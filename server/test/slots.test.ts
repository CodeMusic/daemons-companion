// C-155: THE CASINO's rules, kept once for every player -- and held to the handhelds' own copy in C++.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
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
      // the Tab5's ui.cpp is in parts (C-157: ui/*.inl, included in order), the CASINO among them: every part is read
      const parts = user.startsWith("tab5/") ? readdirSync(new URL("../../firmware/tab5/src/ui/", import.meta.url)).map((f) => read(`tab5/src/ui/${f}`)) : [];
      const c = [read(user), ...parts].join("\n");
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

describe("THE CASINO in context: luck and the cat and the string (C-158)", () => {
  it("returns 90 to 100 back as the luck goes from -1 to +1, scaling the wins alike", async () => {
    const { RETURN_AT, weightsFor } = await import("../src/slots.js");
    expect([RETURN_AT(-5), RETURN_AT(-1), RETURN_AT(0), RETURN_AT(1), RETURN_AT(9)]).toEqual([0.9, 0.9, 0.95, 1, 1]);
    for (const r of [0.86, 0.9, 0.95, 1, 1.04]) {
      const w = weightsFor(r);
      expect(w.reduce((a, b) => a + b, 0)).toBe(10000);
      expect(w.reduce((n, x, o) => n + x * PAYS[o], 0) / 10000).toBeCloseTo(r, 2);
    }
  });

  it("brings the string nearer through a dry spell and away after a win, and keeps the day's return over many pulls", async () => {
    const { CAT, learn, pullReturn, weightsFor, drawFrom, RETURN_AT } = await import("../src/slots.js");
    let cat = { ...CAT };
    for (let i = 0; i < 10; i++) cat = learn(cat, 0, () => 0.5);   // no noise
    expect(cat.reach).toBeGreaterThan(0.3); expect(cat.dry).toBe(10);
    const near = cat.reach; cat = learn(cat, 6, () => 0.5);
    expect(cat.reach).toBeLessThan(near - 0.2); expect(cat.dry).toBe(0); expect(cat.streak).toBe(1);
    // a long run: the money that comes back is the day's return, the string's shaping washing out
    const r = dice(11); let bet = 0, back = 0; cat = { ...CAT };
    for (let i = 0; i < 300000; i++) {
      const o = drawFrom(weightsFor(pullReturn(0, cat)), r);
      bet += 1; back += PAYS[o]; cat = learn(cat, o, r);
    }
    expect(Math.abs(back / bet - RETURN_AT(0))).toBeLessThan(0.012);
  });

  it("makes a near miss that does not pay, and stops the third reel with the wanted piece beside the line", async () => {
    const { nearPieces, stopNear, strip, STRIP: N } = await import("../src/slots.js");
    const r = dice(5);
    for (let i = 0; i < 200; i++) {
      const { pieces, wanted } = nearPieces(r);
      expect(outcomeOf(...pieces)).toBe(0);
      const s = strip(r), at = stopNear(s, 3.1, pieces[2], wanted);
      expect(s[at % N]).toBe(pieces[2]);
    }
  });
});
