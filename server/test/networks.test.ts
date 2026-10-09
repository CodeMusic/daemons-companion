import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { makeServer } from "../src/api.js";
import { DEFAULTS } from "../src/config.js";
import { Store } from "../src/db.js";
import { SharedNetworks } from "../src/networks.js";

describe("one list of networks for every device (C-93)", () => {
  it("learns a network once, and a new password replaces the old", () => {
    const n = new SharedNetworks(new Store(":memory:"));
    n.learn("HOME", "one"); n.learn("HOME", "two"); n.learn("CAFE", "latte");
    expect(n.full().shared).toEqual([{ ssid: "HOME", password: "two" }, { ssid: "CAFE", password: "latte" }]);
    expect(n.names().networks).toEqual(["HOME", "CAFE"]);
  });

  it("adds what a device reports that the list has not seen", () => {
    const n = new SharedNetworks(new Store(":memory:"));
    n.learn("HOME", "one");
    n.merge([{ ssid: "HOME", password: "stale" }, { ssid: "HOTSPOT", password: "phone" }], []);
    expect(n.full().shared).toEqual([{ ssid: "HOME", password: "one" }, { ssid: "HOTSPOT", password: "phone" }]);
  });

  it("does not let a board that has not heard yet bring a forgotten network back", () => {
    const n = new SharedNetworks(new Store(":memory:"));
    n.learn("OLD", "x");
    n.forget("OLD");
    n.merge([{ ssid: "OLD", password: "x" }], []);
    expect(n.full()).toMatchObject({ shared: [], forget: ["OLD"] });
  });

  it("but one learned again on a device comes back, with that password", () => {
    const n = new SharedNetworks(new Store(":memory:"));
    n.learn("OLD", "x"); n.forget("OLD");
    n.merge([{ ssid: "OLD", password: "new", fresh: true }], []);
    expect(n.full()).toMatchObject({ shared: [{ ssid: "OLD", password: "new" }], forget: [] });
  });

  it("forgets everywhere what a device forgot, and moves the revision on each change only", () => {
    const n = new SharedNetworks(new Store(":memory:"));
    n.learn("HOME", "one");
    const r = n.rev();
    n.learn("HOME", "one");
    expect(n.rev()).toBe(r);
    n.merge([], ["HOME"]);
    expect(n.full()).toMatchObject({ shared: [], forget: ["HOME"] });
    expect(n.rev()).toBe(r + 1);
  });

  it("keeps the newest eight, as a board does", () => {
    const n = new SharedNetworks(new Store(":memory:"));
    for (let i = 1; i <= 10; i++) n.learn(`NET${i}`, "p");
    expect(n.names().networks).toEqual(["NET3", "NET4", "NET5", "NET6", "NET7", "NET8", "NET9", "NET10"]);
  });
});

describe("the shared networks through the API (C-93)", () => {
  const server = makeServer({ ...DEFAULTS, database: ":memory:" });
  let base = "";
  beforeAll(async () => {
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => server.close());
  const post = (p: string, b: unknown, headers: Record<string, string> = {}) =>
    fetch(base + p, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(b) })
      .then(async (r) => ({ status: r.status, json: await r.json() }));
  const get = (p: string) => fetch(base + p).then((r) => r.json());

  it("takes one board's network down the cable and hands it to the next", async () => {
    const a = await post("/api/device/networks", { networks: ["HOME"], current: "HOME",
                                                   known: [{ ssid: "HOME", password: "secret", fresh: true }] });
    expect(a.json.shared).toEqual([{ ssid: "HOME", password: "secret" }]);
    const b = await post("/api/device/networks", { networks: [], current: "", known: [] });
    expect(b.json.shared).toEqual([{ ssid: "HOME", password: "secret" }]);
  });

  it("shows the site names only, and says in a device's state when the list changed", async () => {
    const before = (await get("/api/device/state")).netsRev;
    expect(await get("/api/networks")).toMatchObject({ networks: ["HOME"] });
    expect(JSON.stringify(await get("/api/networks"))).not.toContain("secret");
    await post("/api/networks", { ssid: "CAFE", password: "latte" });
    expect((await get("/api/device/state")).netsRev).toBe(before + 1);
    expect((await get("/api/device/link")).shared).toEqual(["HOME", "CAFE"]);
  });

  it("forgets from the site for every device", async () => {
    await post("/api/networks", { op: "forget", ssid: "CAFE" });
    const r = await post("/api/device/networks", { networks: ["HOME", "CAFE"], current: "",
                                                   known: [{ ssid: "CAFE", password: "latte" }] });
    expect(r.json).toMatchObject({ shared: [{ ssid: "HOME", password: "secret" }], forget: ["CAFE"] });
  });

  it("never hands a password over the phone's Bluetooth", async () => {
    const { code } = (await post("/api/pair/code", {})).json;
    const { token } = (await post("/api/pair", { code, name: "test phone" })).json;
    const r = await post("/api/device/networks?via=phone", { networks: [], known: [{ ssid: "X", password: "y", fresh: true }] },
                         { authorization: `Bearer ${token}` });
    expect(r.json.shared).toBeUndefined();
    expect((await get("/api/networks")).networks).not.toContain("X");
  });
});
