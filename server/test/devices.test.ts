import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { makeServer } from "../src/api.js";
import { DEFAULTS } from "../src/config.js";
import { kindOf, validDeviceId } from "../src/devices.js";

const server = makeServer({ ...DEFAULTS, database: ":memory:", savePath: null });
let base = "";
beforeAll(async () => {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());
const as = (id: string) => ({ "content-type": "application/json", "x-device": id });

describe("every device by its own name (C-80)", () => {
  it("knows a board's kind from its id, and refuses a name that is not one", () => {
    expect(kindOf("t-embed-cc1101-36f484")).toBe("t-embed-cc1101");
    expect(kindOf("t-watch-s3-a1b2c3")).toBe("t-watch-s3");
    expect(validDeviceId("t-embed-cc1101-36f484")).toBe(true);
    for (const bad of ["", "x", "../etc", "T-EMBED", "a b c", 7]) expect(validDeviceId(bad)).toBe(false);
  });

  it("keeps each device that asks, how it came, its firmware and its battery", async () => {
    await fetch(base + "/api/device/state?via=usb", { headers: as("t-embed-cc1101-36f484") });
    await fetch(base + "/api/device/state?via=wifi", { headers: as("t-watch-s3-a1b2c3") });   // a watch on the Wi-Fi
    await fetch(base + "/api/device/battery", { method: "POST", headers: as("t-watch-s3-a1b2c3"),
                                               body: JSON.stringify({ percent: 61, mv: 3900, charging: false, usb: false }) });
    await fetch(base + "/api/device/routines", { method: "POST", headers: as("t-embed-cc1101-36f484"),
                                                body: JSON.stringify({ types: [], firmware: "3" }) });
    const { devices } = await fetch(base + "/api/devices").then((r) => r.json());
    const byId = Object.fromEntries(devices.map((d: any) => [d.id, d]));
    expect(byId["t-embed-cc1101-36f484"]).toMatchObject({ kind: "t-embed-cc1101", via: "usb", firmware: "3", here: true });
    expect(byId["t-watch-s3-a1b2c3"]).toMatchObject({ kind: "t-watch-s3", via: "wifi", battery: { percent: 61 } });
    const link = await fetch(base + "/api/device/link").then((r) => r.json());
    expect(link.devices).toHaveLength(2);                                     // the site's DEVICE tab sees them
  });

  it("ignores a request that names no device, and forgets one on the site's word", async () => {
    await fetch(base + "/api/device/state");
    expect((await fetch(base + "/api/devices").then((r) => r.json())).devices).toHaveLength(2);
    const r = await fetch(base + "/api/devices/forget", { method: "POST", headers: { "content-type": "application/json" },
                                                          body: JSON.stringify({ id: "t-watch-s3-a1b2c3" }) }).then((x) => x.json());
    expect(r.devices.map((d: any) => d.id)).toEqual(["t-embed-cc1101-36f484"]);
  });
});

describe("who answers when you talk (C-66)", () => {
  it("is auto until chosen, takes local or openrouter, and refuses anything else", async () => {
    const get = () => fetch(base + "/api/talk/settings").then((r) => r.json());
    const set = (provider: string) => fetch(base + "/api/talk/settings", { method: "POST", headers: { "content-type": "application/json" },
                                                                          body: JSON.stringify({ provider }) });
    expect((await get()).provider).toBe("auto");
    expect((await set("local")).status).toBe(200);
    expect((await get()).provider).toBe("local");
    expect((await set("somewhere")).status).toBe(400);
    expect((await get()).provider).toBe("local");
  });
});
