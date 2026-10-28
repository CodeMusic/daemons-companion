// C-232: THE SUBTLE LAYER's cards -- twenty-two, a REASON face and an INSTINCT face; the day's card, a card, a spread.
import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { cardOf, cardOfDay, deckSize, draw, SHINY_ONE_IN, SPREAD } from "../src/arcana.js";
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
        expect(c.keyword.length).toBeLessThanOrEqual(11);
        expect(c.phrase.length).toBeLessThanOrEqual(40);
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
