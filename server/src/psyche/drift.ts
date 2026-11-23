// C-290: this file runs on the phone too (C-111) -- the app imports it, directly or through another file -- so keep it free of Node-only APIs (node:*, fs).
// C-386 (the user, 2026-11-16: "for downdrift we could adapt the carrier wave to that of a note and even use the other
// notes to influence the beat"; by multiple choice, the month's note): DRIFT DOWN's numbers, in one place for the phone
// (app/sound/binaural.ts) and the hub's exports (sleepexport.ts), which each kept their own copy before.
//
//   THE CARRIER   the sleep piece's key, which is the MONTH's note (sleepsound.ts), in the octave from C3 -- so the
//                 tone between the ears belongs to the music and to the month (synesthesia.ts).
//   THE BEAT      each stage keeps its band -- alpha 8-12 Hz as you settle, theta 4-8, delta 1-4 as you sleep -- and
//                 the DAY places it inside the band: Sunday at the slow edge, Saturday at the quick one, the week a
//                 climb from root to crown. Whole hertz, so every loop holds whole cycles.
//
// Every word DRAFT.
import { Synesthesia, type Qualia } from "./synesthesia.js";

export type Stage = { at: number; beat: number; word: string };

/** The three stages: when each begins (seconds in), its band, and its name. */
export const BANDS = [
  { at: 0, band: [8, 12] as const, word: "ALPHA" },
  { at: 600, band: [4, 8] as const, word: "THETA" },
  { at: 1200, band: [1, 4] as const, word: "DELTA" },
] as const;

/** The night's stages for a day (a date, or a weekday's qualia): the beats the day places in each band. */
export function driftOf(day: Date | Qualia = new Date()): Stage[] {
  const q = day instanceof Date ? Synesthesia.day(day.getDay() + 1) : day;
  return BANDS.map((b) => ({ at: b.at, beat: Synesthesia.beatIn(b.band, q), word: b.word }));
}

/** The stage a moment of the night is in. */
export const stageAt = (s: number, stages: readonly Stage[]) => [...stages].reverse().find((d) => s >= d.at) ?? stages[0];

/** The carrier for a key ("Bb major" -> B-flat 3, 233 Hz): whole hertz in the octave from C3; C3 when it is no key. */
export function carrierOf(keyscale: string | null | undefined): number {
  const p = Synesthesia.pitchOf((keyscale ?? "").split(" ")[0]);
  return Synesthesia.hz(p < 0 ? 0 : p, 3);
}
