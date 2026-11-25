// The hub's only (it runs ffmpeg and keeps files): never imported by core.ts or routes.ts.
// C-508 (the user, 2026-11-24, by multiple choice: the hub keeps "both" -- the drift and its music apart, and a finished
// render for a device that cannot play a binaural beat -- "but keep an eye on space"): a REVERIE's RENDER, made only on
// asking: a piece the hub made, looped under a drift's beats -- the left ear at each stage's carrier, the right at
// carrier + beat -- and its noise bed, faded at the end, as one MP3 to keep or play anywhere. One at a time, through THE
// MESH as the sleep exports are (sleepexport.ts ffmpeg). Kept beside the made drifts, each with its size and when it was
// last played; past the limit the oldest unplayed go first -- their drift and music stay, so any can be made again.
// Not carried yet: a daemon's machine voice (square waves, glitches) and the isochronic layer -- the app plays those live.
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ffmpeg } from "./sleepexport.js";
import { stagesOfFile, type DriftFile } from "../psyche/drift.js";

export type Render = { id: string; drift: string; track: string; name: string; state: "making" | "ready" | "failed";
                       asked: string; made?: string; played?: string | null; seconds: number; bytes?: number; error?: string };
export const RENDER_LIMIT = 2 * 1024 ** 3;   // 2 GB of renders on the hub, then the oldest unplayed go (DRAFT)
const DRIFT_LEVEL = 0.22;                    // as the app's: the beat under the music, never over it
const ID = /^[a-z0-9-]{1,90}--[0-9a-f]{32}$/;

/** A render's length: the drift's own (10 to 45 minutes), its last tenth (at most ten minutes) fading. */
export const renderSeconds = (d: DriftFile) => Math.max(600, Math.min(2700, Math.round(d.meta.durationSec ?? 1800)));

/** The ffmpeg arguments for one render (files as @in:/@out: names, for THE MESH). */
export function renderArgs(d: DriftFile, carrier: number): string[] {
  const L = renderSeconds(d), fade = Math.min(600, Math.round(L / 10));
  const stages = stagesOfFile(d, carrier, 30).filter((s) => s.at < L);
  const spans = stages.map((s, i) => ({ c: s.carrier ?? carrier, b: s.beat, d: (i + 1 < stages.length ? stages[i + 1].at : L) - s.at }))
    .filter((s) => s.d > 0);
  const sine = (f: number, dur: number) => ["-f", "lavfi", "-i", `sine=frequency=${f.toFixed(2)}:duration=${dur}:sample_rate=44100`];
  const bed = stages[0]?.bed ?? null, n = spans.length;
  const inputs = ["-stream_loop", "-1", "-i", "@in:piece", ...spans.flatMap((s) => sine(s.c, s.d)), ...spans.flatMap((s) => sine(s.c + s.b, s.d)),
                  ...(bed ? ["-f", "lavfi", "-i", `anoisesrc=color=${bed.type}:amplitude=${(bed.level * 0.6).toFixed(3)}:duration=${L}:sample_rate=44100`] : [])];
  const left = spans.map((_, i) => `[${1 + i}:a]`).join(""), right = spans.map((_, i) => `[${1 + n + i}:a]`).join("");
  const vol = (DRIFT_LEVEL * 8).toFixed(3);   // ffmpeg's sine is an eighth of full scale
  const graph = `[0:a]atrim=0:${L},aformat=sample_rates=44100:channel_layouts=stereo[m];` +
                `${left}concat=n=${n}:v=0:a=1[l];${right}concat=n=${n}:v=0:a=1[r];` +
                `[l][r]join=inputs=2:channel_layout=stereo,volume=${vol}[b];` +
                (bed ? `[${1 + 2 * n}:a]aformat=channel_layouts=stereo[z];[m][b][z]amix=inputs=3` : `[m][b]amix=inputs=2`) +
                `:duration=first:normalize=0,afade=t=out:st=${L - fade}:d=${fade}[o]`;
  return [...inputs, "-filter_complex", graph, "-map", "[o]", "-c:a", "libmp3lame", "-b:a", "128k", "-compression_level", "7", "-f", "mp3", "@out:mp3"];
}

export class Renders {
  private renders: Render[] = [];
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private dir: string, private limit = RENDER_LIMIT, private make = ffmpeg) {
    mkdirSync(dir, { recursive: true });
    try { this.renders = JSON.parse(readFileSync(join(dir, "renders.json"), "utf8")); } catch { /* none yet */ }
    for (const r of this.renders) if (r.state === "making") { r.state = "failed"; r.error = "the hub restarted while it was made"; }   // DRAFT
  }
  private keep() { writeFileSync(join(this.dir, "renders.json.part"), JSON.stringify(this.renders, null, 1)); renameSync(join(this.dir, "renders.json.part"), join(this.dir, "renders.json")); }
  private path(id: string) { return join(this.dir, `${id}.mp3`); }
  list() { return [...this.renders].sort((a, b) => (b.asked > a.asked ? 1 : -1)); }
  byId(id: string) { return ID.test(id) ? this.renders.find((r) => r.id === id) : undefined; }
  /** A ready render's file (and it counts as played). */
  file(id: string): string | null {
    const r = this.byId(id);
    if (!r || r.state !== "ready" || !existsSync(this.path(id))) return null;
    r.played = new Date().toISOString(); this.keep();
    return this.path(id);
  }
  bytes() { return this.renders.reduce((n, r) => n + (r.state === "ready" ? r.bytes ?? 0 : 0), 0); }

  /** Ask for a drift's render over a piece: kept if made, waited on if making, else made (one at a time). */
  ask(d: DriftFile, track: { id: string; file: string; carrier: number }): Render {
    const id = `${d.id}--${track.id}`, have = this.byId(id);
    if (have && have.state !== "failed") return have;
    const r: Render = { id, drift: d.id, track: track.id, name: d.meta.name ?? d.id, state: "making", asked: new Date().toISOString(), seconds: renderSeconds(d) };
    this.renders = this.renders.filter((x) => x.id !== id).concat(r);
    this.keep();
    this.queue = this.queue.then(async () => {
      const part = `${this.path(id)}.part.mp3`;
      try {
        await this.make(renderArgs(d, track.carrier), { piece: track.file }, { mp3: part }, { title: `a REVERIE's render: ${r.name}`, expectMs: 240_000 });
        renameSync(part, this.path(id));
        Object.assign(r, { state: "ready", made: new Date().toISOString(), bytes: statSync(this.path(id)).size, played: null });
      } catch (e) {
        Object.assign(r, { state: "failed", error: (e as Error).message.slice(0, 200) });
        try { unlinkSync(part); } catch { /* none */ }
      }
      this.keep();
      this.prune();
    });
    return r;
  }

  /** Past the limit, the oldest unplayed renders go first (then the longest unplayed); their drift and music stay. */
  prune(): string[] {
    const gone: string[] = [];
    const ready = this.renders.filter((r) => r.state === "ready").sort((a, b) => (a.played ?? a.made ?? "").localeCompare(b.played ?? b.made ?? ""));
    for (const r of ready) {
      if (this.bytes() <= this.limit) break;
      try { unlinkSync(this.path(r.id)); } catch { /* already gone */ }
      this.renders = this.renders.filter((x) => x.id !== r.id);
      gone.push(r.id);
    }
    if (gone.length) this.keep();
    return gone;
  }
}

/** Every file's bytes under a folder (one level of subfolders, as the hub keeps its pieces). */
export function folderBytes(dir: string): number {
  if (!existsSync(dir)) return 0;
  let n = 0;
  for (const f of readdirSync(dir)) {
    const p = join(dir, f), s = statSync(p);
    if (s.isFile()) n += s.size;
    else if (s.isDirectory()) for (const g of readdirSync(p)) { try { n += statSync(join(p, g)).size; } catch { /* gone */ } }
  }
  return n;
}
