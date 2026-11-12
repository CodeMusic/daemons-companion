// C-356: a journal's KIND (STANDARD or DREAM), a dream journal's page, and READ THE SIGNS from the four books' lexicon
import { describe, expect, it } from "vitest";
import { Store } from "../src/db.js";
import { route } from "../src/routes.js";
import type { Host } from "../src/core.js";
import { chapterWords, DREAM_PAGE_ASK, PAGE_ASK, journalOf, signsWords, writeChapter, writeSigns } from "../src/journal.js";
import { LEXICON, lensesOf, plainSigns, readSigns, signsAsk, SIGNS_ASK, symbolsIn, type Lexicon } from "../src/signs.js";

const h: Host = { edition: "CONTENT", save: { read: () => null, write: () => null } };
const post = (store: Store, path: string, body: object, now = new Date("2026-11-12T12:00:00Z")) =>
  route(h, store, { method: "POST", path, body, deviceId: "phone" }, now);
const DREAM = "I was swimming in a dark sea at night and a white bird flew over the water toward the moon. Then I was in my old house, and a door would not open.";

describe("C-356: the lexicon", () => {
  it("is the four books distilled: every book has principles, and every symbol's readings name a book", () => {
    const books = Object.keys(LEXICON.books).sort();
    expect(books).toEqual(["eudaimon", "hermetic", "subtle", "unity"]);
    for (const b of books) expect(LEXICON.principles.filter((p) => p.book === b).length).toBeGreaterThan(0);
    expect(LEXICON.symbols.length).toBeGreaterThan(50);
    for (const s of LEXICON.symbols) {
      expect(s.keys.length, s.sign).toBeGreaterThan(0);
      for (const r of s.readings) expect(books, `${s.sign}: ${r.book}`).toContain(r.book);
    }
    expect(JSON.stringify(LEXICON).toLowerCase()).not.toMatch(/\bdemons?\b/);
  });
  it("finds the symbols a dream calls up, the most called first", () => {
    const found = symbolsIn(DREAM);
    const signs = found.map((f) => f.symbol.sign.toUpperCase());
    expect(signs.length).toBeGreaterThanOrEqual(4);
    expect(found[0].count).toBeGreaterThanOrEqual(found[found.length - 1].count);
    const lenses = lensesOf(found);
    for (const name of Object.values(LEXICON.books)) expect(lenses).toContain(name);
    expect(signsAsk("dream", DREAM, found)).toContain("THE DREAM");
    expect(signsAsk("standard", DREAM, found)).toContain("THE JOURNAL");
  });
  it("matches whole words only", () => {
    const lex: Lexicon = { books: LEXICON.books, principles: [], symbols: [{ sign: "SEA", keys: ["sea"], readings: [{ book: "subtle", reading: "depth" }] }] };
    expect(symbolsIn("the season changed", lex)).toEqual([]);
    expect(symbolsIn("the sea, the Sea!", lex)[0].count).toBe(2);
  });
  it("reads the mind's JSON, and keeps only the books it names that exist", () => {
    const r = readSigns(`<think>hm</think>{"signs":[{"sign":"water","seen":"the dark sea","reading":"feeling, deep","books":["The Subtle Layer","Nonsense"]}],"thread":"going under"}`);
    expect(r!.signs[0]).toMatchObject({ sign: "WATER", seen: "the dark sea", books: [LEXICON.books.subtle.toUpperCase()] });
    expect(r!.thread).toBe("going under");
    expect(readSigns("no json here")).toBeNull();
    expect(readSigns('{"signs":[]}')).toBeNull();
  });
  it("with nobody to read, the lexicon's own words", () => {
    const p = plainSigns(symbolsIn(DREAM));
    expect(p.signs.length).toBeGreaterThan(0);
    for (const s of p.signs) { expect(s.reading).toBeTruthy(); expect(s.books).toHaveLength(1); }
  });
});

describe("C-356: the DREAM JOURNAL", () => {
  it("a journal is STANDARD unless made a DREAM journal", () => {
    const s = new Store(":memory:");
    const a = post(s, "/api/journal", { title: "Days" }), d = post(s, "/api/journal", { title: "Nights", kind: "dream" });
    expect((a.body as any).kind).toBe("standard");
    expect((d.body as any).kind).toBe("dream");
    expect((post(s, "/api/journal", { title: "Odd", kind: "nonsense" }).body as any).kind).toBe("standard");
    const rows = (route(h, s, { method: "GET", path: "/api/journals", body: {}, deviceId: "p" }).body as any).journals;
    expect(rows.map((r: any) => r.kind).sort()).toEqual(["dream", "standard", "standard"]);
  });
  it("an older database gains the kind, every journal standard", () => {
    const s = new Store(":memory:");
    s.db.exec("CREATE TABLE journals (id INTEGER PRIMARY KEY, title TEXT NOT NULL, created TEXT NOT NULL)");
    s.db.prepare("INSERT INTO journals (title, created) VALUES ('Old', '2026-11-01T00:00:00Z')").run();
    expect(journalOf(s, 1)!.kind).toBe("standard");
  });
  it("a dream chapter is told as dreams, and its signs are read after it", async () => {
    const s = new Store(":memory:");
    const id = (post(s, "/api/journal", { title: "Nights", kind: "dream" }).body as any).id;
    post(s, "/api/journal/entry", { journal: id, title: "The sea", body: DREAM });
    const r = post(s, "/api/journal/summarize", { journal: id }).body as any;
    expect(r.writing).toBeGreaterThan(0);
    expect(r.signing).toBeGreaterThan(0);
    expect(r.signs[0]).toMatchObject({ chapter: r.writing, state: "writing" });
    expect(chapterWords(s, r.writing)!.kind).toBe("dream");
    const asked: string[] = [];
    await writeChapter(s, r.writing, async (system) => { asked.push(system); return "TITLE: Night swim\n\nYou dreamt of the sea."; });
    expect(asked[0]).toBe(DREAM_PAGE_ASK);
    await writeSigns(s, r.signing, async (system, user) => {
      asked.push(system);
      expect(user).toContain("THE DREAM");
      return JSON.stringify({ signs: [{ sign: "the moon", seen: "a white bird toward the moon", reading: "a light that guides by reflection", books: ["THE UNITY BOOK"] }], thread: "a turning toward" });
    });
    expect(asked[1]).toBe(SIGNS_ASK.dream);
    const v = journalOf(s, id)!;
    expect(v.signs[0]).toMatchObject({ state: "done", by: "thinker", chapter: r.writing });
    expect(v.signs[0].reading!.signs[0].sign).toBe("THE MOON");
  });
  it("a standard chapter gets the standard page, and no signs unless asked", async () => {
    const s = new Store(":memory:");
    const id = (post(s, "/api/journal", { title: "Days" }).body as any).id;
    post(s, "/api/journal/entry", { journal: id, title: "", body: "A crow on the fence again, the third day." });
    const r = post(s, "/api/journal/summarize", { journal: id }).body as any;
    expect(r.signing).toBeUndefined();
    const asked: string[] = [];
    await writeChapter(s, r.writing, async (system) => { asked.push(system); return "TITLE: A crow\n\nYou saw a crow."; });
    expect(asked[0]).toBe(PAGE_ASK);
  });
  it("READ THE SIGNS on one entry, or a chapter; asked again, read again; an entry removed takes its reading", async () => {
    const s = new Store(":memory:");
    const id = (post(s, "/api/journal", { title: "Days" }).body as any).id;
    const e = (post(s, "/api/journal/entry", { journal: id, title: "", body: DREAM }).body as any).entries[0].id;
    const r = post(s, "/api/journal/signs", { journal: id, entry: e }).body as any;
    expect(r.signing).toBeGreaterThan(0);
    expect(signsWords(s, r.signing)).toMatchObject({ kind: "standard" });
    await writeSigns(s, r.signing, null);                               // no mind: the lexicon
    expect(journalOf(s, id)!.signs[0]).toMatchObject({ state: "done", by: "lexicon", entry: e });
    const again = post(s, "/api/journal/signs", { journal: id, entry: e }).body as any;
    expect(again.signing).toBe(r.signing);
    expect(again.signs).toHaveLength(1);
    await writeSigns(s, r.signing, async () => "I would rather not.");   // a mind that gives nothing usable: the lexicon still
    expect(journalOf(s, id)!.signs[0]).toMatchObject({ state: "done", by: "lexicon" });
    expect(post(s, "/api/journal/signs", { journal: id }).status).toBe(400);
    expect(post(s, "/api/journal/signs", { journal: id, entry: 999 }).status).toBe(404);
    post(s, "/api/journal/entry/remove", { journal: id, id: e });
    expect(journalOf(s, id)!.signs).toHaveLength(0);
  });
  it("words with no sign and no mind fail plainly", async () => {
    const s = new Store(":memory:");
    const id = (post(s, "/api/journal", { title: "Days" }).body as any).id;
    const e = (post(s, "/api/journal/entry", { journal: id, title: "", body: "Zzxq qqv." }).body as any).entries[0].id;
    const r = post(s, "/api/journal/signs", { journal: id, entry: e }).body as any;
    await writeSigns(s, r.signing, null);
    expect(journalOf(s, id)!.signs[0].state).toBe("failed");
  });
});

describe("C-356: a sign must be in the words", () => {
  it("drops what the mind took from the lenses instead of the dream", () => {
    const answer = JSON.stringify({ signs: [
      { sign: "shadow", seen: "a part no longer watched", reading: "an old instruction", books: ["THE SUBTLE LAYER"] },
      { sign: "white bird", seen: "a white bird flew over the water", reading: "a message arriving", books: ["THE UNITY BOOK"] },
    ], thread: "" });
    expect(readSigns(answer, undefined, DREAM)!.signs.map((s) => s.sign)).toEqual(["WHITE BIRD"]);
    expect(readSigns(answer)!.signs).toHaveLength(2);
    expect(signsAsk("dream", DREAM, symbolsIn(DREAM)).indexOf("THE DREAM")).toBe(0);
  });
});
