// C-290: this file runs on the phone too (C-111) -- keep it free of Node-only APIs (node:*, fs).
// C-356 (the user, 2026-11-12: "a dream journal type ... it also finds the symbols in your dream and give interpretation --
// it should use the wisdom we have in the subtle layer and the hermetic+eudaimon layer+unity book ... perhaps we make some
// distilled context for this ... even in the regular journal type, we could have some symbolism notes, or a similar
// ability to find hidden signs, symbols and patterns in your regular journal notes"): READ THE SIGNS.
//
// The four books are too long for a small mind to hold, so they are distilled by hand into data/symbols.json: a few
// PRINCIPLES per book, always sent, and a lexicon of SYMBOLS, each with the words that call it up and what the books say
// of it. A reading takes the words (one entry, or a chapter's), finds the symbols whose words are in them, and asks the
// house's mind to read them -- in a DREAM journal as a dream's symbols, in a STANDARD one as the signs and patterns of
// a life written down. With no mind, or one that would not answer, the lexicon's own readings are the reading. Every
// word DRAFT.
import symbolsJson from "../data/symbols.json" with { type: "json" };

export type Book = "subtle" | "hermetic" | "eudaimon" | "unity";
export type Symbol = { sign: string; keys: string[]; readings: { book: Book; reading: string }[] };
export type Lexicon = { books: Record<Book, string>; principles: { book: Book; line: string }[]; symbols: Symbol[] };
export type Kind = "standard" | "dream";
export type Sign = { sign: string; seen: string; reading: string; books: string[] };
export type Reading = { signs: Sign[]; thread: string };

export const LEXICON = symbolsJson as unknown as Lexicon;

const words = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}' -]/gu, " ").split(/[\s-]+/).map((w) => w.replace(/^'+|'+$/g, "")).filter(Boolean);

// The symbols the words call up, the most called first: each with the words that called it (as written)
export function symbolsIn(text: string, lex: Lexicon = LEXICON, most = 14): { symbol: Symbol; found: string[]; count: number }[] {
  const ws = words(text), count = new Map<string, number>();
  for (const w of ws) count.set(w, (count.get(w) ?? 0) + 1);
  const out: { symbol: Symbol; found: string[]; count: number }[] = [];
  for (const s of lex.symbols) {
    const found: string[] = []; let n = 0;
    for (const k of s.keys) {
      const key = k.toLowerCase();
      if (key.includes(" ")) { if (text.toLowerCase().includes(key)) { found.push(key); n++; } continue; }
      const c = count.get(key) ?? 0;
      if (c) { found.push(key); n += c; }
    }
    if (n) out.push({ symbol: s, found, count: n });
  }
  return out.sort((a, b) => b.count - a.count || a.symbol.sign.localeCompare(b.symbol.sign)).slice(0, most);
}

const bookName = (b: string, lex: Lexicon) => (lex.books as Record<string, string>)[b] ?? b.toUpperCase();

// What the mind is told of the books: every principle, then the symbols found in these words
export function lensesOf(found: ReturnType<typeof symbolsIn>, lex: Lexicon = LEXICON): string {
  const by = new Map<string, string[]>();
  for (const p of lex.principles) by.set(p.book, [...(by.get(p.book) ?? []), p.line]);
  const books = [...by].map(([b, ls]) => `${bookName(b, lex)}:\n${ls.map((l) => `- ${l}`).join("\n")}`).join("\n\n");
  const syms = found.map(({ symbol, found: f }) =>
    `${symbol.sign} (here as: ${f.join(", ")})\n${symbol.readings.map((r) => `- ${bookName(r.book, lex)}: ${r.reading}`).join("\n")}`).join("\n\n");
  return `THE FOUR BOOKS, as lenses:\n\n${books}${syms ? `\n\nSYMBOLS THE BOOKS KNOW, found in these words:\n\n${syms}` : ""}`;
}

const SHAPE = "Answer with JSON only, no other words: {\"signs\": [{\"sign\": the symbol in one to three words, \"seen\": where it appears " +
  "in the words, under 12 words, \"reading\": what it may mean here, under 60 words, \"books\": the books whose lens you used, by name}], " +
  "\"thread\": one or two sentences on what the signs say together, under 50 words}.";
export const SIGNS_ASK: Record<Kind, string> = {
  dream: "You read the symbols in a person's dream, through the four books given as lenses. Find the three to six images in the dream that " +
    "carry the most -- a place, a creature, an object, a colour, a number, a figure, an act -- and read each: what it may be saying, for this " +
    "dreamer, in the books' own spirit, tied to how it appears in the dream. Prefer the symbols the books know, but read any strong image. " +
    "Offer, never pronounce: 'may', 'often', 'asks'. Never diagnose, never predict, never advise. " + SHAPE,
  standard: "You find the hidden signs, symbols and patterns in a person's journal, through the four books given as lenses: images that recur, " +
    "numbers, colours, creatures, places, people's roles, coincidences, a feeling that keeps returning, a turn in the days. Find three to six " +
    "and read each: what it may be pointing to, in the books' own spirit, tied to where it appears. Offer, never pronounce: 'may', 'often', " +
    "'asks'. Never diagnose, never predict, never advise. " + SHAPE,
};

export const READ_MOST = 6000;
export const signsAsk = (kind: Kind, text: string, found: ReturnType<typeof symbolsIn>, lex: Lexicon = LEXICON) =>
  `${lensesOf(found, lex)}\n\n${kind === "dream" ? "THE DREAM" : "THE JOURNAL"}:\n\n${text.length > READ_MOST ? `${text.slice(0, READ_MOST)}…` : text}`;

const clip = (s: unknown, most: number) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, most);

// The mind's answer as a reading; null if it gave nothing usable
export function readSigns(text: string | null | undefined, lex: Lexicon = LEXICON): Reading | null {
  const raw = String(text ?? "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]);
    const names = Object.values(lex.books).map((n) => n.toUpperCase());
    const signs: Sign[] = (Array.isArray(j.signs) ? j.signs : []).slice(0, 8).map((s: any) => ({
      sign: clip(s?.sign, 40).toUpperCase(), seen: clip(s?.seen, 120), reading: clip(s?.reading, 480),
      books: (Array.isArray(s?.books) ? s.books : [s?.books]).map((b: unknown) => clip(b, 40).toUpperCase())
        .map((b: string) => names.find((n) => n === b || n.includes(b.replace(/^THE /, ""))) ?? "").filter(Boolean),
    })).filter((s: Sign) => s.sign && s.reading);
    return signs.length ? { signs, thread: clip(j.thread, 360) } : null;
  } catch { return null; }
}

// With nobody to read them: the lexicon's own words for the symbols found (the first reading of each, its book named)
export function plainSigns(found: ReturnType<typeof symbolsIn>, lex: Lexicon = LEXICON, most = 6): Reading {
  return {
    signs: found.slice(0, most).map(({ symbol, found: f }) => ({
      sign: symbol.sign.toUpperCase(), seen: f.join(", "), reading: symbol.readings[0]?.reading ?? "",
      books: symbol.readings.slice(0, 1).map((r) => bookName(r.book, lex).toUpperCase()),
    })).filter((s) => s.reading),
    thread: "",
  };
}
