// DAEMONS T-531 (bible 9.21): a dream's symbol is its day's -- ring and horizon, drawn by DAEMONS tools/gendaysymbol.py
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DAY_KEYS, dayOfDream } from "../src/dreams.js";

const ART = join(import.meta.dirname, "..", "data", "art", "daysymbol");
const week = JSON.parse(readFileSync(join(import.meta.dirname, "..", "data", "week.json"), "utf8")).days as { day: string }[];

describe("T-531: the dream's day symbol", () => {
  it("keeps the week's order, Sunday first, as week.json does", () => {
    expect(week.map((d) => d.day.slice(0, 3).toLowerCase())).toEqual([...DAY_KEYS]);
  });
  it("gives a dream the day its night began, on the companion's own clock", () => {
    for (let i = 0; i < 7; i++) {
      const from = new Date(2026, 10, 15 + i, 23, 30);   // Sunday 15 Nov 2026, local
      const to = new Date(from.getTime() + 8 * 3600000);  // waking on the next day
      expect(dayOfDream({ from: from.toISOString(), at: to.toISOString() })).toBe(DAY_KEYS[i]);
    }
    expect(dayOfDream({ at: new Date(2026, 10, 18, 7).toISOString() })).toBe("wed");   // an older dream with no start
  });
  it("has all seven drawn for a light page and a dark one", () => {
    for (const d of DAY_KEYS) for (const t of ["light", "dark"]) {
      const f = join(ART, `${d}_${t}.png`);
      expect(existsSync(f), f).toBe(true);
      expect(readFileSync(f).subarray(1, 4).toString()).toBe("PNG");
    }
  });
});

import { CENTRES, centreNamed, centreOf, mergeAsk, readMerged } from "../src/dreams.js";
describe("C-412: the stage the dream took place at -- its centre", () => {
  it("asks the writer for one of the seven, and reads it however it is said", () => {
    expect(mergeAsk("I dreamt a.", "I dreamt b.")).toMatch(/"centre"/);
    expect(readMerged('{"title": "the glass stair", "centre": "Heart", "dream": "I dreamt a stair."}')?.centre).toBe(3);
    expect(readMerged('{"title": "x", "centre": "third eye", "dream": "I dreamt it."}')?.centre).toBe(5);
    expect(readMerged("TITLE: Rain\nCENTRE: Crown\nI dreamt the rain.")).toEqual({ title: "RAIN", dream: "I dreamt the rain.", centre: 6 });
    expect(readMerged('{"title": "x", "dream": "I dreamt it."}')).toEqual({ title: "X", dream: "I dreamt it." });   // none named: no key
    expect(centreNamed("solar")).toBe(2); expect(centreNamed("a feeling")).toBeUndefined();
    expect(CENTRES).toHaveLength(7);
  });
  it("falls back to the day's own centre, Sunday's root to Saturday's crown", () => {
    for (let i = 0; i < 7; i++) expect(centreOf({ from: new Date(2026, 10, 15 + i, 23).toISOString(), at: "" })).toBe(i);
    expect(centreOf({ centre: 4, from: new Date(2026, 10, 15, 23).toISOString(), at: "" })).toBe(4);
    expect(centreOf({ centre: 9, from: new Date(2026, 10, 15, 23).toISOString(), at: "" })).toBe(0);
  });
});
