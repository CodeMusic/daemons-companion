// C-283: a night from SLEEP to the waking care, when no watch told it -- and the day before it, for the dream's telling
import { describe, expect, it } from "vitest";
import { Store } from "../src/db.js";
import { appNight, route } from "../src/routes.js";
import type { Host } from "../src/core.js";
import { dayOf, dreamAsk, dreamsOf, keepNight } from "../src/dreams.js";

const h: Host = { edition: "CONTENT", save: { read: () => null, write: () => null } };
const at = (iso: string) => new Date(iso);

describe("C-283: a night from SLEEP to WAKE", () => {
  it("takes the night when it is woken, tucked in, with the phone's stirs", () => {
    const store = new Store(":memory:");
    store.logInteraction("feed", null, at("2026-11-02T18:30:00"));
    store.logInteraction("sleep", null, at("2026-11-02T22:00:00"));
    const d = appNight(h, store, "phone", at("2026-11-03T07:00:00"), 3);
    expect(d).toMatchObject({ hours: 9, stirs: 3, tucked: true, by: "words" });
    expect(dreamsOf(store)).toHaveLength(1);
  });
  it("is no night for a nap, a daemon already woken, or a night the watch told", () => {
    const nap = new Store(":memory:");
    nap.logInteraction("sleep", null, at("2026-11-03T13:00:00"));
    expect(appNight(h, nap, "phone", at("2026-11-03T15:00:00"), 0)).toBeNull();
    const woken = new Store(":memory:");
    woken.logInteraction("sleep", null, at("2026-11-02T22:00:00"));
    woken.logInteraction("wake", null, at("2026-11-03T06:30:00"));
    expect(appNight(h, woken, "phone", at("2026-11-03T08:00:00"), 0)).toBeNull();
    const watch = new Store(":memory:");
    watch.logInteraction("sleep", null, at("2026-11-02T22:00:00"));
    keepNight(watch, { from: "2026-11-02T22:05:00.000Z", to: "2026-11-03T06:00:00.000Z", hours: 8, stirs: 1, tucked: true },
              { nickname: "", species: 0, personality: null, device: "t-watch-ultra" });
    expect(appNight(h, watch, "phone", at("2026-11-03T07:00:00"), 0)).toBeNull();
  });
  it("answers the waking care with the dream", () => {
    const store = new Store(":memory:");
    store.logInteraction("sleep", null, at("2026-11-02T23:00:00"));
    const r = route(h, store, { method: "POST", path: "/api/daemon/wake", deviceId: "phone", query: {}, body: { stirs: 0 } }, at("2026-11-03T07:00:00"));
    expect((r.body as any).dream).toMatchObject({ quality: "vivid", by: "words" });
  });
  it("tells the dreamer the day before the night", () => {
    const store = new Store(":memory:");
    store.logInteraction("feed", null, at("2026-11-02T08:00:00"));
    store.logInteraction("feed", null, at("2026-11-02T13:00:00"));
    store.logInteraction("walk", null, at("2026-11-02T17:00:00"));
    expect(dayOf(store, "2026-11-02T22:00:00")).toBe("2 meals, a walk");
    expect(dayOf(new Store(":memory:"), "2026-11-02T22:00:00")).toBe("a quiet day, little done together");
    expect(dreamAsk({ from: "", to: "", hours: 8, stirs: 0, tucked: true }, "2 meals")).toMatch(/Yesterday, with the user: 2 meals\./);
  });
});
