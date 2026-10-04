import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { makeServer } from "../src/api.js";
import { DeviceHub } from "../src/device.js";
import { DEFAULTS } from "../src/config.js";

const hub = new DeviceHub();
const server = makeServer({ ...DEFAULTS, database: ":memory:" }, undefined, hub);
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

const ROUTINES = { firmware: "t-embed 1", types: [
  { name: "FLARE", radio: "IR", routines: ["SONY TV POWER"] },
  { name: "UPLINK", radio: "Wi-Fi", routines: ["NETWORKS IN RANGE"] }] };

describe("the site and the device, linked (C-32)", () => {
  it("is not linked until the device is seen, then says by which way", async () => {
    expect((await get("/api/device/link")).linked).toBe(false);
    await get("/api/device/state?via=usb");
    const l = await get("/api/device/link");
    expect([l.linked, l.via]).toEqual([true, "usb"]);
  });

  it("knows the device's routines from the device itself", async () => {
    await post("/api/device/routines", ROUTINES);
    const l = await get("/api/device/link");
    expect(l.routines.map((t: any) => t.name)).toEqual(["FLARE", "UPLINK"]);
    expect(l.firmware).toBe("t-embed 1");
  });

  it("runs only a routine the device has", async () => {
    expect((await post("/api/device/run", { routine: "FLARE/NOT A ROUTINE" })).status).toBe(400);
    expect((await post("/api/device/run", { routine: "FLARE/SONY TV POWER" })).status).toBe(200);
  });

  it("hands each command to the device once, and keeps its result for the site", async () => {
    const { commands } = await get("/api/device/commands?via=usb");
    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({ type: "run", routine: "FLARE/SONY TV POWER" });
    expect((await get("/api/device/commands?via=usb")).commands).toHaveLength(0);
    await post("/api/device/results", { id: commands[0].id, ok: true, text: "Sent a Sony TV's POWER." });
    expect((await get("/api/device/link")).results[0]).toMatchObject({ id: commands[0].id, ok: true });
  });
});

describe("a Wi-Fi password only goes down the cable (C-33)", () => {
  it("is never handed to a device asking over the network", () => {
    const h = new DeviceHub();
    h.send({ type: "wifi", ssid: "home", password: "secret" });
    h.send({ type: "run", routine: "UPLINK/NETWORKS IN RANGE" });
    expect(h.take("wifi").map((c) => c.type)).toEqual(["run"]);
    expect(h.take("usb").map((c) => c.type)).toEqual(["wifi"]);
  });

  it("refuses a Wi-Fi command without a name", async () => {
    expect((await post("/api/device/wifi", { ssid: "", password: "x" })).status).toBe(400);
  });
});

describe("FLARE without the remote (C-34, C-51)", () => {
  it("offers whole remotes by brand, Sony first, each with its three buttons", async () => {
    const brands = await get("/api/ir/brands");
    expect(brands[0].brand).toBe("Sony");
    expect(brands[0].sets[0]).toMatchObject({ protocol: "SONY", bits: 12, power: "0xA90", volumeUp: "0x490", volumeDown: "0xC90" });
    for (const b of brands) for (const s of b.sets) for (const k of ["power", "volumeUp", "volumeDown"]) expect(s[k]).toMatch(/^0x[0-9A-F]+$/);
  });

  it("sends the board a brand's whole remote to keep, and refuses one not in the table", async () => {
    expect((await post("/api/device/remote", { op: "add", brand: "Sony", label: "NOPE" })).status).toBe(400);
    expect((await post("/api/device/remote", { op: "add", brand: "Sony", label: "SONY" })).status).toBe(200);
    const { commands } = await get("/api/device/commands?via=usb");
    expect(commands[0]).toMatchObject({ type: "remote", op: "add", name: "SONY" });
    expect(commands[0].buttons.map((b: any) => b.code)).toEqual(["0xA90", "0x490", "0xC90"]);
  });

  it("knows the board's remotes as it reports them", async () => {
    await post("/api/device/remotes", { active: 1, remotes: [{ name: "REMOTE 1", buttons: [true, false, false] }, { name: "SONY", buttons: [true, true, true] }] });
    expect((await get("/api/device/link")).remotes.active).toBe(1);
  });

  it("queues a code to try, and refuses one without its protocol", async () => {
    expect((await post("/api/device/ir", { code: "0xA90", bits: 12 })).status).toBe(400);
    expect((await post("/api/device/ir", { protocol: "SONY", code: "0xA90", bits: 12, repeat: 2 })).status).toBe(200);
  });
});

describe("the networks the board has learned (C-52)", () => {
  it("knows them by name only, and asks the board to forget one", async () => {
    await post("/api/device/networks", { networks: ["home", "studio"], current: "home" });
    const l = await get("/api/device/link");
    expect([l.networks, l.currentNetwork]).toEqual([["home", "studio"], "home"]);
    expect((await post("/api/device/network", { op: "forget" })).status).toBe(400);
    const id = (await post("/api/device/network", { op: "forget", index: 1 })).json.id;
    expect((await get("/api/device/commands?via=wifi")).commands.find((c: any) => c.id === id)).toMatchObject({ type: "network", index: 1 });
  });
});

describe("the board's settings, set on the site (C-43)", () => {
  it("starts at the daemon, sleeps after two minutes, and carries them in the state", async () => {
    const s = await get("/api/device/settings");
    expect(s).toEqual({ home: "daemon", sleepAfter: 120, sound: true, volume: 40, ring: 33 });
    expect((await get("/api/device/state")).settings).toEqual(s);
  });

  it("changes one at a time and refuses what the board cannot do", async () => {
    expect((await post("/api/device/settings", { sound: false })).json).toMatchObject({ sound: false, home: "daemon" });
    expect((await post("/api/device/settings", { home: "routines" })).status).toBe(400);
    expect((await post("/api/device/settings", { volume: 101 })).status).toBe(400);
    expect((await get("/api/device/state")).settings.sound).toBe(false);
  });
});

describe("pairing a phone (C-53)", () => {
  it("gives a key for the code shown on this machine, once", async () => {
    const { code } = (await post("/api/pair/code", {})).json;
    expect(code).toMatch(/^\d{6}$/);
    expect((await post("/api/pair", { code: "000000" === code ? "111111" : "000000", name: "x" })).status).toBe(403);
    const r = await post("/api/pair", { code, name: "CodeMusicai" });
    expect(r.json.token.length).toBeGreaterThan(20);
    expect((await post("/api/pair", { code, name: "again" })).status).toBe(403);      // used once
    expect((await get("/api/pair/phones")).map((p: any) => p.name)).toContain("CodeMusicai");
  });

  it("retires a code after five wrong guesses", async () => {
    const { code } = (await post("/api/pair/code", {})).json;
    const wrong = code === "123456" ? "654321" : "123456";
    for (let i = 0; i < 5; i++) await post("/api/pair", { code: wrong });
    expect((await post("/api/pair", { code })).status).toBe(403);
  });
});
