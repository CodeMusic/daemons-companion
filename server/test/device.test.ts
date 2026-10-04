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
    expect(Object.keys(s).sort()).toEqual(["daemon", "date", "day", "edition", "season", "step"]);
    expect(s.daemon).toMatchObject({ nickname: "LABEL", slot: 1, art: "/art/party/1.png", mood: null });
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

describe("the day's date (found live, 2026-10-03)", () => {
  it("is the local date, the same day the weekday names", () => {
    const late = new Date(2026, 9, 3, 23, 30);               // Saturday 3 October, 11:30pm local
    const t = today({ ...DEFAULTS, database: ":memory:" }, new Store(":memory:"), late);
    expect(t.date).toBe("2026-10-03");
    expect(t.day.day).toBe("Saturday");
  });
});
