// C-72: meetings over LoRa (how far they came), and the waves and words between daemons, as the server keeps them.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeServer } from "../src/api.js";
import { DEFAULTS } from "../src/config.js";
import { buildSave } from "./build_save.js";

const dir = mkdtempSync(join(tmpdir(), "companion-lora-"));
const savePath = join(dir, "copy.sav");
writeFileSync(savePath, buildSave({ player: "ROVER", trainerId: 7,
  slots: [{ counter: 1, party: [{ personality: 99, otId: 7, species: 1, nickname: "PIP", level: 5, away: true }] }, { counter: 0, party: [] }] }));
const server = makeServer({ ...DEFAULTS, database: ":memory:", savePath, edition: "CONTEXT" as const });
let base = "";
beforeAll(async () => {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());
const get = (p: string) => fetch(base + p).then((r) => r.json());
const post = async (p: string, b: unknown) => {
  const r = await fetch(base + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });
  return { status: r.status, json: await r.json() };
};

describe("meeting over LoRa (C-72)", () => {
  it("counts a meeting heard over LoRa once an hour, and says how far it came", async () => {
    expect((await post("/api/device/met", { species: "25", peer: "0a0b0c0d", how: "lora", hops: 1 })).json).toMatchObject({ counted: true, how: "lora", hops: 1 });
    expect((await post("/api/device/met", { species: "25", peer: "0a0b0c0d" })).json).toMatchObject({ counted: false, why: "already met this hour" });
    expect((await post("/api/device/met", { species: "4", peer: "11112222" })).json).toMatchObject({ counted: true, how: "ble", hops: 0 });
    const m = await get("/api/meetings");
    expect(m.meetings.map((x: any) => [x.species, x.how, x.hops])).toEqual([[4, "ble", 0], [25, "lora", 1]]);
  });

  it("keeps the waves and words, in and out, and names the daemon", async () => {
    await post("/api/device/beacon", { peer: "feedbeef" });                       // one of ours
    expect((await post("/api/device/message", { dir: "in", kind: "wave", species: "25", peer: "0a0b0c0d", hops: 0 })).json).toMatchObject({ ok: true });
    expect((await post("/api/device/message", { dir: "in", kind: "say", species: "4", peer: "feedbeef", hops: 2, text: "WELL MET\u0007" })).status).toBe(200);
    expect((await post("/api/device/message", { dir: "out", kind: "say", species: "1", peer: "00000000", text: "x".repeat(60) })).status).toBe(200);
    expect((await post("/api/device/message", { dir: "sideways", kind: "say", species: "1", peer: "00000000" })).status).toBe(400);
    expect((await post("/api/device/message", { dir: "in", kind: "say", species: "1", peer: "nope" })).status).toBe(400);
    const m = await get("/api/meetings");
    expect(m.messages.map((x: any) => [x.dir, x.kind, x.name, x.peer, x.hops, x.text, x.ours])).toEqual([
      ["out", "say", "BULBASAUR".length ? m.messages[0].name : "", "00000000", 0, "x".repeat(40), false],
      ["in", "say", m.messages[1].name, "feedbeef", 2, "WELL MET", true],
      ["in", "wave", m.messages[2].name, "0a0b0c0d", 0, "", false]]);
    expect(m.messages[1].name).not.toBe("?");
  });

  it("keeps the LoRa band among the device's settings, 433, 868 or 915 only", async () => {
    expect((await get("/api/device/settings")).band).toBe(433);
    expect((await post("/api/device/settings", { band: 915 })).json.band).toBe(915);
    expect((await post("/api/device/settings", { band: 500 })).status).toBe(400);
    expect((await get("/api/device/state")).settings.band).toBe(915);
  });
});
