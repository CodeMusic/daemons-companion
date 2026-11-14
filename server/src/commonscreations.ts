// THE COMMONS' only (it keeps files): never imported by core.ts or routes.ts.
// C-358 (the user, 2026-11-14: "a community area, you need your account set up for that, and if you do you can upload
// to the community. Likewise if u have an account you can view the community and download one to your device"):
// COMMUNITY, the creations homes shared. A home linked to the commons and approved by its keeper (its "account" for
// now) shares one of its creations -- the row (creations.ts) and its files -- and every approved home can see what was
// shared and fetch it. A home may take back what it shared. Kept beside the commons' database, one folder a creation:
//
//   <dir>/index.json              every shared row, with the home that shared it
//   <dir>/<n>/<file>              its files (a sleep piece: phone.m4a, cover.png; a painting: painting.png)
//
// Limits, so one home cannot fill the machine: 12 MB a creation, 200 a home, these file names only. Every word DRAFT.
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Creation } from "./creations.js";

export const SHARE_MOST_BYTES = 12 * 1024 * 1024, SHARED_MOST_A_HOME = 200;
const FILES = new Set(["phone.m4a", "cover.png", "painting.png"]);   // a song: phone.m4a and cover.png, as a sleep piece
const TYPES: Record<string, string> = { "phone.m4a": "audio/mp4", "cover.png": "image/png", "painting.png": "image/png" };

export type Shared = Creation & { n: number; sharedBy: string; sharedByName: string; sharedAt: string };
type Index = { next: number; shared: Shared[] };

export class CommonsCreations {
  constructor(readonly dir: string) { mkdirSync(dir, { recursive: true }); }
  private read(): Index {
    try { const j = JSON.parse(readFileSync(join(this.dir, "index.json"), "utf8")); if (Array.isArray(j?.shared)) return j; } catch { /* new */ }
    return { next: 1, shared: [] };
  }
  private write(i: Index) {
    writeFileSync(join(this.dir, "index.json.part"), JSON.stringify(i));
    renameSync(join(this.dir, "index.json.part"), join(this.dir, "index.json"));
  }
  // what the community sees: every shared creation, newest first, where to fetch its files from the commons
  list(kind?: string | null): Shared[] {
    return this.read().shared.filter((s) => !kind || s.kind === kind).sort((a, b) => b.sharedAt.localeCompare(a.sharedAt))
      .map((s) => ({ ...s, cover: s.cover ? `/commons/creations/${s.n}/${s.cover}` : null,
                     files: Object.fromEntries(Object.keys(s.files).map((f) => [f, `/commons/creations/${s.n}/${f}`])) }));
  }
  // a home shares one: its row and its files (base64); shared again, the same uid is replaced
  share(home: { id: string; name: string }, row: unknown, files: unknown, now = new Date()): { shared: Shared } | { error: string } {
    const c = row as Creation;
    if (!c || typeof c.uid !== "string" || !/^(sleep|painting|song):[0-9a-f]{16,32}@.{1,40}$/.test(c.uid) || !["sleep", "painting", "song"].includes(c.kind))
      return { error: "that is not a creation" };   // DRAFT
    const given = files && typeof files === "object" ? Object.entries(files as Record<string, unknown>) : [];
    const ok = given.filter(([name, b64]) => FILES.has(name) && typeof b64 === "string") as [string, string][];
    if (!ok.length) return { error: "nothing to share: its files did not come" };   // DRAFT
    const bytes = ok.map(([n, b]) => [n, Buffer.from(b, "base64")] as const);
    if (bytes.reduce((s, [, b]) => s + b.length, 0) > SHARE_MOST_BYTES) return { error: "too large to share" };   // DRAFT
    const i = this.read();
    const before = i.shared.find((s) => s.uid === c.uid);
    if (!before && i.shared.filter((s) => s.sharedBy === home.id).length >= SHARED_MOST_A_HOME)
      return { error: `a home shares at most ${SHARED_MOST_A_HOME}` };   // DRAFT
    const n = before?.n ?? i.next++;
    const folder = join(this.dir, String(n));
    rmSync(folder, { recursive: true, force: true });
    mkdirSync(folder, { recursive: true });
    for (const [name, b] of bytes) writeFileSync(join(folder, name), b);
    const keep = (s: unknown, most: number) => String(s ?? "").slice(0, most);
    const shared: Shared = {
      uid: c.uid, kind: c.kind, id: keep(c.id, 40), home: keep(c.home, 40), title: keep(c.title, 80), about: keep(c.about, 300),
      made: keep(c.made, 40), state: "ready",
      daemon: { nickname: keep(c.daemon?.nickname, 20), species: Number(c.daemon?.species) || 0,
                ...(Array.isArray(c.daemon?.types) ? { types: c.daemon.types.slice(0, 2).map((t) => keep(t, 12)) } : {}) },
      by: c.by ? keep(c.by, 40) : null,
      cover: bytes.some(([nm]) => nm === "cover.png") ? "cover.png" : bytes.some(([nm]) => nm === "painting.png") ? "painting.png" : null,
      files: Object.fromEntries(bytes.map(([nm]) => [nm, nm])),
      meta: Object.fromEntries(Object.entries(c.meta ?? {}).filter(([, v]) => v === null || ["string", "number", "boolean"].includes(typeof v))
                                 .slice(0, 16).map(([k, v]) => [keep(k, 24), typeof v === "string" ? keep(v, 400) : v])) as Creation["meta"],
      bytes: bytes.reduce((s, [, b]) => s + b.length, 0),
      n, sharedBy: home.id, sharedByName: home.name, sharedAt: now.toISOString(),
    };
    i.shared = [shared, ...i.shared.filter((s) => s.uid !== c.uid)];
    this.write(i);
    return { shared: this.list().find((s) => s.uid === c.uid)! };
  }
  unshare(home: { id: string }, uid: string): boolean {
    const i = this.read(), s = i.shared.find((x) => x.uid === uid && x.sharedBy === home.id);
    if (!s) return false;
    rmSync(join(this.dir, String(s.n)), { recursive: true, force: true });
    i.shared = i.shared.filter((x) => x !== s);
    this.write(i);
    return true;
  }
  file(n: string, name: string): { path: string; type: string } | null {
    if (!/^\d{1,6}$/.test(n) || !FILES.has(name)) return null;
    const p = join(this.dir, n, name);
    return existsSync(p) ? { path: p, type: TYPES[name] } : null;
  }
}
