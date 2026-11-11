// C-226: a player's public name is one word from each list in data/names.json -- picked, never typed. Every word, and
// every pair as it is shown, is checked here against data/names_check.json: no given name, body part or place, and
// nothing in a word or a pair that should not be there. A list that fails this fails the build.
import { describe, expect, it } from "vitest";
import names from "../data/names.json" with { type: "json" };
import check from "../data/names_check.json" with { type: "json" };

const lists = names as unknown as { first: (string | null)[]; second: (string | null)[] };
const words = (l: (string | null)[]) => l.filter((w): w is string => !!w);
const NOT = new Set([...check.givenNames, ...check.body, ...check.places]);

describe("the names lists (C-226)", () => {
  for (const [which, list] of [["first", lists.first], ["second", lists.second]] as const) {
    it(`${which}: words of 3 to 8 capital letters, none twice`, () => {
      for (const w of words(list)) expect(w, w).toMatch(/^[A-Z]{3,8}$/);
      expect(new Set(words(list)).size).toBe(words(list).length);
    });
    it(`${which}: no given name, body part or place, and nothing in a word that should not be there`, () => {
      for (const w of words(list)) {
        expect(NOT.has(w), `${w} is on names_check.json`).toBe(false);
        for (const c of check.contains) expect(w.includes(c), `${w} contains ${c}`).toBe(false);
      }
    });
  }
  it("no pair says anything across the join, and every name fits a watch's line (17 letters)", () => {
    for (const a of words(lists.first)) for (const b of words(lists.second)) {
      const joined = a + b;
      for (const c of check.contains) expect(joined.includes(c), `${a} ${b} contains ${c}`).toBe(false);
      expect(`${a} ${b}`.length).toBeLessThanOrEqual(17);
    }
  });
  it("is enough names to go round: at least 32 words a list", () => {
    expect(words(lists.first).length).toBeGreaterThanOrEqual(32);
    expect(words(lists.second).length).toBeGreaterThanOrEqual(32);
  });
});
