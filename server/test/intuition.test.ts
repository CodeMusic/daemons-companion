// C-203: THE SUBTLE LAYER on the companion -- THE THREE as the game derives them, the sense the boards get, reads judged
// by what happens after, leans counted, and THE LOG written from the save's vars as the game writes it.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeServer } from "../src/api.js";
import { DEFAULTS } from "../src/config.js";
import { buildSave } from "./build_save.js";
import { Store } from "../src/db.js";
import { checkNight, keepNight } from "../src/dreams.js";
import { keepFix } from "../src/where.js";
import { landReads, leanRight, lineOf, noteClose, noteSky, readsView, senseFor, takeLean, takeRead, threeOf, wayOf } from "../src/intuition.js";
import { readsLog } from "../src/save/notebook.js";
import layout from "../data/profile_layout.json" with { type: "json" };
import subtle from "../data/subtle.json" with { type: "json" };

const calm = { glad: 0, mad: 0, sad: 0, calm: 0, restless: 0, strongest: null };
const T0 = new Date("2026-10-28T20:00:00Z");
const at = (min: number) => new Date(T0.getTime() + min * 60000);
const who = { nickname: "SPARKY", species: 25, personality: 1234, device: "t-watch-ultra-f351d4" };

describe("C-203: THE THREE, as the game derives them (engine include/daemons_three.h)", () => {
  it("reads CLOSURE from friendship, ATTUNEMENT from calm, VOLTAGE from the strongest feeling", () => {
    expect(threeOf(70, calm)).toEqual({ closure: 2, attunement: 2, voltage: 1 });            // a daemon just caught
    expect(threeOf(230, { ...calm, calm: 70 })).toEqual({ closure: 4, attunement: 4, voltage: 1 });   // calm is no voltage
    expect(threeOf(230, { ...calm, mad: 45 })).toMatchObject({ closure: 3, voltage: 3 });     // MAD at 40 takes one away
    expect(threeOf(10, { ...calm, calm: -60 })).toEqual({ closure: 1, attunement: 0, voltage: 3 });   // AFRAID
  });
  it("makes a lean right 65 + 7 x READ percent of the time", () => {
    expect(leanRight({ closure: 2, attunement: 2, voltage: 1 })).toBe(72);
    expect(leanRight({ closure: 0, attunement: 0, voltage: 4 })).toBe(37);
    expect(leanRight({ closure: 4, attunement: 4, voltage: 0 })).toBe(93);
  });
});

describe("C-203: the sense a board gets", () => {
  it("finds the side of its walks it has walked least", () => {
    const here = { lat: 43.65, lon: -79.38 };
    const f = (dLat: number, dLon: number, min: number) => ({ lat: here.lat + dLat, lon: here.lon + dLon, metres: 5, at: at(min).toISOString(), device: "w" });
    expect(wayOf([], T0)).toBe("");
    // the newest first: here, then two walks north, one east, one south -- west is the least walked
    expect(wayOf([f(0, 0, 0), f(0.01, 0, -60), f(0.02, 0, -120), f(0, 0.01, -180), f(-0.01, 0, -240)], T0)).toBe("west");
  });
  it("says rain only from a fresh outlook, and still from vivid nights or a calm daemon", () => {
    const store = new Store(":memory:");
    expect(senseFor(store, 70, calm, T0)).toMatchObject({ lean: 72, rain: 0, still: 0, way: "", last: 0 });
    store.setSetting("subtle.outlook", JSON.stringify({ at: at(-30).toISOString(), chance: 80 }));
    expect(senseFor(store, 70, calm, T0).rain).toBe(1);
    store.setSetting("subtle.outlook", JSON.stringify({ at: at(-300).toISOString(), chance: 80 }));
    expect(senseFor(store, 70, calm, T0).rain).toBe(0);                                      // three hours old: not a forecast now
    expect(senseFor(store, 70, { ...calm, calm: 30 }, T0).still).toBe(1);
  });
});

describe("C-203: reads, judged by what happens after", () => {
  it("checks a read as the watch tells it, and words it", () => {
    const store = new Store(":memory:");
    expect(takeRead(store, "soon 1", "w", T0)).toBe("a read is <near|rain|night|walk> <0|1> [way]");
    expect(takeRead(store, "walk 1 up", "w", T0)).toBe("a read on a walk names its way: north, east, south or west");
    const r = takeRead(store, "walk 0 east", "w", T0) as any;
    expect(r).toMatchObject({ id: 1, about: "walk", based: false, way: "east", landed: null, closed: false });
    expect(lineOf(r)).toBe("something to the east.");
    expect(lineOf({ about: "near", way: "" })).toBe("someone close by.");
  });
  it("lands a near read on a stranger heard close within half an hour, and closes it after", () => {
    const store = new Store(":memory:");
    takeRead(store, "near 1", "w", T0);
    takeRead(store, "near 0", "w", at(60));
    noteClose(store, "a1b2c3d4", at(10));
    const [late, first] = landReads(store, at(120));
    expect(first.landed).toBe(at(10).toISOString());
    expect(late).toMatchObject({ landed: null, closed: true });
  });
  it("lands a rain read when rain is seen within ten hours", () => {
    const store = new Store(":memory:");
    takeRead(store, "rain 1", "w", T0);
    store.setSetting("weather.now", JSON.stringify({ kind: "rain", code: 61, tempC: 9, city: "TORONTO", at: at(90).toISOString() }));
    noteSky(store, at(95));
    expect(landReads(store, at(100))[0].landed).toBe(at(95).toISOString());
  });
  it("lands a night read only on a VIVID night after it", () => {
    const store = new Store(":memory:");
    takeRead(store, "night 1", "w", T0);
    takeRead(store, "night 1", "w", at(24 * 60));
    const n = (from: Date, hours: number, stirs: number) => checkNight({ from: from.toISOString(), to: new Date(from.getTime() + hours * 3600000).toISOString(), stirs, tucked: true });
    keepNight(store, n(at(10), 8, 1) as any, who);              // vivid
    keepNight(store, n(at(24 * 60 + 10), 3, 0) as any, who);   // broken
    const [second, first] = landReads(store, at(26 * 60 + 60 * 12));
    expect(first.landed).not.toBeNull();
    expect(second).toMatchObject({ landed: null, closed: true });
  });
  it("lands a walk read on new ground that way, and not on ground walked before", () => {
    const store = new Store(":memory:");
    const fix = (lat: number, lon: number, min: number) => keepFix(store, { lat, lon, metres: 5 }, "w", at(min));
    fix(43.6500, -79.3800, -5);                                   // where it was when the read came
    fix(43.6540, -79.3800, -600);                                 // north, walked before
    takeRead(store, "walk 1 north", "w", T0);
    fix(43.6541, -79.3800, 20);                                   // north again, but walked before: not new ground
    expect(landReads(store, at(30))[0].landed).toBeNull();
    fix(43.6500, -79.3740, 40);                                   // east: not the way it said
    fix(43.6460, -79.3800, 50);                                   // south
    expect(landReads(store, at(60))[0].landed).toBeNull();
    fix(43.6510, -79.3700, 70);                                   // east again, further
    fix(43.6520, -79.3700, 80);                                   // east-north-east: east by its bearing
    fix(43.6600, -79.3810, 90);                                   // north, 1.1 km, new ground
    expect(landReads(store, at(100))[0].landed).toBe(at(90).toISOString());
  });
  it("keeps the log's counts, and never says which reads were about nothing", () => {
    const store = new Store(":memory:");
    takeRead(store, "near 1", "w", T0); noteClose(store, "a1b2c3d4", at(5));
    takeRead(store, "rain 0", "w", at(10));
    const v = readsView(store, at(20));
    expect(v.reads).toEqual({ given: 2, landed: 1 });
    expect(v.recent[0]).toEqual({ at: at(10).toISOString(), about: "rain", line: "rain, before long.", landed: null, open: true });
    expect(JSON.stringify(v)).not.toContain("based");
  });
});

describe("C-203: leans at the CASINO's reels", () => {
  it("counts each lean told and the ones that landed", () => {
    const store = new Store(":memory:");
    expect(takeLean(store, "maybe 1")).toBe("a lean is <pays|not> <0|1>");
    takeLean(store, "pays 1", T0); takeLean(store, "not 0", at(1)); takeLean(store, "not 1", at(2));
    expect(readsView(store, at(3)).leans).toEqual({ told: 3, landed: 2 });
  });
});

describe("C-203: THE LOG, written from the save's vars as the game writes it", () => {
  const R = layout.reads;
  const vars = (v: Record<number, number>) => (id: number) => v[id] ?? 0;
  const where = (mapsec: number, phrase: number, landed = false) => mapsec | (phrase << R.phrase_shift) | (landed ? 1 << R.landed_bit : 0);
  const names = layout.sb1.first_met_places as Record<string, string>;
  const [sec] = Object.keys(names).map(Number).filter((n) => n > 0);
  it("counts reads and leans, then the last reads, newest first, landed once their thing is found", () => {
    const lines = readsLog((f) => f === 0x500, vars({
      [R.given]: 3, [R.landed]: 1, [R.leans_told]: 5, [R.leans_landed]: 4,
      [R.where]: where(sec, 0), [R.thing]: 0x500,                   // found since: landed, and counted here
      [R.where + 1]: where(sec, 5, true), [R.thing + 1]: 0x501,
      [R.where + 2]: where(sec, 4), [R.thing + 2]: 0,                // a read about nothing never lands
    }));
    expect(lines).toEqual([
      "Reads: 3 given, 2 landed.", "Leans: 5 told, 4 landed.",
      `${names[sec]}: something by the water. Landed.`, `${names[sec]}: something to the north. Landed.`,
      `${names[sec]}: something close by.`,
    ]);
  });
  it("writes only the counts before any read is given", () => {
    expect(readsLog(() => false, vars({}))).toEqual(["Reads: 0 given, 0 landed.", "Leans: 0 told, 0 landed."]);
  });
});

// ---- through the server: the sense only once the save holds the book, and a read told, kept and logged -----------------
function serve(book: boolean) {
  const dir = mkdtempSync(join(tmpdir(), "subtle-")), savePath = join(dir, "copy.sav");
  const P = layout as any, f = subtle.flag;
  writeFileSync(savePath, buildSave({ player: "ROVER", trainerId: 7, slots: [
    { counter: 1, party: [{ personality: 100, otId: 7, species: 4, nickname: "LABEL", level: 9, away: true }] }, { counter: 0, party: [] }],
    edit: (sb2, sb1) => {
      if (!book) return;
      if (f < P.flags.daemons_flags_start) sb1[P.sb1.flags + (f >> 3)] |= 1 << (f & 7);
      else { const g = f - P.flags.daemons_flags_start; sb2[P.sb2.daemons_flags + (g >> 3)] |= 1 << (g & 7); }
    } }));
  return makeServer({ ...DEFAULTS, database: ":memory:", savePath });
}
const servers = { with: serve(true), without: serve(false) };
const base = { with: "", without: "" };
beforeAll(async () => {
  for (const k of ["with", "without"] as const) {
    await new Promise<void>((r) => servers[k].listen(0, "127.0.0.1", () => r()));
    base[k] = `http://127.0.0.1:${(servers[k].address() as AddressInfo).port}`;
  }
});
afterAll(() => { servers.with.close(); servers.without.close(); });
const get = (k: "with" | "without", p: string) => fetch(base[k] + p).then((r) => r.json());
const post = (k: "with" | "without", p: string, b: unknown) =>
  fetch(base[k] + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) }).then(async (r) => ({ status: r.status, json: await r.json() }));

describe("C-203: through the server", () => {
  it("gives a board the sense only once the save holds THE SUBTLE LAYER", async () => {
    expect((await get("without", "/api/device/state")).subtle).toBeUndefined();
    expect((await get("with", "/api/device/state")).subtle).toMatchObject({ lean: expect.any(Number), rain: 0, way: "", last: 0 });
    expect((await get("without", "/api/reads")).held).toBe(false);
  });
  it("keeps a read and a lean told by a board, and logs them", async () => {
    expect((await post("with", "/api/device/interact", { kind: "read", detail: "near 1" })).json.read).toMatchObject({ about: "near", based: true });
    expect((await post("with", "/api/device/interact", { kind: "read", detail: "nowhere" })).status).toBe(400);
    expect((await post("with", "/api/device/interact", { kind: "lean", detail: "pays 1" })).json.leans).toEqual({ told: 1, landed: 1 });
    const r = await get("with", "/api/reads");
    expect(r).toMatchObject({ held: true, reads: { given: 1, landed: 0 }, leans: { told: 1, landed: 1 } });
    expect(r.recent[0]).toMatchObject({ line: "someone close by.", open: true });
    expect((await get("with", "/api/device/state")).subtle.last).toBeGreaterThan(1.7e9);
  });
});
