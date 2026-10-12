// C-114: each care's phrase of DAEMONS' own music, played on the phone as the boards play it -- a square wave on the
// day's note. The notes are firmware/common/tunes.h's TUNE_FED / WATERED / TRAINED / SLEPT (the user approved the four,
// 2026-10-11: "they are perfect"); change them there and here together.
import { File, Paths } from "expo-file-system";

type Care = "feed" | "water" | "train" | "sleep";
const TUNES: Record<Care, [number, number][]> = {
  feed:  [[0, 230], [-3, 115], [0, 115], [2, 230], [0, 115], [-3, 330]],                       // BLANCHE
  water: [[0, 120], [-2, 120], [-4, 120], [-5, 120], [-4, 120], [-2, 120], [0, 300]],          // VERDIGRIS
  train: [[0, 140], [0, 140], [2, 140], [4, 140], [7, 140], [7, 320]],                         // BRAZEN
  sleep: [[0, 360], [-5, 360], [-9, 360], [-5, 360], [-7, 360], [-9, 360], [-10, 800]],        // HALFTONE, slowed
};
const NAMES = "C D EF G A B";                      // the day's note, as tunes.h's dayRoot: Sunday C ... Saturday B
const dayRoot = (note: string) => { const i = NAMES.indexOf(note); return 72 + (i < 0 ? 0 : i); };

const RATE = 22050;
function wav(tune: [number, number][], root: number): Uint8Array {
  const samples: number[] = [];
  for (const [semis, ms] of tune) {
    const f = 440 * 2 ** ((root + semis - 69) / 12), n = Math.round((RATE * ms) / 1000), gap = Math.round(RATE * 0.012);
    for (let i = 0; i < n; i++) {
      const env = Math.min(1, i / 80) * (i < n * 0.8 ? 1 : Math.max(0, (n - i) / (n * 0.2)));
      samples.push(i > n - gap ? 0 : ((i * f) / RATE) % 1 < 0.5 ? 0.22 * env : -0.22 * env);
    }
  }
  const out = new Uint8Array(44 + samples.length * 2), v = new DataView(out.buffer);
  const text = (at: number, s: string) => [...s].forEach((c, i) => v.setUint8(at + i, c.charCodeAt(0)));
  text(0, "RIFF"); v.setUint32(4, 36 + samples.length * 2, true); text(8, "WAVE"); text(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, RATE, true);
  v.setUint32(28, RATE * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); text(36, "data");
  v.setUint32(40, samples.length * 2, true);
  samples.forEach((s, i) => v.setInt16(44 + i * 2, Math.round(s * 32767), true));
  return out;
}

// The phrase for this care on this day's note, as a file to play (made once, then kept in the cache)
export function careSound(care: Care, dayNote: string): string {
  const f = new File(Paths.cache, `care-${care}-${dayNote || "C"}.wav`);
  if (!f.exists) { f.create(); f.write(wav(TUNES[care], dayRoot(dayNote))); }
  return f.uri;
}
