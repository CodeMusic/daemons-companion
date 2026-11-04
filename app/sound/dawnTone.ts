// THE CREATOR'S HOUR's tone (DAEMONS T-519; the user, 2026-11-02: "an extra awwwing angelic instrument tone added (not too
// loud)"): a sustained, quiet "aah" -- a few voices on an open fifth below the day's note, each shaped by the vowel's
// formants, with a slow vibrato and the breath's swell, and a soft high bell on each in-breath. One sixteen-second breath
// (the hour's light breathes on the same), looped without a seam: every voice is tuned to a whole number of cycles in the
// loop. Built from a single cycle per voice, so it costs little on a phone. DRAFT.
import { Platform } from "react-native";
import { pcmWav } from "./squareWave";

const RATE = 11025, SECONDS = 16, N = RATE * SECONDS, TABLE = 2048;
const FORMANTS: [number, number, number][] = [[730, 90, 1], [1090, 110, 0.5], [2440, 170, 0.25]];   // "ah": Hz, width, weight
const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
const loopable = (f: number) => Math.round(f * SECONDS) / SECONDS;     // a whole number of cycles in the loop

// one cycle of a voice at `f`: its harmonics, each as loud as the vowel lets it be at that pitch
function cycle(f: number): Float32Array {
  const t = new Float32Array(TABLE);
  for (let k = 1; k * f < 3600; k++) {
    const at = k * f;
    const a = FORMANTS.reduce((s, [c, w, g]) => s + g * Math.exp(-(((at - c) / w) ** 2) / 2), 0.04) / k ** 0.6;
    for (let i = 0; i < TABLE; i++) t[i] += a * Math.sin((2 * Math.PI * k * i) / TABLE);
  }
  return t;
}

// the tone's samples for a day's note (MIDI): the voices two octaves and a fourth-under-the-octave below it -- the open fifth
export function dawnSamples(root: number): Float32Array {
  const out = new Float32Array(N);
  const notes = [root - 24, root - 17];                             // C3 and G3 for a C day
  for (const note of notes) for (const cents of [-5, 0, 6]) {       // three voices to a note, a little apart
    const f = loopable(hz(note) * 2 ** (cents / 1200)), table = cycle(f);
    const vib = 5 + (cents + 5) / 22;                               // 5, 5.2, 5.5 Hz: whole cycles in sixteen seconds
    const vibHz = Math.round(vib * SECONDS) / SECONDS;
    let phase = (cents + 5) / 11;                                   // the voices do not start together
    for (let i = 0; i < N; i++) {
      const s = i / RATE;
      phase += (f * (1 + 0.003 * Math.sin(2 * Math.PI * vibHz * s))) / RATE;
      const x = (phase % 1) * TABLE, j = Math.floor(x), fr = x - j;
      out[i] += table[j] * (1 - fr) + table[(j + 1) % TABLE] * fr;
    }
  }
  let peak = 0;
  for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(out[i]));
  for (let i = 0; i < N; i++) {
    const s = i / RATE, breath = 0.8 + 0.2 * (1 - Math.cos((2 * Math.PI * s) / SECONDS)) / 2;
    out[i] = (out[i] / (peak || 1)) * 0.42 * breath;
  }
  const bell = hz(root + 12);                                       // the bell, high and soft, on the in-breath
  for (let i = 0; i < Math.min(N, RATE * 5); i++) {
    const s = i / RATE, env = Math.min(1, s / 0.004) * Math.exp(-s / 1.1);
    out[i] += 0.07 * env * (Math.sin(2 * Math.PI * bell * s) + 0.35 * Math.sin(2 * Math.PI * bell * 2.76 * s) + 0.12 * Math.sin(2 * Math.PI * bell * 5.4 * s));
  }
  return out;
}

// as a sound to play: a file in the cache on a phone, a data URI on the site
export function dawnTone(root: number): string {
  const name = `dawn-tone-${root}`;
  if (Platform.OS === "web") {
    const bytes = pcmWav(dawnSamples(root), RATE);
    let bin = ""; for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return `data:audio/wav;base64,${btoa(bin)}`;
  }
  const { File, Paths }: typeof import("expo-file-system") = require("expo-file-system");
  const f = new File(Paths.cache, `${name}.wav`);
  if (!f.exists) { f.create(); f.write(pcmWav(dawnSamples(root), RATE)); }
  return f.uri;
}
