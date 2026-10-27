import { describe, expect, it } from "vitest";
import { bandOf, LINE_KINDS, writtenLine } from "../src/lines.js";

describe("written lines (C-180)", () => {
  it("every line fits the smallest board", () => {
    for (const k of LINE_KINDS) for (const m of [90, 60, 20]) for (let i = 0; i < 6; i++)
      expect(writtenLine(k, m, "2026-10-27", i).length).toBeLessThanOrEqual(36);
  });
  it("mood picks the band; the worst is quiet, never an alarm", () => {
    expect([bandOf(80), bandOf(60), bandOf(5)]).toEqual(["bright", "fine", "quiet"]);
  });
  it("the same care, day and mood gives the same line; the next care the next line", () => {
    const a = writtenLine("feed", 80, "2026-10-27", 1);
    expect(writtenLine("feed", 80, "2026-10-27", 1)).toBe(a);
    expect(writtenLine("feed", 80, "2026-10-27", 2)).not.toBe(a);
  });
});
