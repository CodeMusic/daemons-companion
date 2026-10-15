import { describe, expect, it } from "vitest";
import { drawnAs, EXPRESSIONS, expressionFor, eyePatch, faceOf, shade, shadePalette } from "../src/expressions.js";
import type { Feelings } from "../src/feelings.js";

const calmFeelings = (p: Partial<Feelings>): Feelings => ({ glad: 0, mad: 0, sad: 0, calm: 0, restless: 0, strongest: null, ...p });

describe("expressions on any sprite (C-119)", () => {
  it("leaves a colour as it was in the plain shade", () => {
    for (const c of [[0, 0, 0], [255, 255, 255], [200, 120, 40], [12, 200, 240], [148, 148, 148]])
      expect(shade(c, EXPRESSIONS.awake.shade)).toEqual(c);
  });

  it("dims and cools a daemon asleep, as on the mock-up sheet", () => {
    const [r, g, b] = shade([230, 150, 200], EXPRESSIONS.asleep.shade);
    expect(r + g + b).toBeLessThan(230 + 150 + 200);       // darker
    expect(b).toBeGreaterThan(r * 0.6);                    // and toward blue
  });

  it("shades the body and the second ramp only -- the clear colour and the streaks keep theirs", () => {
    const pal = Array.from({ length: 16 }, (_, i) => [i * 15, 100, 200 - i * 10]);
    expect(shadePalette(pal, EXPRESSIONS.glad)).toHaveLength(10);
  });

  it("shows sleep before any feeling, then the feeling furthest past its threshold", () => {
    expect(expressionFor({ tired: "asleep" }, calmFeelings({ glad: 90 })).name).toBe("asleep");
    expect(expressionFor({ tired: "drowsy" }, calmFeelings({ mad: 90 })).name).toBe("drowsy");
    expect(expressionFor({ tired: "awake" }, calmFeelings({ glad: 20 })).name).toBe("awake");      // under its threshold
    expect(expressionFor({ tired: "awake" }, calmFeelings({ glad: 30, sad: 60 })).name).toBe("sad");
    expect(expressionFor({ tired: "awake" }, calmFeelings({ calm: -40 })).name).toBe("afraid");    // the signed axis, its far side
    expect(expressionFor({ tired: "awake" }, calmFeelings({ calm: 80 })).name).toBe("awake");      // calm is just being itself
    expect(expressionFor({ tired: "awake" }, null).name).toBe("awake");
  });

  it("gives every expression a whole description a host can draw without rules of its own", () => {
    for (const e of Object.values(EXPRESSIONS)) {
      expect(e.shade.tint).toHaveLength(3);
      if (e.mark) { expect(e.mark.rows).toHaveLength(8); for (const r of e.mark.rows) expect(r).toMatch(/^[.#o]{8}$/); }
    }
  });

  it("closes the eyes it knows, and paints nothing for a daemon whose eyes no one has checked", () => {
    const care = faceOf("caremusai")!;
    const closed = expressionFor({ tired: "asleep" }, null, care).patch;
    expect(closed.length).toBe(4);                                    // two eyes: each filled, then a line across
    expect(closed[1]).toMatchObject({ h: 1, w: 4 });                  // the line
    expect(expressionFor({ tired: "asleep" }, null, null).patch).toEqual([]);
    expect(expressionFor({ tired: "awake" }, null, care).patch).toEqual([]);   // awake: its own eyes
  });

  it("closes a one-pixel eye visibly -- the line is at least two pixels wide", () => {
    const line = eyePatch(faceOf("archiver")!, EXPRESSIONS.asleep).filter((p) => p.h === 1 && p.w >= 2);
    expect(line).toHaveLength(2);
  });

  it("lids half the eye when sleepy or sad, and draws an upturned arc when glad", () => {
    const f = faceOf("caremusai")!;
    expect(eyePatch(f, EXPRESSIONS.drowsy).every((p) => p.h === 2)).toBe(true);   // the top half of a 5-high eye
    const glad = eyePatch(f, EXPRESSIONS.glad);
    const arc = glad.filter((p) => p.h === 1);
    expect(Math.min(...arc.map((p) => p.y))).toBeLessThan(Math.max(...arc.map((p) => p.y)));   // the middle above the ends
  });

  it("draws any expression by name for a bench check, as a host would receive it, and nothing for a name it lacks", () => {
    const care = faceOf("caremusai")!;
    expect(drawnAs("asleep", care)).toEqual(expressionFor({ tired: "asleep" }, null, care));
    expect(drawnAs("glad", null)?.patch).toEqual([]);
    expect(drawnAs("sulking", care)).toBeNull();
  });
});
