// C-296: the four running totals the companion keeps on its side (KEPT, BOND, WORK, PORTION), the line the brief reads,
// and the tone a daemon's pictures take from the class the save holds -- lighter in good spirits, darker in low, the hue kept.
import { describe, expect, it } from "vitest";
import { shade } from "../src/expressions.js";
import type { Spirits } from "../src/save/reader.js";
import { selfOf } from "../src/self.js";
import { spiritsPortal, spiritsSaid, spiritTotals, toneOf, toneShade } from "../src/spirits.js";

const now = new Date("2026-11-11T15:00:00");
const ago = (days: number, hour = 12) => { const d = new Date(now); d.setDate(d.getDate() - days); d.setHours(hour, 0, 0, 0); return d.toISOString(); };
const sp = (cls: Spirits["class"], rung: number): Spirits => ({ class: cls, lean: 0, rung, words: null });

describe("C-296: the four totals", () => {
  it("counts each kind of time together on its own axis", () => {
    const t = spiritTotals([
      { at: ago(1, 8), kind: "feed" }, { at: ago(1, 12), kind: "feed" }, { at: ago(1, 18), kind: "feed" }, { at: ago(1, 9), kind: "water" },
      { at: ago(1, 21), kind: "sleep" }, { at: ago(1, 10), kind: "walk" }, { at: ago(1, 11), kind: "met" }, { at: ago(1, 13), kind: "train" },
      { at: ago(1, 14), kind: "exp", detail: "123 40 battle 7" }, { at: ago(1, 15), kind: "exp", detail: "123 20 walk 2026-11-10" },
      { at: ago(1, 16), kind: "gift", detail: "HANDSHAKE 9" }, { at: ago(1, 17), kind: "site" },
    ], now);
    expect(t).toEqual({ kept: 5 - 2, bond: 2, work: 2, portion: 1 });   // today, nothing eaten at breakfast or lunch: two meals missed
  });
  it("leaves out what is older than four weeks", () => {
    expect(spiritTotals([{ at: ago(40), kind: "train" }, { at: ago(2), kind: "train" }], now).work).toBe(1);
  });
  it("counts a meal missed against KEPT, as the clock sees it", () => {
    const t = spiritTotals([{ at: ago(3, 7), kind: "water" }], now);   // a day with nothing eaten after it
    expect(t.kept).toBeLessThan(1);
  });
});

describe("C-296: the brief", () => {
  it("says the class and the four weeks, in words", () => {
    const line = spiritsSaid("good", { kept: 50, bond: 6, work: 0, portion: 0 });
    expect(line).toBe("You are in GOOD spirits. Over the last four weeks you have been kept well, sometimes together, seldom worked, and given nothing yet.");
    expect(selfOf({ nickname: "LABEL", spirits: line })).toContain(line);
    expect(selfOf({ nickname: "LABEL", spirits: line }, "short")).not.toContain("four weeks");
  });
  it("gives THE MIND the class, its tone and each total's word", () => {
    const p = spiritsPortal(sp("low", 1), { kept: -6, bond: 0, work: 21, portion: 3 });
    expect(p).toMatchObject({ class: "low", rung: 1, said: { kept: "kept badly", bond: "seldom together", work: "worked often", portion: "given a fair share" } });
    expect(p.tone).toBeLessThan(0);
  });
});

describe("C-296: the tone", () => {
  it("is none as it is, and grows towards the edge", () => {
    expect(toneOf(sp("as it is", 6))).toBe(0);
    expect(toneShade(0)).toBeNull();
    expect(toneOf(sp("good", 8))).toBeCloseTo(0.4);
    expect(toneOf(sp("good", 11))).toBeCloseTo(1);
    expect(toneOf(sp("low", 0))).toBeCloseTo(-1);
  });
  it("lightens in good spirits and darkens in low, keeping the hue", () => {
    const hue = ([r, g, b]: number[]) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
      return mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; };
    const red = [200, 60, 40], sum = (c: number[]) => c[0] + c[1] + c[2];
    const light = shade(red, toneShade(1)!), dark = shade(red, toneShade(-1)!);
    expect(sum(light)).toBeGreaterThan(sum(red));
    expect(sum(dark)).toBeLessThan(sum(red));
    expect(Math.abs(hue(light) - hue(red))).toBeLessThan(0.15);
    expect(Math.abs(hue(dark) - hue(red))).toBeLessThan(0.15);
  });
});

describe("C-296: the picture's key carries the tone", () => {
  it("is unchanged as it is, and moves when the tone does", async () => {
    const { artKeyOf } = await import("../src/core.js");
    expect(artKeyOf({ species: 4, moves: [1, 2] })).toBe("4-1.2");
    expect(artKeyOf({ species: 4, moves: [1, 2], spirits: sp("as it is", 6) })).toBe("4-1.2");
    expect(artKeyOf({ species: 4, moves: [1, 2], spirits: sp("good", 11) })).toBe("4-1.2~1.0");
    expect(artKeyOf({ species: 4, moves: [1, 2], spirits: sp("low", 3) })).toBe("4-1.2~-0.4");
  });
});
