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

const FFMPEG = ["/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg", "/usr/bin/ffmpeg"].find(existsSync) ?? "ffmpeg";

// Any audio the converters read (mp3, wav) -> raw 16 kHz 16-bit little-endian mono. null when neither could.
export async function toDevicePcm(audio: Buffer): Promise<Buffer | null> {
  const viaFfmpeg = await run(FFMPEG, ["-hide_banner", "-loglevel", "error", "-i", "pipe:0",
                                       "-f", "s16le", "-ac", "1", "-ar", String(DEVICE_RATE), "pipe:1"], audio);
  if (viaFfmpeg && viaFfmpeg.length) return viaFfmpeg;
  if (!existsSync("/usr/bin/afconvert")) return null;
  const dir = mkdtempSync(join(tmpdir(), "daemons-voice-"));
  try {
    writeFileSync(join(dir, "in.mp3"), audio);
    const ok = await run("/usr/bin/afconvert", ["-f", "WAVE", "-d", `LEI16@${DEVICE_RATE}`, "-c", "1",
                                                join(dir, "in.mp3"), join(dir, "out.wav")]);
    if (ok === null) return null;
    return pcmOfWav(readFileSync(join(dir, "out.wav")));
  } finally { rmSync(dir, { recursive: true, force: true }); }
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
