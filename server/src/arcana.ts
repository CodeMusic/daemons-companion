// C-232 (the user, 2026-10-28, by multiple choice and in their words): THE SUBTLE LAYER's cards -- twenty-two, our own
// arcana (data/arcana.json), each with two faces on the book's purple: REASON (a circuit board under green; a daemon of
// the mainland, where the game teaches computer science and machine learning) and INSTINCT (a living net under gold; a
// daemon of the seven islands, where it teaches the mind). A keyword at the top, a phrase under the daemon. Upright only;
// now and then SHINY. Drawn three ways, and no more: THE DAY'S CARD (the same all day), A CARD whenever one is wanted
// (out and about, or one each with a friend), and A SPREAD of three -- PAST, PRESENT, FUTURE. Only once the save holds
// THE SUBTLE LAYER. Every word DRAFT. No node: imports.
// C-272 (the user, 2026-11-01): each face also carries a PROPHECY, drawn from its daemon, its type and its INDEX entry --
// the app's alone, under the card; the game and the watches keep the short phrase.
import arcanaJson from "../data/arcana.json" with { type: "json" };
import speciesJson from "../data/species.json" with { type: "json" };
import thirteenJson from "../data/thirteen.json" with { type: "json" };

// C-239: and SPELLCRAFT, THE HERMETIC LAYER's face of the same twenty-two -- its own deck, drawn once that book is held.
// C-272/C-273 (the user, 2026-11-01): THE HERMETIC LAYER's two decks are ABOVE and BELOW, as THE SUBTLE LAYER's are REASON
// and INSTINCT; deck "hermetic" draws them. "spellcraft" is the old single face, kept for the watches until they move.
export type Side = "reason" | "instinct" | "above" | "below" | "spellcraft";
export type Deck = "subtle" | "spellcraft" | "hermetic";
export type Pick = "reason" | "instinct" | "above" | "below" | "both";   // one of the book's two decks, or both as one
type Face = { keyword: string; phrase: string; prophecy?: string; species: string };
const DECK = (arcanaJson as unknown as { cards: ({ n: number; roman: string } & Record<Side, Face>)[] }).cards;
const SIDES: Record<Deck, Side[]> = { subtle: ["reason", "instinct"], hermetic: ["above", "below"], spellcraft: ["spellcraft"] };
const THIRTEEN = (thirteenJson as unknown as { cards: { n: string; keyword: string; phrase: string; species: string }[] }).cards;
const SPECIES = speciesJson as unknown as Record<string, { name: string; national: number }>;
const BY_NAME = new Map(Object.entries(SPECIES).map(([id, s]) => [s.name, Number(id)]));

export const SHINY_ONE_IN = 16;                                     // DRAFT: how often a card comes shiny
export const SPREADS = { ppf: ["PAST", "PRESENT", "FUTURE"], mbs: ["MIND", "BODY", "SPIRIT"] } as const;   // DRAFT; C-273: the user's fourth
export type Spread = keyof typeof SPREADS;
export const SPREAD = SPREADS.ppf;
export const BACK = "/art/arcana/back.png";                        // C-273: one back for every deck -- it never shows the type

export type Card = { n: number; roman: string; side: Side; keyword: string; phrase: string; prophecy?: string; species: number;
                     name: string; shiny: boolean; art: string; face: string; at?: string };

export function cardOf(n: number, side: Side, shiny: boolean): Card {
  const c = DECK[n], f = c[side], species = BY_NAME.get(f.species) ?? 0;
  return { n: c.n, roman: c.roman, side, keyword: f.keyword, phrase: f.phrase, ...(f.prophecy ? { prophecy: f.prophecy } : {}), species,
           name: f.species, shiny, art: `/art/species/${species}.png`, face: `/art/arcana/${side}${shiny ? "_shiny" : ""}.png` };
}
export const deckSize = () => DECK.length;

const hash = (s: string) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0; return h; };
// the day's card: the same all day, for one trainer -- the seed is the date and who they are. (C-273, agreed with the game
// lane so the GBA shows the same card: the hermetic deck keeps SPELLCRAFT's seed, and the bit that gives INSTINCT gives
// ABOVE -- above pairs with instinct, below with reason. The day's card ignores the reader's choice of deck.)
export function cardOfDay(date: string, who = "", deck: Deck = "subtle"): Card {
  const h = hash(`${date}|${who}|${deck === "subtle" ? "arcana" : "spellcraft"}`), odd = (h >>> 8) % 2 === 1;
  const side: Side = deck === "spellcraft" ? "spellcraft" : deck === "hermetic" ? (odd ? "above" : "below") : odd ? "instinct" : "reason";
  return cardOf(h % DECK.length, side, (h >>> 12) % SHINY_ONE_IN === 0);
}
// C-240: Halloween's card, with THE HERMETIC LAYER held -- one of the Book of Thirteen's spells (three and a half among them)
export const isHalloween = (date: string) => date.slice(5) === "10-31";
export function thirteenOfDay(date: string, who = ""): Card {
  const h = hash(`${date}|${who}|thirteen`), t = THIRTEEN[h % THIRTEEN.length], species = BY_NAME.get(t.species) ?? 0;
  return { n: h % THIRTEEN.length, roman: t.n, side: "spellcraft", keyword: t.keyword, phrase: t.phrase, species, name: t.species,
           shiny: false, art: `/art/species/${species}.png`, face: "/art/arcana/spellcraft.png" };
}
// a card, or a spread of three (no card twice in one spread) -- from one of the book's two decks, or both as one;
// C-273: three are PAST / PRESENT / FUTURE, or MIND / BODY / SPIRIT
export function draw(count: 1 | 3, rand: () => number = Math.random, deck: Deck = "subtle", pick: Pick = "both", spread: Spread = "ppf"): Card[] {
  const ns = [...DECK.keys()];
  const sides = SIDES[deck].includes(pick as Side) ? [pick as Side] : SIDES[deck];
  const out: Card[] = [];
  for (let i = 0; i < count; i++) {
    const n = ns.splice(Math.floor(rand() * ns.length), 1)[0];
    const side = sides.length === 1 ? sides[0] : rand() < 0.5 ? sides[0] : sides[1];
    out.push({ ...cardOf(n, side, Math.floor(rand() * SHINY_ONE_IN) === 0), ...(count === 3 ? { at: SPREADS[spread][i] } : {}) });
  }
  return out;
}
