// C-240 (the user, 2026-10-29: "on Halloween if you have the book, the entire holiday features that hermetic layers
// pulses (any time of day not just the witching hour)... let's get creative"; by multiple choice, all four): all of 31
// October, with THE HERMETIC LAYER held -- the shimmer on the breath all day (no shadow); A COSTUME (the daemon goes as
// a daemon of a type that beats its own -- what it fears, from the game's chart, data/fears.json -- and a tap takes the
// mask off); TRICK OR TREAT (every daemon it meets that day leaves a treat: a SPELLCRAFT card, or a sweet line); THE
// THIRTEEN as the day's card (arcana.ts thirteenOfDay); THE HANDLESS CLOCK (the boards' clock face without its hands).
// Every word DRAFT. No node: imports.
import fearsJson from "../data/fears.json" with { type: "json" };
import speciesJson from "../data/species.json" with { type: "json" };
import { draw } from "./arcana.js";
import type { Store } from "./store.js";

const FEARS = (fearsJson as unknown as { fears: Record<string, string[]> }).fears;
const SPECIES = speciesJson as unknown as Record<string, { name: string; types: string[]; art?: { front?: string } }>;
const hash = (s: string) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0; return h; };
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const halloweenOn = (d = new Date()) => d.getMonth() === 9 && d.getDate() === 31;

// the costume: a daemon whose first type beats this one's -- the same one all day for the same daemon
export function costumeOf(species: number, d = new Date()): { species: number; name: string } | null {
  const own = SPECIES[String(species)];
  const fears = own ? FEARS[own.types[0]] ?? [] : [];
  if (!fears.length) return null;                             // nothing beats it: it goes as itself
  const h = hash(`${ymd(d)}|${species}|costume`), type = fears[h % fears.length];
  const as = Object.entries(SPECIES).filter(([id, s]) => s.types[0] === type && Number(id) !== species && s.art?.front);
  if (!as.length) return null;
  const [id, s] = as[(h >>> 8) % as.length];
  return { species: Number(id), name: s.name };
}

// TRICK OR TREAT: what a daemon met today leaves -- a card from THE HERMETIC LAYER's deck, or a sweet line (DRAFT)
export const SWEETS = [
  "A pocket of moonlight, still cool.",
  "One honest compliment, wrapped twice.",
  "A sugared seed that grows into a laugh.",
  "A candle that only lights for friends.",
  "A spell for one good night's sleep.",
  "A licorice key. It opens nothing. It is delicious.",
  "Half a secret. The other half is yours to guess.",
  "A ribbon tied in a knot that wants to come undone.",
  "A small bright coin from the bottom of a well.",
  "A whisper that says: you were seen today.",
  "A toffee shaped like the moon, a bite already gone.",
  "A wish, folded small enough to carry.",
];
export interface Treat { at: string; peer: string; from: string; kind: "card" | "sweet"; text: string; card?: { keyword: string; phrase: string; species: number } }
const key = (d: Date) => `halloween.treats.${ymd(d)}`;
export const treatsOf = (store: Store, d = new Date()): Treat[] => {
  try { return (JSON.parse(store.getSetting(key(d)) ?? "[]") as Treat[]) ?? []; } catch { return []; }
};
// a daemon met on Halloween: its treat, once per peer that day
export function trickOrTreat(store: Store, peer: string, from: string, d = new Date(), rand: () => number = Math.random): Treat | null {
  if (!halloweenOn(d)) return null;
  const had = treatsOf(store, d);
  if (had.some((t) => t.peer === peer)) return null;
  let t: Treat;
  if (rand() < 0.5) {
    const c = draw(1, rand, "spellcraft")[0];
    t = { at: d.toISOString(), peer, from, kind: "card", text: `${from} left a card: ${c.keyword}. ${c.phrase}`,   // DRAFT
          card: { keyword: c.keyword, phrase: c.phrase, species: c.species } };
  } else t = { at: d.toISOString(), peer, from, kind: "sweet", text: `${from} left a treat: ${SWEETS[Math.floor(rand() * SWEETS.length)]}` };   // DRAFT
  store.setSetting(key(d), JSON.stringify([t, ...had].slice(0, 60)));
  return t;
}

// for a board: is it Halloween here, the costume, and a treat left in the last ten minutes
export function halloweenView(store: Store, carried: number | null, held: boolean, d = new Date()) {
  if (!held || !halloweenOn(d)) return null;
  const fresh = treatsOf(store, d).find((t) => d.getTime() - Date.parse(t.at) < 600000);
  return { on: 1, costume: carried ? costumeOf(carried, d) : null, ...(fresh ? { treat: fresh.text } : {}), treats: treatsOf(store, d).length };
}
