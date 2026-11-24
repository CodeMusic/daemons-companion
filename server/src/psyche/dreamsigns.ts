// C-290: this file runs on the phone too (C-111) -- keep it free of Node-only APIs (node:*, fs).
// C-484 (the user, 2026-11-23: "I'd also like if the 'signs and symbols' which currently in the app u have to click to
// generate -- for that to also show under the dream (perhaps a more concise version, where it shows an actual symbol and
// then the word, and the body of what the symbol represents -- ideally it starts with a reference to what in the dream
// led to this symbol ... along with the book that led to these symbols ... the symbols should generated if one does not
// exist in the inventory -- once it generates the symbols it is saved somewhere for use in future dreams [in the engine
// room we would have the ability to regenerate any particular symbol if it was not what we wanted]"):
//
// THE SYMBOLS' INVENTORY: every symbol a dream has called up, kept with its glyph and what it stands for. The lexicon's
// ninety-seven (signs.ts, data/symbols.json) come with a glyph drawn here; a symbol the house's mind names that is not
// yet kept is kept the first time, with the glyph and meaning the mind gave it (or one from the pool), and every later
// dream that calls it up shows the same one. THE ENGINE ROOM makes one again (POST /api/symbols/again).
//
// A dream's own SIGNS & SYMBOLS: the house's mind's reading, kept on the dream, once it has been read; until then, and
// with no mind, the lexicon's reading of its words. Every word DRAFT.
import type { Store } from "../shared/store.js";
import { LEXICON, plainSigns, readSigns, signName, SIGNS_ASK, signsAsk, symbolsIn, type Reading, type Sign } from "./signs.js";

// a glyph for each of the lexicon's symbols: plain text symbols (shown with U+FE0E, so a phone does not swap in a picture)
export const GLYPHS: Record<string, string> = {
  WATER: "▽", FIRE: "△", FLYING: "⇧", FALLING: "⇩", "BEING CHASED": "⇉", TEETH: "▿▿", HOUSE: "⌂", DOOR: "▯", KEY: "⚷",
  STAIRS: "⊿", MIRROR: "◐", SNAKE: "∿", OUROBOROS: "◯", BIRD: "⋎", DOG: "⊻", CAT: "⊼", DEATH: "⚰", BIRTH: "✳",
  CHILD: "◦", MOTHER: "♁", FATHER: "♃", STRANGER: "⁇", "STRANGER WHO KNOWS YOU": "⁈", "SHADOW FIGURE": "◼", OCEAN: "≋",
  FOREST: "♣♣", MOUNTAIN: "▲", ROAD: "═", CAR: "⇒", TRAIN: "⊡⊡", BRIDGE: "⌓", STORM: "☈", SUN: "☉", MOON: "☾",
  STARS: "✶", NIGHT: "◗", LIGHT: "☼", DARKNESS: "■", GOLD: "◈", BOOK: "▤", "BLANK TABLET": "▭", SCHOOL: "⌗",
  "BEING LATE": "⌛", NAKED: "◌", "LOSING SOMETHING": "⊘", PHONE: "☏", MACHINE: "⚙", RING: "◎", CIRCLE: "○", SPIRAL: "∮",
  TREE: "♣", GARDEN: "✿", FLOWER: "❀", SEED: "•", EGG: "⬭", CAVE: "◠", WELL: "⊚", TOWER: "♜", CROSSROADS: "╋",
  THRESHOLD: "⊐", THREE: "∴", SEVEN: "7", TWELVE: "12", THIRTEEN: "13", RED: "◆", BLUE: "◆", GREEN: "◆", YELLOW: "◆",
  WHITE: "◇", BLACK: "◆", VIOLET: "◆", MASK: "☻", VOICE: "❝", MUSIC: "♫", WOUND: "✕", HEALING: "✚", GIFT: "⊞",
  TWIN: "⧉", DAEMON: "✧", SPOON: "⚲", HAND: "☞", APPLE: "◍", STONE: "▰", CUP: "⊔", BOX: "☐", NAME: "№", WORDS: "¶",
  SLEEP: "≀", EATING: "◒", MONEY: "¤", ANGER: "✸", ENVY: "⊜", TRAPPED: "⊠", LOVER: "♡", EYE: "◉", BODY: "⊕", GOD: "✺",
};
// the colours' own ink, so a colour's diamond is that colour
export const SIGN_INK: Record<string, string> = { RED: "#b23a3a", BLUE: "#3a5fb2", GREEN: "#3a9a4a", YELLOW: "#c9a623",
                                                  WHITE: "#d9d4c7", BLACK: "#222222", VIOLET: "#7b3194" };
// for a symbol a mind names that the lexicon does not know, and gives no glyph of its own
export const POOL = ["⟡", "✷", "✹", "❖", "✥", "✤", "✣", "❂", "❉", "❊", "❋", "✾", "✽", "⌘", "⌬", "⍟", "⎈", "⊛", "⊗", "⋄",
                     "⋇", "⋈", "⌖", "⧫", "⬡", "✱", "✲", "✺", "❃", "✻"];

export type Kept = { sign: string; glyph: string; means: string; book: string; by: "lexicon" | "mind" | "pool"; made: string };
const INVENTORY = "symbols.inventory";
export function inventoryOf(store: Store): Record<string, Kept> {
  try { const o = JSON.parse(store.getSetting(INVENTORY) ?? "{}"); return o && typeof o === "object" ? o : {}; } catch { return {}; }
}
const keepInventory = (store: Store, inv: Record<string, Kept>) => store.setSetting(INVENTORY, JSON.stringify(inv));

const bookName = (b: string) => (LEXICON.books as Record<string, string>)[b] ?? b.toUpperCase();
const hash = (s: string) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const lexiconOf = (sign: string) => LEXICON.symbols.find((s) => s.sign.toUpperCase() === sign);
// A glyph a mind gave is kept if it is one or two symbols, not words
export const fitGlyph = (g: unknown): string | null => {
  const t = String(g ?? "").replace(/️|︎/g, "").trim(), chars = [...t];
  return chars.length >= 1 && chars.length <= 2 && !/[\p{L}\p{N}\s]/u.test(t) ? t : null;
};
// the pool's glyph for a sign, past any already taken by another
function poolGlyph(sign: string, taken: Set<string>, skip = 0): string {
  for (let i = 0; i < POOL.length; i++) { const g = POOL[(hash(sign) + skip + i) % POOL.length]; if (!taken.has(g)) return g; }
  return POOL[(hash(sign) + skip) % POOL.length];
}

/** A symbol as kept: the inventory's, else the lexicon's (kept the first time), else made from what was given. */
export function keptSymbol(store: Store, sign: string, given?: { glyph?: unknown; means?: string; book?: string }, now = new Date()): Kept {
  const name = signName(sign), inv = inventoryOf(store);
  if (inv[name]) return inv[name];
  const lex = lexiconOf(name), taken = new Set(Object.values(inv).map((k) => k.glyph));
  const g = GLYPHS[name] ?? fitGlyph(given?.glyph);
  const k: Kept = lex
    ? { sign: name, glyph: GLYPHS[name] ?? poolGlyph(name, taken), means: lex.readings[0]?.reading ?? "", book: bookName(lex.readings[0]?.book ?? ""), by: "lexicon", made: now.toISOString() }
    : { sign: name, glyph: g ?? poolGlyph(name, taken), means: String(given?.means ?? "").slice(0, 300), book: given?.book ?? "", by: g ? "mind" : "pool", made: now.toISOString() };
  inv[name] = k;
  keepInventory(store, inv);
  return k;
}

// ---- a dream's SIGNS & SYMBOLS ----
export type DreamSign = Sign & { glyph: string; ink?: string };
export type DreamSigns = { signs: DreamSign[]; thread: string; books: string[]; by: "thinker" | "lexicon"; at: string };
type HasText = { text: string; signs?: DreamSigns };

const withGlyphs = (store: Store, r: Reading, extra: Record<string, { glyph?: unknown; means?: string }> = {}): DreamSign[] =>
  r.signs.map((s) => {
    const k = keptSymbol(store, s.sign, { ...extra[s.sign], book: s.books[0] });
    return { ...s, sign: k.sign, glyph: k.glyph, ...(SIGN_INK[k.sign] ? { ink: SIGN_INK[k.sign] } : {}) };
  });
const booksOf = (signs: Sign[]) => [...new Set(signs.flatMap((s) => s.books))];

/** The lexicon's reading of a dream, its symbols kept in the inventory. */
// the waking that closes a written dream ("I woke humming.") is not in the dream: every dream would read as SLEEP
export const dreamt = (text: string) => text.replace(/(^|[.!?…]\s+)I woke\b[^.!?…]*[.!?…]?/g, "$1").trim();
export function lexiconSigns(store: Store, text: string, now = new Date()): DreamSigns {
  const r = plainSigns(symbolsIn(dreamt(text)), LEXICON, 5);
  const signs = withGlyphs(store, r);
  return { signs, thread: "", books: booksOf(signs), by: "lexicon", at: now.toISOString() };
}
/** What a dream shows: its kept reading, else the lexicon's (its glyphs always the inventory's now, so a symbol made again shows anew). */
export function signsOfDream(store: Store, d: HasText, now = new Date()): DreamSigns {
  if (d.signs?.signs?.length) {
    const signs = d.signs.signs.map((s) => { const k = keptSymbol(store, s.sign); return { ...s, glyph: k.glyph, ...(SIGN_INK[k.sign] ? { ink: SIGN_INK[k.sign] } : {}) }; });
    return { ...d.signs, signs };
  }
  return lexiconSigns(store, d.text, now);
}

// the dream reading asks for each sign's glyph and meaning too, for a symbol the inventory does not hold yet
export const DREAM_SIGNS_ASK = SIGNS_ASK.dream.replace(/Answer with JSON only[\s\S]*$/, "") +
  "Answer with JSON only, no other words: {\"signs\": [{\"sign\": the symbol in one to three words, \"seen\": where it appears in the " +
  "dream, quoting its words, under 12 words, \"reading\": what it may mean here, beginning from how it appears in the dream, under 50 words, " +
  "\"books\": the books whose lens you used, by name, \"glyph\": one plain Unicode symbol character that pictures it (not a letter, not an " +
  "emoji), \"means\": what this symbol stands for in general, under 20 words}], \"thread\": one sentence on what the signs say together, under 40 words}.";

/** The house's mind reads a dream's signs; its reading is returned, its new symbols kept. Null if it gave nothing usable. */
export async function readDreamSigns(store: Store, text: string, write: (system: string, user: string, most?: number) => Promise<string | null>, now = new Date()): Promise<DreamSigns | null> {
  const found = symbolsIn(text);
  const raw = await write(DREAM_SIGNS_ASK, signsAsk("dream", text, found), 1100);
  const r = readSigns(raw, LEXICON, text);
  if (!r) return null;
  const extra: Record<string, { glyph?: unknown; means?: string }> = {};
  try {
    const j = JSON.parse(String(raw ?? "").replace(/<think>[\s\S]*?<\/think>/g, "").match(/\{[\s\S]*\}/)?.[0] ?? "{}");
    for (const s of Array.isArray(j.signs) ? j.signs : []) extra[String(s?.sign ?? "").replace(/\s+/g, " ").trim().toUpperCase().slice(0, 40)] = { glyph: s?.glyph, means: String(s?.means ?? "").slice(0, 300) };
  } catch { /* the reading stands without them */ }
  const signs = withGlyphs(store, r, extra);
  return { signs, thread: r.thread, books: booksOf(signs), by: "thinker", at: now.toISOString() };
}

// ---- THE ENGINE ROOM: a symbol made again ----
export const AGAIN_ASK = "You draw symbols for a book of dreams. Given a symbol's name, answer with JSON only: {\"glyph\": one plain Unicode " +
  "symbol character that pictures it (not a letter, not an emoji, not the one it had), \"means\": what it stands for in dreams, under 20 words}.";
/** A symbol made again: with a mind, the glyph and meaning it gives; without, the pool's next glyph and the lexicon's meaning. */
export async function symbolAgain(store: Store, sign: string, write: ((system: string, user: string, most?: number) => Promise<string | null>) | null, now = new Date()): Promise<Kept | string> {
  const name = signName(sign), inv = inventoryOf(store), had = inv[name];
  if (!had) return "no such symbol is kept";                                                     // DRAFT
  const taken = new Set(Object.values(inv).map((k) => k.glyph));
  let glyph: string | null = null, means = had.means, by: Kept["by"] = "pool";
  if (write) {
    try {
      const j = JSON.parse(String(await write(AGAIN_ASK, `The symbol: ${name}. Its glyph now: ${had.glyph}.`, 200) ?? "").match(/\{[\s\S]*\}/)?.[0] ?? "{}");
      const g = fitGlyph(j.glyph);
      if (g && g !== had.glyph) { glyph = g; by = "mind"; }
      if (typeof j.means === "string" && j.means.trim()) means = j.means.trim().slice(0, 300);
    } catch { /* the pool's, below */ }
  }
  if (!glyph) { taken.add(had.glyph); glyph = poolGlyph(name, taken, 1 + Object.keys(inv).length); }
  inv[name] = { ...had, glyph, means, by, made: now.toISOString() };
  keepInventory(store, inv);
  return inv[name];
}
export const inventoryList = (store: Store) => Object.values(inventoryOf(store)).sort((a, b) => a.sign.localeCompare(b.sign));
