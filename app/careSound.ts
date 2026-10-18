// C-114: each care's phrase of DAEMONS' own music, played on the phone as the boards play it -- a square wave on the
// day's note. The notes are firmware/common/tunes.h's TUNE_FED / WATERED / TRAINED / SLEPT (the user approved the four,
// 2026-10-11: "they are perfect"); change them there and here together.
import { File, Paths } from "expo-file-system";
import { wav } from "./squareWave";

type Care = "feed" | "water" | "train" | "sleep";
const TUNES: Record<Care, [number, number][]> = {
  feed:  [[0, 230], [-3, 115], [0, 115], [2, 230], [0, 115], [-3, 330]],                       // BLANCHE
  water: [[0, 120], [-2, 120], [-4, 120], [-5, 120], [-4, 120], [-2, 120], [0, 300]],          // VERDIGRIS
  train: [[0, 140], [0, 140], [2, 140], [4, 140], [7, 140], [7, 320]],                         // BRAZEN
  sleep: [[0, 360], [-5, 360], [-9, 360], [-5, 360], [-7, 360], [-9, 360], [-10, 800]],        // HALFTONE, slowed
};
const NAMES = "C D EF G A B";                      // the day's note, as tunes.h's dayRoot: Sunday C ... Saturday B
const dayRoot = (note: string) => { const i = NAMES.indexOf(note); return 72 + (i < 0 ? 0 : i); };

// The phrase for this care on this day's note, as a file to play (made once, then kept in the cache)
export function careSound(care: Care, dayNote: string): string {
  const f = new File(Paths.cache, `care-${care}-${dayNote || "C"}.wav`);
  if (!f.exists) { f.create(); f.write(wav(TUNES[care], dayRoot(dayNote))); }
  return f.uri;
}
