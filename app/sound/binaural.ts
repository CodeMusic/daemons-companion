// C-334 (the user, 2026-11-11: "scan my other repo for PulseEntrain as we could have an option for that -- pulseentrain
// overlay would require headphones so that part would just be for the phone"): DRIFT DOWN, a binaural layer under the
// sleep sounds. What carries over from PulseEntrain is its idea, written again here from the textbook formula rather than
// copied: one sine in the left ear at the carrier, one in the right at carrier + beat, so the two ears hear a slow beat
// that is in neither -- on headphones only (from a speaker the two mix in the air and it is only a hum). The session
// drifts as PulseEntrain's do, a stage at a time: alpha 10 Hz as you settle, theta 6 Hz, then delta 2 Hz as you sleep.
//
// Each stage is a short loop, the carrier and the beat whole numbers of hertz, so every loop holds whole cycles of both
// and repeats without a seam. The carrier sits in the sleep piece's own key (its root, in the octave from C3), so the tone
// belongs to the music. Quiet by design: it lies under the music, never over it. DRAFT.
// C-386: the key is the month's and the day places each beat inside its band -- the numbers are server/src/psyche/drift.ts's,
// shared with the hub's exports.
import { Platform } from "react-native";

const RATE = 22050, SECONDS = 4, N = RATE * SECONDS;
export { carrierOf, driftOf, stageAt, stagesOfFile, LONG_FALL, LONG_FALL_INFO, type Stage, type Bed, type DriftFile, type DriftInfo } from "../../server/src/psyche/drift";

// one stage, as a stereo 16-bit WAV's bytes: left at the carrier, right at carrier + beat, a soft edge-free loop
export function binauralWav(carrier: number, beat: number, level = 0.5): Uint8Array {
  const out = new Uint8Array(44 + N * 4), v = new DataView(out.buffer);
  const text = (at: number, s: string) => [...s].forEach((c, i) => v.setUint8(at + i, c.charCodeAt(0)));
  text(0, "RIFF"); v.setUint32(4, 36 + N * 4, true); text(8, "WAVE"); text(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true); v.setUint32(24, RATE, true);
  v.setUint32(28, RATE * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true); text(36, "data");
  v.setUint32(40, N * 4, true);
  const l = (2 * Math.PI * carrier) / RATE, r = (2 * Math.PI * (carrier + beat)) / RATE, a = Math.round(32767 * level);
  for (let i = 0; i < N; i++) {
    v.setInt16(44 + i * 4, Math.round(a * Math.sin(l * i)), true);
    v.setInt16(46 + i * 4, Math.round(a * Math.sin(r * i)), true);
  }
  return out;
}

// a stage as a sound to play: a file in the cache on a phone, a data URI on the site
export function binauralStage(carrier: number, beat: number): string {
  const name = `drift-${carrier}-${beat}`;
  if (Platform.OS === "web") {
    const bytes = binauralWav(carrier, beat);
    let bin = ""; for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return `data:audio/wav;base64,${btoa(bin)}`;
  }
  const { File, Paths }: typeof import("expo-file-system") = require("expo-file-system");
  const f = new File(Paths.cache, `${name}.wav`);
  if (!f.exists) { f.create(); f.write(binauralWav(carrier, beat)); }
  return f.uri;
}


// C-506: a drift's noise bed -- white, pink or brown noise as an eight-second mono loop, its last half second crossfaded
// onto its first so it repeats without a seam. Made once a colour (seeded, so the same colour is the same file).
const BED_S = 8, BED_N = RATE * BED_S, XF = Math.round(RATE * 0.5);
export function noiseWav(colour: string): Uint8Array {
  let seed = [...colour].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 31 - 1; };
  const x = new Float32Array(BED_N + XF);
  let b0 = 0, b1 = 0, b2 = 0, br = 0;
  for (let i = 0; i < x.length; i++) {
    const w = rnd();
    if (colour === "pink") {                                   // Paul Kellet's economy filter
      b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913;
      x[i] = (b0 + b1 + b2 + w * 0.1848) * 0.11;
    } else if (colour === "brown") { br = (br + 0.02 * w) / 1.02; x[i] = br * 3.5; }
    else x[i] = w * 0.5;
  }
  for (let i = 0; i < XF; i++) { const k = i / XF; x[i] = x[i] * k + x[BED_N + i] * (1 - k); }   // the tail laid over the head
  const out = new Uint8Array(44 + BED_N * 2), v = new DataView(out.buffer);
  const text = (at: number, s: string) => [...s].forEach((c, i) => v.setUint8(at + i, c.charCodeAt(0)));
  text(0, "RIFF"); v.setUint32(4, 36 + BED_N * 2, true); text(8, "WAVE"); text(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, RATE, true);
  v.setUint32(28, RATE * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); text(36, "data");
  v.setUint32(40, BED_N * 2, true);
  for (let i = 0; i < BED_N; i++) v.setInt16(44 + i * 2, Math.round(32767 * Math.max(-1, Math.min(1, x[i]))), true);
  return out;
}
export function bedSound(colour: string): string {
  if (Platform.OS === "web") {
    const bytes = noiseWav(colour);
    let bin = ""; for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return `data:audio/wav;base64,${btoa(bin)}`;
  }
  const { File, Paths }: typeof import("expo-file-system") = require("expo-file-system");
  const f = new File(Paths.cache, `bed-${colour}.wav`);
  if (!f.exists) { f.create(); f.write(noiseWav(colour)); }
  return f.uri;
}
