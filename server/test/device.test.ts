import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeServer, today } from "../src/api.js";
import { Store } from "../src/db.js";
import { DEFAULTS } from "../src/config.js";
import { buildSave } from "./build_save.js";

const dir = mkdtempSync(join(tmpdir(), "device-"));
const savePath = join(dir, "copy.sav");
writeFileSync(savePath, buildSave({ player: "ROVER", trainerId: 7, slots: [
  { counter: 1, party: [{ personality: 99, otId: 7, species: 1, nickname: "PIP", level: 5 },
                        { personality: 100, otId: 7, species: 4, nickname: "LABEL", level: 9, away: true }] },
  { counter: 0, party: [] }] }));
const server = makeServer({ ...DEFAULTS, database: ":memory:", savePath });
let base = "";
beforeAll(async () => {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());
const get = (p: string) => fetch(base + p).then((r) => r.json());
const post = (p: string, b: unknown) =>
  fetch(base + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) })
    .then(async (r) => ({ status: r.status, json: await r.json() }));

describe("the sync protocol's server side (C-09)", () => {
  it("gives a device its day, season, next step and the party's AWAY daemon", async () => {
    await post("/api/goals", { title: "Tidy the garage", breakdown: true });
    const s = await get("/api/device/state");
    expect(Object.keys(s).sort()).toEqual(["beacons", "clock", "daemon", "date", "day", "edition", "party", "season", "server", "settings", "step"]);
    expect(s.daemon).toMatchObject({ nickname: "LABEL", slot: 1, art: "/art/party/1.png", mood: null });
    expect(s.clock.epoch).toBeGreaterThan(1.7e9);                          // C-71: the watch sets its clock by it
    // C-68: the party and their routines, named as the game names them, each with its streak's colour
    expect(s.party.length).toBeGreaterThan(1);
    for (const p of s.party) for (const r of p.routines) expect(r).toMatchObject({ name: expect.any(String), colour: expect.stringMatching(/^#[0-9a-f]{6}$/) });

    expect(s.step.text).toBe("Write down what done looks like");
  });

  it("takes the steps a device ticked off and answers with the next", async () => {
    const before = await get("/api/device/state");
    const r = await post("/api/device/ticks", { steps: [before.step.id, 99999] });
    expect(r.status).toBe(200);
    expect(r.json.done).toEqual([before.step.id]);            // an unknown id is not counted
    expect(r.json.state.step.text).toBe("Gather what you need");
  });

  it("refuses a malformed tick", async () => {
    expect((await post("/api/device/ticks", { steps: "all" })).status).toBe(400);
  });
});

describe("the daemon on the handheld (C-36) and the day's colours (C-37, C-38)", () => {
  it("carries the daemon's INDEX entry in the edition's voice, its kind, and a key for its art", async () => {
    const s = await get("/api/device/state");
    expect(s.daemon.entry.length).toBeGreaterThan(20);
    expect(s.daemon.category).not.toBe("");
    expect(s.daemon.types.length).toBeGreaterThan(0);
    expect(s.daemon.artKey).toMatch(/^4-/);                  // species 4, then its routines
  });

  it("sends the carried daemon's art as sixteen RGB565 colours and 4-bit pixels", async () => {
    const a = await get("/api/device/art");
    expect([a.w, a.h, a.palette.length]).toEqual([64, 64, 16]);
    expect(Buffer.from(a.pixels, "base64").length).toBe(2048);
    expect(a.palette.every((c: number) => c >= 0 && c <= 0xffff)).toBe(true);
  });

  it("gives the day a menu colour and a light colour of its own, not the CHECKPOINT's trim", async () => {
    const s = await get("/api/device/state");
    expect(s.day.menu).toMatch(/^#[0-9A-F]{6}$/);
    expect(s.day.led).toMatch(/^#[0-9A-F]{6}$/);
    expect(s.day.menu).not.toBe(s.day.colour);
  });
});

describe("the day's date (found live, 2026-10-03)", () => {
  it("is the local date, the same day the weekday names", () => {
    const late = new Date(2026, 9, 3, 23, 30);               // Saturday 3 October, 11:30pm local
    const t = today({ ...DEFAULTS, database: ":memory:" }, new Store(":memory:"), late);
    expect(t.date).toBe("2026-10-03");
    expect(t.day.day).toBe("Saturday");
  });
});

describe("a step finished grows the daemon you carry (C-44, C-45)", () => {
  it("feeds it, and gives it experience shown as what it has grown", async () => {
    const before = (await get("/api/device/state")).daemon.grown.exp;
    await post("/api/goals", { title: "Water the plants", breakdown: true });
    const s = await get("/api/device/state");
    await post("/api/device/ticks", { steps: [s.step.id] });
    const after = await get("/api/device/state");
    expect(after.daemon.grown.exp).toBeGreaterThan(before);
    expect(after.daemon.life.fed.today).toBeGreaterThan(0);
  });
});
