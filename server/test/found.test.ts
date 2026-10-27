import { describe, expect, it } from "vitest";
import { heldKeys, newlyFound } from "../src/save/found.js";

const nb = (...pages: [string, string][]) => ({ sections: [...new Set(pages.map(([s]) => s))].map((name) => ({ name, pages: pages.filter(([s]) => s === name).map(([, title]) => ({ title })) })) });
const ix = (...e: [number, boolean][]) => ({ entries: e.map(([national, bound]) => ({ national, bound })) });

describe("what the game just gave (C-189)", () => {
  it("nothing is new when the save holds what it held", () => {
    const a = heldKeys(nb(["FIELD", "A"]), ix([1, false]));
    expect(newlyFound(a, heldKeys(nb(["FIELD", "A"]), ix([1, false])))).toEqual([]);
  });
  it("a page filed and a daemon met are new, the page first", () => {
    const a = heldKeys(nb(["FIELD", "A"]), ix([1, false]));
    const got = newlyFound(a, heldKeys(nb(["FIELD", "A"], ["LETTERS", "B"]), ix([1, false], [4, false])));
    expect(got.map((f) => f.key)).toEqual(["page:LETTERS/B", "card:4:seen"]);
  });
  it("a daemon met before and bound now is new again", () => {
    const got = newlyFound(heldKeys(null, ix([7, false])), heldKeys(null, ix([7, true])));
    expect(got.map((f) => f.key)).toEqual(["card:7:bound"]);
  });
  it("the same title in two sections is two pages", () => {
    const got = newlyFound(heldKeys(nb(["FIELD", "X"]), null), heldKeys(nb(["FIELD", "X"], ["SONGBOOK", "X"]), null));
    expect(got.map((f) => f.key)).toEqual(["page:SONGBOOK/X"]);
  });
});
