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
