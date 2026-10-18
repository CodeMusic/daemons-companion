// C-158: the world the devices live in, and the CASINO's luck in it -- on synthetic saves, never the user's own.
import { describe, expect, it } from "vitest";
import { Store } from "../src/db.js";
import { casinoContext, reelSpecies, skyOf, watchOf, weatherNow } from "../src/context.js";
import { setWeatherCity } from "../src/weather.js";
import { casinoAdmin } from "../src/casino.js";
import { holiday } from "../src/holidays.js";

const at = (m: number, d: number, h = 12) => new Date(2026, m - 1, d, h);

describe("the world and the CASINO's luck (C-158)", () => {
  it("keeps the game's own watches", () => {
    expect([4, 5, 6, 7, 17, 18, 19, 20, 23].map((h) => watchOf(at(10, 18, h)))).toEqual(["NIGHT", "DAWN", "DAWN", "DAY", "DAY", "DUSK", "DUSK", "NIGHT", "NIGHT"]);
  });

  it("gathers WMO's weather codes", () => {
    expect([0, 2, 45, 61, 73, 95, 81].map(skyOf)).toEqual(["clear", "cloudy", "fog", "rain", "snow", "storm", "rain"]);
  });

  it("makes St Patrick's the luckiest of days, a stormy night a bad one, and says why", () => {
    const pat = casinoContext("CONTENT", at(3, 17, 10), "winter", holiday("CONTENT", at(3, 17)), null);
    expect(pat.reasons[0]).toEqual({ source: "holiday", effect: 1, why: "St Patrick's Day: the luck of the day" });
    expect(pat.rtp).toBeGreaterThanOrEqual(0.99);
    const storm = casinoContext("CONTENT", at(10, 18, 23), "autumn", null,
      { kind: "storm", code: 95, tempC: 9, city: "Toronto", at: new Date().toISOString() });
    expect(storm.rtp).toBe(0.9 + 0.05 * (1 - 0.6) - 0.05 * 0);   // -0.6 luck: 0.92
    expect(storm.reasons.map((r) => r.source)).toEqual(["weather", "time", "season"]);
    expect(storm.reasons[0].why).toBe("a storm: the house leans in in Toronto");
  });

  it("puts only daemons seen on the reels, those at home in the season and hour first", () => {
    const seen = [1, 4, 7, 10, 17];
    const r = reelSpecies(seen, 4, [7], "autumn", "DAY", at(10, 18));
    expect(r).toHaveLength(3);
    expect(r).not.toContain(4);                                  // the carried one is the jackpot, not a friend
    expect(r.every((s) => seen.includes(s))).toBe(true);
    expect(r[0]).toBe(7);                                        // the party's before the rest
  });

  it("looks a city up and keeps its weather, without ever calling out in a test", async () => {
    const store = new Store(":memory:");
    const fake = (async (url: string) => ({ json: async () => url.includes("geocoding")
      ? { results: [{ name: "Toronto", country: "Canada", latitude: 43.7, longitude: -79.4 }] }
      : { current: { weather_code: 71, temperature_2m: -2.4 } } })) as unknown as typeof fetch;
    expect(await setWeatherCity(store, "toronto", fake)).toMatchObject({ name: "Toronto", latitude: 43.7 });
    expect(weatherNow(store)).toMatchObject({ kind: "snow", tempC: -2, city: "Toronto" });
    await setWeatherCity(store, "", fake);
    expect(weatherNow(store)).toBeNull();
  });

  it("lists everyone at the reels with the odds they last said, and why", () => {
    const store = new Store(":memory:");
    store.setSetting("carry", JSON.stringify({ "t-deck-09ffa8": 11 }));
    store.logInteraction("table", "here t-deck-09ffa8 968 45 9 0");
    store.logInteraction("table", "here m5go-606748");
    const ctx = { luck: 0.3, rtp: 0.965, reasons: [{ source: "time", effect: 0.1, why: "dusk: the golden hour" }] };
    const a = casinoAdmin(store, [{ personality: 11, nickname: "ARTSAI", name: "ARTSAI", species: 151 }], ctx);
    const deck = a.players.find((p) => p.device === "t-deck-09ffa8")!;
    expect(deck).toMatchObject({ name: "ARTSAI", odds: { rtp: 0.968, reach: 0.45, dry: 9, streak: 0 } });
    expect(deck.reasons.map((r) => r.why)).toEqual(["dusk: the golden hour", "9 pulls without a win: the string comes nearer"]);
    expect(a.players.find((p) => p.device === "m5go-606748")!.odds).toBeNull();
  });
});
