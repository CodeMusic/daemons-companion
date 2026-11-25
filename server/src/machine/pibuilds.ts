// BRAIN: basal ganglia (act) -- the Pi program built by the household's volunteers, kept and served by the hub
// C-541 (the user, 2026-11-24, for C-515: GitHub builds the Pi devices' program while the repository is public and that
// costs nothing; "if GitHub ever costs money, building moves to an opt-in, and otherwise falls to a volunteer on the mind
// network to build it"): THE SHELF. Its source is a setting, builds.pizero.source -- "github" (the default: the devices
// take GitHub's rolling release) or "volunteers". With volunteers, the hub looks at GitHub every quarter hour for the
// newest commit that changed the Pi program (a public read, no key), and asks THE MESH to build it, one job per board
// (procmesh.ts's build: taken by a DAEMONS Server host whose caps say "build:pizero"). Each finished board is checked
// here -- the tarball's SHA-1 against what its builder said -- and the boards are published together as a manifest of
// the same shape as GitHub's, so a device's `daemons-zero --update` reads either (DAEMONS_UPDATES=<hub>/api/builds/pizero).
// A board that no volunteer builds keeps its older entry. The recipe is the repository's own (firmware/pizero/tools/
// package.sh), the one GitHub runs too, made to give one SHA-1 for one commit on any honest machine, so a second host's
// build of a board can be compared with the first; `checked` stays false until that comparison is made (not yet). DRAFT.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const BOARDS = ["cardputer-zero", "gamepi20", "gamehat", "uconsole", "daemicom"];
export const REPO = "CodeMusic/daemons-companion";
export const PATHS = ["firmware/pizero", "server/data/patches.json"];
export const CHECK_EVERY_MS = 15 * 60_000, GIVE_UP_MS = 6 * 60 * 60_000;
export type Source = "github" | "volunteers";
export type Entry = { board: string; commit: string; at: string; sha1: string; file: string; builder?: string; checked?: boolean };
export type Manifest = { boards: Record<string, Entry>; commit: string; by: "volunteers" };
type Mesh = { build(recipe: string, commit: string, board: string, outputs: Record<string, string>, o: { title: string; expectMs?: number }): Promise<string>;
              drop(jobId: string, why: string): boolean; jobs: Map<string, { id: string; kind: string; args: string[]; state: string }> };

const sha1 = (f: string) => createHash("sha1").update(readFileSync(f)).digest("hex");
const writeAtomic = (f: string, s: string) => { writeFileSync(`${f}.tmp`, s); renameSync(`${f}.tmp`, f); };

// the newest commit on main that changed the Pi program, from GitHub's public API (two paths, the later of the two)
export async function newestCommit(get: typeof fetch = fetch): Promise<{ sha: string; at: string } | null> {
  const found = await Promise.all(PATHS.map(async (p) => {
    const r = await get(`https://api.github.com/repos/${REPO}/commits?sha=main&per_page=1&path=${encodeURIComponent(p)}`,
                        { headers: { accept: "application/vnd.github+json", "user-agent": "daemons-hub" }, signal: AbortSignal.timeout(20_000) });
    if (!r.ok) throw new Error(`GitHub answered ${r.status}`);
    const j: any = await r.json();
    const c = Array.isArray(j) ? j[0] : null;
    return c && /^[0-9a-f]{40}$/.test(c.sha) ? { sha: String(c.sha), at: String(c.commit?.committer?.date ?? "") } : null;
  }));
  return found.filter((x): x is { sha: string; at: string } => !!x).sort((a, b) => b.at.localeCompare(a.at))[0] ?? null;
}

export class PiBuilds {
  building: { commit: string; boards: Record<string, "waiting" | "built" | "failed">; since: number; errors: Record<string, string> } | null = null;
  lastCheck: { at: number; newest?: string; error?: string } | null = null;
  constructor(private dir: string, private mesh: Mesh, private setting: (k: string) => string | null,
              private get: typeof fetch = fetch, private now: () => number = Date.now) {
    mkdirSync(join(dir, "pizero"), { recursive: true });
  }
  source(): Source { return this.setting("builds.pizero.source") === "volunteers" ? "volunteers" : "github"; }
  private root() { return join(this.dir, "pizero"); }
  manifest(): Manifest | null {
    const f = join(this.root(), "manifest.json");
    try { return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null; } catch { return null; }
  }
  // a file a device fetches: the manifest, or a board's tarball or .deb named in it
  file(name: string): string | null {
    if (!/^[a-z0-9][a-z0-9.-]{0,80}$/.test(name)) return null;
    if (name === "manifest.json") { const f = join(this.root(), name); return existsSync(f) ? f : null; }
    const e = Object.values(this.manifest()?.boards ?? {}).find((x) => x.file === name || x.file.replace(/\.tar\.gz$/, ".deb") === name);
    if (!e) return null;
    const f = join(this.root(), e.commit.slice(0, 12), name);
    return existsSync(f) ? f : null;
  }
  status() {
    return { source: this.source(), manifest: this.manifest(), building: this.building, lastCheck: this.lastCheck };
  }

  // every quarter hour (and when asked): a newer commit, built by the volunteers
  async check(): Promise<void> {
    if (this.source() !== "volunteers") return;
    try {
      const n = await newestCommit(this.get);
      this.lastCheck = { at: this.now(), newest: n?.sha };
      if (n && n.sha !== this.manifest()?.commit && n.sha !== this.building?.commit && !this.building) void this.queue(n.sha);
    } catch (e) { this.lastCheck = { at: this.now(), error: (e as Error).message }; }
  }

  async queue(commit: string): Promise<Manifest | null> {
    if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error("a commit is forty hex digits");
    if (this.building) throw new Error(`already building ${this.building.commit.slice(0, 12)}`);
    const dir = join(this.root(), commit.slice(0, 12));
    mkdirSync(dir, { recursive: true });
    const b = this.building = { commit, boards: Object.fromEntries(BOARDS.map((x) => [x, "waiting"])) as Record<string, "waiting" | "built" | "failed">, since: this.now(), errors: {} as Record<string, string> };
    const giveUp = setTimeout(() => { for (const j of this.mesh.jobs.values()) if (j.kind === "build" && j.args[1] === commit) this.mesh.drop(j.id, "no volunteer took it"); }, GIVE_UP_MS);
    giveUp.unref?.();
    const fresh: Record<string, Entry> = {};
    await Promise.all(BOARDS.map(async (board) => {
      const outs = { tar: join(dir, `daemons-zero-${board}.tar.gz`), deb: join(dir, `daemons-zero-${board}.deb`), json: join(dir, `${board}.json`) };
      try {
        const builder = await this.mesh.build("pizero", commit, board, outs, { title: `the Pi program for the ${board}`, expectMs: 15 * 60_000 });
        const said: Entry = JSON.parse(readFileSync(outs.json, "utf8"));
        const got = sha1(outs.tar);
        if (said.commit !== commit || said.board !== board || said.sha1 !== got) throw new Error("its result is not what its builder said");
        fresh[board] = { board, commit, at: said.at, sha1: got, file: `daemons-zero-${board}.tar.gz`, builder, checked: false };
        b.boards[board] = "built";
      } catch (e) {
        b.boards[board] = "failed"; b.errors[board] = (e as Error).message;
        for (const f of Object.values(outs)) rmSync(f, { force: true });
      }
    }));
    clearTimeout(giveUp);
    this.building = null;
    if (!Object.keys(fresh).length) { rmSync(dir, { recursive: true, force: true }); return null; }
    // published together: the boards built now, and each other board's older entry kept
    const was = this.manifest();
    const m: Manifest = { boards: { ...(was?.boards ?? {}), ...fresh }, commit, by: "volunteers" };
    writeAtomic(join(this.root(), "manifest.json"), JSON.stringify(m, null, 2));
    this.prune(m);
    return m;
  }
  // the folders no entry names any more
  private prune(m: Manifest) {
    const keep = new Set(Object.values(m.boards).map((e) => e.commit.slice(0, 12)));
    for (const d of readdirSync(this.root(), { withFileTypes: true }))
      if (d.isDirectory() && !keep.has(d.name)) rmSync(join(this.root(), d.name), { recursive: true, force: true });
  }
}
