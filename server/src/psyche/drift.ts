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

// C-506: a stage may carry its own carrier and noise bed (a drift file's); THE LONG FALL's do not
export type Bed = { type: string; level: number } | null;
export type Stage = { at: number; beat: number; word: string; carrier?: number; bed?: Bed };

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

// ---- C-506 (the user, 2026-11-24: "down drift should be more expandable -- it often seems like the same pattern
// progression"): a drift is a FILE now -- a PulseEntrain session (`.imed` v2, its docs/SESSION_FORMAT.md): scenes on one
// timeline, each with its beat (and perhaps its carrier), ramped between, the noise bed held forward. The library is the
// hub's (server/data/drifts/, server/src/machine/drifts.ts); THE LONG FALL is the three bands above, placed by the day, as
// DRIFT DOWN always was. Every name and word DRAFT.
export type DriftScene = { atSec: number; beatHz: number; carrierHz?: number; noise?: string };
export type DriftBed = { source?: string; type?: string; level?: number };
export type DriftFile = {
  id: string; kind: string;
  meta: { name?: string; description?: string; durationSec?: number; strength?: number; category?: string };
  entrainment: { ramp?: string; scenes: DriftScene[] };
  audio?: { binaural?: { carrierHz?: number }; beds?: DriftBed[] };
};
export type DriftInfo = { id: string; name: string; kind: string; group: string | null; description: string;
                          durationSec: number | null; strength: number | null; phone?: boolean };   // C-551: phone, one the app carries
export const LONG_FALL = "the-long-fall";
export const LONG_FALL_INFO: DriftInfo = { id: LONG_FALL, name: "THE LONG FALL", kind: "sleep", group: "DAEMONS",
  description: "Alpha as you settle, theta, then delta as you sleep: each beat placed by the day.", durationSec: 1800, strength: 1 };

/** The band a beat sits in, by its usual name. */
export const bandWord = (hz: number) => hz < 4 ? "DELTA" : hz < 8 ? "THETA" : hz < 13 ? "ALPHA" : hz < 30 ? "BETA" : "GAMMA";
// a quarter hertz: a four-second loop then holds whole cycles of the carrier and of carrier + beat (sound/binaural.ts)
const quarter = (hz: number) => Math.max(0.25, Math.round(hz * 4) / 4);
// a bed as the phone can play it: the noises by their colour; PulseEntrain's textures by the noise nearest them
const BED_AS: Record<string, string> = { white: "white", pink: "pink", brown: "brown", blue: "white", violet: "white",
                                         grey: "pink", gray: "pink", rain: "pink", wind: "brown", surf: "brown", stream: "pink", fire: "brown" };
const bedOf = (type: string | undefined, level: number | undefined): Bed =>
  !type || type === "none" || !BED_AS[type] ? null : { type: BED_AS[type], level: Math.max(0, Math.min(1, level ?? 0.1)) };

/** A drift file as the stages the player steps through: every `stepS` seconds the beat it has ramped to (linearly between
 *  scenes, or held with `ramp: "step"`), its carrier (the scene's, the file's, or the music's key) and its bed; a new stage
 *  only where one of them moves. Past its last scene the last stage holds. */
export function stagesOfFile(f: DriftFile, keyCarrier: number, stepS = 15): Stage[] {
  const scenes = [...(f.entrainment?.scenes ?? [])].filter((s) => Number.isFinite(s.atSec) && Number.isFinite(s.beatHz))
    .sort((a, b) => a.atSec - b.atSec);
  if (!scenes.length) return [];
  const baseCarrier = f.audio?.binaural?.carrierHz ?? keyCarrier;
  const firstBed = (f.audio?.beds ?? []).find((b) => b.type && (b.source === "noise" || b.source === "texture" || !b.source));
  const level = firstBed?.level;
  const stepped = f.entrainment.ramp === "step";
  const at = (t: number) => {
    let i = 0;
    while (i + 1 < scenes.length && scenes[i + 1].atSec <= t) i++;
    const a = scenes[i], b = scenes[i + 1];
    const k = !b || stepped ? 0 : (t - a.atSec) / Math.max(1e-9, b.atSec - a.atSec);
    const lerp = (x: number, y: number) => x + (y - x) * k;
    const ca = a.carrierHz ?? baseCarrier, cb = b?.carrierHz ?? baseCarrier;
    let noise: string | undefined = firstBed?.type;                   // held forward from the last scene that set one
    for (let j = 0; j <= i; j++) if (scenes[j].noise !== undefined) noise = scenes[j].noise;
    return { beat: quarter(lerp(a.beatHz, b?.beatHz ?? a.beatHz)), carrier: quarter(lerp(ca, cb)), bed: bedOf(noise, level) };
  };
  const end = scenes[scenes.length - 1].atSec, out: Stage[] = [];
  for (let t = 0; ; t += stepS) {
    const x = at(Math.min(t, end)), last = out[out.length - 1];
    if (!last || last.beat !== x.beat || last.carrier !== x.carrier || JSON.stringify(last.bed) !== JSON.stringify(x.bed))
      out.push({ at: Math.min(t, end), beat: x.beat, word: bandWord(x.beat), carrier: x.carrier, bed: x.bed });
    if (t >= end) break;
  }
  return out;
}

/** THE LONG FALL as a drift file (the hub serves it beside the library): the day's three bands, a step each. */
export function longFallFile(day: Date = new Date()): DriftFile {
  return { id: LONG_FALL, kind: "sleep", meta: { name: LONG_FALL_INFO.name, description: LONG_FALL_INFO.description, durationSec: 1800, strength: 1 },
           entrainment: { ramp: "step", scenes: driftOf(day).map((s) => ({ atSec: s.at, beatHz: s.beat })) } };
}
