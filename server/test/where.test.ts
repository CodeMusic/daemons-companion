import { describe, expect, it } from "vitest";
import { askFind, checkFix, findAsked, fixesOf, keepFix } from "../src/where.js";
import { Store } from "../src/db.js";

describe("C-174: where a watch has been, and FIND", () => {
  it("checks a fix as the watch tells it", () => {
    expect(checkFix("51.5007 -0.1246 8")).toEqual({ lat: 51.5007, lon: -0.1246, metres: 8 });
    expect(checkFix("0 0 5")).toBe("a fix is <lat> <lon> <metres>");
    expect(checkFix("91 10 5")).toBe("a fix is <lat> <lon> <metres>");
    expect(checkFix("nonsense")).toBe("a fix is <lat> <lon> <metres>");
  });
  it("keeps fixes newest first, by device", () => {
    const store = new Store(":memory:");
    keepFix(store, { lat: 1, lon: 2, metres: 3 }, "t-watch-ultra-a1");
    keepFix(store, { lat: 4, lon: 5, metres: 6 }, "t-watch-s3-b2");
    expect(fixesOf(store).map((f) => f.lat)).toEqual([4, 1]);
    expect(fixesOf(store, "t-watch-ultra-a1")).toHaveLength(1);
  });
  it("asks one device to sound for ten minutes, and a fix answers it", () => {
    const store = new Store(":memory:"), now = new Date("2026-10-29T08:00:00Z");
    askFind(store, "t-watch-ultra-a1", now);
    expect(findAsked(store, "t-watch-ultra-a1", now)).toBe(now.toISOString());
    expect(findAsked(store, "t-watch-s3-b2", now)).toBeNull();
    expect(findAsked(store, "t-watch-ultra-a1", new Date(now.getTime() + 11 * 60000))).toBeNull();
    keepFix(store, { lat: 1, lon: 2, metres: 3 }, "t-watch-ultra-a1");
    expect(findAsked(store, "t-watch-ultra-a1", now)).toBeNull();
  });
});
