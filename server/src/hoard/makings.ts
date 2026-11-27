// BRAIN: pathway -- a making's steps in order: see, write, voice, render; each step a model or ffmpeg handed in
// The hub's only: never imported by core.ts or routes.ts.
// C-605, C-603, C-577, C-604, C-606 (C-596; the user, 2026-11-27): THE HOARD's MAKINGS -- what the house's mind makes
// of a file, QUEUED and built ONE AT A TIME in the background, each a JOB whose step and progress are shown, each
// finished one a CREATION kept in THE HOARD beside what it was made of (its owner's alone until they share it):
//
//   SPOKEN   a text file read aloud -- in a voice cast from the file itself, a daemon's the reader picked, or the
//            daemon on the device that asked (C-603)
//   MAGIC    a picture given something to say and a voice to say it in, its mouth moving as it speaks: one video (C-577)
//   VIDEO    a sequence of pictures, each speaking (the mind's words, the person's own, or a daemon's), with music
//            under them -- or silent, with a song that carries the words (C-604)
//   ANSWER   a picture, a recording, a text or a creation asked a question, typed or spoken, answering as itself (C-606)
//
// It joins the mind's words (psyche/photovoice.ts) to the machine's doors, which are handed in as MAKERS -- the model
// that sees, the house's writer, the voice door, the hearing, THE MESH's ffmpeg, the music door -- so nothing here names
// a model, and a test makes everything with stand-ins. Who may read the file a making is made of is rules.ts's to say,
// asked when the job is queued and again when it runs. Every word a person reads is DRAFT.
import { randomBytes } from "node:crypto";
import { createReadStream, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Store } from "../shared/store.js";
import { askedAsk, cleanAnswer, imagineAsk, readImagined, readPersona, readSeen, readSong, sequenceSongAsk, textVoiceAsk, underscoreCaption,
         SEE_PROMPT, type FileSelf, type Mouth, type Seen } from "../psyche/photovoice.js";
import { Hoard, HoardError } from "./hoard.js";
import { FPS, LEVELS, SIDE, glowStills, hearableArgs, jawStills, joinArgs, joinWavs, mouthLevels, pixelArgs, plainWavArgs, pngOf, selectCommands, speakArgs, squareArgs, stillArgs,
         voiceFileArgs, wavPcm } from "./render.js";
import { canRead, looksOf, stageOf, MUSIC_PROMPT_MOST, SCENES_MOST, SPOKEN_MOST, TITLE_MOST, WORDS_MOST, type HoardFile, type Who } from "./rules.js";

export type Makers = {
  /** a picture (a JPEG) shown to the house's own seeing model with a question; null when the house has none */
  see: ((jpeg: Uint8Array, prompt: string, signal: AbortSignal) => Promise<string>) | null;
  /** the house's writer */
  write: (title: string, system: string, user: string, most: number, signal: AbortSignal) => Promise<string>;
  /** a line said in a voice cast by `recipe`: a WAV */
  speak: (text: string, recipe: string, signal: AbortSignal) => Promise<Uint8Array | null>;
  /** what was said in a 16 kHz WAV */
  hear: (wav: Uint8Array) => Promise<string | null>;
  /** an ffmpeg job, its files named only as @in:<name> and @out:<name> (THE MESH's, C-360) */
  ffmpeg: (args: string[], inputs: Record<string, string>, outputs: Record<string, string>, o: { title: string; expectMs?: number }) => Promise<void>;
  /** music from the music door, written to `to`: a song that carries `lyrics`, or music without words. null: no door */
  music: ((o: { song: boolean; caption: string; lyrics?: string; seconds: number; to: string }, signal: AbortSignal) => Promise<void>) | null;
  /** a daemon's voice and who it is: "daemon" is the one on the device that asked, "daemon:<species>" one that was picked */
  daemon: (name: string, device: string) => { recipe: string; persona: string; name: string } | null;
};
export const MAKE_KINDS = ["spoken", "magic", "video", "answer"] as const;
export type MakeKind = (typeof MAKE_KINDS)[number];
export type JobState = "waiting" | "making" | "done" | "failed" | "stopped";
export type Job = { id: string; kind: MakeKind; title: string; state: JobState; step: string; progress: number; at: number; started: number | null;
                    ended: number | null; error: string | null; owner: string; ownerName: string; device: string; args: Record<string, any>; result: string | null };
export const PIECE = 1000;       // DRAFT: the most said in one breath
export { SCENES_MOST, SPOKEN_MOST };
const STOPPED = "stopped";
const base = (name: string) => name.replace(/\.[A-Za-z0-9]{1,5}$/, "").slice(0, 80) || "a file";

export class Makings {
  private H: Hoard;
  private store: Store;
  private dir: string;
  private makers: Makers;
  private now: () => number;
  private busy = false;
  private ctl: AbortController | null = null;
  private settled: (() => void)[] = [];

  private paused: boolean;
  /** `paused`: jobs are kept and nothing is made (a test's server, which has no models to make with) */
  constructor(H: Hoard, store: Store, dir: string, makers: Makers, o: { now?: () => number; paused?: boolean } = {}) {
    this.H = H; this.store = store; this.dir = dir; this.makers = makers; this.paused = o.paused === true;
    this.now = o.now ?? (() => store.now());
    store.db.exec(`CREATE TABLE IF NOT EXISTS hoard_jobs (id TEXT PRIMARY KEY, kind TEXT NOT NULL, title TEXT NOT NULL, state TEXT NOT NULL, step TEXT NOT NULL DEFAULT '',
      progress REAL NOT NULL DEFAULT 0, at INTEGER NOT NULL, started INTEGER, ended INTEGER, error TEXT, owner TEXT NOT NULL, owner_name TEXT NOT NULL,
      device TEXT NOT NULL DEFAULT '', args TEXT NOT NULL, result TEXT);`);
    // one that was being made when the hub stopped is made again from its start
    store.db.prepare("UPDATE hoard_jobs SET state = 'waiting', step = '', progress = 0, started = NULL WHERE state = 'making'").run();
    if (!this.paused) setTimeout(() => void this.next(), 500).unref?.();
  }

  /** where a spoken question waits until its making hears it */
  inbox(): string { const d = join(this.dir, "said"); mkdirSync(d, { recursive: true }); return d; }

  // ---- the queue ----
  private jobOf(r: any): Job {
    return { id: r.id, kind: r.kind, title: r.title, state: r.state, step: r.step, progress: r.progress, at: r.at, started: r.started ?? null, ended: r.ended ?? null,
             error: r.error ?? null, owner: r.owner, ownerName: r.owner_name, device: r.device, args: JSON.parse(r.args), result: r.result ?? null };
  }
  private job(id: string): Job | null { const r = this.store.db.prepare("SELECT * FROM hoard_jobs WHERE id = ?").get(String(id)); return r ? this.jobOf(r) : null; }
  private set(id: string, patch: Partial<Pick<Job, "state" | "step" | "progress" | "started" | "ended" | "error" | "result">>) {
    const keys = Object.keys(patch) as (keyof typeof patch)[];
    if (keys.length) this.store.db.prepare(`UPDATE hoard_jobs SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`).run(...keys.map((k) => patch[k] as never), id);
  }
  /** everything queued, the one in hand first, then the waiting in order, then the latest finished. Another person's
   *  making is shown as being there, never by its name (a file's name is its owner's) */
  list(who: Who) {
    // in the order they were asked (two asked in one millisecond keep their order: the table's own row order settles it)
    const rows = (this.store.db.prepare("SELECT * FROM hoard_jobs ORDER BY at DESC, rowid DESC LIMIT 200").all() as any[]).map((r) => this.jobOf(r));
    const rank = (j: Job) => (j.state === "making" ? 0 : j.state === "waiting" ? 1 : 2);
    const place = new Map(rows.map((j, i) => [j.id, i]));       // newest first
    const jobs = rows.sort((a, b) => rank(a) - rank(b) || (rank(a) === 1 ? place.get(b.id)! - place.get(a.id)! : place.get(a.id)! - place.get(b.id)!))
      .filter((j) => j.owner === who.key || j.state === "making" || j.state === "waiting")
      .map((j) => this.shown(j, who));
    return { jobs, now: rows.find((j) => j.state === "making")?.id ?? null };
  }
  /** a job as a caller is shown it: another person's by its being there, never by its name */
  shown(j: Job, who: Who) {
    const mine = j.owner === who.key;
    return { id: j.id, kind: j.kind, title: mine ? j.title : "someone else's making", state: j.state, step: mine ? j.step : "", stage: stageOf(j.state, j.step),
             progress: j.progress, at: j.at, started: j.started, ended: j.ended, error: mine ? j.error : null, by: j.ownerName, mine, result: mine ? j.result : null };
  }
  /** queue a making. Everything it names is checked now: the file is there, the asker may read it, it is the right kind */
  ask(kind: unknown, a: Record<string, any>, who: Who, device = ""): Job {
    if (!who.key) throw new HoardError(403, "only the household makes things here");
    if (!MAKE_KINDS.includes(kind as MakeKind)) throw new HoardError(400, "a making is spoken, magic, video or answer");
    const file = (id: unknown, looks: string[], what: string): HoardFile => {
      const f = this.H.file(String(id ?? ""), who);
      if (!looks.includes(looksOf(f.mime))) throw new HoardError(415, what);
      return f;
    };
    const voice = (v: unknown, auto = "auto") => { const s = String(v ?? auto); if (s !== "auto" && s !== "daemon" && !/^daemon:\d{1,4}$/.test(s)) throw new HoardError(400, "a voice is auto, daemon, or daemon:<its number>"); return s; };
    let title = "", args: Record<string, any> = {};
    if (kind === "spoken") {
      const f = file(a.of, ["text"], "only a text file is read aloud");
      args = { of: f.id, voice: voice(a.voice, "daemon") }; title = `"${f.name}" read aloud`;
    } else if (kind === "magic") {
      const f = file(a.of, ["image"], "only a picture is made to speak");
      args = { of: f.id, voice: voice(a.voice), words: typeof a.words === "string" ? a.words.trim().slice(0, WORDS_MOST) : "" }; title = `"${f.name}" speaks`;
    } else if (kind === "video") {
      const scenes = Array.isArray(a.scenes) ? a.scenes : [];
      if (!scenes.length || scenes.length > SCENES_MOST) throw new HoardError(400, `a magic video has 1 to ${SCENES_MOST} pictures`);
      const music = a.music === "under" || a.music === "song" ? a.music : "none";
      args = { music, musicPrompt: typeof a.musicPrompt === "string" ? a.musicPrompt.trim().slice(0, MUSIC_PROMPT_MOST) : "", title: typeof a.title === "string" ? a.title.trim().slice(0, TITLE_MOST) : "",
        scenes: scenes.map((s: any) => {
          const f = file(s?.of, ["image"], "a magic video is made of pictures");
          const say = s?.say === "words" || s?.say === "daemon" ? s.say : "auto";
          if (say === "words" && !String(s.words ?? "").trim()) throw new HoardError(400, "write what that picture says, or let it decide");
          if (say === "daemon" && !/^\d{1,4}$/.test(String(s.species ?? ""))) throw new HoardError(400, "pick the daemon that speaks");
          return { of: f.id, say, words: say === "words" ? String(s.words).trim().slice(0, WORDS_MOST) : "", species: say === "daemon" ? Number(s.species) : null };
        }) };
      if (music === "song" && args.scenes.some((s: any) => s.say !== "auto")) throw new HoardError(400, "a song carries the words only when no picture has a speaker");
      if (music !== "none" && !this.makers.music) throw new HoardError(503, "the house has no music door now");
      title = args.title || `a magic video of ${args.scenes.length} picture${args.scenes.length === 1 ? "" : "s"}`;
    } else {
      const f = this.H.file(String(a.of ?? ""), who);
      if (f.kind === "file" && !["image", "audio", "text"].includes(looksOf(f.mime))) throw new HoardError(415, "ask a picture, a recording, a text or a creation");
      const text = typeof a.text === "string" ? a.text.trim().slice(0, WORDS_MOST) : "";
      if (!text && typeof a.said !== "string") throw new HoardError(400, "ask it something");
      args = { of: f.id, text, said: typeof a.said === "string" ? a.said : "" }; title = text ? `"${f.name}" asked: ${text.slice(0, 60)}` : `"${f.name}" asked aloud`;
    }
    if ((kind === "magic" || kind === "video") && !this.makers.see) throw new HoardError(503, "the house has no model that sees now");
    const id = randomBytes(8).toString("hex");
    this.store.db.prepare("INSERT INTO hoard_jobs (id, kind, title, state, at, owner, owner_name, device, args) VALUES (?, ?, ?, 'waiting', ?, ?, ?, ?, ?)")
      .run(id, kind as string, title, this.now(), who.key, who.name.slice(0, 60), device.slice(0, 80), JSON.stringify(args));
    setTimeout(() => void this.next(), 0);
    return this.job(id)!;
  }
  /** stop a making of your own: a waiting one leaves the queue, the one in hand is given up */
  stop(id: string, who: Who): boolean {
    const j = this.job(id);
    if (!j) throw new HoardError(404, "no such making");
    if (j.owner !== who.key && !who.keeper) throw new HoardError(403, "only the one who asked for it stops it");
    if (j.state === "waiting") { this.set(id, { state: "stopped", ended: this.now() }); return true; }
    if (j.state === "making") { this.ctl?.abort(); return true; }
    return false;
  }
  /** make a failed or stopped one again, as it was asked */
  again(id: string, who: Who): Job {
    const j = this.job(id);
    if (!j) throw new HoardError(404, "no such making");
    if (j.owner !== who.key) throw new HoardError(403, "only the one who asked for it asks again");
    if (j.state !== "failed" && j.state !== "stopped") throw new HoardError(409, "only a failed or stopped making is made again");
    this.set(id, { state: "waiting", step: "", progress: 0, error: null, started: null, ended: null });
    this.store.db.prepare("UPDATE hoard_jobs SET at = ? WHERE id = ?").run(this.now(), id);      // it takes its turn at the end of the queue
    setTimeout(() => void this.next(), 0);
    return this.job(id)!;
  }
  /** resolves when nothing is being made or waiting (a test's) */
  idle(): Promise<void> {
    const open = this.store.db.prepare("SELECT COUNT(*) AS n FROM hoard_jobs WHERE state IN ('waiting', 'making')").get() as { n: number };
    if (!this.busy && !open.n) return Promise.resolve();
    return new Promise((ok) => this.settled.push(ok));
  }

  // ---- one at a time ----
  private async next(): Promise<void> {
    if (this.busy || this.paused) return;
    const r = this.store.db.prepare("SELECT * FROM hoard_jobs WHERE state = 'waiting' ORDER BY at, rowid LIMIT 1").get();
    if (!r) { for (const ok of this.settled.splice(0)) ok(); return; }
    const j = this.jobOf(r), work = join(this.dir, j.id);
    this.busy = true; this.ctl = new AbortController();
    this.set(j.id, { state: "making", started: this.now(), step: "starting", progress: 0 });
    mkdirSync(work, { recursive: true });
    try {
      const who: Who = { key: j.owner, name: j.ownerName };
      const made = await this.make(j, who, work, this.ctl.signal);
      this.set(j.id, { state: "done", ended: this.now(), progress: 1, step: "", result: made });
    } catch (e) {
      const stopped = this.ctl.signal.aborted || (e as Error)?.message === STOPPED;
      this.set(j.id, { state: stopped ? "stopped" : "failed", ended: this.now(), error: stopped ? null : String((e as Error)?.message ?? e).slice(0, 300) });
    } finally {
      rmSync(work, { recursive: true, force: true });
      this.busy = false; this.ctl = null;
      setTimeout(() => void this.next(), 20);
    }
  }
  private make(j: Job, who: Who, work: string, signal: AbortSignal): Promise<string> {
    const step = (s: string, p: number) => { if (signal.aborted) throw new Error(STOPPED); this.set(j.id, { step: s, progress: Math.max(0, Math.min(0.99, p)) }); };
    const heard = (text: string) => { this.store.db.prepare("UPDATE hoard_jobs SET args = ? WHERE id = ?").run(JSON.stringify({ ...j.args, text, said: "" }), j.id); };
    const m = new Making(this.H, this.makers, who, j, work, signal, step, this.now, heard);
    return j.kind === "spoken" ? m.spoken() : j.kind === "magic" ? m.magic() : j.kind === "video" ? m.video() : m.answer();
  }
}

/** one making, start to finish */
class Making {
  private H: Hoard; private K: Makers; private who: Who; private j: Job; private work: string; private signal: AbortSignal;
  private step: (s: string, p: number) => void; private now: () => number; private heard: (text: string) => void;
  private n = 0;
  constructor(H: Hoard, K: Makers, who: Who, j: Job, work: string, signal: AbortSignal, step: (s: string, p: number) => void, now: () => number, heard: (text: string) => void) {
    this.H = H; this.K = K; this.who = who; this.j = j; this.work = work; this.signal = signal; this.step = step; this.now = now; this.heard = heard;
  }
  private path(name: string) { return join(this.work, `${++this.n}-${name}`); }
  /** the file a making is made of, still its asker's to read, and its bytes on the hub */
  private async source(id: string): Promise<{ f: HoardFile; at: string }> {
    const f = this.H.rowOf_(id);
    if (!f) throw new Error("the file it was made of is gone");
    if (!canRead(f, this.who, this.now())) throw new Error("that file is no longer shared with you");
    return { f, at: await this.H.bring(f.sha, this.work) };
  }
  private async write(title: string, ask: { system: string; user: string }, most: number): Promise<string> {
    const t = await this.K.write(title, ask.system, ask.user, most, this.signal);
    if (!t?.trim()) throw new Error("the house's mind found no words");
    return t;
  }
  /** asked twice when its first answer cannot be read (a model's JSON slips) */
  private async read<T>(title: string, ask: { system: string; user: string }, most: number, parse: (t: string) => T): Promise<T> {
    try { return parse(await this.write(title, ask, most)); } catch (e) { if ((e as Error).message === STOPPED || this.signal.aborted) throw e; }
    return parse(await this.write(title, ask, most));
  }
  /** a line, or many breaths of one, said in one voice: a WAV */
  private async voice(text: string, recipe: string, from: number, to: number, what: string): Promise<Uint8Array> {
    const pieces = breaths(text), wavs: Uint8Array[] = [];
    for (let i = 0; i < pieces.length; i++) {
      this.step(pieces.length > 1 ? `${what} (${i + 1} of ${pieces.length})` : what, from + ((to - from) * i) / pieces.length);
      let w = await this.K.speak(pieces[i], recipe, this.signal);
      if (!w?.length) throw new Error("the voice did not come");
      if (!wavPcm(w)) {                        // the door sent something other than a plain WAV: made one, so its loudness can be read
        const said = this.path("said"), wav = this.path("wav");
        writeFileSync(said, w);
        await this.K.ffmpeg(plainWavArgs(), { said }, { wav }, { title: `${this.j.title}: its voice, plain`, expectMs: 5000 });
        w = new Uint8Array(readFileSync(wav));
      }
      wavs.push(w);
    }
    const all = joinWavs(wavs);
    if (!all) throw new Error("its voice could not be put together");
    return all;
  }
  /** the picture as a square JPEG, and what is in it (kept with the picture, so it is looked at once) */
  private async seen(f: HoardFile, at: string): Promise<{ seen: Seen; square: string }> {
    const square = this.path("square");
    await this.K.ffmpeg(squareArgs(), { photo: at }, { square }, { title: `${this.j.title}: its picture`, expectMs: 8000 });
    const kept = (this.H.rowOf_(f.id)?.meta as { seen?: Seen } | undefined)?.seen;
    if (kept?.description) return { seen: kept, square };
    if (!this.K.see) throw new Error("the house has no model that sees now");
    const jpeg = new Uint8Array(readFileSync(square));
    let seen: Seen;
    try { seen = readSeen(await this.K.see(jpeg, SEE_PROMPT, this.signal)); }
    catch (e) { if (this.signal.aborted) throw new Error(STOPPED); seen = readSeen(await this.K.see(jpeg, SEE_PROMPT, this.signal)); }
    this.H.noteMeta(f.id, { seen });
    return { seen, square };
  }
  /** a square picture and a voice as one scene of video: the stills, the voice's loudness, ffmpeg */
  private async speaking(square: string, mouth: Mouth | null, wav: Uint8Array, title: string): Promise<string> {
    const pixels = this.path("pixels"), video = this.path("scene");
    await this.K.ffmpeg(pixelArgs(), { square }, { pixels }, { title: `${title}: its pixels`, expectMs: 5000 });
    const rgb = new Uint8Array(readFileSync(pixels));
    if (rgb.length !== SIDE * SIDE * 3) throw new Error("the picture could not be read");
    const stills = mouth ? jawStills(rgb, SIDE, SIDE, { x: mouth.x * SIDE, y: mouth.y * SIDE, w: mouth.w * SIDE, chin: mouth.chin * SIDE }) : glowStills(rgb);
    const ins: Record<string, string> = {};
    stills.forEach((s, i) => { const p = this.path(`still${i}`); writeFileSync(p, pngOf(s, SIDE, SIDE)); ins[`still${i}`] = p; });
    const voice = this.path("voice"); writeFileSync(voice, wav);
    const { levels, seconds } = mouthLevels(wav, FPS, LEVELS);
    await this.K.ffmpeg(speakArgs(selectCommands(levels, FPS)), { ...ins, voice }, { video }, { title: `${title}: its mouth`, expectMs: 15_000 + seconds * 2500 });
    return video;
  }
  private async keep(at: string, o: { name: string; mime: string; kind: "spoken" | "magic" | "video" | "answer"; of: string | null; meta: Record<string, unknown> }): Promise<string> {
    this.step("keeping it", 0.97);
    const r = await this.H.take(createReadStream(at), { name: o.name, mime: o.mime, kind: o.kind, of: o.of ?? undefined, meta: o.meta, share: "me" }, this.who);
    return r.file.id;
  }
  private async asAudio(wav: Uint8Array, title: string): Promise<string> {
    const voice = this.path("voice"), audio = this.path("audio");
    writeFileSync(voice, wav);
    await this.K.ffmpeg(voiceFileArgs(), { voice }, { audio }, { title: `${title}: its file`, expectMs: 8000 });
    return audio;
  }
  private daemon(name: string) {
    const d = this.K.daemon(name, this.j.device);
    if (!d) throw new Error(name === "daemon" ? "no daemon is on that device to read it" : "that daemon is not one of yours");
    return d;
  }

  // ---- SPOKEN: a text file read aloud (C-603) ----
  async spoken(): Promise<string> {
    this.step("reading it", 0.02);
    const { f } = await this.source(this.j.args.of);
    const got = await this.H.text(f.sha, f.size);
    const text = got.text.replace(/\r/g, "").trim();
    if (!text) throw new Error("there are no words in it to read");
    const said = text.slice(0, SPOKEN_MOST), whole = got.whole && text.length <= SPOKEN_MOST;
    this.step("finding its voice", 0.06);
    const v = String(this.j.args.voice);
    let recipe: string, by: string;
    if (v === "auto") {      // the synesthesia persona: a reader cast from the file's own facts
      recipe = await this.read(`${this.j.title}: its voice`, textVoiceAsk({ name: f.name, kind: f.mime, words: said.split(/\s+/).length, opening: said.slice(0, 700),
                                                                          added: new Date(f.added).toISOString().slice(0, 10) }), 200, readPersona);
      by = "its own voice";
    } else { const d = this.daemon(v); recipe = d.recipe; by = d.name; }
    const wav = await this.voice(said, recipe, 0.1, 0.9, "reading it aloud");
    this.step("putting it together", 0.92);
    const audio = await this.asAudio(wav, this.j.title);
    return this.keep(audio, { name: `${base(f.name)} (read aloud).m4a`, mime: "audio/mp4", kind: "spoken", of: f.id,
                              meta: { persona: recipe, voice: v, by, whole, words: said.split(/\s+/).length, opening: said.slice(0, 280), seconds: Math.round(wavPcm(wav)?.seconds ?? 0) } });
  }

  // ---- MAGIC: a picture that speaks (C-577) ----
  private async sceneOf(of: string, o: { say: "auto" | "words" | "daemon"; words?: string; voice?: string; species?: number | null }, from: number, to: number, label: string) {
    const span = to - from, { f, at } = await this.source(of);
    this.step(`${label}looking`, from + span * 0.05);
    const { seen, square } = await this.seen(f, at);
    this.step(`${label}finding its words`, from + span * 0.3);
    let persona: string, phrase: string, by = "its own voice";
    const picked = o.say === "daemon" ? `daemon:${o.species}` : o.voice && o.voice !== "auto" ? o.voice : "";
    if (picked) {                  // a daemon speaks: its own voice; the words the person's, else what it says on seeing the picture
      const d = this.daemon(picked);
      persona = d.recipe; by = d.name;
      phrase = o.words?.trim() || (await this.read(`${this.j.title}: what ${d.name} says`, imagineAsk(seen, { as: d.persona }), 200, (t) => readImagined(t, { persona }))).phrase;
    } else {
      ({ persona, phrase } = await this.read(`${this.j.title}: its words`, imagineAsk(seen, { words: o.words }), 300, (t) => readImagined(t, { words: o.words })));
    }
    const wav = await this.voice(phrase, persona, from + span * 0.45, from + span * 0.75, `${label}finding its voice`);
    this.step(`${label}moving its mouth`, from + span * 0.8);
    const video = await this.speaking(square, seen.mouth, wav, this.j.title);
    return { f, seen, persona, phrase, by, video, seconds: wavPcm(wav)?.seconds ?? 0 };
  }
  async magic(): Promise<string> {
    const a = this.j.args;
    const s = await this.sceneOf(a.of, { say: a.words ? "words" : "auto", words: a.words, voice: a.voice }, 0, 0.95, "");
    return this.keep(s.video, { name: `${base(s.f.name)} (speaking).mp4`, mime: "video/mp4", kind: "magic", of: s.f.id,
      meta: { phrase: s.phrase, persona: s.persona, by: s.by, tag: s.seen.tag, description: s.seen.description, colours: s.seen.colours, mood: s.seen.mood,
              mouth: s.seen.mouth, seconds: Math.round(s.seconds) } });
  }

  // ---- VIDEO: a sequence of pictures, with music under them or a song (C-604) ----
  async video(): Promise<string> {
    const a = this.j.args, n = a.scenes.length as number, music = a.music as "none" | "under" | "song";
    const scenes: { video: string; of: string; phrase: string; persona: string; by: string; seconds: number; mood: string; description: string }[] = [];
    if (music === "song") {
      // no picture speaks: the song carries the words -- written from what the pictures hold, then each picture held its share of it
      const seen: { f: HoardFile; seen: Seen; square: string }[] = [];
      for (let i = 0; i < n; i++) {
        this.step(`picture ${i + 1} of ${n}: looking`, (0.4 * i) / n);
        const { f, at } = await this.source(a.scenes[i].of);
        seen.push({ f, ...(await this.seen(f, at)) });
      }
      this.step("writing the song", 0.42);
      const song = await this.read(`${this.j.title}: its song`, sequenceSongAsk(seen.map((s) => s.seen.description), a.musicPrompt), 600, readSong);
      const seconds = Math.max(30, Math.min(150, n * 8)), track = this.path("music");
      this.step("making the song", 0.5);
      await this.K.music!({ song: true, caption: a.musicPrompt || song.style, lyrics: song.lyrics, seconds, to: track }, this.signal);
      for (let i = 0; i < n; i++) {
        this.step(`picture ${i + 1} of ${n}: its place in the song`, 0.8 + (0.1 * i) / n);
        const video = this.path("scene");
        await this.K.ffmpeg(stillArgs(seconds / n), { square: seen[i].square }, { video }, { title: `${this.j.title}: picture ${i + 1}`, expectMs: 10_000 });
        scenes.push({ video, of: seen[i].f.id, phrase: "", persona: "", by: "", seconds: seconds / n, mood: seen[i].seen.mood, description: seen[i].seen.description });
      }
      return this.joined(scenes, music, track, { song });
    }
    for (let i = 0; i < n; i++) {
      const s = a.scenes[i];
      const r = await this.sceneOf(s.of, { say: s.say, words: s.words, species: s.species }, (0.8 * i) / n, (0.8 * (i + 1)) / n, `picture ${i + 1} of ${n}: `);
      scenes.push({ video: r.video, of: r.f.id, phrase: r.phrase, persona: r.persona, by: r.by, seconds: r.seconds + 0.7, mood: r.seen.mood, description: r.seen.description });
    }
    let track = "";
    if (music === "under") {
      this.step("making the music", 0.82);
      track = this.path("music");
      await this.K.music!({ song: false, caption: underscoreCaption(scenes.map((s) => s.mood), a.musicPrompt), seconds: Math.max(20, Math.ceil(scenes.reduce((t, s) => t + s.seconds, 0)) + 2), to: track }, this.signal);
    }
    return this.joined(scenes, music, track, {});
  }
  private async joined(scenes: { video: string; of: string; phrase: string; persona: string; by: string; seconds: number }[], music: "none" | "under" | "song", track: string,
                       more: Record<string, unknown>): Promise<string> {
    this.step("putting it together", 0.92);
    const out = this.path("video");
    const ins: Record<string, string> = Object.fromEntries(scenes.map((s, i) => [`scene${i}`, s.video]));
    if (music !== "none") ins.music = track;
    const total = scenes.reduce((t, s) => t + s.seconds, 0);
    await this.K.ffmpeg(joinArgs(scenes.length, music), ins, { video: out }, { title: `${this.j.title}: joined`, expectMs: 20_000 + total * 3000 });
    const title = String(this.j.args.title || this.j.title);
    return this.keep(out, { name: `${title.replace(/[\\/:"]/g, "").slice(0, 80)}.mp4`, mime: "video/mp4", kind: "video", of: null,
      meta: { title, music, seconds: Math.round(total), scenes: scenes.map((s) => ({ of: s.of, phrase: s.phrase, by: s.by })), ...more } });
  }

  // ---- ANSWER: a file asked something (C-606) ----
  async answer(): Promise<string> {
    const a = this.j.args;
    let question = String(a.text ?? "");
    if (!question) {                        // it was spoken: made hearable, then heard
      this.step("hearing the question", 0.05);
      const wav = this.path("heard");
      await this.K.ffmpeg(hearableArgs(), { said: a.said }, { wav }, { title: `${this.j.title}: what was said`, expectMs: 6000 });
      question = ((await this.K.hear(new Uint8Array(readFileSync(wav)))) ?? "").trim().slice(0, WORDS_MOST);
      rmSync(a.said, { force: true });
      if (!question) throw new Error("nothing was heard: ask it again, a little nearer");
      this.heard(question);                 // kept with the job as its words: the recording is gone, and it can still be made again
    }
    this.step("remembering what it is", 0.15);
    const { f, at } = await this.source(a.of);
    const self = await this.selfOf(f, at);
    this.step("thinking", 0.4);
    const answer = cleanAnswer(await this.write(`${this.j.title}: its answer`, askedAsk(self, question), 220));
    if (!answer) throw new Error("it found nothing to say");
    const wav = await this.voice(answer, self.persona ?? "", 0.6, 0.9, "finding its voice");
    const audio = await this.asAudio(wav, this.j.title);
    return this.keep(audio, { name: `${base(f.name)} (answer).m4a`, mime: "audio/mp4", kind: "answer", of: f.id,
                              meta: { question, answer, persona: self.persona ?? "", seconds: Math.round(wavPcm(wav)?.seconds ?? 0) } });
  }
  /** what a file is, to itself: from what a making already learned of it, or learned now and kept */
  private async selfOf(f: HoardFile, at: string): Promise<FileSelf> {
    const meta = f.meta as Record<string, any>, looks = looksOf(f.mime);
    if (f.kind === "magic" || f.kind === "answer" || f.kind === "spoken")
      return { name: f.name, what: f.kind === "magic" ? "a picture that speaks" : f.kind === "spoken" ? "a text that is read aloud" : "an answer that was given",
               description: meta.description ?? meta.opening ?? meta.question, said: meta.phrase ?? meta.answer, persona: meta.persona };
    if (f.kind === "video")
      return { name: f.name, what: "a film of pictures", description: (meta.scenes ?? []).map((s: any) => s.phrase).filter(Boolean).join(" / ").slice(0, 600),
               persona: meta.persona ?? "A warm, unhurried storyteller's voice, middle-aged, clear and kind." };
    if (looks === "image") {
      const { seen } = await this.seen(f, at);
      let voice = meta.voice as { persona?: string; phrase?: string } | undefined;
      if (!voice?.persona) { voice = await this.read(`${this.j.title}: its voice`, imagineAsk(seen), 300, readImagined); this.H.noteMeta(f.id, { voice }); }
      return { name: f.name, what: "a picture", description: seen.description, said: voice.phrase, persona: voice.persona };
    }
    if (looks === "audio") {
      let heard = String(meta.heard ?? "");
      if (!heard) {
        const wav = this.path("heard");
        await this.K.ffmpeg(hearableArgs(), { said: at }, { wav }, { title: `${this.j.title}: what is in it`, expectMs: 8000 });
        heard = ((await this.K.hear(new Uint8Array(readFileSync(wav)))) ?? "").trim().slice(0, 1500);
        this.H.noteMeta(f.id, { heard: heard || "(no words: sound or music)" });
      }
      let persona = String(meta.persona ?? "");
      if (!persona) { persona = await this.read(`${this.j.title}: its voice`, textVoiceAsk({ name: f.name, kind: "a recording", words: heard.split(/\s+/).length, opening: heard || "sound, no words" }), 200, readPersona); this.H.noteMeta(f.id, { persona }); }
      return { name: f.name, what: "a recording", heard: heard || "sound or music, no words", persona };
    }
    const text = (await this.H.text(f.sha, f.size)).text.trim();
    let persona = String(meta.persona ?? "");
    if (!persona) { persona = await this.read(`${this.j.title}: its voice`, textVoiceAsk({ name: f.name, kind: f.mime, words: text.split(/\s+/).length, opening: text.slice(0, 700) }), 200, readPersona); this.H.noteMeta(f.id, { persona }); }
    return { name: f.name, what: "a written file", description: text.slice(0, 1500), persona };
  }
}

/** a text in breaths a voice says whole: cut at its paragraphs, then its sentences */
export function breaths(text: string, most = PIECE): string[] {
  const out: string[] = [];
  for (const p of text.split(/\n\s*\n/).map((x) => x.replace(/\s+/g, " ").trim()).filter(Boolean)) {
    if (p.length <= most) { out.push(p); continue; }
    let cur = "";
    for (const s of p.match(/[^.!?]+[.!?]*\s*/g) ?? [p]) {
      if ((cur + s).length > most && cur) { out.push(cur.trim()); cur = ""; }
      for (let i = 0; i < s.length; i += most) { const part = s.slice(i, i + most); if ((cur + part).length > most && cur) { out.push(cur.trim()); cur = ""; } cur += part; }
    }
    if (cur.trim()) out.push(cur.trim());
  }
  // short neighbours said in one breath, so a list of one-line paragraphs is not a hundred voices
  const joined: string[] = [];
  for (const p of out) { const last = joined[joined.length - 1]; if (last !== undefined && (last + " " + p).length <= most) joined[joined.length - 1] = `${last} ${p}`; else joined.push(p); }
  return joined;
}
