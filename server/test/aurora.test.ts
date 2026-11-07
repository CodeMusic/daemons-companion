// C-305 (DAEMONS T-528, vision 4.40): the aurora's nights -- the game's rule to the bit, so a phone and a cartridge agree.
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { AURORA_BANDS, AURORA_LINE, auroraShows, auroraWeight, dayNumber, isLightNight, lightNight, nightNumber, nightOfClock,
         nightOfPlay } from "../src/aurora.js";

const at = (y: number, m: number, d: number, h: number, min = 0) => new Date(y, m - 1, d, h, min);

describe("C-305: the light's nights", () => {
  it("counts days from 2000-01-01 as the cartridge does", () => {
    expect(dayNumber(2000, 1, 1)).toBe(0);
    expect(dayNumber(2000, 3, 1)).toBe(60);                 // 2000 was a leap year
    expect(dayNumber(2026, 11, 7)).toBe(Math.round((Date.UTC(2026, 10, 7) - Date.UTC(2000, 0, 1)) / 86400000));
  });
  it("gives a night before noon to the evening before, and wraps as a u16", () => {
    expect(nightOfClock(at(2026, 11, 4, 3))).toBe(nightOfClock(at(2026, 11, 3, 22)));
    expect(nightOfClock(at(2026, 11, 4, 11, 59))).toBe(nightOfClock(at(2026, 11, 3, 20)));
    expect(nightOfClock(at(2026, 11, 4, 12))).toBe(nightOfClock(at(2026, 11, 3, 22)) + 1);
    expect(nightNumber(0, 0)).toBe(0xFFFF);
  });
  it("lights this November's nights, as the game lane filmed and listed them (T-528)", () => {
    const lit = Array.from({ length: 30 }, (_, i) => i + 1).filter((d) => lightNight(at(2026, 11, d, 22)));
    expect(lit).toEqual([3, 5, 9, 10, 14, 15, 16, 17, 23, 25, 27, 28]);
  });
  it("lights about one night in three, 2020-2049", () => {
    let n = 0, lit = 0;
    for (let d = dayNumber(2020, 1, 1); d < dayNumber(2050, 1, 1); d++, n++) if (isLightNight(d)) lit++;
    expect(lit / n).toBeGreaterThan(0.33);
    expect(lit / n).toBeLessThan(0.34);
  });
  it("reads play time as the game does without a clock: an hour a day, a minute 24 of its minutes", () => {
    expect(nightOfPlay(10, 29, 59)).toBe(9);                 // 29*24 + 23 = 719, before noon
    expect(nightOfPlay(10, 30, 0)).toBe(10);
    expect(nightOfPlay(0, 0, 0)).toBe(0xFFFF);
  });
  it("shows in the den only with the book mended, at night, on a night of light", () => {
    expect(auroraShows(true, at(2026, 11, 3, 22))).toBe(true);
    expect(auroraShows(true, at(2026, 11, 4, 4, 59))).toBe(true);   // still the 3rd's night
    expect(auroraShows(true, at(2026, 11, 4, 5))).toBe(false);      // dawn
    expect(auroraShows(true, at(2026, 11, 3, 19, 59))).toBe(false); // dusk
    expect(auroraShows(false, at(2026, 11, 3, 22))).toBe(false);
    expect(auroraShows(true, at(2026, 11, 4, 22))).toBe(false);     // a dark night
  });
  it("breathes as the grove skies do: 72 to 168 of 256 in a full band", () => {
    expect(auroraWeight(255, 0)).toBe(72);
    expect(auroraWeight(255, 1)).toBe(168);
    expect(auroraWeight(0, 1)).toBe(0);
  });
  // where the engine is beside it (DAEMONS' own checkout), the numbers are the engine's
  const src = "../../pokefirered-daemons/src/daemons_aurora.c";
  it.runIf(existsSync(src))("keeps the engine's bands and lines", () => {
    const c = readFileSync(src, "utf8");
    const bands = [...c.matchAll(/sBand\[SKY_MAX\] = \{([^}]*)\}/g)].map((m) => m[1].split(",").map((s) => Number(s.trim())));
    expect(bands).toEqual([AURORA_BANDS.CONTENT, AURORA_BANDS.CONTEXT]);
    const five = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) >> 3);
    expect(five(AURORA_LINE.CONTENT)).toEqual([30, 7, 9]);
    expect(five(AURORA_LINE.CONTEXT)).toEqual([10, 30, 15]);
    expect(c).toMatch(/72 \+ breath \* 96 \/ 255/);
  });
});
