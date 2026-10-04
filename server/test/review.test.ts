// The follow-up to Opus 4.8's settings work (reviewed 2026-10-04), and C-31 / C-13's first pieces.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { mkdtempSync, writeFileSync } from "node:fs";
import { networkInterfaces, tmpdir } from "node:os";
import { join } from "node:path";
import { makeServer } from "../src/api.js";
import { DEFAULTS } from "../src/config.js";
import { readSave } from "../src/save/reader.js";
import { buildSave } from "./build_save.js";

const dir = mkdtempSync(join(tmpdir(), "review-"));
const savePath = join(dir, "copy.sav");
writeFileSync(savePath, buildSave({ player: "ROVER", trainerId: 7,
  slots: [{ counter: 1, party: [{ personality: 99, otId: 7, species: 1, nickname: "PIP", level: 5, away: true, held: 375 }] },
          { counter: 0, party: [] }] }));
const junk = join(dir, "not-a-save.sav");
writeFileSync(junk, new Uint8Array(4096));
const server = makeServer({ ...DEFAULTS, database: ":memory:", savePath });
let port = 0;
beforeAll(async () => {
  await new Promise<void>((r) => server.listen(0, "0.0.0.0", () => r()));
  port = (server.address() as AddressInfo).port;
});
afterAll(() => server.close());
const local = (p: string, b?: unknown) => fetch(`http://127.0.0.1:${port}${p}`, b === undefined ? undefined
  : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) }).then((r) => r.json());

describe("C-31: what an AWAY daemon holds", () => {
  it("is read from the save and named as the game names it", () => {
    const d = readSave(new Uint8Array(require("node:fs").readFileSync(savePath))).party[0];
    expect(d.heldItem).toBe(375);
    expect(d.holding).toBe("OPUS");
  });
  it("travels to the device with it", async () => {
    expect((await local("/api/device/state")).daemon.holding).toBe("OPUS");
  });
});

describe("C-13: using the device is tending the daemon", () => {
  it("keeps each use", async () => {
    const r = await local("/api/device/interact", { kind: "routine", detail: "FLARE/POWER" });
    expect(r.last.kind).toBe("routine");
    expect(r.last.detail).toBe("FLARE/POWER");
  });
});

describe("C-29, reviewed: settings say whether the file is a save", () => {
  it("a real save is valid; a file of zeroes is not", async () => {
    expect((await local("/api/settings")).valid).toBe(true);
    const bad = await local("/api/settings", { savePath: junk });
    expect(bad.exists).toBe(true);
    expect(bad.valid).toBe(false);
    await local("/api/settings", { savePath: "" });
  });
});

describe("on the network, only the device's door answers", () => {
  const lan = Object.values(networkInterfaces()).flat().find((i) => i && i.family === "IPv4" && !i.internal)?.address;
  it.skipIf(!lan)("refuses settings and SYNC from another address, and serves the device", async () => {
    const from = (p: string, b?: unknown) => fetch(`http://${lan}:${port}${p}`, b === undefined ? undefined
      : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });
    expect((await from("/api/settings")).status).toBe(403);
    expect((await from("/api/sync", {})).status).toBe(403);
    expect((await from("/api/settings/pick", {})).status).toBe(403);
    expect((await from("/api/device/state")).status).toBe(200);
  });

  it.skipIf(!lan)("answers a paired phone everywhere but what only the Mac may do (C-53)", async () => {
    const { code } = await local("/api/pair/code", {});
    const from = (p: string, b?: unknown, token?: string) => fetch(`http://${lan}:${port}${p}`, {
      method: b === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: b === undefined ? undefined : JSON.stringify(b) });
    const { token } = await (await from("/api/pair", { code, name: "test phone" })).json();
    expect((await from("/api/settings", undefined, token)).status).toBe(200);
    expect((await from("/api/goal", undefined, token)).status).toBe(200);
    expect((await from("/api/settings/pick", {}, token)).status).toBe(403);
    expect((await from("/api/pair/code", {}, token)).status).toBe(403);
    expect((await from("/api/settings", undefined, "not-a-key")).status).toBe(403);
  });
});
