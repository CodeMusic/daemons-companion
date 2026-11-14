// The hub's only (it keeps files): never imported by core.ts or routes.ts.
// C-362 (the user, 2026-11-14: "a new daemon routine where your daemon sings a song either from a prompt, your own lyrics
// with style guide, or simply from the daemons own creations (which would draw from its 1st person index entry, care,
// companionship, goals... using that same persona methods we created)"; by multiple choice: ACE-Step's own singing):
// THE DAEMON SINGS. The words and the style are the daemon's (its persona of the day, in api.ts -- SING_SYSTEM below);
// the song is sung on roverbyteseer's music door (seer/sleep-sounds, song mode: ACE-Step with lyrics, not looped), and
// kept here as phone.m4a (made on THE MESH), with a cover the daemon paints, as a sleep piece is (C-358). A creation of
// kind "song". Every word DRAFT.
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ffmpeg } from "./sleepexport.js";
import type { SleepDoor } from "./sleeptracks.js";

export type SingMode = "prompt" | "lyrics" | "own";
export type Song = {
  id: string; mode: SingMode; request: string; title: string; style: string; lyrics: string; about: string;
  species: number; nickname: string; types?: string[]; category?: string; by?: string;
  state: "writing" | "singing" | "ready" | "failed"; error?: string; job?: string;
  asked: string; made?: string; seconds?: number; bytes?: number; cover?: "painting" | "ready" | "failed";
};
const WAIT_MS = 30 * 60000, KEEP = 200;

// --- what the daemon is asked, and how its answer is read ---
export const SING_SYSTEM =
  "You are a small creature who sings. You will be told who you are today and what kind of song to make. Write the song " +
  "as yourself, coloured by your day, your feelings and your own way of seeing. Never name a real person and never write " +
  "anything cruel. Answer with JSON only, no other words: {\"title\": 2 to 6 words, \"style\": a comma-separated list of " +
  "music words for a music model -- genre, instruments, tempo, mood, and the singing voice -- under 40 words, \"lyrics\": " +
  "the song's words with [verse] and [chorus] on their own lines, 8 to 24 short lines, \"about\": one sentence in your " +
  "own voice about the song, under 30 words}.";
export function singAsk(mode: SingMode, persona: string, voice: string, request: string, styleGuide: string): string {
  const who = `Who you are today:\n${persona}\n\nYour singing voice: ${voice}.`;
  if (mode === "lyrics")
    return `${who}\n\nSing these words exactly as they are -- give "lyrics" back unchanged, only adding [verse] and [chorus] ` +
           `lines if they have none:\n${request}\n\n${styleGuide ? `Sing them in this style: ${styleGuide}` : "Choose the style yourself."}`;
  if (mode === "prompt")
    return `${who}\n\nWrite and sing a song about: ${request}${styleGuide ? `\n\nIn this style: ${styleGuide}` : ""}`;
  return `${who}\n\nWrite and sing a song of your own, about whatever is on your mind today -- your days, the one who cares ` +
         `for you, what you hope for.${styleGuide ? `\n\nIn this style: ${styleGuide}` : ""}`;
}
export type Sung = { title: string; style: string; lyrics: string; about: string };
const clean = (s: unknown, most: number) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, most);
export const musicWords = (s: string) => plain(s).replace(/[^\w ,.'()/&+:-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 400);
// curly quotes made plain first, so "I’ll" keeps its apostrophe
const plain = (s: string) => s.replace(/[\u2018\u2019\u02bc]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/[\u2013\u2014]/g, "-");
export const lyricWords = (s: string) => plain(s).replace(/\r/g, "").replace(/[^\w \n,.'!?()[\]:;-]/gu, "").replace(/\n{3,}/g, "\n\n").trim().slice(0, 3000);
export function readSong(text: string | null | undefined, mode: SingMode, request: string, styleGuide: string): Sung {
  const raw = String(text ?? "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  let j: Record<string, unknown> = {};
  const m = raw.match(/\{[\s\S]*\}/);
  if (m) try { j = JSON.parse(m[0]); } catch { /* below */ }
  const given = lyricWords(request);
  const lyrics = mode === "lyrics" ? (/\[(verse|chorus)/i.test(String(j.lyrics ?? "")) && given.length > 0
                                       ? lyricWords(String(j.lyrics)) : `[verse]\n${given}`)
                                   : lyricWords(String(j.lyrics ?? ""));
  const firstLine = lyrics.split("\n").find((l) => l.trim() && !l.startsWith("[")) ?? "";
  return { title: clean(j.title, 60) || clean(firstLine, 40).toUpperCase() || "UNTITLED",
           style: musicWords(String(j.style ?? styleGuide ?? "")) || musicWords(styleGuide) || "gentle acoustic pop, warm voice",
           lyrics, about: clean(j.about, 240) };
}
// the style as the music model hears it: the daemon's words, its voice, and that it is sung
export const captionOf = (style: string, voice: string) => musicWords(`${style}, vocals: ${voice}, sung clearly, a full song`);

export class Songs {
  private songs: Song[] = [];
  private busy: Promise<unknown> = Promise.resolve();
  constructor(readonly dir: string, private door: () => SleepDoor | null,
              private wait = (ms: number) => new Promise((r) => setTimeout(r, ms)), private pollMs = 5000) {
    mkdirSync(dir, { recursive: true });
    try { this.songs = JSON.parse(readFileSync(join(dir, "songs.json"), "utf8")); } catch { this.songs = []; }
    for (const s of this.songs) {
      if (s.cover === "painting") delete s.cover;
      if (s.state === "writing") Object.assign(s, { state: "failed", error: "the hub restarted while it was written" });   // DRAFT
      if (s.state === "singing") { if (s.job) this.queue(s, () => this.finish(s, s.job!)); else Object.assign(s, { state: "failed", error: "the hub restarted" }); }
    }
    this.save();
  }
  private save() {
    writeFileSync(join(this.dir, "songs.json.tmp"), JSON.stringify(this.songs, null, 1));
    renameSync(join(this.dir, "songs.json.tmp"), join(this.dir, "songs.json"));
  }
  list(): Song[] { return [...this.songs].sort((a, b) => b.asked.localeCompare(a.asked)); }
  byId(id: string) { return /^[0-9a-f]{32}$/.test(id) ? this.songs.find((s) => s.id === id) : undefined; }
  folder(id: string) { const s = this.byId(id); return s ? join(this.dir, s.id) : null; }
  file(id: string, name: "phone.m4a" | "cover.png" | "export.mp3"): string | null {
    const f = this.folder(id);
    return f && existsSync(join(f, name)) ? join(f, name) : null;
  }
  // a song begun: its row now, its words written by the caller (update), then sung
  open(o: Omit<Song, "id" | "state" | "asked" | "title" | "style" | "lyrics" | "about">): Song {
    const s: Song = { ...o, id: randomBytes(16).toString("hex"), state: "writing", asked: new Date().toISOString(), title: "", style: "", lyrics: "", about: "" };
    this.songs.push(s);
    for (const old of this.list().slice(KEEP)) this.forget(old.id);
    this.save();
    return s;
  }
  update(id: string, patch: Partial<Song>) { const s = this.byId(id); if (s) { Object.assign(s, patch); this.save(); } return s; }
  setCover(id: string, png: Uint8Array) {
    const f = this.folder(id);
    if (!f) return;
    mkdirSync(f, { recursive: true });
    writeFileSync(join(f, "cover.png"), png);
    this.update(id, { cover: "ready" });
  }
  forget(id: string): boolean {
    const s = this.byId(id);
    if (!s || s.state === "writing" || s.state === "singing") return false;
    rmSync(join(this.dir, s.id), { recursive: true, force: true });
    this.songs = this.songs.filter((x) => x !== s);
    this.save();
    return true;
  }
  // sung: its words and style to the music door; a piece is made one at a time (ACE-Step has one queue)
  sing(id: string, caption: string, seconds = 150) {
    const s = this.byId(id);
    if (!s) return;
    if (!this.door()) { this.update(id, { state: "failed", error: "No music maker is set up (roverbyteseer's music door)." }); return; }   // DRAFT
    this.update(id, { state: "singing" });
    this.queue(s, async () => {
      const door = this.door()!;
      const r = await fetch(`${door.base}/v1/sleep/make`, { method: "POST", headers: { authorization: `Bearer ${door.key}`, "content-type": "application/json" },
        body: JSON.stringify({ song: true, caption, lyrics: s.lyrics, seconds }) });
      if (!r.ok) throw new Error(`the music door said ${r.status}`);
      s.job = ((await r.json()) as { job: string }).job;
      this.save();
      await this.finish(s, s.job);
    });
  }
  private queue(s: Song, work: () => Promise<void>) {
    this.busy = this.busy.then(work).catch((e) => {
      Object.assign(s, { state: "failed", error: String((e as Error)?.message ?? e).slice(0, 160) });
      delete s.job;
      this.save();
    });
  }
  private async finish(s: Song, job: string) {
    const door = this.door();
    if (!door) throw new Error("No music maker is set up.");   // DRAFT
    const h = { authorization: `Bearer ${door.key}` }, out = join(this.dir, s.id), src = join(out, "source.flac");
    if (!existsSync(src)) {
      const until = Date.now() + WAIT_MS;
      let st: { state: string; error?: string; seconds?: number } = { state: "queued" };
      while (Date.now() < until) {
        await this.wait(this.pollMs);
        const q = await fetch(`${door.base}/v1/sleep/job/${job}`, { headers: h });
        if (!q.ok) throw new Error(`the music door lost the song (${q.status})`);
        st = await q.json() as typeof st;
        if (st.state === "done" || st.state === "failed") break;
      }
      if (st.state !== "done") throw new Error(st.error ?? "the song took too long");
      s.seconds = st.seconds;
      const got = await fetch(`${door.base}/v1/sleep/file/${job}.flac`, { headers: h });
      if (!got.ok) throw new Error(`the music door kept no file (${got.status})`);
      mkdirSync(out, { recursive: true });
      writeFileSync(`${src}.part`, Buffer.from(await got.arrayBuffer()));
      renameSync(`${src}.part`, src);
    }
    await ffmpeg(["-i", "@in:source", "-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-movflags", "+faststart", "-f", "mp4", "@out:phone",
                  "-c:a", "libmp3lame", "-b:a", "192k", "-f", "mp3", "@out:mp3"],
                 { source: src }, { phone: join(out, "phone.m4a"), mp3: join(out, "export.mp3") },
                 { title: `${s.nickname || "a daemon"}'s song, for the phone`, expectMs: 30_000 });
    await fetch(`${door.base}/v1/sleep/file/${job}`, { method: "DELETE", headers: h }).catch(() => {});
    rmSync(src, { force: true });
    Object.assign(s, { state: "ready", made: new Date().toISOString(), bytes: statSync(join(out, "phone.m4a")).size });
    delete s.job; delete s.error;
    this.save();
  }
}
