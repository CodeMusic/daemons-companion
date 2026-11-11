// The hub's only (it runs ffmpeg and keeps files): never imported by core.ts or routes.ts.
// C-334: sleep sounds, made and kept. A recipe (sleepsound.ts, from the daemon's context) is sent to roverbyteseer's
// keyed door to ACE-Step (DAEMONS ai/litellm/sleep-sounds, :4002), which answers with a piece already made to loop without
// a seam. The hub keeps each piece in three files, each for one player:
//
//   phone.m4a        AAC, 44.1 kHz stereo, ~96 kb/s -- the app loops it for thirty minutes, fading over the last ten
//   watch.wav        PCM, 16 kHz mono, 16-bit -- the T-Watch Ultra copies it to its card and plays it from there
//   watch-adpcm.wav  IMA ADPCM, 16 kHz mono, a quarter the size -- for a watch that would rather decode than store
//
// A piece is named by its recipe's KEY: the same context finds the piece already made; a changed one makes a new piece.
// At most KEEP pieces a daemon are kept, the oldest let go. One piece is made at a time (ACE-Step has one queue).
// Ids are random (a file is fetched by an id nobody can guess, as a voice is: api.ts DEVICE_DOOR).
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FOUND_FFMPEG } from "./ai/voice.js";
import type { SleepRecipe } from "./sleepsound.js";

export type SleepTrack = {
  id: string; key: string; species: number; nickname: string;
  caption: string; bpm: number; keyscale: string; said: string;
  state: "making" | "ready" | "failed"; error?: string;
  job?: string;                                     // roverbyteseer's job, while it is being made (a restart waits on it again)
  asked: string; made?: string; seconds?: number;
  bytes?: { phone: number; watch: number; watchAdpcm: number };
};
export const SLEEP_FILES = { "phone.m4a": "audio/mp4", "watch.wav": "audio/wav", "watch-adpcm.wav": "audio/wav" } as const;
export type SleepFile = keyof typeof SLEEP_FILES;
export type SleepDoor = { base: string; key: string };   // roverbyteseer's sleep door and a key LiteLLM takes
const KEEP = 4;
const WAIT_MS = 30 * 60000;

const run = (args: string[]) => new Promise<void>((done, fail) =>
  execFile(FOUND_FFMPEG ?? "ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { timeout: 10 * 60000 },
           (e) => (e ? fail(e) : done())));

export class SleepTracks {
  private tracks: SleepTrack[] = [];
  private busy: Promise<unknown> = Promise.resolve();
  constructor(readonly dir: string, private door: () => SleepDoor | null,
              private wait = (ms: number) => new Promise((r) => setTimeout(r, ms)), private pollMs = 5000) {
    mkdirSync(dir, { recursive: true });
    try { this.tracks = JSON.parse(readFileSync(join(dir, "tracks.json"), "utf8")); } catch { this.tracks = []; }
    // a piece left making when the server stopped: wait on its job again (a deploy restarts the hub often); one never
    // sent to roverbyteseer is not coming, so it may be asked again
    for (const t of this.tracks.filter((t) => t.state === "making")) {
      if (!t.job) { Object.assign(t, { state: "failed", error: "the server restarted" }); continue; }
      this.queue(t, () => this.finish(t, t.job!, null));
    }
    this.save();
  }
  private save() {
    writeFileSync(join(this.dir, "tracks.json.tmp"), JSON.stringify(this.tracks, null, 1));
    renameSync(join(this.dir, "tracks.json.tmp"), join(this.dir, "tracks.json"));
  }
  list(species?: number | null): SleepTrack[] {
    return this.tracks.filter((t) => species == null || t.species === species).sort((a, b) => b.asked.localeCompare(a.asked));
  }
  byId(id: string): SleepTrack | undefined { return /^[0-9a-f]{32}$/.test(id) ? this.tracks.find((t) => t.id === id) : undefined; }
  file(id: string, name: string): string | null {
    const t = this.byId(id);
    if (!t || t.state !== "ready" || !(name in SLEEP_FILES)) return null;
    const f = join(this.dir, t.id, name);
    return existsSync(f) ? f : null;
  }
  // the piece for this recipe: kept, being made, or asked for now. `again` makes a new one for the same context.
  ask(r: SleepRecipe, who: { species: number; nickname: string; said: string }, again = false): SleepTrack {
    const have = this.tracks.find((t) => t.key === r.key && t.state !== "failed");
    if (have && !(again && have.state === "ready")) return have;
    if (!this.door()) throw new Error("No music maker is set up (roverbyteseer's sleep door).");   // DRAFT
    for (const t of this.tracks.filter((t) => t.key === r.key && t.state === "failed")) this.drop(t);
    const t: SleepTrack = { id: randomBytes(16).toString("hex"), key: r.key, species: who.species, nickname: who.nickname,
                            caption: r.caption, bpm: r.bpm, keyscale: r.keyscale, said: who.said, state: "making", asked: new Date().toISOString() };
    this.tracks.push(t);
    this.save();
    const seed = again ? undefined : r.seed;
    this.queue(t, () => this.make(t, r, seed));
    return t;
  }
  private queue(t: SleepTrack, work: () => Promise<void>) {
    this.busy = this.busy.then(work).catch((e) => {
      Object.assign(t, { state: "failed", error: String((e as Error)?.message ?? e).slice(0, 160) });
      delete t.job;
      this.save();
    });
  }
  private drop(t: SleepTrack) {
    rmSync(join(this.dir, t.id), { recursive: true, force: true });
    this.tracks = this.tracks.filter((x) => x !== t);
  }
  private async make(t: SleepTrack, r: SleepRecipe, seed?: number) {
    const door = this.door();
    if (!door) throw new Error("No music maker is set up.");   // DRAFT
    const h = { authorization: `Bearer ${door.key}`, "content-type": "application/json" };
    const asked = await fetch(`${door.base}/v1/sleep/make`, { method: "POST", headers: h,
      body: JSON.stringify({ caption: r.caption, seconds: r.seconds, bpm: r.bpm, keyscale: r.keyscale, ...(seed != null ? { seed } : {}) }) });
    if (!asked.ok) throw new Error(`roverbyteseer said ${asked.status}`);
    const { job } = await asked.json() as { job: string };
    t.job = job;
    this.save();
    await this.finish(t, job, r.seconds);
  }
  private async finish(t: SleepTrack, job: string, seconds: number | null) {
    const door = this.door();
    if (!door) throw new Error("No music maker is set up.");   // DRAFT
    const h = { authorization: `Bearer ${door.key}`, "content-type": "application/json" };
    const out = join(this.dir, t.id), src = join(out, "source.flac");
    // the piece is fetched whole (written aside, then renamed) before anything else; a restart that finds it here
    // converts it again without asking roverbyteseer, whose copy goes only once the hub's own files are made
    if (!existsSync(src)) {
      const until = Date.now() + WAIT_MS;
      let st: { state: string; error?: string; seconds?: number } = { state: "queued" };
      while (Date.now() < until) {
        await this.wait(this.pollMs);
        const q = await fetch(`${door.base}/v1/sleep/job/${job}`, { headers: h });
        if (!q.ok) throw new Error(`roverbyteseer lost the piece (${q.status})`);
        st = await q.json() as typeof st;
        if (st.state === "done" || st.state === "failed") break;
      }
      if (st.state !== "done") throw new Error(st.error ?? "the piece took too long");
      t.seconds = st.seconds ?? seconds ?? undefined;
      const got = await fetch(`${door.base}/v1/sleep/file/${job}.flac`, { headers: h });
      if (!got.ok) throw new Error(`roverbyteseer kept no file (${got.status})`);
      mkdirSync(out, { recursive: true });
      writeFileSync(`${src}.part`, Buffer.from(await got.arrayBuffer()));
      renameSync(`${src}.part`, src);
      this.save();
    }
    await run(["-i", src, "-c:a", "aac", "-b:a", "96k", "-ar", "44100", "-movflags", "+faststart", join(out, "phone.m4a")]);
    await run(["-i", src, "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", join(out, "watch.wav")]);
    await run(["-i", src, "-ac", "1", "-ar", "16000", "-c:a", "adpcm_ima_wav", join(out, "watch-adpcm.wav")]);
    await fetch(`${door.base}/v1/sleep/file/${job}`, { method: "DELETE", headers: h }).catch(() => {});   // nothing kept there
    rmSync(src, { force: true });
    const size = (f: string) => statSync(join(out, f)).size;
    Object.assign(t, { state: "ready", made: new Date().toISOString(),
                       bytes: { phone: size("phone.m4a"), watch: size("watch.wav"), watchAdpcm: size("watch-adpcm.wav") } });
    delete t.error; delete t.job;
    // keep the newest KEEP of this daemon's
    for (const old of this.list(t.species).filter((x) => x.state === "ready").slice(KEEP)) this.drop(old);
    this.save();
  }
}

// roverbyteseer's sleep door: the setting `sleep.url`, or the Tiiny's LiteLLM host on :4002; the key is LiteLLM's (tiiny.key)
export function sleepDoor(get: (k: string) => string | null): SleepDoor | null {
  const set = (get("sleep.url") ?? "").trim().replace(/\/+$/, "");
  let base = /^https?:\/\/[^\s/]+$/.test(set) ? set : "";
  if (!base) {
    try { const u = new URL(get("tiiny.url") ?? ""); if (u.port === "4000") base = `${u.protocol}//${u.hostname}:4002`; } catch { /* none */ }
  }
  return base ? { base, key: get("tiiny.key") ?? "" } : null;
}
