// C-236: the witching hour -- 3 to 4 in the morning; a routine named for the daemon's first type, one set with the game's.
import { describe, expect, it } from "vitest";
import { WITCHING_NAMES, WITCHING_TUNE, witchingLine, witchingNow, witchingRoutine } from "../src/witching.js";
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
  it("takes the first type, however it is written", () => {
    expect(witchingRoutine("FLOW / CONTEXT")).toBe("UNDERTOW");
    expect(witchingRoutine(["LOGIC", "CONTENT"])).toBe("LAST PROOF");
    expect(witchingRoutine("")).toBe("THIN SEAM");
    expect(witchingLine("SPARKY", "UNDERTOW")).toBe("SPARKY did UNDERTOW. It does not, by day.");
    expect(WITCHING_TUNE.some(([s]) => s === 127)).toBe(true);
  });
});
