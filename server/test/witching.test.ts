// C-236: the witching hour -- 3 to 4 in the morning; a routine named for the daemon's first type, one set with the game's.
import { describe, expect, it } from "vitest";
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
});
