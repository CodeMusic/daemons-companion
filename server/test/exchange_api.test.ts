// C-218, C-219: THE EXCHANGE over HTTP -- the hub's own companion joins with no invite, another's only with one, and an
// address that keeps guessing is paused; TRADE with no hub named asks for one; a hub's address is checked.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeServer } from "../src/api.js";
import { DEFAULTS } from "../src/config.js";
import { Store } from "../src/db.js";
import { setHub, tradeRoute } from "../src/tradelink.js";
import { buildSave } from "./build_save.js";

const dir = mkdtempSync(join(tmpdir(), "companion-exchange-"));
const savePath = join(dir, "copy.sav");
writeFileSync(savePath, buildSave({ player: "ROVER", trainerId: 7,
  slots: [{ counter: 1, party: [{ personality: 99, otId: 7, species: 1, nickname: "PIP", level: 5 }] }, { counter: 0, party: [] }] }));
const server = makeServer({ ...DEFAULTS, database: ":memory:", savePath, edition: "CONTENT" as const });
let base = "";
beforeAll(async () => {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());
const post = (p: string, b: unknown) =>
  fetch(base + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });

describe("the exchange over HTTP", () => {
  it("joins the hub's own player, and another only with an invite; a guesser is paused", async () => {
    expect((await (await post("/api/trade/join", { name: "ROVER" })).json()).player).toMatchObject({ name: "ROVER" });
    expect((await post("/api/exchange/me", {})).status).toBe(401);
    for (let i = 0; i < 8; i++) expect((await post("/api/exchange/join", { name: "KIT", code: `WRONG${i}` })).status).toBe(400);
    const { code } = await (await post("/api/exchange/invite", {})).json();
    const paused = await post("/api/exchange/join", { name: "KIT", code });
    expect(paused.status).toBe(429);                                   // even a right code waits once the tries are spent
  });

  it("names a hub only by its address, and forgets the old token when it changes", () => {
    const s = new Store(":memory:");
    s.setSetting("trade.token", "old");
    expect(setHub(s, "coremp135")).toMatch(/http/);
    expect(setHub(s, "http://coremp135:4730/")).toEqual({ hub: "http://coremp135:4730" });
    expect(s.getSetting("trade.token")).toBeNull();
    expect(setHub(s, "")).toEqual({ hub: "" });
    expect(s.getSetting("trade.hub")).toBeNull();
  });

  it("with no hub in reach, TRADE asks for one and nothing else", async () => {
    const s = new Store(":memory:");
    const r = await tradeRoute(null, s, null, "CONTENT", "GET", "/api/trade", {});
    expect(r.body).toMatchObject({ needsHub: true, me: null, hub: null });
    expect((await tradeRoute(null, s, null, "CONTENT", "POST", "/api/trade/offer", { personality: 1 })).body).toMatchObject({ error: /hub's address/ });
  });
});
