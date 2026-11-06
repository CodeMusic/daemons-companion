// C-283: a night from SLEEP to the waking care, when no watch told it -- and the day before it, for the dream's telling
import { describe, expect, it } from "vitest";
import { Store } from "../src/db.js";
import { appNight, route } from "../src/routes.js";
import type { Host } from "../src/core.js";
import { asDreamt, dayOf, dreamAsk, dreamerSaid, dreamsOf, keepNight } from "../src/dreams.js";

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
    expect(dreamAsk({ from: "", to: "", hours: 8, stirs: 0, tucked: true }, "2 meals")).toMatch(/Yesterday, with your trainer: 2 meals\./);
  });
});

describe("C-293: he dreams as himself", () => {
  const n = { from: "", to: "", hours: 8, stirs: 0, tucked: true };
  it("is told how it speaks of itself, after its record, and to tell the dream in that voice (C-303)", () => {
    const self = dreamerSaid({ nickname: "PING", entry: "Asks one question.", said: "Are you there? Good." });
    expect(self).toMatch(/Your INDEX entry: Asks one question\.\nYou say of yourself, in your own words: "Are you there\? Good\." Tell the dream in that voice\./);
    expect(dreamerSaid({ nickname: "PING", entry: "Asks one question." })).not.toMatch(/You say of yourself/);
  });
  it("is told who is dreaming -- the INDEX, feelings, care and bond -- and asked for a metaphor told as 'I dreamt'", () => {
    const self = dreamerSaid({ nickname: "SEEKMUSAI", name: "VAPOREON", types: "WATER", category: "BUBBLE JET", entry: "It lives near water.",
                                trainer: "KIT", feelings: "very GLAD, and a little SAD", bond: 62, bondTrend: "STRONGER",
                                care: { rest: 90, hunger: 40, thirst: 5, companionship: 85, weight: 0 }, goal: "write the book (next, chapter two)" });
    expect(self).toMatch(/You are SEEKMUSAI, a VAPOREON, a WATER daemon\./);
    expect(self).toMatch(/Your INDEX entry \(the BUBBLE JET DAEMON\): It lives near water\./);
    expect(self).toMatch(/You feel very GLAD, and a little SAD\./);
    expect(self).toMatch(/You are well rested, nearly fed, well watered, and you feel close to KIT\./);
    expect(self).toMatch(/Your bond with KIT is 62%, grown STRONGER this week\./);
    expect(self).toMatch(/KIT is working toward: write the book/);
    const ask = dreamAsk(n, "a walk", { nickname: "SEEKMUSAI", trainer: "KIT" });
    expect(ask).toMatch(/tucked in by KIT/);
    expect(ask).toMatch(/Begin with the words "I dreamt"/);
    expect(ask).toMatch(/not a report/);
    expect(dreamAsk(n, null, null, "short")).toMatch(/starting with "I dreamt"/);
  });
  it("keeps every telling as the daemon's own, whole sentences", () => {
    expect(asDreamt("I dreamed of rain.")).toBe("I dreamed of rain.");
    expect(asDreamt('"Counters gleam white under distant stars."')).toBe("I dreamt this: Counters gleam white under distant stars.");
    const long = asDreamt("I dreamt of a river. " + "The water sang to me. ".repeat(30));
    expect(long.length).toBeLessThanOrEqual(360);
    expect(long.endsWith(".")).toBe(true);
  });
  it("is one night when the phone took it at the waking and the watch tells it after", () => {
    const store = new Store(":memory:");
    store.logInteraction("sleep", null, at("2026-11-02T22:00:00"));
    const d = appNight(h, store, "t-watch-ultra-f351d4", at("2026-11-03T07:00:00"), undefined)!;   // woken from the watch
    expect(d).toMatchObject({ stirs: 0, tucked: true });
    const told = keepNight(store, { from: new Date(at("2026-11-02T22:00:30")).toISOString(), to: new Date(at("2026-11-03T06:58:00")).toISOString(),
                                    hours: 9, stirs: 2, tucked: true }, { nickname: "", species: 0, personality: null, device: "t-watch-ultra-f351d4" });
    expect(told.id).toBe(d.id);
    expect(dreamsOf(store)).toHaveLength(1);
    expect(dreamsOf(store)[0]).toMatchObject({ stirs: 2 });
  });
});
