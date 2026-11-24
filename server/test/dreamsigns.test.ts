// C-484: a dream's SIGNS & SYMBOLS, and THE SYMBOLS' INVENTORY (server/src/psyche/dreamsigns.ts)
import { describe, expect, it } from "vitest";
import { Store } from "../src/shared/db.js";
import { dreamById, keepDreamSigns, keepNight } from "../src/dreams.js";
import { GLYPHS, inventoryOf, lexiconSigns, readDreamSigns, signsOfDream, symbolAgain } from "../src/psyche/dreamsigns.js";
import { LEXICON } from "../src/psyche/signs.js";

const said = (o: unknown) => async () => JSON.stringify(o);

describe("SIGNS & SYMBOLS under a dream (C-484)", () => {
  it("every lexicon symbol has its own glyph", () => {
    for (const s of LEXICON.symbols) expect(GLYPHS[s.sign.toUpperCase()], s.sign).toBeTruthy();
  });
  it("the lexicon reads a dream at once, each sign with its glyph, what called it up, and its book; and keeps them", () => {
    const store = new Store(":memory:");
    const r = lexiconSigns(store, "I dreamt of a lake under the moon, and a door I could not open.");
    const names = r.signs.map((s) => s.sign);
    expect(names).toEqual(expect.arrayContaining(["WATER", "MOON", "DOOR"]));
    const water = r.signs.find((s) => s.sign === "WATER")!;
    expect(water).toMatchObject({ glyph: "▽", seen: "lake" });
    expect(water.books.length).toBe(1);
    expect(r.by).toBe("lexicon");
    expect(Object.keys(inventoryOf(store))).toEqual(expect.arrayContaining(["WATER", "MOON", "DOOR"]));
  });
  it("the house's mind names a new symbol: kept with its glyph, and the same glyph the next time it is called up", async () => {
    const store = new Store(":memory:");
    const text = "I dreamt a paper kite floated over the water and sang.";
    const first = await readDreamSigns(store, text, said({ signs: [
      { sign: "kite", seen: "a paper kite floated", reading: "A kite over water may be a small light carried into feeling.", books: ["THE SUBTLE LAYER"], glyph: "⚹", means: "a light you carry" },
      { sign: "water", seen: "over the water", reading: "Water often comes with feeling.", books: ["THE SUBTLE LAYER"], glyph: "~" },
    ], thread: "A light carried over feeling." }));
    expect(first?.by).toBe("thinker");
    expect(first?.signs.map((s) => [s.sign, s.glyph])).toEqual([["KITE", "⚹"], ["WATER", "▽"]]);   // the lexicon's glyph wins
    expect(inventoryOf(store).KITE).toMatchObject({ glyph: "⚹", means: "a light you carry", by: "mind" });
    const again = await readDreamSigns(store, "The kite again, on a pier.", said({ signs: [
      { sign: "kite", seen: "The kite again", reading: "It returns.", books: ["THE UNITY BOOK"], glyph: "✪" }], thread: "" }));
    expect(again?.signs[0].glyph).toBe("⚹");
  });
  it("a sign the dream does not hold is dropped, and words for a glyph are refused", async () => {
    const store = new Store(":memory:");
    const r = await readDreamSigns(store, "A tower in the snow.", said({ signs: [
      { sign: "tower", seen: "A tower", reading: "A tower may ask what you are building toward.", books: ["THE HERMETIC LAYER"] },
      { sign: "ocean", seen: "the ocean", reading: "Not in this dream.", books: [] },
      { sign: "snowfall", seen: "in the snow", reading: "A quiet.", books: [], glyph: "snow" }], thread: "" }));
    expect(r?.signs.map((s) => s.sign)).toEqual(["TOWER", "SNOWFALL"]);
    expect(inventoryOf(store).SNOWFALL.by).toBe("pool");
  });
  it("a reading kept on a dream is what it shows, journal or bound", async () => {
    const store = new Store(":memory:");
    const d = keepNight(store, { from: "2026-11-01T23:00:00Z", to: "2026-11-02T06:00:00Z", hours: 7, stirs: 0, tucked: false },
                        { nickname: "ROVERCUB", species: 1, personality: 1, device: "w" });
    expect(signsOfDream(store, d).by).toBe("lexicon");
    const r = (await readDreamSigns(store, d.text, said({ signs: [{ sign: d.text.split(/\W+/).find((w) => w.length > 4) ?? "night", seen: "x", reading: "y", books: [] }], thread: "t" })))!;
    expect(keepDreamSigns(store, d.id, r)).toBe(true);
    expect(signsOfDream(store, dreamById(store, d.id)!).by).toBe("thinker");
  });
  it("the waking that closes a written dream is not read as a sign", () => {
    const store = new Store(":memory:");
    expect(lexiconSigns(store, "I dreamt of the sea. I woke humming.").signs.map((s) => s.sign)).toEqual(["WATER"]);
  });
  it("THE ENGINE ROOM makes a symbol again: a new glyph, from the mind or the pool", async () => {
    const store = new Store(":memory:");
    lexiconSigns(store, "the moon");
    const pooled = await symbolAgain(store, "MOON", null);
    expect(typeof pooled !== "string" && pooled.glyph).not.toBe("☾");
    const minded = await symbolAgain(store, "moon", said({ glyph: "☽", means: "a changing light" }));
    expect(minded).toMatchObject({ sign: "MOON", glyph: "☽", means: "a changing light", by: "mind" });
    expect(signsOfDream(store, { text: "the moon" }).signs[0].glyph).toBe("☽");
    expect(await symbolAgain(store, "NOT KEPT", null)).toMatch(/no such symbol/);
  });
});
