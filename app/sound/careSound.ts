// C-114: each care's phrase of DAEMONS' own music, played on the phone as the boards play it -- a square wave on the
// day's note. The notes are firmware/common/tunes.h's TUNE_FED / WATERED / TRAINED / SLEPT (the user approved the four,
// 2026-10-11: "they are perfect"), read from server/data/tunes.json (C-160: no copy of our own any more).
import { dayRoot, tuneSound } from "./tuneSound";

type Care = "feed" | "water" | "train" | "sleep";
const NAME: Record<Care, string> = { feed: "FED", water: "WATERED", train: "TRAINED", sleep: "SLEPT" };

// The phrase for this care on this day's note, as a file to play (made once, then kept in the cache)
export function careSound(care: Care, dayNote: string): string {
  return tuneSound(NAME[care], dayRoot(dayNote)) ?? "";
}
