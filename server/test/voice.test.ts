import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { asWav, CAN_CONVERT, Conversations, DEVICE_RATE, FOUND_FFMPEG, mp3OfWav, pcmOfWav, phoneAudio, toDevicePcm, VoiceShelf, wavOf } from "../src/ai/voice.js";

// A second of a 440 Hz tone as a WAV, at a rate the handheld does not play (the voice server's is 24 kHz).
function wav(rate: number, seconds = 1): Buffer {
  const n = rate * seconds, out = Buffer.alloc(44 + n * 2);
  out.write("RIFF", 0, "latin1"); out.writeUInt32LE(36 + n * 2, 4); out.write("WAVEfmt ", 8, "latin1");
  out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(1, 22); out.writeUInt32LE(rate, 24);
  out.writeUInt32LE(rate * 2, 28); out.writeUInt16LE(2, 32); out.writeUInt16LE(16, 34);
  out.write("data", 36, "latin1"); out.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) out.writeInt16LE(Math.round(8000 * Math.sin(2 * Math.PI * 440 * i / rate)), 44 + i * 2);
  return out;
}

describe("the daemon's voice, for a handheld (C-66)", () => {
  it("finds a WAV's samples", () => {
    expect(pcmOfWav(wav(16000))!.length).toBe(32000);
    expect(pcmOfWav(Buffer.from("not a wav"))).toBeNull();
    const pcm = Buffer.from([1, 2, 3, 4]);
    expect(pcmOfWav(wavOf(pcm))!.equals(pcm)).toBe(true);          // and makes one the speech server takes
  });

  it.skipIf(!CAN_CONVERT)(
    "converts the voice server's audio to the speaker's 16 kHz", async () => {
      const pcm = await toDevicePcm(wav(24000));
      expect(pcm).not.toBeNull();
      expect(Math.abs(pcm!.length / 2 - DEVICE_RATE)).toBeLessThan(DEVICE_RATE * 0.02);   // a second, give or take
    });

  it("keeps a few answers for a while, then lets them go", () => {
    const shelf = new VoiceShelf(1000, 2);
    const a = shelf.put(Buffer.from([1]), 0), b = shelf.put(Buffer.from([2]), 0), c = shelf.put(Buffer.from([3]), 0);
    expect(shelf.get(a, 0)).toBeNull();                 // the oldest made room
    expect(shelf.get(b, 0)![0]).toBe(2);
    expect(shelf.get(c, 2000)).toBeNull();              // and none outlives its time
  });
});

describe("the daemon remembers the last few things said (C-66)", () => {
  it("keeps six exchanges a device, each device its own, and forgets after a quiet while", () => {
    const talks = new Conversations(1000, 6);
    for (let i = 0; i < 8; i++) talks.add("board", `q${i}`, `a${i}`, 0);
    expect(talks.history("board", 0).map((t) => t.text)).toEqual(["q2", "q3", "q4", "q5", "q6", "q7"]);
    expect(talks.history("watch", 0)).toEqual([]);
    talks.add("board", "", "nothing heard", 0);                      // a turn with nothing heard is not kept
    expect(talks.history("board", 0)).toHaveLength(6);
    expect(talks.history("board", 2001)).toEqual([]);                // fifteen quiet minutes, here one second
  });
});

// The handheld's recording over Bluetooth (C-82): 8 kHz G.711 mu-law, as firmware talk.cpp encodes it.
function mulawWav(seconds = 1): Buffer {
  const SEG = [0x3f, 0x7f, 0xff, 0x1ff, 0x3ff, 0x7ff, 0xfff, 0x1fff];
  const enc = (pcm: number) => {
    let v = pcm >> 2, mask = 0xff;
    if (v < 0) { v = -v; mask = 0x7f; }
    v = Math.min(v, 8159) + 0x21;
    let seg = 0; while (seg < 8 && v > SEG[seg]) seg++;
    return seg >= 8 ? 0x7f ^ mask : ((seg << 4) | ((v >> (seg + 1)) & 0xf)) ^ mask;
  };
  const n = 8000 * seconds, out = Buffer.alloc(44 + n);
  out.write("RIFF", 0, "latin1"); out.writeUInt32LE(36 + n, 4); out.write("WAVEfmt ", 8, "latin1");
  out.writeUInt32LE(16, 16); out.writeUInt16LE(7, 20); out.writeUInt16LE(1, 22); out.writeUInt32LE(8000, 24);
  out.writeUInt32LE(8000, 28); out.writeUInt16LE(1, 32); out.writeUInt16LE(8, 34);
  out.write("data", 36, "latin1"); out.writeUInt32LE(n, 40);
  for (let i = 0; i < n; i++) out[44 + i] = enc(Math.round(8000 * Math.sin(2 * Math.PI * 440 * i / 8000)));
  return out;
}

// The phone records m4a with its index (moov) after the samples, as ffmpeg writes one by default; past ffmpeg's buffer
// (20 s at 32 kbps is enough) a pipe cannot read it, and the hub has no afconvert to fall back on (C-168).
describe("a long recording from the phone (C-168)", () => {
  it.skipIf(!FOUND_FFMPEG)("is read whole, its index at the end", async () => {
    const dir = mkdtempSync(join(tmpdir(), "voice-test-"));
    try {
      const m4a = join(dir, "long.m4a");
      const made = spawnSync(FOUND_FFMPEG!, ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi",
        "-i", "sine=frequency=440:duration=20:sample_rate=16000", "-ac", "1", "-c:a", "aac", "-b:a", "32k", m4a]);
      expect(made.status).toBe(0);
      const bytes = readFileSync(m4a);
      expect(bytes.indexOf("moov")).toBeGreaterThan(bytes.indexOf("mdat"));      // the index really is at the end
      const pcm = await toDevicePcm(bytes);
      expect(Math.abs(pcm!.length / 2 - 20 * DEVICE_RATE)).toBeLessThan(DEVICE_RATE * 0.5);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }, 60_000);                                                    // two ffmpeg starts: about eleven seconds on the hub
});

describe("a recording over Bluetooth (C-82)", () => {
  it.skipIf(!CAN_CONVERT)(
    "reaches speech to text as a 16 kHz WAV of the same length, and sounds like itself", async () => {
      const w = await asWav(mulawWav(1));
      expect(w?.mime).toBe("audio/wav");
      const pcm = pcmOfWav(w!.audio)!;
      expect(Math.abs(pcm.length / 2 - DEVICE_RATE)).toBeLessThan(DEVICE_RATE * 0.02);
      let peak = 0; for (let i = 0; i < pcm.length; i += 2) peak = Math.max(peak, Math.abs(pcm.readInt16LE(i)));
      expect(peak).toBeGreaterThan(6000);                       // the 8000-high tone came through, not silence
      expect(peak).toBeLessThan(10000);
    });
});

// 2026-11-05: the phone files every voice as .mp3, so a WAV (the Tiiny's) played as static -- the hub sends it MP3
describe("a voice for the phone", () => {
  const tone = Buffer.alloc(24000 * 2);
  for (let i = 0; i < 24000; i++) tone.writeInt16LE(Math.round(8000 * Math.sin(i / 10)), i * 2);
  it.skipIf(!FOUND_FFMPEG)("turns a WAV into an MP3", async () => {
    const r = await phoneAudio({ answer: "hi", audioBase64: wavOf(tone, 24000).toString("base64"), audioMime: "audio/wav" });
    const b = Buffer.from(r.audioBase64 as string, "base64");
    expect(r.audioMime).toBe("audio/mpeg");
    expect(b.toString("latin1", 0, 4)).not.toBe("RIFF");
    expect(b.toString("latin1", 0, 3) === "ID3" || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)).toBe(true);
    expect(r.answer).toBe("hi");
  });
  it("leaves an MP3, and an answer with no voice, as they came", async () => {
    const mp3 = { audioBase64: Buffer.from([0xff, 0xfb, 0x90, 0x00]).toString("base64"), audioMime: "audio/mpeg" };
    expect(await phoneAudio(mp3)).toEqual(mp3);
    expect(await phoneAudio({ answer: "x" })).toEqual({ answer: "x" });
    expect(await mp3OfWav(Buffer.from("not a wav at all"))).toBeNull();
  });
});

describe("a whole piece's voice", () => {
  it("is read in parts cut at sentences, each within what the voice takes", async () => {
    const { voicePieces } = await import("../src/ai/voice.js");
    const long = Array.from({ length: 30 }, (_, i) => `Sentence number ${i} is here.`).join(" ");
    const parts = voicePieces(`A short first paragraph.\n\n${long}`);
    expect(parts[0]).toBe("A short first paragraph.");
    expect(parts.length).toBeGreaterThan(2);
    expect(parts.every((p) => p.length <= 560)).toBe(true);
    expect(parts.slice(1).every((p) => p.endsWith("."))).toBe(true);
  });
  it("joins its parts' voices into one, a breath between", async () => {
    const { joinVoices, wavOf, CAN_CONVERT, FOUND_FFMPEG } = await import("../src/ai/voice.js");
    if (!FOUND_FFMPEG) return;
    const tone = wavOf(Buffer.alloc(24000 * 2), 24000);   // a second of silence each
    const one = (await joinVoices([tone, tone]))!;
    expect(one.toString("latin1", 0, 4)).toBe("RIFF");
    expect((one.length - 44) / 2 / 24000).toBeCloseTo(2.4, 1);
    expect(await joinVoices([tone])).toBe(tone);
    void CAN_CONVERT;
  });
});
