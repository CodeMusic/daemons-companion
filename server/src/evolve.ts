// C-184 (the user, 2026-10-24: "if an event happens that puts it over threshold then it evolved on the companions,
// ...such that when it returns the game knows"; and: the game finds it already evolved). The game's own evolution table
// (species.json `evolutions`, exported by DAEMONS T-448) judged here for a carried daemon -- only what the companion can
// judge (`judged`): its level, its friendship (220, as the game's), the hour for DAY and NIGHT, the SILCOON/CASCOON split
// on its personality. Never an item, a trade, beauty or SHEDINJA's copy. What evolved is kept by its personality until
// SYNC writes the new species into the save (writer.ts), and the game finishes it (its stats, the INDEX, its moves).
import speciesJson from "../data/species.json" with { type: "json" };
import type { Store } from "./store.js";

const SPECIES = speciesJson as unknown as Record<string, any>;
export interface Evolution { method: string; param: number | string; target: number; judged: boolean }
export interface Judged { species: number; level: number; friendship: number; personality: number; bond?: number }

// the species it becomes now, or null: the first of its evolutions the companion may judge whose rule it meets
export function evolveTarget(d: Judged, hour: number): number | null {
  for (const e of (SPECIES[String(d.species)]?.evolutions ?? []) as Evolution[]) {
    if (!e.judged) continue;
    const p = Number(e.param), friend = d.friendship >= 220, split = ((d.personality >>> 16) % 10) < 5;
    const met = e.method === "LEVEL" || e.method === "LEVEL_NINJASK" ? d.level >= p
      : e.method === "FRIENDSHIP" ? friend
      : e.method === "FRIENDSHIP_DAY" ? friend && hour >= 12
      : e.method === "FRIENDSHIP_NIGHT" ? friend && hour < 12
      : e.method === "LEVEL_SILCOON" ? d.level >= p && split
      : e.method === "LEVEL_CASCOON" ? d.level >= p && !split
      : e.method === "CARRIED" ? (d.bond ?? 0) >= p              // C-185: only ever met here (DAEMONS T-450)
      : false;                                                   // the ATK/DEF comparisons wait for its stats (not yet here)
    if (met && SPECIES[String(e.target)]) return e.target;
  }
  return null;
}

export interface Evolved { from: number; to: number; at: string }
const key = (personality: number) => `evolved.${personality >>> 0}`;
export function evolvedOf(store: Store, personality: number): Evolved | null {
  try { return JSON.parse(store.getSetting(key(personality)) ?? "null"); } catch { return null; }
}
// judged again each time it is looked at: what it is now (the save's species, or what it has already become here),
// and if that meets a rule, it becomes the next -- kept, and told once as an interaction
export function judgeEvolution(store: Store, d: Judged, now = new Date()): Evolved | null {
  const had = evolvedOf(store, d.personality);
  const target = evolveTarget({ ...d, species: had?.to ?? d.species }, now.getHours());
  if (target === null) return had;
  const e: Evolved = { from: had?.from ?? d.species, to: target, at: now.toISOString() };
  store.setSetting(key(d.personality), JSON.stringify(e));
  store.logInteraction("evolved", `${d.personality >>> 0} ${had?.to ?? d.species} ${target}`);
  return e;
}
// written into the save: forgotten here
export function evolutionWritten(store: Store, personality: number) { store.setSetting(key(personality), null); }

// C-185 (the user, 2026-10-24: "daemons that evolve only with you" -- a new line made for it, DAEMONS T-450): the bond a
// carried daemon builds while it is out, kept by its personality and never reset (the line's two thresholds, 60 and
// 160, are both counted from the first day). steps/1000 + days carried x 5 + cares + goals done x 3, as the game
// session weighed it; a day carried counted once a calendar day, and no one day's steps past 20,000 -- one long walk
// is not a bond.
export const BOND = { stepsPer: 1000, day: 5, care: 1, goal: 3, dayStepsCap: 20000 };
export interface Bond { days: number; lastDay: string; stepsBanked: number; stepsToday: number; cares: number; goals: number }
const bondKey = (personality: number) => `bond.${personality >>> 0}`;
const NO_BOND: Bond = { days: 0, lastDay: "", stepsBanked: 0, stepsToday: 0, cares: 0, goals: 0 };
export function bondOf(store: Store, personality: number): Bond {
  try { return { ...NO_BOND, ...JSON.parse(store.getSetting(bondKey(personality)) ?? "{}") }; } catch { return { ...NO_BOND }; }
}
export function bondScore(b: Bond) {
  return Math.floor((b.stepsBanked + b.stepsToday) / BOND.stepsPer) + b.days * BOND.day + b.cares * BOND.care + b.goals * BOND.goal;
}
// seen carried today, with the day's steps so far: a new day counts once, and its steps (capped) replace the day's
// before -- the walking count only ever rises through a day
export function bondSeen(store: Store, personality: number, date: string, steps: number): Bond {
  const b = bondOf(store, personality);
  if (b.lastDay !== date) { b.stepsBanked += b.stepsToday; b.stepsToday = 0; b.days += 1; b.lastDay = date; }
  b.stepsToday = Math.max(b.stepsToday, Math.min(Math.max(0, steps), BOND.dayStepsCap));
  store.setSetting(bondKey(personality), JSON.stringify(b));
  return b;
}
export function bondAdd(store: Store, personality: number, what: "cares" | "goals") {
  const b = bondOf(store, personality);
  b[what] += 1;
  store.setSetting(bondKey(personality), JSON.stringify(b));
}
