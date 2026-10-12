import { describe, expect, it } from "vitest";
import { feelings, derived, HALF_LIFE_MS } from "../src/feelings.js";
import type { Interaction } from "../src/life.js";

const at = (d: number, h: number, m: number, kind: string): Interaction => ({ at: new Date(2026, 9, d, h, m).toISOString(), kind });
const when = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m);

describe("the daemon's feelings (C-120)", () => {
  it("is glad when it has just eaten, and half as glad three hours later", () => {
    const fed = [at(12, 12, 0, "feed")];
    const now = feelings(fed, when(12, 12, 1)).glad, later = feelings(fed, when(12, 15, 1)).glad;
    expect(now).toBeGreaterThan(11);
    expect(later / now).toBeCloseTo(0.5, 1);
    expect(HALF_LIFE_MS).toBe(3 * 3600000);
  });

  it("knows what it is answering: the event whose push is largest now -- near in time and strong in kind", () => {
    const f = feelings([at(12, 9, 0, "step"), at(12, 12, 0, "water")], when(12, 12, 5));
    expect(f.strongest?.kind).toBe("water");                 // the step was bigger, but three hours ago
    const g = feelings([at(12, 11, 50, "step"), at(12, 12, 0, "water")], when(12, 12, 5));
    expect(g.strongest?.kind).toBe("step");                  // ten minutes apart, the step is the stronger
  });

  it("is sad for a meal time passed with nothing eaten -- only once it has a history with you", () => {
    const f = feelings([at(12, 8, 0, "water")], when(12, 15, 0));      // lunch (11-14) went by
    expect(f.sad).toBeGreaterThan(0);
    expect(f.strongest?.kind).toBe("missed-meal");
    expect(derived([], when(12, 15, 0))).toEqual([]);                  // a daemon just come out misses nothing
  });

  it("is woken, a little cross and startled, when tended while it sleeps -- once, not for every care after", () => {
    const night = [at(12, 22, 0, "sleep"), at(13, 2, 0, "feed"), at(13, 2, 1, "water")];
    expect(derived(night, when(13, 3, 0)).filter((e) => e.kind === "woken")).toHaveLength(1);
    const f = feelings(night, when(13, 2, 5));
    expect(f.mad).toBeGreaterThan(0);
    expect(f.calm).toBeLessThan(f.glad);
    expect(derived([at(12, 22, 0, "sleep"), at(13, 8, 0, "feed")], when(13, 9, 0)).some((e) => e.kind === "woken")).toBe(false);   // morning: no
  });

  it("is uneasy left up alone at night, and calm when put to bed", () => {
    expect(feelings([at(12, 19, 0, "feed")], when(12, 23, 10)).calm).toBeLessThan(0);
    expect(feelings([at(12, 19, 0, "feed"), at(12, 21, 0, "sleep")], when(12, 23, 10)).calm).toBeGreaterThan(0);
  });

  it("grows restless in empty time, and settles the moment you do something together", () => {
    const fed = [at(12, 9, 0, "feed")];
    expect(feelings(fed, when(12, 10, 30)).restless).toBe(0);
    expect(feelings(fed, when(12, 14, 0)).restless).toBeGreaterThan(30);
    expect(feelings([...fed, at(12, 13, 55, "train")], when(12, 14, 0)).restless).toBe(0);
  });

  it("stays within its bounds, and never goes below nothing for the three that have no far side", () => {
    const lots = Array.from({ length: 30 }, (_, i) => at(12, 12, i, "feed"));
    const f = feelings(lots, when(12, 12, 30));
    expect(f.glad).toBe(100);
    for (const a of ["glad", "mad", "sad", "restless"] as const) expect(f[a]).toBeGreaterThanOrEqual(0);
    expect(f.calm).toBeGreaterThanOrEqual(-100);
  });
});
