// C-290: this file runs on the phone too (C-111) -- the app imports it, directly or through another file -- so keep it free of Node-only APIs (node:*, fs).
// C-357 (5), CONTAINER (the user's pick, 2026-11-12): THE SUBTLE LAYER's first page notes "a daemon that evolves does not
// seem to become someone else. It changes vessel." The companion's half of DAEMONS' CONTAINER at evolving: it remembers
// the form it last saw the carried daemon in, by its personality, and when that form changes -- evolved here (C-184) or in
// the game and brought home by SYNC -- for a week after, and only once the save holds the book, a line under the daemon's
// own, in the book's purple: words under words (C-204), never a feeling. Every word DRAFT. No node: imports.
import type { Store } from "./store.js";

export const VESSEL_UNDER = "Still me.";                             // DRAFT: the game lane drafts the game's, the user picks
export const VESSEL_DAYS = 7;
type Seen = { species: number; from?: number; at?: string };
const key = (personality: number) => `vessel.${personality >>> 0}`;

// what the companion last saw it as; a change kept with when it was seen. The first sight is only remembered.
export function vesselOf(store: Store, personality: number, species: number, now = new Date()): { from: number; to: number; at: string } | null {
  let s: Seen | null = null;
  try { s = JSON.parse(store.getSetting(key(personality)) ?? "null"); } catch { s = null; }
  if (!s || s.species !== species) {
    const next: Seen = s ? { species, from: s.species, at: now.toISOString() } : { species };
    store.setSetting(key(personality), JSON.stringify(next));
    s = next;
  }
  if (s.from === undefined || !s.at || now.getTime() - Date.parse(s.at) > VESSEL_DAYS * 86400000) return null;
  return { from: s.from, to: s.species, at: s.at };
}
