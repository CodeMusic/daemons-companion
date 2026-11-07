// C-305 (DAEMONS T-528, vision 4.40): the aurora's nights -- the game's rule to the bit, so a phone and a cartridge agree.
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { AURORA_BANDS, AURORA_CONJUGATE, AURORA_LINE, auroraShows, auroraWeight, conjugateLight, dayNumber, fromOtherSide, isLightNight,
         lightNight, nightNumber, nightOfClock, nightOfPlay, skyBands } from "../src/aurora.js";
import { readSave } from "../src/save/reader.js";
import { buildSave } from "./build_save.js";

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
    const both = /sBandConjugate\[SKY_MAX\] = \{([^}]*)\}/.exec(c)![1].split(",").map((s) => Number(s.trim()));
    expect(both).toEqual(AURORA_CONJUGATE.bands);
    expect(Number(/#define CONJUGATE_RED_BANDS (\d+)/.exec(c)![1])).toBe(AURORA_CONJUGATE.redBands);
  });
});

describe("C-306: the conjugate light", () => {
  const mon = (metGame: number, egg = false) => ({ metGame, egg });
  it("sees the other edition's daemons and no one else's", () => {
    expect(fromOtherSide("CONTENT", [mon(5)])).toBe(true);                // LeafGreen's, in FireRed's game
    expect(fromOtherSide("CONTEXT", [mon(4)])).toBe(true);
    expect(fromOtherSide("CONTENT", [mon(4), mon(1), mon(2), mon(3), mon(15)])).toBe(false);   // its own, Ruby to Colosseum
    expect(fromOtherSide("CONTENT", [mon(5, true)])).toBe(false);         // not an egg
    expect(conjugateLight(false, "CONTENT", [mon(5)])).toBe(false);       // not before the mending
    expect(conjugateLight(true, "CONTENT", [mon(4), mon(5)])).toBe(true);
  });
  it("reads the met game and the egg from the save", () => {
    const save = buildSave({ player: "ROVER", trainerId: 1, slots: [1, 2].map((counter) => ({ counter, party: [
      { personality: 0x12345678, otId: 1, species: 1, nickname: "PIP", level: 12, metLevel: 5, metGame: 5 },
      { personality: 0x00000777, otId: 1, species: 7, nickname: "EGG", level: 5, metGame: 4, egg: true }] })) });
    const [a, b] = readSave(save).party;
    expect([a.metGame, a.metLevel, a.egg, b.metGame, b.egg]).toEqual([5, 5, false, 4, true]);
  });
  it("crowns the sky with the red and lays the green below, one line to a band", () => {
    const sky = skyBands("CONTEXT", true);
    expect(sky.map(([l]) => l)).toEqual([AURORA_LINE.CONTENT, ...Array(5).fill(AURORA_LINE.CONTEXT)]);
    expect(sky.map(([, w]) => w)).toEqual([255, 255, 176, 64, 16, 0]);
    expect(skyBands("CONTENT", false)).toEqual(AURORA_BANDS.CONTENT.map((w) => [AURORA_LINE.CONTENT, w]));
  });
});
