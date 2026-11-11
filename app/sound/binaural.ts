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
import { Platform } from "react-native";

const RATE = 22050, SECONDS = 4, N = RATE * SECONDS;
export const DRIFT = [{ at: 0, beat: 10, word: "ALPHA" }, { at: 600, beat: 6, word: "THETA" }, { at: 1200, beat: 2, word: "DELTA" }] as const;   // seconds in
const NOTES: Record<string, number> = { C: 0, Db: 1, "C#": 1, D: 2, Eb: 3, "D#": 3, E: 4, F: 5, Gb: 6, "F#": 6, G: 7, Ab: 8, "G#": 8, A: 9, Bb: 10, "A#": 10, B: 11 };

// the carrier for a key ("F major" -> F3, 175 Hz), a whole number of hertz
export function carrierOf(keyscale: string | null | undefined): number {
  const n = NOTES[(keyscale ?? "").split(" ")[0]] ?? 0;
  return Math.round(440 * 2 ** ((48 + n - 69) / 12));
}

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

// which stage a moment in the session is in
export const stageAt = (s: number) => [...DRIFT].reverse().find((d) => s >= d.at) ?? DRIFT[0];
