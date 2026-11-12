// C-351, C-354 (the user, 2026-11-12): THE SINGING BOWL -- struck, it rings in the day's note (or a month's chord, its
// days' notes together). A bowl's voice is not a string's: its modes sit near 1, 2.7, 5.1 and 8.2 times the note, each
// split in two a few hertz apart (the bowl is never perfectly round), so every mode beats -- the "wah" of a bowl -- and the
// higher ones die first. A soft strike on the rim, ten seconds of ring. DRAFT.
import { Platform } from "react-native";
import { pcmWav } from "./squareWave";

const RATE = 22050, SECONDS = 10, N = RATE * SECONDS;
const MODES: [ratio: number, amp: number, decay: number, beat: number][] = [
  [1, 1, 6.5, 1.3], [2.71, 0.5, 3.6, 2.1], [5.15, 0.22, 2.0, 3.2], [8.24, 0.1, 1.1, 4.4]];
export const NOTE_MIDI: Record<string, number> = { C: 60, D: 62, E: 64, F: 65, G: 67, A: 69, B: 71 };
const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

export function bowlSamples(notes: string[]): Float32Array {
  const out = new Float32Array(N);
  notes.forEach((n, k) => {
    const f = hz(NOTE_MIDI[n] ?? 60);
    for (const [ratio, amp, decay, beat] of MODES) {
      const a = (amp / notes.length) * (k === 0 ? 1 : 0.8);
      const f1 = f * ratio - beat / 2, f2 = f * ratio + beat / 2;
      for (let i = 0; i < N; i++) {
        const s = i / RATE;
        const env = Math.min(1, s / 0.012) * Math.exp(-s / decay);
        out[i] += a * env * (Math.sin(2 * Math.PI * f1 * s) + 0.85 * Math.sin(2 * Math.PI * f2 * s + 0.6));
      }
    }
  });
  for (let i = 0; i < Math.min(N, RATE * 0.03); i++) out[i] += 0.25 * (Math.random() * 2 - 1) * Math.exp(-i / (RATE * 0.006));   // the striker on the rim
  let peak = 0;
  for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(out[i]));
  for (let i = 0; i < N; i++) out[i] = (out[i] / (peak || 1)) * 0.6;
  return out;
}

// as a sound to play: a file in the cache on a phone, a data URI on the site
export function bowlTone(notes: string[]): string {
  const name = `bowl-${notes.join("")}`;
  if (Platform.OS === "web") {
    const bytes = pcmWav(bowlSamples(notes), RATE);
    let bin = ""; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return `data:audio/wav;base64,${btoa(bin)}`;
  }
  const { File, Paths }: typeof import("expo-file-system") = require("expo-file-system");
  const f = new File(Paths.cache, `${name}.wav`);
  if (!f.exists) { f.create(); f.write(pcmWav(bowlSamples(notes), RATE)); }
  return f.uri;
}
