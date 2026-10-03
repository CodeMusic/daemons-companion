import { describe, expect, it } from "vitest";
import { season } from "../src/seasons.js";

// The same boundaries DAEMONS tools/seasons.py was checked against (vision 9.21: CONTENT north, CONTEXT south).
const at = (m: number, d: number) => new Date(2026, m - 1, d);

describe("seasons by edition (C-14)", () => {
  it.each([
    [12, 20, "autumn", "spring"], [12, 21, "winter", "summer"], [3, 20, "winter", "summer"], [3, 21, "spring", "autumn"],
    [6, 20, "spring", "autumn"], [6, 21, "summer", "winter"], [9, 21, "summer", "winter"], [9, 22, "autumn", "spring"],
    [1, 1, "winter", "summer"], [7, 4, "summer", "winter"],
  ])("%i-%i is %s in CONTENT and %s in CONTEXT", (m, d, content, context) => {
    expect(season("CONTENT", at(m, d))).toBe(content);
    expect(season("CONTEXT", at(m, d))).toBe(context);
  });
});
