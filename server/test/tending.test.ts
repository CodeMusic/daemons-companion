// C-357 (3): THE BODY's centres -- the day's centre's tending in the book's own words, tended by a touch or by what the
// companion sees (a walk on the root's day, a dream kept on the third eye's), and the week's climb, root to crown.
import { describe, expect, it } from "vitest";
import { Store } from "../src/db.js";
import { CENTRES, tend, tendedOf, tendingOf, tendingView } from "../src/tending.js";
import { checkNight, keepNight } from "../src/dreams.js";

const day = (d: number, h = 12) => new Date(2026, 10, d, h);      // November 2026: the 8th a Sunday, the 12th a Thursday

describe("C-357 (3): the day's tending, from the book's own pages", () => {
  it("finds every centre's tending on its page, in the book's words", () => {
    expect(CENTRES).toEqual(["Root", "Sacral", "Solar Plexus", "Heart", "Throat", "Third Eye", "Crown"]);
    for (const c of CENTRES) expect(tendingOf(c), c).toMatchObject({ page: expect.stringMatching(/^(LOWER|HEART|UPPER)$/), tending: expect.any(String) });
    expect(tendingOf("Throat")).toEqual({ page: "HEART", tending: "sing, and say your goals aloud." });
    expect(tendingOf("Root")?.tending).toBe("walk, dance, wash, look after yourself.");
  });
  it("is tended once a day by a touch, and kept", () => {
    const store = new Store(":memory:");
    expect(tendingView(store, day(12)).done).toBeNull();
    const t = tend(store, day(12, 9));
    expect(t).toMatchObject({ date: "2026-11-12", centre: "Throat", by: "you" });
    expect(tend(store, day(12, 18)).at).toBe(t.at);               // a second touch is the same tending
    expect(tendedOf(store)).toHaveLength(1);
    expect(tendingView(store, day(12)).done).toMatchObject({ by: "you" });
  });
  it("is tended by a walk on the root's day and a dream kept on the third eye's, and by nothing else", () => {
    const store = new Store(":memory:");
    store.setSetting("walk.2026-11-08", "4200");
    expect(tendingView(store, day(8)).done).toEqual({ at: "", by: "walk" });
    store.setSetting("walk.2026-11-09", "9000");                   // Monday's is the sacral's: a walk does not tend it
    expect(tendingView(store, day(9)).done).toBeNull();
    const n = checkNight({ from: day(12, 23), to: day(13, 7), stirs: 1, tucked: true });
    if (typeof n === "string") throw new Error(n);
    keepNight(store, n, { nickname: "LABEL", species: 4, personality: 1, device: "w" });
    expect(tendingView(store, day(13)).done).toEqual({ at: "", by: "dream" });
  });
  it("draws the week's climb, Sunday the root to Saturday the crown, the days ahead not yet climbed", () => {
    const store = new Store(":memory:");
    store.setSetting("walk.2026-11-08", "4200");
    tend(store, day(10));
    const v = tendingView(store, day(12));
    expect(v.climb.map((c) => c.centre)).toEqual(CENTRES);
    expect(v.climb.map((c) => c.tended)).toEqual([true, false, true, false, false, false, false]);
    expect(v.climb.map((c) => c.ahead)).toEqual([false, false, false, false, false, true, true]);
    expect(v.climb[4]).toMatchObject({ day: "Thursday", today: true });
  });
});
