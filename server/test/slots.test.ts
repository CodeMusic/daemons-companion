// C-155: THE CASINO's rules, kept once for every player -- and held to the handhelds' own copy in C++.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { BETS, PAYS, RETURN, STRIP, WEIGHTS, draw, outcomeOf, piecesFor, resultDetail, stopAt, strip, tableAct } from "../src/slots.js";
import { parseResult } from "../src/casino.js";

// a repeatable dice, so a failure can be run again
function dice(seed: number) {                                // mulberry32: small, and even enough for a tally
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("SLOTS (C-155)", () => {
  it("pays 94.4 back of every 100, from a table of a thousand", () => {
    expect(WEIGHTS.reduce((a, b) => a + b, 0)).toBe(1000);
    expect(RETURN).toBeCloseTo(0.944, 6);
  });

  it("is the table the boards play by: the handhelds and the Tab5 both include firmware/common/slots.h (C-157)", () => {
    const read = (p: string) => readFileSync(new URL("../../firmware/" + p, import.meta.url), "utf8");
    const h = read("common/slots.h");
    const nums = (name: string) => (new RegExp(`${name}\\[\\]\\s*=\\s*\\{([^}]*)\\}`).exec(h)?.[1] ?? "").split(",").map((n) => Number(n.trim()));
    expect(nums("WEIGHTS")).toEqual(WEIGHTS);
    expect(nums("PAYS")).toEqual(PAYS);
    expect(nums("BETS")).toEqual(BETS);
    for (const user of ["esp32/src/casino.cpp", "tab5/src/ui.cpp"]) {
      const c = read(user);
      expect(c).toContain('#include "../../common/slots.h"');
      expect(c).not.toMatch(/WEIGHTS?\[[^\]]*\]\s*=\s*\{/);         // no table of its own beside it
    }
  });

  it("draws three pieces that make exactly the result decided", () => {
    const r = dice(7);
    for (let o = 0; o < WEIGHTS.length; o++)
      for (let i = 0; i < 300; i++) expect(outcomeOf(...piecesFor(o, r))).toBe(o);
  });

  it("draws results near the table over many pulls", () => {
    const r = dice(42), n = 200000, seen = new Array(WEIGHTS.length).fill(0);
    for (let i = 0; i < n; i++) seen[draw(r)]++;
    seen.forEach((k, o) => expect(Math.abs(k / n - WEIGHTS[o] / 1000)).toBeLessThan(0.004));
  });

  it("puts every piece twice round a reel, and stops a reel on its piece, never backwards", () => {
    const s = strip(dice(3));
    expect(s.length).toBe(STRIP);
    for (let p = 0; p < 6; p++) expect(s.filter((x) => x === p).length).toBe(2);
    for (let p = 0; p < 6; p++) {
      const at = stopAt(s, 4.2, p as 0);
      expect(s[at % STRIP]).toBe(p);
      expect(at).toBeGreaterThanOrEqual(5);
      expect(at - 4.2).toBeLessThanOrEqual(STRIP);
    }
  });

  it("calls a big win to the table, and writes a result the companion reads", () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(tableAct)).toEqual([null, null, null, null, null, "BIGWIN", "JACKPOT"]);
    const d = resultDetail(-120, "a1b2", 3, "phone-pixel", 7);
    expect(parseResult(9, d)).toEqual({ id: 9, delta: -120, boot: "a1b2", seq: 3, device: "phone-pixel", spins: 7 });
  });
});
