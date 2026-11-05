// C-297 (DAEMONS T-519): THE EUDAIMON LAYER, the third book's dawn half -- held only with the game's flag or as a preview,
// no book or hour required; its observer's line as the lead daemon's SPIRITS would read it.
import { describe, expect, it } from "vitest";
import { observedSections, readEudaimon } from "../src/eudaimon.js";
import eudaimon from "../data/eudaimon.json" with { type: "json" };

const observer = (lead?: "good" | "as it is" | "low") =>
  observedSections(lead).flatMap((s) => s.entries).flatMap((e) => e.paragraphs).filter((p) => p.voice === "observer").map((p) => p.text);
const raw = (eudaimon as any).sections.flatMap((s: any) => s.entries).flatMap((e: any) => e.paragraphs).find((p: any) => p.voice === "observer");

describe("C-297: THE EUDAIMON LAYER", () => {
  it("is not held without the game's flag, and is held as a preview, with its ten sections", () => {
    expect(readEudaimon(null)).toEqual({ held: false });
    const b = readEudaimon(null, true);
    expect(b.held).toBe(true);
    expect(b.how).toBe("preview");
    expect(b.sections).toHaveLength(10);
  });
  it("reads its observer's line as the lead daemon's spirits choose it, and keeps no readings in what it sends", () => {
    expect(observer("good")).toEqual([raw.readings.good]);
    expect(observer("as it is")).toEqual([raw.readings.as_is]);
    expect(observer("low")).toEqual([raw.readings.low]);
    expect(observer()).toEqual([raw.readings.as_is]);
    expect(JSON.stringify(readEudaimon(null, true, "low"))).not.toContain("readings");
  });
});
