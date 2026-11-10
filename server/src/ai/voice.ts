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

// The upstream voice into the shelf as MP3: its first bytes (already read) and the rest. Pcm is the Tiiny's 24 kHz, 16-bit
// mono; a WAV says its own rate; an MP3 goes as it is. Ends the flow, failed or not, and never past STREAM_MOST_MS.
export function streamMp3(shelf: VoiceStreams, id: string, first: Uint8Array, rest: ReadableStreamDefaultReader<Uint8Array>,
                          kind: "wav" | "mp3" | "pcm", rate = 24000): Promise<void> {
  const stop = setTimeout(() => { rest.cancel().catch(() => {}); }, STREAM_MOST_MS);
  if (kind === "mp3") {
    return (async () => {
      shelf.push(id, Buffer.from(first));
      try { for (;;) { const { done, value } = await rest.read(); if (done) break; shelf.push(id, Buffer.from(value)); } shelf.end(id); }
      catch { shelf.end(id, true); } finally { clearTimeout(stop); }
    })();
  }
  let head = Buffer.from(first);
  if (kind === "wav") {                                   // the header off: its rate kept, its samples fed on as PCM
    rate = head.length >= 28 ? head.readUInt32LE(24) || rate : rate;
    const at = head.indexOf("data", 12, "latin1");
    head = at >= 0 ? head.subarray(at + 8) : head.subarray(44);
  }
  const enc = spawn(FFMPEG, ["-hide_banner", "-loglevel", "error", "-f", "s16le", "-ar", String(rate), "-ac", "1", "-i", "pipe:0",
                             "-codec:a", "libmp3lame", "-b:a", "64k", "-write_xing", "0", "-id3v2_version", "0",
                             "-flush_packets", "1", "-f", "mp3", "pipe:1"], { stdio: ["pipe", "pipe", "ignore"] });
  enc.stdout.on("data", (c: Buffer) => shelf.push(id, c));
  enc.stdin.on("error", () => {});
  return new Promise((resolve) => {
    enc.on("error", () => { clearTimeout(stop); shelf.end(id, true); resolve(); });
    enc.on("close", (code) => { clearTimeout(stop); shelf.end(id, code !== 0); resolve(); });
    (async () => {
      let odd: Buffer | null = null;                      // a sample split across two pieces is kept whole
      const feed = (b: Buffer) => {
        const all = odd ? Buffer.concat([odd, b]) : b, even = all.length & ~1;
        odd = even < all.length ? all.subarray(even) : null;
        if (even) enc.stdin.write(all.subarray(0, even));
      };
      try { feed(head); for (;;) { const { done, value } = await rest.read(); if (done) break; feed(Buffer.from(value)); } }
      catch { /* what came is said */ }
      enc.stdin.end();
    })();
  });
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
