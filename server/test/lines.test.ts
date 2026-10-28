import { describe, expect, it } from "vitest";
import { bandOf, LINE_KINDS, saying, UNDER_LINES, writtenLine } from "../src/lines.js";

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

describe("words under words (C-204)", () => {
  it("each line the user chose is one the daemon really says, and its under-line fits the smallest board", () => {
    const all = new Set<string>();
    for (const k of LINE_KINDS) for (const m of [90, 60, 20]) for (let i = 0; i < 6; i++) all.add(writtenLine(k, m, "2026-10-27", i));
    expect(UNDER_LINES.length).toBe(4);
    for (const l of UNDER_LINES) { expect(all.has(l)).toBe(true); expect(saying(l, true).under!.length).toBeLessThanOrEqual(36); }
  });
  it("says it only once the book is held, and only under those four", () => {
    expect(saying("Again! Again!", true)).toEqual({ said: "Again! Again!", under: "Watch me." });
    expect(saying("Again! Again!", false)).toEqual({ said: "Again! Again!" });
    expect(saying("Good practice.", true)).toEqual({ said: "Good practice." });
  });
});
