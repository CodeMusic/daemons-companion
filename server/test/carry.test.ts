// C-80: a daemon in each device -- which device carries which daemon, kept by personality, chosen in the app and the
// site. On synthetic saves built as the game builds them; never the user's own.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeServer } from "../src/api.js";
import { assign, carriedFor, carryView } from "../src/carry.js";
import { DEFAULTS } from "../src/config.js";
import { Store } from "../src/db.js";
import { buildSave } from "./build_save.js";

const PIP = { personality: 0x12345678, otId: 0x00ab1234, species: 1, nickname: "PIP", level: 12, away: true };
const LABEL = { personality: 0x0000002f, otId: 0x00ab1234, species: 4, nickname: "LABEL", level: 9, away: true };
const HOME = { personality: 0x00000777, otId: 0x00ab1234, species: 7, nickname: "STAY", level: 5 };
const CC = "t-embed-cc1101-36f484", WATCH = "t-watch-s3-a1b2c3", STICK = "m5-sticks3-0a0b0c";

describe("which device carries which daemon (carry.ts)", () => {
  const away = [{ personality: 1 }, { personality: 2 }];
  it("gives a device that asks the first daemon no other device has, and keeps it", () => {
    const store = new Store(":memory:");
    expect(carriedFor(store, away, CC)?.personality).toBe(1);
    expect(carriedFor(store, away, WATCH)?.personality).toBe(2);
    expect(carriedFor(store, away, STICK)).toBeNull();                       // two away, three devices: one goes without
    expect(carriedFor(store, away, CC)?.personality).toBe(1);               // and it stays
  });
  it("with no device named, answers with the first away, as before", () => {
    expect(carriedFor(new Store(":memory:"), away, "")?.personality).toBe(1);
  });
  it("moves a daemon to the device chosen, leaving the one that had it", () => {
    const store = new Store(":memory:");
    carriedFor(store, away, CC); carriedFor(store, away, WATCH);
    assign(store, WATCH, 1);
    expect(carryView(store, away).byDevice[WATCH].personality).toBe(1);
    expect(carryView(store, away).byDevice[CC]).toBeUndefined();
    expect(carryView(store, away).unplaced.map((d) => d.personality)).toEqual([2]);
    expect(carriedFor(store, away, CC)?.personality).toBe(2);               // CC asks again: the one left
  });
  it("lets a device go empty, and forgets a daemon that came home", () => {
    const store = new Store(":memory:");
    carriedFor(store, away, CC);
    assign(store, CC, null);
    expect(carryView(store, away).byDevice[CC]).toBeUndefined();
    assign(store, CC, 2);
    expect(carryView(store, [{ personality: 1 }]).byDevice[CC]).toBeUndefined();   // 2 is home now
  });
});

describe("a daemon in each device, through the API (C-80)", () => {
  const save = buildSave({ player: "ROVER", trainerId: 0x00ab1234,
    slots: [{ counter: 1, party: [PIP, LABEL, HOME] }, { counter: 2, party: [PIP, LABEL, HOME] }] });
  const path = join(mkdtempSync(join(tmpdir(), "carry-")), "copy.sav");
  writeFileSync(path, save);
  const server = makeServer({ ...DEFAULTS, database: ":memory:", savePath: path });
  let base = "";
  beforeAll(async () => {
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => server.close());
  const as = (id: string) => ({ "content-type": "application/json", "x-device": id });
  const stateOf = (id: string) => fetch(base + "/api/device/state?via=wifi", { headers: as(id) }).then((r) => r.json());

  it("answers each device with its own daemon", async () => {
    expect((await stateOf(CC)).daemon.nickname).toBe("PIP");
    expect((await stateOf(WATCH)).daemon.nickname).toBe("LABEL");
    expect((await stateOf(STICK)).daemon).toBeNull();                       // STAY is home: nothing for a third
  });

  it("lists the devices with what each carries, and puts a daemon where the site says", async () => {
    let v = await fetch(base + "/api/devices").then((r) => r.json());
    const carries = (id: string) => v.devices.find((d: any) => d.id === id)?.daemon?.nickname ?? null;
    expect([carries(CC), carries(WATCH), carries(STICK)]).toEqual(["PIP", "LABEL", null]);
    expect(v.away.map((d: any) => d.nickname)).toEqual(["PIP", "LABEL"]);
    v = await fetch(base + "/api/devices/carry", { method: "POST", headers: { "content-type": "application/json" },
                                                   body: JSON.stringify({ id: STICK, personality: PIP.personality }) }).then((r) => r.json());
    expect([carries(CC), carries(STICK)]).toEqual([null, "PIP"]);
    expect((await stateOf(STICK)).daemon.nickname).toBe("PIP");
    expect((await stateOf(CC)).daemon).toBeNull();                          // LABEL is the watch's; nothing is free
  });

  it("refuses a daemon that is not away, or a name that is not a device", async () => {
    const post = (b: unknown) => fetch(base + "/api/devices/carry", { method: "POST", headers: { "content-type": "application/json" },
                                                                    body: JSON.stringify(b) });
    expect((await post({ id: CC, personality: HOME.personality })).status).toBe(400);
    expect((await post({ id: "../x", personality: PIP.personality })).status).toBe(400);
    expect((await post({ id: CC, personality: null })).status).toBe(200);
  });
});

describe("a board away from home, through the relay with its own key (C-82)", () => {
  const save = buildSave({ player: "ROVER", trainerId: 0x00ab1234,
    slots: [{ counter: 1, party: [PIP, LABEL] }, { counter: 2, party: [PIP, LABEL] }] });
  const path = join(mkdtempSync(join(tmpdir(), "relay-")), "copy.sav");
  writeFileSync(path, save);
  const store = new Store(":memory:");
  const server = makeServer({ ...DEFAULTS, database: ":memory:", savePath: path }, store);
  let base = "", secret = "";
  beforeAll(async () => {
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    store.setSetting("relay.url", "https://relay.example/webhook/companion");
    secret = (await fetch(base + "/api/settings/relay").then((r) => r.json())).secret;
  });
  afterAll(() => server.close());
  const relayed = (key: string, p: string) => fetch(base + p, { headers: { authorization: `Bearer ${key}`, "x-companion-relay": secret } });

  it("hands a board its key down the cable, and never over the Wi-Fi", async () => {
    const wifi = await fetch(base + "/api/device/state?via=wifi", { headers: { "x-device": CC } }).then((r) => r.json());
    expect(wifi.away).toBeUndefined();
    const usb = await fetch(base + "/api/device/state?via=usb", { headers: { "x-device": CC } }).then((r) => r.json());
    expect(usb.away.url).toBe("https://relay.example/webhook/companion");
    expect(usb.away.key.length).toBeGreaterThanOrEqual(16);
  });

  it("knows the board by its key through the relay, and opens the device's door only", async () => {
    const { away } = await fetch(base + "/api/device/state?via=usb", { headers: { "x-device": WATCH } }).then((r) => r.json());
    const st = await relayed(away.key, "/api/device/state").then((r) => r.json());
    expect(st.daemon.nickname).toBe("LABEL");                                // the watch's own (PIP went to the CC1101)
    const devs = await fetch(base + "/api/devices").then((r) => r.json());
    expect(devs.devices.find((d: any) => d.id === WATCH).via).toBe("relay");
    expect((await relayed(away.key, "/api/goals")).status).toBe(403);        // not the device's door
    expect((await relayed("not-a-key-at-all-000000", "/api/device/state")).status).toBe(401);
  });

  it("knows the Tab5 through the relay by its paired key and ?device=, and answers with its own daemon (C-77)", async () => {
    store.addPhone("tab5-key-0123456789abcdef", "Tab5 a1b2c3");
    const TAB5 = "m5-tab5-a1b2c3";
    const st = await relayed("tab5-key-0123456789abcdef", `/api/device/state?device=${TAB5}`).then((r) => r.json());
    expect(st.daemon).toBeNull();                                            // PIP and LABEL are the other two's
    const devs = await fetch(base + "/api/devices").then((r) => r.json());
    expect(devs.devices.find((d: any) => d.id === TAB5)).toMatchObject({ kind: "m5-tab5", via: "relay" });
    expect((await relayed("tab5-key-0123456789abcdef", "/api/goals")).status).toBe(200);   // a paired key: the whole API
  });

  it("stops a forgotten board's key", async () => {
    const { away } = await fetch(base + "/api/device/state?via=usb", { headers: { "x-device": STICK } }).then((r) => r.json());
    expect((await relayed(away.key, "/api/device/state")).status).toBe(200);
    await fetch(base + "/api/devices/forget", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: STICK }) });
    expect((await relayed(away.key, "/api/device/state")).status).toBe(401);
  });
});

describe("a daemon away stays away when the game puts it in the PC (C-103)", () => {
  // the user, 2026-10-10: five away, put in the PC in the game, more caught and sent -- after SYNC only the new ones
  // were out. The away bit is in the record the PC keeps, so a boxed daemon is read as away as well.
  const NEW = { personality: 0x00000101, otId: 0x00ab1234, species: 7, nickname: "NEWBIE", level: 4, away: true };
  const save = buildSave({ player: "ROVER", trainerId: 0x00ab1234,
    slots: [{ counter: 1, party: [NEW, HOME] }, { counter: 2, party: [NEW, HOME] }],
    boxes: [{ ...PIP, exp: 2000 }, { ...HOME, personality: 0x00000999, nickname: "BOXED" }, { ...LABEL, exp: 500 }] });
  const path = join(mkdtempSync(join(tmpdir(), "boxed-")), "copy.sav");
  writeFileSync(path, save);
  const server = makeServer({ ...DEFAULTS, database: ":memory:", savePath: path });
  let base = "";
  beforeAll(async () => {
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => server.close());

  it("lists every daemon away, the party's and the boxes', and not one only put away", async () => {
    const v = await fetch(base + "/api/devices").then((r) => r.json());
    expect(v.away.map((d: any) => d.nickname)).toEqual(["NEWBIE", "PIP", "LABEL"]);
    const pip = v.away.find((d: any) => d.nickname === "PIP");
    expect(pip.slot).toBeGreaterThanOrEqual(100);                           // a box's, past any party slot
    expect(pip.level).toBeGreaterThan(1);                                    // read from its experience
  });

  it("puts a boxed daemon in a device, with its picture", async () => {
    const r = await fetch(base + "/api/devices/carry", { method: "POST", headers: { "content-type": "application/json" },
                                                        body: JSON.stringify({ id: CC, personality: PIP.personality }) });
    expect(r.status).toBe(200);
    const state = await fetch(base + "/api/device/state?via=wifi", { headers: { "x-device": CC } }).then((r) => r.json());
    expect(state.daemon.nickname).toBe("PIP");
    expect((await fetch(base + "/api/device/art", { headers: { "x-device": CC } })).status).toBe(200);
    expect((await fetch(base + state.daemon.art)).status).toBe(200);
  });
});
