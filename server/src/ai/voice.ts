// C-66, C-65: the daemon's voice, for a handheld. The voice server speaks mp3, which a small board cannot decode; the
// handheld's speaker takes 16 kHz, 16-bit mono, the rate its tunes are played at. So the server converts each answer
// once (ffmpeg, else macOS's own afconvert) and keeps it a few minutes on a shelf, and the board streams it from
// GET /api/device/voice/<id> straight into its speaker -- never holding the whole of it.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

export const DEVICE_RATE = 16000;

function run(cmd: string, args: string[], input?: Buffer): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { stdio: ["pipe", "pipe", "ignore"] });
    const out: Buffer[] = [];
    p.stdout.on("data", (c: Buffer) => out.push(c));
    p.on("error", () => resolve(null));
    p.on("close", (code) => resolve(code === 0 ? Buffer.concat(out) : null));
    p.stdin.on("error", () => {});
    p.stdin.end(input);
  });
}

export const FOUND_FFMPEG = ["/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg", "/usr/bin/ffmpeg"].find(existsSync);
const FFMPEG = FOUND_FFMPEG ?? "ffmpeg";
const AFCONVERT = "/usr/bin/afconvert";
// whether a converter is where toDevicePcm looks for one (the tests skip on it; the hub's ffmpeg is /usr/bin's)
export const CAN_CONVERT = FOUND_FFMPEG !== undefined || existsSync(AFCONVERT);

// Any audio the converters read (mp3, wav, the phone's m4a) -> raw 16 kHz 16-bit little-endian mono. null when neither
// could. The audio goes to a file first, never a pipe: an m4a with its index (moov) at the end, as the phone and ffmpeg
// both write them, cannot be read from a pipe once it is longer than ffmpeg's buffer (the hub has no afconvert to fall
// back on, C-168).
export async function toDevicePcm(audio: Buffer): Promise<Buffer | null> {
  const dir = mkdtempSync(join(tmpdir(), "daemons-voice-"));
  try {
    const input = join(dir, "in.mp3");                  // the name afconvert has always been given; both read the bytes
    writeFileSync(input, audio);
    const viaFfmpeg = await run(FFMPEG, ["-hide_banner", "-loglevel", "error", "-i", input,
                                         "-f", "s16le", "-ac", "1", "-ar", String(DEVICE_RATE), "pipe:1"]);
    if (viaFfmpeg && viaFfmpeg.length) return viaFfmpeg;
    if (!existsSync(AFCONVERT)) return null;
    const ok = await run(AFCONVERT, ["-f", "WAVE", "-d", `LEI16@${DEVICE_RATE}`, "-c", "1", input, join(dir, "out.wav")]);
    if (ok === null) return null;
    return pcmOfWav(readFileSync(join(dir, "out.wav")));
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

// 2026-11-05: a WAV (the Tiiny's voice, the board's) as an MP3 for the phone -- the app files every voice as .mp3, and
// iOS decodes by the name, so a WAV under it plays as static. Anything not a WAV, or a WAV ffmpeg cannot read, as it came.
export async function mp3OfWav(audio: Buffer): Promise<Buffer | null> {
  if (audio.length < 12 || audio.toString("latin1", 0, 4) !== "RIFF") return null;
  const mp3 = await run(FFMPEG, ["-hide_banner", "-loglevel", "error", "-f", "wav", "-i", "pipe:0",
                                 "-codec:a", "libmp3lame", "-b:a", "64k", "-ac", "1", "-f", "mp3", "pipe:1"], audio);
  return mp3 && mp3.length ? mp3 : null;
}
export async function phoneAudio<T extends Record<string, unknown>>(r: T): Promise<T> {
  if (typeof r.audioBase64 !== "string" || !r.audioBase64) return r;
  const mp3 = await mp3OfWav(Buffer.from(r.audioBase64, "base64")).catch(() => null);
  return mp3 ? { ...r, audioBase64: mp3.toString("base64"), audioMime: "audio/mpeg" } : r;
}

// C-317: a voice streamed to the phone while it is still being made -- the Tiiny's PCM (or WAV) turned to MP3 as it
// arrives (iOS and the browsers play an MP3 as it comes; a WAV they want whole), kept on a shelf by an id nobody can
// guess, and sent to whoever asks for it from its first bytes on: one that asks late gets what is made, then follows.
// The hub has one core; LAME keeps up with a 24 kHz voice many times over.
type Flow = { chunks: Buffer[]; done: boolean; failed: boolean; at: number; follow: Set<(c: Buffer | null) => void> };
export const STREAM_KEEP_MS = 10 * 60_000, STREAM_MOST_MS = 120_000;
export class VoiceStreams {
  private flows = new Map<string, Flow>();
  constructor(private now = () => Date.now()) {}
  open(): string {
    for (const [k, f] of this.flows) if (this.now() - f.at > STREAM_KEEP_MS) this.flows.delete(k);
    const id = randomBytes(16).toString("hex");
    this.flows.set(id, { chunks: [], done: false, failed: false, at: this.now(), follow: new Set() });
    return id;
  }
  push(id: string, c: Buffer) {
    const f = this.flows.get(id);
    if (!f || f.done || !c.length) return;
    f.chunks.push(c); f.follow.forEach((g) => g(c));
  }
  end(id: string, failed = false) {
    const f = this.flows.get(id);
    if (!f || f.done) return;
    f.done = true; f.failed = failed; f.follow.forEach((g) => g(null)); f.follow.clear();
  }
  has = (id: string) => this.flows.has(id);
  done = (id: string) => this.flows.get(id)?.done ?? true;
  whole = (id: string) => { const f = this.flows.get(id); return f?.done ? Buffer.concat(f.chunks) : null; };
  // what is made, then each new piece as it comes, and the end; false when there is no such voice
  follow(id: string, take: (c: Buffer) => void, end: () => void): (() => void) | false {
    const f = this.flows.get(id);
    if (!f) return false;
    f.chunks.forEach(take);
    if (f.done) { end(); return () => {}; }
    const g = (c: Buffer | null) => (c ? take(c) : end());
    f.follow.add(g);
    return () => f.follow.delete(g);
  }
}

// One MP3 encoder feeding the shelf: 16-bit mono PCM in, at `rate`, MP3 out as it is made (no ID3, no Xing frame -- a
// player reading a stream would take that frame's "no length" at its word). A sample split across two pieces kept whole.
function mp3Into(shelf: VoiceStreams, id: string, rate: number) {
  const enc = spawn(FFMPEG, ["-hide_banner", "-loglevel", "error", "-f", "s16le", "-ar", String(rate), "-ac", "1", "-i", "pipe:0",
                             "-codec:a", "libmp3lame", "-b:a", "64k", "-write_xing", "0", "-id3v2_version", "0",
                             "-flush_packets", "1", "-f", "mp3", "pipe:1"], { stdio: ["pipe", "pipe", "ignore"] });
  enc.stdout.on("data", (c: Buffer) => shelf.push(id, c));
  enc.stdin.on("error", () => {});
  const closed = new Promise<void>((resolve) => {
    enc.on("error", () => { shelf.end(id, true); resolve(); });
    enc.on("close", (code) => { shelf.end(id, code !== 0); resolve(); });
  });
  let odd: Buffer | null = null;
  return {
    feed(b: Buffer) {
      const all = odd ? Buffer.concat([odd, b]) : b, even = all.length & ~1;
      odd = even < all.length ? all.subarray(even) : null;
      if (even) enc.stdin.write(all.subarray(0, even));
    },
    end() { enc.stdin.end(); return closed; },
  };
}
export type Streamed = { first: Uint8Array; rest: ReadableStreamDefaultReader<Uint8Array>; kind: "wav" | "mp3" | "pcm" };
// A streamed voice's samples, fed on as they come: a WAV's header taken off (its rate said), PCM as it is
async function samplesOf(s: Streamed, feed: (b: Buffer) => void, rate: number): Promise<number> {
  let head = Buffer.from(s.first);
  if (s.kind === "wav") {
    rate = head.length >= 28 ? head.readUInt32LE(24) || rate : rate;
    const at = head.indexOf("data", 12, "latin1");
    head = at >= 0 ? head.subarray(at + 8) : head.subarray(44);
  }
  feed(head);
  try { for (;;) { const { done, value } = await s.rest.read(); if (done) break; feed(Buffer.from(value)); } }
  catch { /* what came is said */ }
  return rate;
}

// The upstream voice into the shelf as MP3. Pcm is the Tiiny's 24 kHz, 16-bit mono; a WAV says its own rate; an MP3 goes
// as it is. Ends the flow, failed or not, and never past STREAM_MOST_MS.
export async function streamMp3(shelf: VoiceStreams, id: string, first: Uint8Array, rest: ReadableStreamDefaultReader<Uint8Array>,
                                kind: "wav" | "mp3" | "pcm", rate = 24000): Promise<void> {
  const stop = setTimeout(() => { rest.cancel().catch(() => {}); }, STREAM_MOST_MS);
  try {
    if (kind === "mp3") {
      shelf.push(id, Buffer.from(first));
      try { for (;;) { const { done, value } = await rest.read(); if (done) break; shelf.push(id, Buffer.from(value)); } shelf.end(id); }
      catch { shelf.end(id, true); }
      return;
    }
    if (kind === "wav" && first.length >= 28) rate = Buffer.from(first).readUInt32LE(24) || rate;
    const enc = mp3Into(shelf, id, rate);
    await samplesOf({ first, rest, kind }, (b) => enc.feed(b), rate);
    await enc.end();
  } finally { clearTimeout(stop); }
}

// C-317: the voice in growing parts. Between the hub and the Tiiny sits LiteLLM, which hands a voice on only once it is
// whole (measured 2026-11-10: the first byte at 13 s, streamed or not) -- so the answer is asked for a part at a time,
// the first short (its words are heard in a few seconds), each next one longer, made while the one before is playing.
// The Tiiny makes about 1.55 s of speech a second, plus about a second to begin, so each part may be about half as long
// again as the one before and still be ready in time. Cut at sentences, else clauses, else words.
export const FIRST_PART = 70, PART_GROWS = 1.45, PART_MOST = 360;
export function voiceParts(text: string): string[] {
  const words = text.replace(/\s+/g, " ").trim();
  if (!words) return [];
  // the places a part may end, best first: a sentence's end, then a clause's, then any space
  const out: string[] = [];
  let rest = words, want = FIRST_PART;
  while (rest.length > want * 1.3) {
    const cut = (re: RegExp) => { let best = -1; for (const m of rest.matchAll(re)) { const e = m.index! + m[0].length; if (e >= want * 0.6 && e <= want * 1.3) { if (best < 0 || Math.abs(e - want) < Math.abs(best - want)) best = e; } } return best; };
    let e = cut(/[.!?]["')]?\s/g);
    if (e < 0) e = cut(/[,;:\u2014-]\s/g);
    if (e < 0) e = cut(/\s/g);
    if (e < 0) break;
    out.push(rest.slice(0, e).trim()); rest = rest.slice(e).trim();
    want = Math.min(PART_MOST, Math.round(want * PART_GROWS));
  }
  if (rest) out.push(rest);
  return out;
}
// Each part asked in turn and said into the one MP3, a breath between; `ask` gives a part's voice streamed, or null. The
// first part asked by the caller (it waits on it), the rest here. Ends the flow; a part that will not come ends it there.
export async function streamParts(shelf: VoiceStreams, id: string, first: Streamed, parts: string[],
                                  ask: (part: string) => Promise<Streamed | null>, rate = 24000, gapMs = 120): Promise<void> {
  if (first.kind === "mp3") return streamMp3(shelf, id, first.first, first.rest, "mp3");   // MP3s are not joined here: the first part alone
  if (first.kind === "wav" && first.first.length >= 28) rate = Buffer.from(first.first).readUInt32LE(24) || rate;
  const enc = mp3Into(shelf, id, rate), started = Date.now();
  const gap = Buffer.alloc(Math.round((rate * gapMs) / 1000) * 2);
  await samplesOf(first, (b) => enc.feed(b), rate);
  // the next part is asked as soon as the one before has arrived -- not when it has played
  let next = parts.length ? ask(parts[0]) : null;
  for (let i = 0; i < parts.length && next; i++) {
    if (Date.now() - started > STREAM_MOST_MS) break;
    const got = await next.catch(() => null);
    if (!got || got.kind === "mp3") break;
    next = i + 1 < parts.length ? ask(parts[i + 1]) : null;
    enc.feed(gap);
    await samplesOf(got, (b) => enc.feed(b), rate);
  }
  await enc.end();
}

// 2026-11-07 (the user: a dream or a journal's chapter, its voice made once and kept, and exported): a long piece read
// in parts the voice takes at once, cut at its sentences, and the parts' voices joined into one, a breath between.
export const PIECE_MOST = 560;
export function voicePieces(text: string, most = PIECE_MOST): string[] {
  const out: string[] = [];
  for (const p of text.split(/\n\s*\n/).map((x) => x.replace(/\s+/g, " ").trim()).filter(Boolean)) {
    if (p.length <= most) { out.push(p); continue; }
    let cur = "";
    for (const s of p.match(/[^.!?]+[.!?]*\s*/g) ?? [p]) {
      if ((cur + s).length > most && cur) { out.push(cur.trim()); cur = ""; }
      cur += s.length > most ? s.slice(0, most) : s;
    }
    if (cur.trim()) out.push(cur.trim());
  }
  return out;
}
export const JOIN_RATE = 24000;
export async function joinVoices(parts: Buffer[], gapMs = 400): Promise<Buffer | null> {
  if (parts.length === 1) return parts[0];
  const gap = Buffer.alloc(Math.round((JOIN_RATE * gapMs) / 1000) * 2), pcms: Buffer[] = [];
  for (const p of parts) {
    const pcm = await run(FFMPEG, ["-hide_banner", "-loglevel", "error", "-i", "pipe:0", "-f", "s16le", "-ac", "1",
                                   "-ar", String(JOIN_RATE), "pipe:1"], p);
    if (!pcm || !pcm.length) return null;
    pcms.push(pcms.length ? gap : Buffer.alloc(0), pcm);
  }
  return wavOf(Buffer.concat(pcms), JOIN_RATE);
}

// 16 kHz samples as a WAV -- what the speech-to-text server is sent, whatever the device recorded (C-66: the phone
// records AAC, the handheld a WAV already).
export function wavOf(pcm: Buffer, rate = DEVICE_RATE): Buffer {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0, "latin1"); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVEfmt ", 8, "latin1");
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36, "latin1"); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

// Any recording as a 16 kHz WAV, or as it came when it could not be converted.
export async function asWav(audio: Buffer): Promise<{ audio: Buffer; mime: string } | null> {
  const pcm = await toDevicePcm(audio);
  return pcm && pcm.length ? { audio: wavOf(pcm), mime: "audio/wav" } : null;
}

// The samples of a PCM WAV: its "data" chunk.
export function pcmOfWav(wav: Buffer): Buffer | null {
  if (wav.length < 12 || wav.toString("latin1", 0, 4) !== "RIFF" || wav.toString("latin1", 8, 12) !== "WAVE") return null;
  for (let at = 12; at + 8 <= wav.length; ) {
    const id = wav.toString("latin1", at, at + 4), len = wav.readUInt32LE(at + 4);
    if (id === "data") return wav.subarray(at + 8, Math.min(wav.length, at + 8 + len));
    at += 8 + len + (len & 1);
  }
  return null;
}

// C-66: what was said lately, per device, so the daemon remembers the last few things -- six exchanges, forgotten after
// fifteen quiet minutes (a conversation, not a diary; nothing is written down).
export class Conversations {
  private talks = new Map<string, { turns: { text: string; answer: string }[]; at: number }>();
  constructor(private quietMs = 15 * 60 * 1000, private most = 6) {}
  history(who: string, now = Date.now()) {
    const t = this.talks.get(who);
    return t && now - t.at <= this.quietMs ? t.turns : [];
  }
  add(who: string, text: string, answer: string, now = Date.now()) {
    if (!text || !answer) return;
    const turns = [...this.history(who, now), { text, answer }].slice(-this.most);
    this.talks.set(who, { turns, at: now });
  }
}

// A few answers, kept long enough for a board to fetch them, then gone.
export class VoiceShelf {
  private items = new Map<string, { pcm: Buffer; at: number }>();
  constructor(private keepMs = 10 * 60 * 1000, private most = 6) {}
  put(pcm: Buffer, now = Date.now()): string {
    for (const [k, v] of this.items) if (now - v.at > this.keepMs) this.items.delete(k);
    while (this.items.size >= this.most) this.items.delete(this.items.keys().next().value!);
    const id = randomBytes(6).toString("hex");
    this.items.set(id, { pcm, at: now });
    return id;
  }
  get(id: string, now = Date.now()): Buffer | null {
    const v = this.items.get(id);
    return v && now - v.at <= this.keepMs ? v.pcm : null;
  }
}
