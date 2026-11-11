// C-232: THE SUBTLE LAYER's cards -- twenty-two, a REASON face and an INSTINCT face; the day's card, a card, a spread.
import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { cardOf, cardOfDay, deckSize, draw, SHINY_ONE_IN, SPREAD, symbolForm } from "../src/arcana.js";
import speciesJson from "../data/species.json" with { type: "json" };

const SPECIES = speciesJson as unknown as Record<string, { name: string; national: number; art: { front: string } }>;
const ART = join(import.meta.dirname, "..", "data", "art");
const seeded = (s: number) => () => ((s = (s * 1103515245 + 12345) >>> 0) / 2 ** 32);

describe("C-232: the deck", () => {
  it("is twenty-two cards, each with a mainland REASON daemon and an island INSTINCT daemon, all drawn", () => {
    expect(deckSize()).toBe(22);
    for (let n = 0; n < 22; n++) {
      const r = cardOf(n, "reason", false), i = cardOf(n, "instinct", false);
      expect(SPECIES[r.species]?.national).toBeLessThanOrEqual(151);
      expect(SPECIES[i.species]?.national).toBeGreaterThan(151);
      for (const c of [r, i]) {
        expect(existsSync(join(ART, SPECIES[c.species].art.front.split("/").pop()!.replace("_front", "")))).toBe(true);
        expect(c.keyword.length).toBeLessThanOrEqual(12);
        expect(c.phrase.length).toBeLessThanOrEqual(40);           // the short phrase: the game's and the watches'
        expect(c.prophecy!.length).toBeGreaterThanOrEqual(100);    // C-272: the prophecy, the app's alone
        expect(c.prophecy!.length).toBeLessThanOrEqual(200);
      }
      expect(r.keyword).not.toBe(i.keyword);
    }
  });
  it("has its four faces on disk", () => {
    for (const f of ["reason", "instinct", "reason_shiny", "instinct_shiny"]) expect(existsSync(join(ART, `arcana_${f}.png`))).toBe(true);
    expect(cardOf(17, "instinct", true).face).toBe("/art/arcana/instinct_shiny.png");
  });
});

describe("C-232: drawing", () => {
  it("gives the same card all day, and another the next", () => {
    expect(cardOfDay("2026-10-28", "ROVER7")).toEqual(cardOfDay("2026-10-28", "ROVER7"));
    const week = new Set(Array.from({ length: 30 }, (_, d) => JSON.stringify(cardOfDay(`2026-11-${String(d + 1).padStart(2, "0")}`, "ROVER7"))));
    expect(week.size).toBeGreaterThan(15);
  });
  it("lays a spread of three, past, present and future, never a card twice", () => {
    for (let s = 1; s < 40; s++) {
      const c = draw(3, seeded(s));
      expect(c.map((x) => x.at)).toEqual([...SPREAD]);
      expect(new Set(c.map((x) => x.n)).size).toBe(3);
    }
    expect(draw(1, seeded(9))[0].at).toBeUndefined();
  });
  it("comes shiny now and then -- about one in sixteen", () => {
    const r = seeded(4), cards = Array.from({ length: 3200 }, () => draw(1, r)[0]);
    const shiny = cards.filter((c) => c.shiny).length / cards.length;
    expect(shiny).toBeGreaterThan(0.5 / SHINY_ONE_IN);
    expect(shiny).toBeLessThan(2 / SHINY_ONE_IN);
    expect(cards.filter((c) => c.side === "instinct").length).toBeGreaterThan(1300);
  });
});

// C-272: THE HERMETIC LAYER's two decks, ABOVE and BELOW -- a face each on the twenty-two, as REASON and INSTINCT
describe("C-272: ABOVE and BELOW", async () => {
  const arcana = (await import("../data/arcana.json")).default as unknown as
    { cards: Record<"reason" | "instinct" | "above" | "below" | "spellcraft", { keyword: string; phrase: string; prophecy: string; species: string }>[] };
  const thirteen = (await import("../data/thirteen.json")).default as unknown as { cards: { species: string }[] };
  const BY_NAME = new Map(Object.values(SPECIES).map((s) => [s.name, s]));
  it("gives every card an ABOVE and a BELOW face, each a prophecy on a daemon of its own", () => {
    for (const c of arcana.cards) for (const f of [c.above, c.below]) {
      expect(BY_NAME.get(f.species)?.national, f.species).toBeGreaterThan(0);    // SYMBOL's art is a folder of forms
      expect(f.keyword.length).toBeLessThanOrEqual(12);
      expect(f.phrase.length).toBeLessThanOrEqual(40);
      expect(f.prophecy.length).toBeGreaterThanOrEqual(100);
      expect(f.prophecy.length).toBeLessThanOrEqual(200);
    }
    const faces = arcana.cards.flatMap((c) => [c.reason, c.instinct, c.above, c.below].map((f) => f.species));
    expect(new Set([...faces, ...thirteen.cards.map((t) => t.species)]).size).toBe(faces.length + thirteen.cards.length);
  });
  it("keeps every word in the GBA's characters", () => {
    for (const c of arcana.cards) for (const f of [c.reason, c.instinct, c.above, c.below])
      expect(/^[A-Za-z0-9 .,:;!?'-]+$/.test(f.phrase + f.keyword + f.prophecy), f.keyword).toBe(true);
  });
  // C-273, agreed with the game lane (DAEMONS T-509): the GBA computes the same day's card
  it("deals the hermetic day's card by SPELLCRAFT's seed, odd ABOVE and even BELOW", () => {
    expect([cardOfDay("2026-11-01", "RED12345", "hermetic")].map((c) => [c.roman, c.side, c.keyword])[0]).toEqual(["XX", "below", "THE LEDGER"]);
    expect([cardOfDay("2026-11-02", "RED12345", "hermetic")].map((c) => [c.roman, c.side, c.keyword])[0]).toEqual(["XI", "above", "THE COIN"]);
    expect([cardOfDay("2026-12-25", "BLUE54321", "hermetic")].map((c) => [c.roman, c.side, c.keyword])[0]).toEqual(["VIII", "above", "SULPHUR"]);
    expect(cardOfDay("2026-11-01", "RED12345", "hermetic").n).toBe(cardOfDay("2026-11-01", "RED12345", "spellcraft").n);
    expect(cardOfDay("2026-11-01", "RED12345", "hermetic").prophecy?.length).toBeGreaterThan(100);
  });
  it("draws from the deck chosen -- one of the two, or both as one -- and lays MIND, BODY, SPIRIT", () => {
    for (let s = 1; s < 30; s++) {
      expect(draw(3, seeded(s), "hermetic", "above").every((c) => c.side === "above")).toBe(true);
      expect(draw(3, seeded(s), "subtle", "instinct").every((c) => c.side === "instinct")).toBe(true);
      expect(draw(1, seeded(s), "hermetic", "reason")[0].side).not.toBe("reason");   // a pick from the other book means both
    }
    const sides = new Set(Array.from({ length: 60 }, (_, s) => draw(1, seeded(s + 1), "hermetic")[0].side));
    expect([...sides].sort()).toEqual(["above", "below"]);
    expect(draw(3, seeded(3), "subtle", "both", "mbs").map((c) => c.at)).toEqual(["MIND", "BODY", "SPIRIT"]);
    expect(cardOf(4, "below", true).face).toBe("/art/arcana/below_shiny.png");
    for (const f of ["above", "below", "above_shiny", "below_shiny", "back"]) expect(existsSync(join(ART, `arcana_${f}.png`))).toBe(true);
  });
});

// C-239: THE HERMETIC LAYER's deck, the same twenty-two with a SPELLCRAFT face; C-240: Halloween's thirteen
describe("C-239, C-240: SPELLCRAFT, and the thirteen", async () => {
  const { cardOf, cardOfDay, draw, isHalloween, thirteenOfDay } = await import("../src/arcana.js");
  const arcana = (await import("../data/arcana.json")).default as unknown as { cards: { spellcraft: { keyword: string; phrase: string; species: string } }[] };
  const thirteen = (await import("../data/thirteen.json")).default as unknown as { cards: { n: string; species: string }[] };
  it("gives every card a SPELLCRAFT face, a daemon of its own, its own picture", () => {
    const seen = new Set<string>();
    for (let n = 0; n < 22; n++) {
      const c = cardOf(n, "spellcraft", false);
      expect(c.species, c.name).toBeGreaterThan(0);
      expect(c.face).toBe("/art/arcana/spellcraft.png");
      seen.add(c.name);
    }
    expect(seen.size).toBe(22);
    for (const c of arcana.cards) { expect(c.spellcraft.keyword.length).toBeLessThanOrEqual(11); expect(c.spellcraft.phrase.length).toBeLessThanOrEqual(38); }
  });
  it("draws SPELLCRAFT only from its own deck, and its day card apart from THE SUBTLE LAYER's", () => {
    expect(draw(3, Math.random, "spellcraft").every((c) => c.side === "spellcraft")).toBe(true);
    expect(cardOfDay("2026-10-29", "ROVER1", "spellcraft").side).toBe("spellcraft");
    expect(["reason", "instinct"]).toContain(cardOfDay("2026-10-29", "ROVER1").side);
  });
  it("on Halloween deals one of the thirteen -- fourteen with the half -- each a daemon that exists", () => {
    expect([isHalloween("2026-10-31"), isHalloween("2026-10-30")]).toEqual([true, false]);
    expect(thirteen.cards.map((c) => c.n)).toContain("3½");
    const c = thirteenOfDay("2026-10-31", "ROVER1");
    expect(c.species).toBeGreaterThan(0);
    expect(thirteen.cards.every((t) => t.species.length > 0)).toBe(true);
  });
});

describe("C-315: SYMBOL on a card", () => {
  it("shows the form for its keyword's first letter", () => {
    expect(symbolForm("INCANTATION")).toBe("i");
    expect(symbolForm("beginnings")).toBe("b");
    expect(symbolForm("!")).toBe("exclamation_mark");
    expect(symbolForm("")).toBe("question_mark");
    const dealt = Array.from({ length: deckSize() }, (_, n) => ["reason", "instinct", "above", "below", "spellcraft"]
      .map((side) => { try { return cardOf(n, side as any, false); } catch { return null; } })).flat()
      .filter((c) => c?.name === "SYMBOL");
    expect(dealt.length).toBeGreaterThan(0);
    for (const c of dealt) expect(c!.art).toBe(`/art/symbol/${symbolForm(c!.keyword)}.png`);
    for (const c of dealt) expect(existsSync(join(ART, "symbol", `${symbolForm(c!.keyword)}.png`)), c!.keyword).toBe(true);   // exported by DAEMONS
    expect(existsSync(join(ART, "symbol.png"))).toBe(true);   // the INDEX's, the A form
  });
});
