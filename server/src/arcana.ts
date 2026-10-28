// C-232 (the user, 2026-10-28, by multiple choice and in their words): THE SUBTLE LAYER's cards -- twenty-two, our own
// arcana (data/arcana.json), each with two faces on the book's purple: REASON (a circuit board under green; a daemon of
// the mainland, where the game teaches computer science and machine learning) and INSTINCT (a living net under gold; a
// daemon of the seven islands, where it teaches the mind). A keyword at the top, a phrase under the daemon. Upright only;
// now and then SHINY. Drawn three ways, and no more: THE DAY'S CARD (the same all day), A CARD whenever one is wanted
// (out and about, or one each with a friend), and A SPREAD of three -- PAST, PRESENT, FUTURE. A card is a prompt for
// noticing, never a prediction (4.33). Only once the save holds THE SUBTLE LAYER. Every word DRAFT. No node: imports.
import arcanaJson from "../data/arcana.json" with { type: "json" };
import speciesJson from "../data/species.json" with { type: "json" };

export type Side = "reason" | "instinct";
type Face = { keyword: string; phrase: string; species: string };
const DECK = (arcanaJson as unknown as { cards: { n: number; roman: string; reason: Face; instinct: Face }[] }).cards;
const SPECIES = speciesJson as unknown as Record<string, { name: string; national: number }>;
const BY_NAME = new Map(Object.entries(SPECIES).map(([id, s]) => [s.name, Number(id)]));

export const SHINY_ONE_IN = 16;                                     // DRAFT: how often a card comes shiny
export const SPREAD = ["PAST", "PRESENT", "FUTURE"] as const;       // DRAFT

export type Card = { n: number; roman: string; side: Side; keyword: string; phrase: string; species: number; name: string;
                     shiny: boolean; art: string; face: string; at?: (typeof SPREAD)[number] };

export function cardOf(n: number, side: Side, shiny: boolean): Card {
  const c = DECK[n], f = c[side], species = BY_NAME.get(f.species) ?? 0;
  return { n: c.n, roman: c.roman, side, keyword: f.keyword, phrase: f.phrase, species, name: f.species, shiny,
           art: `/art/species/${species}.png`, face: `/art/arcana/${side}${shiny ? "_shiny" : ""}.png` };
}
export const deckSize = () => DECK.length;

const hash = (s: string) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0; return h; };
// the day's card: the same all day, for one trainer -- the seed is the date and who they are
export function cardOfDay(date: string, who = ""): Card {
  const h = hash(`${date}|${who}|arcana`);
  return cardOf(h % DECK.length, (h >>> 8) % 2 ? "instinct" : "reason", (h >>> 12) % SHINY_ONE_IN === 0);
}
// a card, or a spread of three (no card twice in one spread)
export function draw(count: 1 | 3, rand: () => number = Math.random): Card[] {
  const ns = [...DECK.keys()];
  const out: Card[] = [];
  for (let i = 0; i < count; i++) {
    const n = ns.splice(Math.floor(rand() * ns.length), 1)[0];
    out.push({ ...cardOf(n, rand() < 0.5 ? "reason" : "instinct", Math.floor(rand() * SHINY_ONE_IN) === 0), ...(count === 3 ? { at: SPREAD[i] } : {}) });
  }
  return out;
}
