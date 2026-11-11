// C-296 (DAEMONS T-519, vision 4.40: "the companion may keep the four running totals on its side"; the user, 2026-11-11,
// by multiple choice: SPIRITS' leftovers, built DRAFT): the four kinds of event that nudge a daemon's SPIRITS, counted
// from what the companion itself sees, and the TONE its pictures take from the class the save holds.
//
// The game keeps the class and its lean (save/reader.ts spiritsOf); the companion only ever reads those bits. These
// totals are the companion's own: four weeks of its log, each event one step on one of the four. They are never
// written into the save, and they never move the class -- the game does that.
//
// Tone, never hue (vision 4.40, invariant 5): in good spirits a daemon's body lightens, in low spirits it darkens, and
// it keeps its type's colour. The stronger the lean towards the edge, the stronger the tone; as it is, no tone at all.
// This file runs on the phone too (C-111): no node:*. Every word DRAFT.
import { derived } from "./feelings.js";
import type { Interaction } from "./life.js";
import type { Shade } from "./expressions.js";
import type { Spirits, SpiritsClass } from "./save/reader.js";

export type SpiritAxis = "kept" | "bond" | "work" | "portion";
export type SpiritTotals = Record<SpiritAxis, number>;

// what each kind of time together counts towards (vision 4.40's four): KEPT fed, watered, rested -- or a meal missed,
// woken, left alone at night; BOND time spent together and others met; WORK run as itself; PORTION a share dealt to it
export const SPIRIT_EVENTS: Record<string, [SpiritAxis, 1 | -1]> = {
  feed: ["kept", 1], water: ["kept", 1], sleep: ["kept", 1],
  "missed-meal": ["kept", -1], woken: ["kept", -1], "alone-at-night": ["kept", -1],
  walk: ["bond", 1], step: ["bond", 1], met: ["bond", 1],
  train: ["work", 1], routine: ["work", 1], battle: ["work", 1],
  gift: ["portion", 1],
};
export const SPIRIT_DAYS = 28;

// an interaction's kind as the four read it: a battle's experience is WORK; other experience is counted where it came from
const kindOf = (e: Interaction) => (e.kind === "exp" ? (/ battle /.test(` ${e.detail ?? ""} `) ? "battle" : "") : e.kind);

// the four totals over the last four weeks; the clock's own events (a meal missed, woken, a night alone) included
export function spiritTotals(events: Interaction[], now = new Date()): SpiritTotals {
  const t = now.getTime(), from = t - SPIRIT_DAYS * 86400000;
  const out: SpiritTotals = { kept: 0, bond: 0, work: 0, portion: 0 };
  const clock = derivedOverDays(events, now);
  for (const e of [...events, ...clock]) {
    const a = Date.parse(e.at), hit = SPIRIT_EVENTS[kindOf(e)];
    if (hit && a >= from && a <= t) out[hit[0]] += hit[1];
  }
  return out;
}

// derived() looks back a day; the four look back four weeks, so ask it once a day across them
function derivedOverDays(events: Interaction[], now: Date): Interaction[] {
  const seen = new Set<string>(), out: Interaction[] = [];
  for (let back = 0; back < SPIRIT_DAYS; back += 1) {
    const at = new Date(now.getTime() - back * 86400000);
    for (const e of derived(events.filter((x) => Date.parse(x.at) <= at.getTime()), at)) {
      const k = `${e.kind} ${e.at}`;
      if (!seen.has(k) && Date.parse(e.at) <= at.getTime()) { seen.add(k); out.push(e); }
    }
  }
  return out;
}

// a total said in a word, for the brief: the same bands on every device
export function totalWord(axis: SpiritAxis, n: number): string {
  if (axis === "kept") return n >= 40 ? "kept well" : n >= 10 ? "kept fairly" : n > -5 ? "kept little" : "kept badly";
  if (axis === "bond") return n >= 20 ? "often together" : n >= 5 ? "sometimes together" : "seldom together";
  if (axis === "work") return n >= 20 ? "worked often" : n >= 5 ? "worked sometimes" : "seldom worked";
  return n >= 3 ? "given a fair share" : n >= 1 ? "given a little" : "given nothing yet";
}

const CLASS_SAID: Record<SpiritsClass, string> = { good: "You are in GOOD spirits.", "as it is": "Your spirits are as they are.", low: "You are in LOW spirits." };
// one line for the brief: the class the save holds and the four weeks behind it
export function spiritsSaid(cls: SpiritsClass | null, t: SpiritTotals): string {
  const weeks = `Over the last four weeks you have been ${totalWord("kept", t.kept)}, ${totalWord("bond", t.bond)}, ` +
                `${totalWord("work", t.work)}, and ${totalWord("portion", t.portion)}.`;
  return cls ? `${CLASS_SAID[cls]} ${weeks}` : weeks;
}

// TONE: how far a daemon's pictures lighten or darken, 0 as it is to 1 at the edge (rungs 0..11: 0-3 low, 8-11 good)
export function toneOf(s: Spirits | null | undefined): number {
  if (!s || s.class === "as it is") return 0;
  return s.class === "good" ? 0.4 + 0.2 * (s.rung - 8) : -(0.4 + 0.2 * (3 - s.rung));
}
// the tone as a shade for expressions.ts's shade(): lighter mixes towards white, darker towards black; the hue is kept
export function toneShade(k: number): Shade | null {
  const a = Math.max(-1, Math.min(1, k));
  if (!a) return null;
  return a > 0 ? { sat: 1 - 0.1 * a, val: 1 + 0.12 * a, tint: [255, 255, 255], mix: 0.16 * a }
               : { sat: 1 + 0.05 * a, val: 1 + 0.24 * a, tint: [0, 0, 0], mix: -0.08 * a };
}

// THE MIND's SPIRITS (C-254's NOW): the class the save holds, in the game's words, its tone, and the four weeks behind it
export type SpiritsPortal = { class: SpiritsClass | null; words: string | null; rung: number | null; tone: number;
                              totals: SpiritTotals; said: Record<SpiritAxis, string> };
export function spiritsPortal(s: Spirits | null, t: SpiritTotals): SpiritsPortal {
  const said = Object.fromEntries((Object.keys(t) as SpiritAxis[]).map((a) => [a, totalWord(a, t[a])])) as Record<SpiritAxis, string>;
  return { class: s?.class ?? null, words: s?.words ?? null, rung: s?.rung ?? null, tone: toneOf(s), totals: t, said };
}
