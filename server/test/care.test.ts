import { describe, expect, it } from "vitest";
import { care, careworn, carePatch, girthOf, withCare } from "../src/care.js";
import { EXPRESSIONS, type Face } from "../src/expressions.js";
import type { Interaction } from "../src/life.js";

const at = (d: number, h: number, kind: string): Interaction => ({ at: new Date(2026, 9, d, h, 0).toISOString(), kind });
const noon = (d: number) => new Date(2026, 9, d, 12, 30);
// a whole day of it: three meals and three drinks, put to bed at nine; `train` too, or not
const day = (d: number, train: boolean, bed = true): Interaction[] => [
  at(d, 8, "feed"), at(d, 8, "water"), at(d, 12, "feed"), at(d, 12, "water"), at(d, 18, "feed"), at(d, 18, "water"),
  ...(train ? [at(d, 15, "train")] : []), ...(bed ? [at(d, 21, "sleep")] : [])];
const days = (from: number, to: number, train: boolean, bed = true) => Array.from({ length: to - from + 1 }, (_, i) => day(from + i, train, bed)).flat();
const FACE: Face = { eyes: [[20, 20, 3, 3], [40, 20, 1, 1]], fill: 1, line: 5, fillRgb: [220, 220, 230], lineRgb: [16, 16, 16] };

describe("the care group (C-266)", () => {
  it("is all well for a daemon just come out, and for one cared for every day", () => {
    expect(care([], noon(10))).toMatchObject({ rest: 100, hunger: 0, thirst: 0, weight: 0, companionship: 100 });
    const kept = care([...days(1, 9, true), at(10, 8, "feed"), at(10, 8, "water")], noon(10));
    expect(kept).toMatchObject({ rest: 100, hunger: 0, thirst: 0, weight: 0, companionship: 100, worn: { shadows: false, bloodshot: false } });
  });

  it("shadows its eyes after a night not put to bed, and bloodshots them after three", () => {
    const one = care([...days(1, 8, true), ...day(9, true, false), at(10, 8, "feed"), at(10, 8, "water")], noon(10));
    expect(one.worn).toEqual({ shadows: true, bloodshot: false });
    const three = care([...days(1, 6, true), ...days(7, 9, true, false), at(10, 8, "feed"), at(10, 8, "water")], noon(10));
    expect(three.rest).toBeLessThan(40);
    expect(three.worn).toEqual({ shadows: true, bloodshot: true });
    const tucked = care([...days(1, 6, true), ...days(7, 9, true, false), ...day(10, true), at(11, 8, "feed"), at(11, 8, "water")], noon(11));
    expect(tucked.rest).toBeGreaterThan(three.rest);              // one good night already helps
  });

  it("grows heavier for days fed and never trained -- and only so far", () => {
    const lazy = care(days(1, 14, false), noon(15));
    expect(lazy.weight).toBeGreaterThan(30);
    const month = care(days(1, 40, false), new Date(2026, 10, 10, 12));
    expect(month.weight).toBeLessThanOrEqual(60);                 // it settles back each day: bounded by its own sum
    expect(girthOf(month.weight)).toBeLessThan(1.12);
    const fit = care(days(1, 14, true), noon(15));
    expect(fit.weight).toBe(0);
  });

  it("grows thinner, sadder and further from you when not fed", () => {
    const hungry = care([...days(1, 7, true), at(8, 8, "water"), at(8, 12, "water"), at(8, 18, "water"), at(8, 21, "sleep"),
                         at(9, 8, "water"), at(9, 12, "water"), at(9, 18, "water"), at(9, 21, "sleep")], noon(10));
    expect(hungry.weight).toBeLessThan(0);
    expect(hungry.hunger).toBeGreaterThanOrEqual(45);            // two days and a breakfast
    expect(hungry.thirst).toBeLessThan(hungry.hunger);
    expect(hungry.companionship).toBeLessThan(90);
    const f = withCare({ glad: 0, mad: 0, sad: 0, calm: 0, restless: 0, strongest: null }, hungry);
    expect(f.sad).toBeGreaterThanOrEqual(25);                     // past SAD's threshold: it shows (expressions.ts)
    expect(f.strongest?.kind).toBe("hungry");
  });

  it("thirst saddens it and costs companionship, but leaves its shape alone", () => {
    const dry = care([...days(1, 7, true), at(8, 8, "feed"), at(8, 12, "feed"), at(8, 18, "feed"), at(8, 15, "train"), at(8, 21, "sleep"),
                      at(9, 8, "feed"), at(9, 12, "feed"), at(9, 18, "feed"), at(9, 15, "train"), at(9, 21, "sleep")], noon(10));
    expect(dry.thirst).toBeGreaterThan(40);
    expect(dry.weight).toBe(0);
    expect(dry.companionship).toBeLessThan(100);
  });

  it("is drawn by every host from the expression: its girth and the patches under and beside its eyes", () => {
    const worn = careworn({ ...EXPRESSIONS.awake, patch: [] }, { rest: 30, hunger: 0, thirst: 0, weight: 50, companionship: 80, before: 0,
                                                                 worn: { shadows: true, bloodshot: true } }, FACE);
    expect(worn.pose.girth).toBe(1.09);
    expect(worn.patch.some((p) => p.y === 23 && p.w === 5)).toBe(true);    // the shadow, under the 3x3 eye and a pixel wider each side
    expect(worn.patch.some((p) => p.x === 19 && p.y === 21)).toBe(true);   // red beside it
    const closed = carePatch(FACE, { shadows: true, bloodshot: true }, EXPRESSIONS.asleep.shade, true);
    expect(closed.every((p) => p.h === 1 && (p.y === 23 || p.y === 21))).toBe(true);
    expect(closed.length).toBe(2);                                // asleep: only the shadows, no bloodshot
  });
});
