import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { asWav, Conversations, DEVICE_RATE, pcmOfWav, toDevicePcm, VoiceShelf, wavOf } from "../src/ai/voice.js";

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

  it.skipIf(!existsSync("/opt/homebrew/bin/ffmpeg") && !existsSync("/usr/bin/afconvert"))(
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

describe("a recording over Bluetooth (C-82)", () => {
  it.skipIf(!existsSync("/opt/homebrew/bin/ffmpeg") && !existsSync("/usr/bin/afconvert"))(
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
