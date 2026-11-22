// C-479: a lesson as a board sings it -- each note as sung, whether right, its pitch's colour; and the groups carried back.
import { describe, expect, it } from "vitest";
import speciesJson from "../data/species.json" with { type: "json" };
import { expFor } from "../src/save/growth.js";
import { boardSong, lesson, noteColours, songOf } from "../src/ownsong.js";

const SPECIES = speciesJson as unknown as Record<string, any>;
const curve = SPECIES["1"].growth;                         // ROVERCUB
const [cub] = songOf(1);

describe("a TRAIN sung on a board (C-479)", () => {
  it("sings a part it knows whole, every note right, in its pitch's colour", () => {
    const s = boardSong(lesson(1, expFor(curve, 16), curve, 0, true))!;
    expect(s.notes).toHaveLength(cub.notes.length);
    s.notes.forEach(([midi, ms, right, rgb], i) => {
      expect(midi).toBe(cub.notes[i][0]); expect(right).toBe(1); expect(ms).toBeGreaterThan(0);
      expect(rgb).toBe(parseInt(noteColours(midi)[0].slice(1), 16));
    });
    expect(s.bits).toEqual([]);                            // nothing left to carry back
  });
  it("sings a part it hardly knows with wrong notes, and carries the error back", () => {
    const s = boardSong(lesson(1, expFor(curve, 1), curve, 0, true), () => 0.99)!;   // the furthest candidate each time
    expect(s.notes.some(([, , right]) => right === 0)).toBe(true);
    expect(s.counted).toBe(true); expect(s.gain).toBeGreaterThan(0);
    expect(s.bits.length).toBeGreaterThan(0);
    s.bits.forEach((b) => expect(b).toMatch(/^[01]{4} [01]{4}$/));
    expect(JSON.stringify(s).length).toBeLessThan(4000);    // small enough for a watch's line
  });
  it("sings past the day's three, and carries nothing back", () => {
    const s = boardSong(lesson(1, expFor(curve, 1), curve, 3, true))!;
    expect(s.counted).toBe(false); expect(s.gain).toBe(0); expect(s.bits).toEqual([]);
  });
});
