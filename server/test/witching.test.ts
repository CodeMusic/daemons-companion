// C-236: the witching hour -- 3 to 4 in the morning; a routine named for the daemon's first type, one set with the game's.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { AS_ABOVE, breathOf, HOUR_LINES, hourDate, hourGone, hourLine, minutesLeft, PULSE, pulseOf, WITCHING_NAMES, WITCHING_TUNE,
         witchingLine, witchingNow, witchingRoutine } from "../src/witching.js";
import speciesJson from "../data/species.json" with { type: "json" };

const at = (h: number, m = 0) => new Date(2026, 9, 29, h, m);

describe("C-236: the witching hour", () => {
  it("is 3:00 to 4:00 in the morning, by the device's clock", () => {
    expect([at(2, 59), at(3, 0), at(3, 59), at(4, 0), at(15, 30)].map((d) => witchingNow(d))).toEqual([false, true, true, false, false]);
  });
  it("names a routine for every type the daemons have, each a move's width", () => {
    const types = new Set(Object.values(speciesJson as unknown as Record<string, { types: string[] }>).flatMap((s) => s.types));
    for (const t of types) expect(WITCHING_NAMES[t], t).toBeTruthy();
    for (const n of Object.values(WITCHING_NAMES)) expect(n.length).toBeLessThanOrEqual(12);
    expect(new Set(Object.values(WITCHING_NAMES)).size).toBe(Object.keys(WITCHING_NAMES).length);
  });
  it("never borrows a daemon's name (UNDERTOW is a species; FLOW's is UNDERCURRENT)", () => {
    const names = new Set(Object.values(speciesJson as unknown as Record<string, { name: string }>).map((s) => s.name.toUpperCase()));
    for (const n of Object.values(WITCHING_NAMES)) expect(names.has(n), n).toBe(false);
  });
  it("takes the first type, however it is written", () => {
    expect(witchingRoutine("FLOW / CONTEXT")).toBe("UNDERCURRENT");
    expect(witchingRoutine(["LOGIC", "CONTENT"])).toBe("LAST PROOF");
    expect(witchingRoutine("")).toBe("THIN SEAM");
    expect(witchingLine("SPARKY", "UNDERCURRENT")).toBe("SPARKY did UNDERCURRENT. It does not, by day.");
    expect(WITCHING_TUNE.some(([s]) => s === 127)).toBe(true);
  });
});

describe("C-237: the hour's face", () => {
  it("breathes red to blue through the book's purple, on the clock's phase", () => {
    expect([pulseOf(0), pulseOf(0.5), pulseOf(1)]).toEqual([PULSE.red, PULSE.purple, PULSE.blue]);
    expect(breathOf(new Date(2026, 9, 29, 3, 0, 0, 0))).toBeCloseTo(0);           // a whole number of breaths since midnight
    expect(breathOf(new Date(2026, 9, 29, 3, 0, 4, 0))).toBeCloseTo(1);           // half a breath on: blue
    expect(pulseOf(0.5, 0.3)).toBe("#351A2F");                                    // the backgrounds, faint
  });
  it("counts the hour down: the pie gone widdershins, the minutes left, the date", () => {
    expect([at(3, 0), at(3, 30), at(3, 59)].map((d) => hourGone(d))).toEqual([0, 0.5, 59 / 60]);
    expect([at(3, 0), at(3, 30), at(3, 59)].map((d) => minutesLeft(d))).toEqual([60, 30, 1]);
    expect(hourDate(at(3, 10))).toBe("THU 29 OCT");
  });
  it("turns the day's line under, in the folk craft's words, a face line's width", () => {
    expect(hourLine(at(3))).toBe("Hex under Uncrossing");                          // a Thursday: forgiveness over wrath
    expect(hourLine(new Date(2026, 10, 1, 3))).toBe("Thrall under Circle");        // a Sunday
    for (const h of HOUR_LINES) expect(`${h.shadow} under ${h.virtue}`.length).toBeLessThanOrEqual(24);
    expect(AS_ABOVE[0]).toBe("AS ABOVE, SO BELOW.");
    expect(AS_ABOVE.at(-1)).toBe("AS BELOW, SO ABOVE.");
  });
  it("says THE HERMETIC LAYER's own first saying, and the watches say the same lines", () => {
    expect(AS_ABOVE.length).toBeGreaterThan(3);                                    // the book's inscriptions between the maxims
    const cpp = readFileSync(new URL("../../firmware/esp32/src/intuition.cpp", import.meta.url), "utf8");
    const table = cpp.slice(cpp.indexOf("AS_ABOVE[] = {"), cpp.indexOf("};", cpp.indexOf("AS_ABOVE[] = {")));
    expect([...table.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => JSON.parse(`"${m[1]}"`))).toEqual(AS_ABOVE);
  });
});

// DAEMONS T-519 (the user, 2026-11-02): the witching hour's strength as the game's glitch has it, THE CREATOR'S HOUR at
// 4:24-5:12 (Brahma muhurta at a 6:00 sunrise), and the catch-up for play that starts inside an hour
describe("T-519: the two hours, and the catch-up", async () => {
  const W = await import("../src/witching.js");
  const t = (h: number, m: number, s = 0) => new Date(2026, 10, 4, h, m, s);
  it("follows the game's glitch curve in the witching hour: a quarter at 3:00, all at 3:30, 0.28 at 3:59", () => {
    expect([W.witchingStrength(t(2, 59)), W.witchingStrength(t(3, 0)), W.witchingStrength(t(3, 15)), W.witchingStrength(t(3, 30)),
            W.witchingStrength(t(3, 59)), W.witchingStrength(t(4, 0))]).toEqual([0, 0.25, 0.63, 1, 0.28, 0]);
  });
  it("keeps THE CREATOR'S HOUR 4:24 to 5:12: rising seven minutes, holding, resolving seven", () => {
    expect([W.creatorNow(t(4, 23, 59)), W.creatorNow(t(4, 24)), W.creatorNow(t(5, 11, 59)), W.creatorNow(t(5, 12))]).toEqual([false, true, true, false]);
    expect(W.creatorLevel(t(4, 24))).toBe(0);
    expect(W.creatorLevel(t(4, 27, 30))).toBeCloseTo(0.5, 5);
    expect([W.creatorLevel(t(4, 31)), W.creatorLevel(t(4, 48)), W.creatorLevel(t(5, 5))]).toEqual([1, 1, 1]);
    expect(W.creatorLevel(t(5, 8, 30))).toBeCloseTo(0.5, 5);
    expect(W.creatorLevel(t(3, 30))).toBe(0);
  });
  it("sounds its tone in the middle seven minutes only, 4:44:30 to 4:51:30, fading over half a minute", () => {
    expect([W.creatorTone(t(4, 44, 29)), W.creatorTone(t(4, 44, 45)) > 0, W.creatorTone(t(4, 45)), W.creatorTone(t(4, 48)),
            W.creatorTone(t(4, 51)), W.creatorTone(t(4, 51, 30))]).toEqual([0, true, 1, 1, 1, 0]);
  });
  it("shows nothing for a minute after arriving inside an hour, then eases over two up to the clock's level", () => {
    const start = t(4, 24).getTime(), came = t(4, 40).getTime();
    expect(W.caughtUp(t(4, 0).getTime(), came, start)).toBe(1);                      // arrived before it began: the clock's
    expect(W.caughtUp(came, came + 59_000, start)).toBe(0);                          // the first minute: nothing
    expect(W.caughtUp(came, came + 120_000, start)).toBeCloseTo(0.5, 5);             // halfway up
    expect(W.caughtUp(came, came + 180_000, start)).toBe(1);                         // caught up
    expect(W.creatorLevelNow(came, new Date(came + 30_000))).toBe(0);
    expect(W.creatorLevelNow(came, new Date(came + 200_000))).toBe(1);
    expect(W.witchingLevel(t(3, 20).getTime(), t(3, 20, 30))).toBe(0);              // the witching hour waits too
    expect(W.witchingLevel(t(2, 50).getTime(), t(3, 30))).toBe(1);
  });
  it("breathes its gold once in sixteen seconds on the clock, so every device breathes together", () => {
    expect(W.goldBreathOf(t(4, 30, 0))).toBeCloseTo(1, 6);                         // 16200 s since midnight: 1012.5 breaths, a top
    expect(W.goldBreathOf(t(4, 30, 8))).toBeCloseTo(0, 6);                         // half a breath on: 1013, a bottom
    expect(W.goldBreathOf(t(4, 30, 4))).toBeCloseTo(0.5, 6);
  });
});
