import { describe, expect, it } from "vitest";
import { drowsyFrom, thrived, thriveOf } from "../src/thrive.js";
import { keepNight, checkNight } from "../src/dreams.js";
import { EXPRESSIONS } from "../src/expressions.js";
import { Store } from "../src/db.js";

const who = { nickname: "SPARKY", species: 25, personality: 1234, device: "t-watch-ultra-f351d4" };
const night = (endHoursAgo: number, hours: number, stirs: number) => {
  const to = new Date(Date.now() - endHoursAgo * 3600000);
  return checkNight({ from: new Date(to.getTime() - hours * 3600000).toISOString(), to: to.toISOString(), stirs }) as any;
};

describe("C-207: the daemon looks how the week has gone", () => {
  it("is ordinary with nothing told", () => {
    expect(thriveOf(new Store(":memory:"))).toEqual({ level: 50, glow: 0, stars: 0, moon: false, rested: false, broken: false });
  });
  it("glows with good nights and goals, a moon the morning after a vivid one", () => {
    const store = new Store(":memory:");
    for (let d = 5; d >= 1; d--) keepNight(store, night(d * 24 + 2, 8, 1), who);
    keepNight(store, night(1, 8, 1), who);
    store.logInteraction("goal", "1"); store.logInteraction("goal", "2");
    const t = thriveOf(store);
    expect(t.level).toBeGreaterThan(90);
    expect(t.glow).toBeGreaterThan(80);
    expect(t).toMatchObject({ stars: 2, moon: true, rested: true, broken: false });
    const e = thrived({ ...EXPRESSIONS.awake, patch: [] }, t);
    expect(e.shade.sat).toBeGreaterThan(1);
    expect(e.pose.dy).toBe(-1);
  });
  it("reads the latest night, even when an older one is told after it", () => {
    const store = new Store(":memory:");
    keepNight(store, night(1, 8, 1), who);                    // this morning's, vivid
    keepNight(store, night(49, 3, 9), who);                   // an old broken one, told late from the outbox
    expect(thriveOf(store)).toMatchObject({ moon: true, rested: true, broken: false });
  });
  it("is drowsy until noon and paler after a broken night", () => {
    const store = new Store(":memory:");
    keepNight(store, night(1, 3, 9), who);
    const t = thriveOf(store);
    expect(t).toMatchObject({ broken: true, rested: false, glow: 0 });
    expect(drowsyFrom(t, 9)).toBe(true);
    expect(drowsyFrom(t, 13)).toBe(false);
    expect(thrived({ ...EXPRESSIONS.awake, patch: [] }, t).shade.sat).toBeLessThan(1);
  });
});
