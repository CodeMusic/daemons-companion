import { describe, expect, it } from "vitest";
import { askFind, checkFix, findAsked, fixesOf, keepFix, walkedSince } from "../src/where.js";
import { weatherSpot } from "../src/weather.js";
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
    keepFix(store, { lat: 1, lon: 2, metres: 3 }, "t-watch-ultra-a1", new Date(now.getTime() + 60000));   // a fix since the ask
    expect(findAsked(store, "t-watch-ultra-a1", now)).toBeNull();
  });
});

describe("C-174: the distance walked, and the weather where it is", () => {
  const at = (min: number) => new Date(Date.UTC(2026, 9, 29, 12, min)).toISOString();
  const fix = (min: number, lat: number, lon: number) => ({ at: at(min), lat, lon, metres: 5, device: "t-watch-ultra-f351d4" });
  it("joins the legs of a walk, leaving out the wander and the gaps", () => {
    const fixes = [fix(0, 45, -75), fix(1, 45.001, -75), fix(2, 45.00101, -75), fix(3, 45.002, -75), fix(40, 45.003, -75), fix(41, 45.1, -75)];
    const m = walkedSince(fixes, new Date(at(0)));
    expect(m).toBeGreaterThan(215);                          // two legs of ~111 m; the wander, the gap and the jump left out
    expect(m).toBeLessThan(230);
    expect(walkedSince(fixes, new Date(at(39)))).toBe(0);
  });
  it("takes the weather where the watch is, named for the city while it is near", () => {
    const store = new Store(":memory:");
    store.setSetting("weather.city", JSON.stringify({ name: "Ottawa", country: "Canada", latitude: 45.42, longitude: -75.69 }));
    expect(weatherSpot(store)?.latitude).toBe(45.42);
    keepFix(store, { lat: 45.4, lon: -75.7, metres: 5 }, "t-watch-ultra-f351d4");
    expect(weatherSpot(store)).toMatchObject({ name: "Ottawa", latitude: 45.4 });
    keepFix(store, { lat: 43.65, lon: -79.38, metres: 5 }, "t-watch-ultra-f351d4");
    expect(weatherSpot(store)).toMatchObject({ name: "AWAY", latitude: 43.65 });
    expect(weatherSpot(store, new Date(Date.now() + 3 * 3600000))?.latitude).toBe(45.42);
  });
});

describe("C-199: a fix told late, from the card", () => {
  it("does not answer a FIND asked after it was taken", () => {
    const store = new Store(":memory:"), now = new Date("2026-10-29T08:00:00Z");
    askFind(store, "w", now);
    keepFix(store, { lat: 1, lon: 2, metres: 3 }, "w", new Date(now.getTime() - 3600000));   // from the card, an hour old
    expect(findAsked(store, "w", now)).toBe(now.toISOString());
  });
  it("is filed when it was taken, in its place among the rest", async () => {
    const { takeFix } = await import("../src/routes.js");
    const store = new Store(":memory:");
    const now = new Date();
    takeFix(store, "45.1 -75.1 5", "w", now);
    const then = Math.floor(now.getTime() / 1000) - 3600;
    takeFix(store, `45.2 -75.2 5 ${then}`, "w", now);
    const l = fixesOf(store);
    expect(l[0].lat).toBe(45.1);                               // the newest still first
    expect(l[1]).toMatchObject({ lat: 45.2, at: new Date(then * 1000).toISOString() });
    takeFix(store, `45.3 -75.3 5 ${then + 999999}`, "w", now);   // from the future: taken as now
    expect(new Date(fixesOf(store)[0].at).getTime()).toBe(now.getTime());
  });
});

describe("FIND taken back (the user, 2026-10-28)", () => {
  it("stops when the app says it was found", async () => {
    const { Store } = await import("../src/db.js");
    const { route } = await import("../src/routes.js");
    const store = new Store(":memory:"), h = { edition: "CONTENT" as const, save: { read: () => null, write: () => null } };
    const post = (body: object) => route(h, store, { method: "POST", path: "/api/where/find", body, deviceId: "" });
    expect(post({ id: "t-watch-ultra-f351d4" }).body).toEqual({ asked: true });
    expect(store.getSetting("find.t-watch-ultra-f351d4")).toBeTruthy();
    expect(post({ id: "t-watch-ultra-f351d4", stop: true }).body).toEqual({ asked: false });
    expect(store.getSetting("find.t-watch-ultra-f351d4")).toBeFalsy();
  });
});

describe("C-175: a fix told twice", () => {
  it("is kept once -- over LoRa by another board, and later by the watch itself", () => {
    const store = new Store(":memory:"), at = new Date("2026-10-29T08:00:00Z");
    keepFix(store, { lat: 45.1, lon: -75.1, metres: 5 }, "w", at);
    keepFix(store, { lat: 45.1, lon: -75.1, metres: 5 }, "w", at);
    expect(fixesOf(store)).toHaveLength(1);
  });
});
