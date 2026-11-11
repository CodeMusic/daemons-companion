// C-314: THE EUDAIMON LAYER earned in the companion -- seven mornings in THE CREATOR'S HOUR
import { describe, expect, it } from "vitest";
import { DAWNS_TO_EARN, dawnEarned, keepDawn } from "../src/dawns.js";
import { readEudaimon } from "../src/eudaimon.js";

const store = () => { const m = new Map<string, string>(); return { getSetting: (k: string) => m.get(k) ?? null, setSetting: (k: string, v: string | null) => { if (v === null) m.delete(k); else m.set(k, v); } }; };
const at = (day: number, h: number, min: number) => new Date(2026, 10, day, h, min);

describe("C-314: dawns kept", () => {
  it("keeps a morning only in the creator's hour, once a day, and earns the book at seven", () => {
    const s = store();
    expect(keepDawn(s, at(1, 3, 0))).toMatchObject({ kept: 0, now: false });
    expect(keepDawn(s, at(1, 4, 30))).toMatchObject({ kept: 1, now: true });
    expect(keepDawn(s, at(1, 5, 0)).kept).toBe(1);                  // the same morning again
    expect(keepDawn(s, at(1, 5, 12)).now).toBe(false);              // the hour is over at 5:12
    for (let d = 2; d < 1 + DAWNS_TO_EARN; d++) keepDawn(s, at(d * 2, 4, 24));   // need not run together
    expect(dawnEarned(s)).toBe(true);
  });
  it("opens the dawn half as kept in the app, and the game's flag still wins", () => {
    expect(readEudaimon(null, false, "as it is", false).held).toBe(false);
    expect(readEudaimon(null, false, "as it is", true)).toMatchObject({ held: true, how: "app" });
  });
});
