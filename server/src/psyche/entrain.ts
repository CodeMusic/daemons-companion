// C-290: this file runs on the phone too (C-111) -- the app imports it, directly or through another file -- so keep it free of Node-only APIs (node:*, fs).
// C-591 (the user, 2026-11-26: "lets add that support to our down drift -- now you can turn on down drift even if no
// headphones (but ideally they also use headphones) the options that can use the downdrift info are the headphones, the
// pulsetto, or ... the Luma"): ENTRAINMENT -- what a drift asks of each thing it can reach, moment by moment. MIND: it
// reads a drift and the player's settings and says a level and a flash; app/sound/entrain.ts hands those to the devices
// (app/platform/pulsetto.ts, app/platform/nova.ts), and the headphones keep the beat between the ears as before.
//
// A drift (psyche/drift.ts; PulseEntrain's .imed v2, its docs/SESSION_FORMAT.md) already carries, beside each scene's
// beat, what PulseEntrain's two devices read, and until now it was kept and ignored:
//   intensity   the PULSETTO's level, held forward from the scene that sets it: 0..9, or "=", "=-", "=+" -- the base,
//               one under it, one over -- where the base is the file's own pulsetto.intensity
//   flash       the NOVA's eyes, held forward: sync (both, the default), left, right, off
//   flashHz     the NOVA's rate, held forward: 0 or none follows the beat
//   brightness  the NOVA's brightness, held forward, else the file's nova.brightness
//   biphotic    signed hertz, GLIDING: one eye flashes that much slower (> 0 the right, < 0 the left), easing back to 0
//               where a later scene leaves it out
//
// THE PULSETTO (the user: "you can set the intensity manually if u want <like a max or min delta cap> or leave it as auto
// which uses what is defined in the track -- or it infers it from the frequency"): AUTO takes the drift's own intensity,
// and where the drift gives none, infers one from the beat (slower, gentler: delta 2, theta 3, alpha 4, beta 5, gamma 6);
// FIXED holds the player's level. Either way it never leaves the player's MIN..MAX, and it moves one step at a time.
//
// THE NOVA: it flashes at the beat (or the drift's flashHz), never past the player's ceiling nor the hard 40 Hz
// (shared/nova.ts), in the drift's own pattern or the one the player chose; its brightness is the length of each flash.
// As the night fades over its last ten minutes, so does each: the level eases to MIN, the flashes shorten to nothing.
//
// Every number and word here DRAFT; how it feels is the user's to judge.
import type { DriftFile, DriftScene } from "./drift.js";
import { bandWord } from "./drift.js";
import type { Qualia } from "./synesthesia.js";
import { Synesthesia } from "./synesthesia.js";
import { clampLevel } from "../shared/pulsetto.js";
import { clampHz, HARD_MAX_HZ, MIN_HZ, type Eye } from "../shared/nova.js";

/** A scene as PulseEntrain writes it: the beat and carrier drift.ts reads, and what its devices read. */
export type EntrainScene = DriftScene & { intensity?: number | string; flash?: string; flashHz?: number; brightness?: number; biphotic?: number };
export type Flash = "sync" | "left" | "right" | "off";
/** What a drift asks for at one moment, beyond its beat. */
export type Cue = { intensity: number | string | null; flash: Flash | null; flashHz: number | null; brightness: number | null; biphotic: number };
export const NO_CUE: Cue = { intensity: null, flash: null, flashHz: null, brightness: null, biphotic: 0 };

const FLASHES = new Set(["sync", "left", "right", "off"]);
/** The cue at `s` seconds into a drift: the hold-forward values as the last scene to set each left them, biphotic glided. */
export function cueAt(f: DriftFile | null | undefined, s: number): Cue {
  const scenes = [...((f?.entrainment?.scenes ?? []) as EntrainScene[])].filter((x) => Number.isFinite(x.atSec)).sort((a, b) => a.atSec - b.atSec);
  if (!scenes.length) return NO_CUE;
  const cue: Cue = { ...NO_CUE };
  let i = -1;
  for (let j = 0; j < scenes.length && scenes[j].atSec <= s; j++) {
    i = j;
    const x = scenes[j];
    if (x.intensity !== undefined && x.intensity !== null) cue.intensity = x.intensity;
    if (typeof x.flash === "string" && FLASHES.has(x.flash)) cue.flash = x.flash as Flash;
    if (typeof x.flashHz === "number") cue.flashHz = x.flashHz > 0 ? x.flashHz : null;
    if (typeof x.brightness === "number") cue.brightness = Math.min(1, Math.max(0, x.brightness));
  }
  if (i >= 0) {
    const a = scenes[i], b = scenes[i + 1], from = a.biphotic ?? 0, to = b ? (b.biphotic ?? 0) : from;
    const k = b ? Math.min(1, Math.max(0, (s - a.atSec) / Math.max(1e-9, b.atSec - a.atSec))) : 0;
    cue.biphotic = Math.round((from + (to - from) * k) * 100) / 100;
  }
  return cue;
}

// ---- THE PULSETTO ----
export type StimMode = "auto" | "fixed";
export type StimSetting = { mode: StimMode; level: number; min: number; max: number };
export const STIM_DEFAULT: StimSetting = { mode: "auto", level: 4, min: 1, max: 6 };   // DRAFT: 9 is the device's top
const TOKEN: Record<string, number> = { "=": 0, "=-": -1, "=+": 1 };

/** A level from the beat alone, where a drift gives none: slower, gentler. */
export function inferStim(beat: number): number {
  return beat < 4 ? 2 : beat < 8 ? 3 : beat < 13 ? 4 : beat < 30 ? 5 : 6;
}
/** The player's range, made sound: whole levels 1..9, MIN no higher than MAX. */
export function rangeOf(set: StimSetting): [number, number] {
  const lo = clampLevel(set.min, 1), hi = Math.max(lo, clampLevel(set.max, 1));
  return [lo, hi];
}
/** What the PULSETTO should be at now, and why: FIXED, the DRIFT's own, or inferred from the BEAT. 0 only where the
 *  drift itself says 0 (a pause it wrote); `fade` 1 is whole, falling to 0 as the night ends. */
export function stimTarget(cue: Cue, beat: number, set: StimSetting, fileBase?: number | null, fade = 1): { level: number; why: "fixed" | "drift" | "beat" } {
  const [lo, hi] = rangeOf(set), inside = (n: number) => Math.min(hi, Math.max(lo, n));
  let level: number, why: "fixed" | "drift" | "beat";
  if (set.mode === "fixed") { level = inside(clampLevel(set.level, 1)); why = "fixed"; }
  else if (cue.intensity !== null && cue.intensity !== undefined) {
    const base = clampLevel(fileBase ?? inferStim(beat), 1);
    const raw = typeof cue.intensity === "number" ? cue.intensity : String(cue.intensity) in TOKEN ? base + TOKEN[String(cue.intensity)] : base;
    if (clampLevel(raw) === 0) return { level: 0, why: "drift" };   // the drift's own pause
    level = inside(clampLevel(raw, 1)); why = "drift";
  } else { level = inside(inferStim(beat)); why = "beat"; }
  const v = Math.min(1, Math.max(0, fade));
  if (v < 1) level = Math.max(lo, Math.round(lo + (level - lo) * v));
  return { level, why };
}
/** One step toward the target, never more: the PULSETTO moves a level at a time (the conductor steps it every ten
 *  seconds), so a drift that leaps from 2 to 6 is felt as a climb. */
export const stimStep = (now: number | null, target: number) =>
  now === null || now === 0 || target === 0 ? target : now + Math.sign(target - now);

// ---- THE NOVA ----
export type Pattern = "follow" | "together" | "drifting" | "left" | "right";
export type LightSetting = { pattern: Pattern; brightness: number; ceiling: number };
/** The ceilings a player may choose. 12 is alpha's top: every sleep drift stays under it. Past it is the band where
 *  flashing light most often brings on a seizure in the photosensitive, so the app asks again before 25 or 40. */
export const CEILINGS = [8, 12, 25, 40] as const;
export const LIGHT_DEFAULT: LightSetting = { pattern: "follow", brightness: 0.7, ceiling: 12 };
export const PATTERN_WORDS: Record<Pattern, [string, string]> = {   // DRAFT
  follow: ["THE DRIFT'S", "As the drift writes it: both eyes, one, or one slower than the other."],
  together: ["TOGETHER", "Both eyes flash at once, on the beat."],
  drifting: ["DRIFTING", "The eyes flash a little apart and slide in and out of step."],
  left: ["LEFT", "Only the left eye flashes."],
  right: ["RIGHT", "Only the right eye flashes."],
};

export type Light = { left: Eye; right: Eye; hz: number; dark: boolean; pattern: Pattern | "biphotic" | "off" };
/** Both eyes for this moment: the rate (the drift's flashHz, else the beat) under the ceiling; the pattern; each flash's
 *  length from the brightness (the player's, times the drift's, times the fade). */
export function lightTarget(cue: Cue, beat: number, set: LightSetting, fileBrightness?: number | null, fade = 1): Light {
  const ceiling = Math.min(HARD_MAX_HZ, Math.max(MIN_HZ, set.ceiling || LIGHT_DEFAULT.ceiling));
  const hz = clampHz(cue.flashHz && cue.flashHz > 0 ? cue.flashHz : beat, ceiling);
  const b = Math.min(1, Math.max(0, set.brightness)) * (cue.brightness ?? fileBrightness ?? 1) * Math.min(1, Math.max(0, fade));
  const duty = b <= 0.001 ? 0 : Math.round((0.08 + 0.42 * b) * 1000) / 1000;   // half lit at full: a clean flash
  const pattern: Light["pattern"] = set.pattern !== "follow" ? set.pattern
    : cue.flash === "off" ? "off" : cue.flash === "left" ? "left" : cue.flash === "right" ? "right" : cue.biphotic ? "biphotic" : "together";
  const lit = (rate: number): Eye => ({ hz: clampHz(rate, ceiling), duty, level: 0 }), dark: Eye = { hz, duty: 0, level: 0 };
  const out = (left: Eye, right: Eye): Light => ({ left, right, hz, pattern, dark: left.duty === 0 && right.duty === 0 });
  switch (pattern) {
    case "off": return out(dark, dark);
    case "left": return out(lit(hz), dark);
    case "right": return out(dark, lit(hz));
    case "drifting": return out(lit(hz * 0.89), lit(hz * 1.11));   // PulseEntrain's detune: they cross through anti-phase
    case "biphotic": {
      const slow = lit(Math.max(MIN_HZ, hz - Math.abs(cue.biphotic)));
      return cue.biphotic > 0 ? out(lit(hz), slow) : out(slow, lit(hz));
    }
    default: return out(lit(hz), lit(hz));
  }
}

// ---- for SYNESTHESIA, felt (C-592) ----
/** A note's rate: where its colour sits on its wheel, from theta's slow edge (red, 4 Hz) to alpha's quick one (violet,
 *  12 Hz) -- as DRIFT DOWN places each night's beat by the day (drift.ts). */
export const rateOf = (q: Qualia) => Synesthesia.beatIn([4, 12], q);
/** Its band's name, as the player reads it. */
export const rateWord = (hz: number) => bandWord(hz);
