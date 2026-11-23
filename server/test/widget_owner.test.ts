// The user, 2026-11-16: YOUR DEVICES had four rows reading "This phone's widget", one with a watch's firmware on it.
// Each widget is kept beside the paired phone it is on; only the asker's own is its own; a widget shows no firmware.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { makeServer } from "../src/api.js";
import { DEFAULTS } from "../src/shared/config.js";

const server = makeServer({ ...DEFAULTS, database: ":memory:" });
let base = "";
beforeAll(async () => {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => { server.close(); });
const post = (p: string, b: unknown, h: Record<string, string> = {}) =>
  fetch(base + p, { method: "POST", headers: { "content-type": "application/json", ...h }, body: JSON.stringify(b) }).then((r) => r.json());
const pair = async (name: string) => (await post("/api/pair", { code: (await post("/api/pair/code", {})).code, name })).token as string;
const as = (token: string, p: string) => fetch(base + p, { headers: { authorization: `Bearer ${token}` } }).then((r) => r.json());

describe("each widget named for its phone", () => {
  it("keeps the phone a widget is on, says which is the asker's own, and shows no firmware on a widget", async () => {
    const mine = await pair("Rover's phone"), theirs = await pair("the iPad");
    await as(mine, "/api/device/state?via=wifi&device=iphone-widget-aaaaaa");
    await as(theirs, "/api/device/state?via=wifi&device=iphone-widget-bbbbbb");
    // a board's report filed under a widget (the bridge before C-392) is not shown on it
    await as(mine, "/api/device/state?via=phone&device=iphone-widget-aaaaaa");
    await fetch(base + "/api/device/hello?device=iphone-widget-aaaaaa", { method: "POST", headers: { "content-type": "application/json",
      authorization: `Bearer ${mine}`, "x-device": "iphone-widget-aaaaaa" }, body: JSON.stringify({ firmware: "t-watch-ultra 3 e4a212d" }) });
    const { devices } = await as(mine, "/api/devices?device=iphone-widget-aaaaaa");
    const a = devices.find((d: any) => d.id === "iphone-widget-aaaaaa"), b = devices.find((d: any) => d.id === "iphone-widget-bbbbbb");
    expect(a).toMatchObject({ owner: "Rover's phone", mine: true, firmware: null, battery: null });
    expect(b).toMatchObject({ owner: "the iPad", mine: false });
  });
});
