// C-290: this file runs on the phone too (C-111) -- the app imports it, directly or through another file -- so keep it free of Node-only APIs (node:*, fs).
// C-349 (the user, 2026-11-12): THE ACCENTS -- each place's palette from the game (data/accents.json, server/tools/accents.py),
// unlocked as the save reaches it: every place the companion has seen a save made in (kept here from the first read on,
// so it outlives the next save somewhere else) and every place the game's own map has lit (its visited flags: the towns
// the player can fly to). A fresh save has its first town or two. `here` is where the save was made, for IN STEP.
import accentsJson from "../data/accents.json" with { type: "json" };
import regionsJson from "../data/regions.json" with { type: "json" };
import type { Store } from "./store.js";

export type Accent = { deep: string; main: string; light: string; spark: string; map: string; breathe?: boolean };
export const ACCENTS = (accentsJson as unknown as { accents: Record<string, Accent> }).accents;

// a map section's name, ours (MAPSEC_PALLET_TOWN -> BLANCHE TOWN), for the visited flags profile.visited lists
const SECTION_NAMES: Record<string, string> = Object.fromEntries(
  (regionsJson as unknown as { regions: { sections: Record<string, { name: string }> }[] }).regions
    .flatMap((r) => Object.entries(r.sections).map(([k, s]) => [k, s.name])));

const KEY = "accents_saved_in";

export function savedInBefore(store: Store): string[] {
  try { const v = JSON.parse(store.getSetting(KEY) ?? "[]"); return Array.isArray(v) ? v.filter((x) => typeof x === "string") : []; }
  catch { return []; }
}

/** What this save has unlocked, keeping where it was saved in the companion's memory. */
export function accentsOf(store: Store, prof: { savedIn: { place: string } | null; visited: string[] }) {
  const here = prof.savedIn?.place && ACCENTS[prof.savedIn.place] ? prof.savedIn.place : null;
  const before = savedInBefore(store);
  if (here && !before.includes(here)) store.setSetting(KEY, JSON.stringify([...before, here]));
  const lit = prof.visited.map((m) => SECTION_NAMES[m]).filter((n): n is string => !!n && !!ACCENTS[n]);
  const unlocked = [...new Set([...before, ...(here ? [here] : []), ...lit])].sort();
  return { here, unlocked };
}
