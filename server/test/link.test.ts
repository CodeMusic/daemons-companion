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
    expect(s).toEqual({ home: "daemon", sleepAfter: 120, sound: true, volume: 40, ring: 33, meet: true,   // meet: C-15
                        palette: "checkpoint" });                                                       // C-90
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

describe("the phone carries the board's link over Bluetooth (C-55)", () => {
  it("is linked by the phone only with a paired phone's key, and never hands it a Wi-Fi password", async () => {
    const { code } = (await post("/api/pair/code", {})).json;
    const { token } = (await post("/api/pair", { code, name: "carrier" })).json;
    const auth = { authorization: `Bearer ${token}` };
    await fetch(base + "/api/device/state?via=phone");                                   // no key: not the phone
    expect((await get("/api/device/link")).via).not.toBe("phone");
    await fetch(base + "/api/device/state?via=phone", { headers: auth });
    expect((await get("/api/device/link")).via).toBe("phone");
    await post("/api/device/wifi", { ssid: "home", password: "secret" });
    const { commands } = await fetch(base + "/api/device/commands?via=phone", { headers: auth }).then((r) => r.json());
    expect(commands.some((c: any) => c.type === "wifi")).toBe(false);
  });
});

describe("the companion from anywhere, through the user's n8n (C-56)", () => {
  it("answers a relayed request only with the relay's secret and a paired phone's key", async () => {
    const { secret } = await get("/api/settings/relay");
    const { code } = (await post("/api/pair/code", {})).json;
    const { token } = (await post("/api/pair", { code, name: "far away" })).json;
    const relay = (p: string, h: Record<string, string>, b?: unknown) => fetch(base + p, b === undefined ? { headers: h }
      : { method: "POST", headers: { "content-type": "application/json", ...h }, body: JSON.stringify(b) }).then((r) => r.status);
    expect(await relay("/api/today", { "x-companion-relay": "guess", authorization: `Bearer ${token}` })).toBe(403);
    expect(await relay("/api/device/state", { "x-companion-relay": secret })).toBe(401);        // not even the device's door
    expect(await relay("/api/today", { "x-companion-relay": secret, authorization: `Bearer ${token}` })).toBe(200);
    expect(await relay("/api/settings/relay", { "x-companion-relay": secret, authorization: `Bearer ${token}` })).toBe(403);
    expect(await relay("/api/pair", { "x-companion-relay": secret }, { code: "123456" })).toBe(401);
  });

  it("keeps the relay's address for the phones, and only an https one", async () => {
    expect((await post("/api/settings/relay", { url: "http://plain.example" })).status).toBe(400);
    expect((await post("/api/settings/relay", { url: "https://n8n.example/webhook/companion" })).json.url)
      .toBe("https://n8n.example/webhook/companion");
    expect((await get("/api/settings/away")).url).toBe("https://n8n.example/webhook/companion");
    const before = (await get("/api/settings/relay")).secret;
    expect((await post("/api/settings/relay", { renew: true })).json.secret).not.toBe(before);
  });
});

describe("the pictures, as JSON, so they cross the relay (C-59)", () => {
  it("gives every species the INDEX draws in one answer, and one by itself", async () => {
    const { species } = await get("/api/art?all=species");
    const ids = Object.keys(species);
    expect(ids.length).toBeGreaterThan(300);
    expect(species[ids[0]].startsWith("iVBOR")).toBe(true);                    // a PNG, base64
    expect((await get(`/api/art?species=${ids[0]}`)).png).toBe(species[ids[0]]);
    expect((await fetch(base + "/api/art")).status).toBe(400);
  });
});

describe("renaming a remote (C-59)", () => {
  it("sends the board a plain name of at most sixteen letters, and refuses an empty one", async () => {
    const { id } = (await post("/api/device/remote", { op: "rename", index: 0, name: "  Living room TV, the big one\u0007 " })).json;
    const { commands } = await get("/api/device/commands?via=usb");
    expect(commands.find((c: any) => c.id === id)).toMatchObject({ type: "remote", op: "rename", index: 0, name: "Living room TV," });
    expect((await post("/api/device/remote", { op: "rename", index: 0, name: "\u0007" })).status).toBe(400);
  });
});

describe("meeting others nearby (C-15)", () => {
  it("keeps a meeting once an hour per tag, never one of our own, and SYNC is what writes it", async () => {
    expect((await post("/api/device/beacon", { peer: "0badf00d" })).status).toBe(200);          // the board's own tag
    expect((await post("/api/device/met", { species: "25", peer: "0badf00d" })).json).toMatchObject({ counted: false, why: "one of yours" });
    expect((await post("/api/device/met", { species: "25", peer: "12345678" })).json).toMatchObject({ counted: true });
    expect((await post("/api/device/met", { species: "25", peer: "12345678" })).json).toMatchObject({ counted: false });
    expect((await post("/api/device/met", { species: "99999", peer: "abcdef01" })).status).toBe(400);
    expect((await post("/api/device/met", { species: "25", peer: "not-hex!" })).status).toBe(400);
  });

  it("shows who was met, newest first, not yet written until a SYNC writes it, and never our own (C-60)", async () => {
    const m = await get("/api/meetings");
    expect(m.meetings).toHaveLength(1);
    expect(m.meetings[0]).toMatchObject({ species: 25, written: false });
    expect(typeof m.meetings[0].name).toBe("string");
    expect(m.heardOurs).toMatchObject({ peer: "0badf00d" });
    await post("/api/device/listen", { started: true, devices: 57, beacons: 1 });
    expect((await get("/api/meetings")).lastListen).toMatchObject({ started: true, devices: 57, beacons: 1 });
  });
});
