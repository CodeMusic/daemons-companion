// C-218, C-219: two games trading through one exchange -- the hub's own companion (local) and another player's
// (over the network, here a fetch that answers as api.ts does), each SYNC writing its own save. Synthetic saves only.
import { describe, expect, it } from "vitest";
import speciesJson from "../data/species.json" with { type: "json" };
import { expFor } from "../src/save/growth.js";
import { readAway, readBoxes, readSave, ORDERS } from "../src/save/reader.js";
import { syncSave } from "../src/save/writer.js";
import { arriving, describe as describeRecord, fromB64, toB64, tradeRecord } from "../src/save/trade.js";
import * as X from "../src/exchange.js";
import { afterSync, beforeSync, exchangeRoute, localLink, remoteLink, tradeRoute, type Link } from "../src/tradelink.js";
import * as core from "../src/core.js";
import { Store } from "../src/db.js";
import { buildSave, type DaemonSpec } from "./build_save.js";

const SPECIES = speciesJson as unknown as Record<string, any>;
const mon = (personality: number, otId: number, species: number, level: number, extra: Partial<DaemonSpec> = {}): DaemonSpec =>
  ({ personality, otId, species, nickname: SPECIES[String(species)].name, level, exp: expFor(SPECIES[String(species)].growth ?? 0, level), hp: 20, maxHP: 20, ...extra });
const A_ID = 0x00110007, B_ID = 0x00220009;
const saveA = () => buildSave({ player: "ROVER", trainerId: A_ID, slots: [{ counter: 4, party: [mon(1001, A_ID, 1, 12), mon(1002, A_ID, 4, 15, { away: true })] }, { counter: 3, party: [] }] });
const saveB = () => buildSave({ player: "KIT", trainerId: B_ID, slots: [{ counter: 4, party: [mon(2001, B_ID, 7, 10)] }, { counter: 3, party: [] }],
                                boxes: [mon(2002, B_ID, 1, 20, { away: true }), mon(2003, B_ID, 4, 8)] });

let n = 0;
const KEYS: X.Keys = { token: () => `tok${++n}`, hash: (t) => `h:${t}`, password: (pw) => `pw:${[...pw].reverse().join("")}`, check: (pw, kept) => kept === `pw:${[...pw].reverse().join("")}`, code: () => `CODE${++n}` };
const hostOf = (bytes: { save: Uint8Array }): core.Host => ({ edition: "CONTENT", save: { read: () => bytes.save, write: (b) => { bytes.save = b; return null; } } });
// another companion's way to the hub: a fetch answered as api.ts answers /api/exchange/*
const viaHub = (hub: Store): typeof fetch => (async (url: string, init: any) => {
  const name = String(url).split("/api/exchange/")[1], b = init.body ? JSON.parse(init.body) : {};
  const out = (body: unknown) => ({ status: 200, json: async () => JSON.parse(JSON.stringify(body)) });
  if (name === "join") return out(X.join(hub, KEYS, b));
  const p = X.playerFor(hub, KEYS, init.headers["x-daemons-player"] ?? "");
  if (!p) return out({ error: "join the exchange first" });
  if (name === "me") return out(X.players(hub).find((v) => v.id === p.id));
  return out(exchangeRoute(hub, KEYS, p, name, b));
}) as unknown as typeof fetch;

async function sync(link: Link, store: Store, bytes: { save: Uint8Array }) {
  await beforeSync(link, store, bytes.save);
  const r = core.sync(hostOf(bytes), store);
  await afterSync(link, store);
  return r;
}

describe("the save's half (save/trade.ts, writer.ts trade)", () => {
  it("reads an AWAY daemon's record, and only an AWAY one", () => {
    const t = tradeRecord(saveA(), 1002);
    expect(typeof t).toBe("object");
    if (typeof t === "string") return;
    expect(t).toMatchObject({ personality: 1002, species: 4, level: 15, otId: A_ID });
    expect(t.record.length).toBe(80);
    expect(tradeRecord(saveA(), 1001)).toMatch(/AWAY/);
    expect(tradeRecord(saveA(), 9999)).toMatch(/not in this save/);
    expect(typeof tradeRecord(saveB(), 2002)).toBe("object");       // from a box
    expect(fromB64(toB64(t.record))).toEqual(t.record);
  });

  it("writes the one coming into the slot the one going left: AWAY, its own trainer, marked for the game", () => {
    const b = tradeRecord(saveB(), 2002);
    if (typeof b === "string") throw new Error(b);
    const r = syncSave(saveA(), { link: false, trade: [{ id: "t1:swap", out: 1002, record: b.record }] });
    expect(r.traded).toEqual([{ id: "t1:swap", out: 1002, in: 2002, species: 1, nickname: SPECIES["1"].name, where: "party" }]);
    const party = readSave(r.save).party;
    expect(party.map((d) => d.personality)).toEqual([1001, 2002]);
    expect(party[1]).toMatchObject({ otId: B_ID, away: true, level: 20 });
    // the marker (unusedRibbons bit 2), sealed again under its own key
    const rec = r.save;                                              // read back through arriving's own check
    const back = tradeRecord(r.save, 2002);
    if (typeof back === "string") throw new Error(back);
    const v = new DataView(back.record.buffer), key = (2002 ^ B_ID) >>> 0, misc = ORDERS[2002 % 24].indexOf("M") * 12;
    expect(((v.getUint32(32 + misc + 8, true) ^ key) >>> 29) & 1).toBe(1);
    expect(rec.length).toBe(0x20000);
  });

  it("into a box slot too, and waits when the daemon going came home or the one coming is here already", () => {
    const a = tradeRecord(saveA(), 1002);
    if (typeof a === "string") throw new Error(a);
    const r = syncSave(saveB(), { link: false, trade: [{ id: "t1:swap", out: 2002, record: a.record }] });
    expect(r.traded[0]).toMatchObject({ where: "box", in: 1002 });
    expect(readBoxes(r.save)[0]).toMatchObject({ personality: 1002, away: true, otId: A_ID });
    expect(readBoxes(r.save)[1]).toMatchObject({ personality: 2003 });
    expect(syncSave(saveB(), { link: false, trade: [{ id: "x", out: 2003, record: a.record }] }).tradeWaits[0].why).toMatch(/home in the game/);
    expect(syncSave(saveA(), { link: false, trade: [{ id: "x", out: 1002, record: a.record }] }).tradeWaits[0].why).toMatch(/already in this save/);
    const broken = a.record.slice(); broken[40] ^= 0xff;
    expect(arriving(broken)).toBeNull();
    expect(describeRecord(broken)).toBeNull();
  });
});

describe("the exchange (C-218 players, C-219 trades)", () => {
  it("joins by invite, and the same name again only with its password", () => {
    const hub = new Store(":memory:");
    expect(X.failed(X.join(hub, KEYS, { name: "KIT", code: "NOPE" }))).toBe(true);
    const inv = X.invite(hub, KEYS);
    const kit = X.join(hub, KEYS, { name: "kit", code: inv.code, password: "secret1" });
    if (X.failed(kit)) throw new Error(kit.error);
    expect(kit.player).toMatchObject({ name: "KIT", password: true });
    expect(X.failed(X.join(hub, KEYS, { name: "KIT", code: inv.code }))).toBe(true);                 // the invite is spent, the name taken
    const again = X.join(hub, KEYS, { name: "KIT", password: "secret1" });                          // a second device
    expect(!X.failed(again) && again.player.id).toBe(kit.player.id);
    expect(JSON.stringify(hub.getSetting("exchange"))).not.toContain("secret1");                    // never the password itself
  });

  it("trades in full: both SYNCs write, a restored save cannot offer it again, and it can come back by trade", async () => {
    const hub = new Store(":memory:"), kitStore = new Store(":memory:");
    const A = { save: saveA() }, B = { save: saveB() };
    const rover = localLink(hub, KEYS), kit = remoteLink(kitStore, "http://coremp135:4730", viaHub(hub));
    await rover.join({ name: "ROVER" });                                                              // the hub's own: no invite
    expect(X.failed(await kit.join({ name: "KIT" }))).toBe(true);
    await kit.join({ name: "KIT", code: X.invite(hub, KEYS).code });
    const offered = await tradeRoute(rover, hub, A.save, "CONTENT", "POST", "/api/trade/offer", { personality: 1002, kind: "full" });
    expect(offered.status).toBe(200);
    const id = (offered.body as X.Offer).id;
    expect((await tradeRoute(rover, hub, A.save, "CONTENT", "POST", "/api/trade/offer", { personality: 1002 })).body).toMatchObject({ error: /already in a trade/ });
    const view = await tradeRoute(kit, kitStore, B.save, "CONTEXT", "GET", "/api/trade", {});
    expect((view.body as any).board.open[0]).toMatchObject({ id, from: { player: "ROVER", nickname: SPECIES["4"].name } });
    const took = await tradeRoute(kit, kitStore, B.save, "CONTEXT", "POST", "/api/trade/accept", { offer: id, personality: 2002 });
    expect(took.body).toMatchObject({ state: "agreed" });
    expect(JSON.stringify(took.body)).not.toMatch(/record|secretId/);                                // names only, never a record

    const ra = await sync(rover, hub, A), rb = await sync(kit, kitStore, B);
    expect(ra.traded).toEqual([{ nickname: SPECIES["1"].name, species: 1, where: "party" }]);
    expect(rb.traded).toEqual([{ nickname: SPECIES["4"].name, species: 4, where: "box" }]);
    expect(readAway(A.save).map((d) => d.personality)).toEqual([2002]);
    expect(readBoxes(B.save)[0].personality).toBe(1002);
    expect((await sync(rover, hub, A)).traded).toEqual([]);                                           // once
    const board = X.board(hub, X.players(hub)[0].id);
    expect(board.trades[0]).toMatchObject({ state: "done", done: true });

    // ROVER restores the old save, with 1002 still in it: refused
    const old = await tradeRoute(rover, hub, saveA(), "CONTENT", "POST", "/api/trade/offer", { personality: 1002 });
    expect(old.body).toMatchObject({ error: /traded away from this game already/ });
    // ...but KIT may trade 1002 onward, and back to ROVER's game, where it is ROVER's again
    const back = await tradeRoute(kit, kitStore, B.save, "CONTEXT", "POST", "/api/trade/offer", { personality: 1002, to: X.players(hub)[0].id });
    expect(back.status).toBe(200);
    expect((await tradeRoute(rover, hub, A.save, "CONTENT", "POST", "/api/trade/accept", { offer: (back.body as X.Offer).id, personality: 2002 })).status).toBe(200);
    await sync(rover, hub, A); await sync(kit, kitStore, B);
    expect(readAway(A.save).map((d) => d.personality)).toEqual([1002]);
    expect((await tradeRoute(rover, hub, A.save, "CONTENT", "POST", "/api/trade/offer", { personality: 1002 })).status).toBe(200);
  });

  it("lends: each holds the other's, the owner calls it home, and each gets its own back as it is now", async () => {
    const hub = new Store(":memory:"), kitStore = new Store(":memory:");
    const A = { save: saveA() }, B = { save: saveB() };
    const rover = localLink(hub, KEYS), kit = remoteLink(kitStore, "http://hub", viaHub(hub));
    await rover.join({ name: "ROVER" }); await kit.join({ name: "KIT", code: X.invite(hub, KEYS).code });
    const o = (await tradeRoute(rover, hub, A.save, "CONTENT", "POST", "/api/trade/offer", { personality: 1002, kind: "loan" })).body as X.Offer;
    await tradeRoute(kit, kitStore, B.save, "CONTEXT", "POST", "/api/trade/accept", { offer: o.id, personality: 2002 });
    await sync(rover, hub, A); await sync(kit, kitStore, B);
    expect(((await tradeRoute(kit, kitStore, B.save, "CONTEXT", "GET", "/api/trade", {})).body as any).away).toMatchObject([{ personality: 1002, busy: true }]);
    // KIT cannot pass ROVER's daemon on while it is borrowed, nor withdraw a loan once begun
    expect((await tradeRoute(kit, kitStore, B.save, "CONTEXT", "POST", "/api/trade/offer", { personality: 1002 })).body).toMatchObject({ error: /on loan/ });
    expect((await tradeRoute(rover, hub, A.save, "CONTENT", "POST", "/api/trade/withdraw", { id: o.id })).body).toMatchObject({ error: /called home/ });
    expect((await tradeRoute(rover, hub, A.save, "CONTENT", "POST", "/api/trade/recall", { id: o.id })).body).toMatchObject({ state: "returning" });
    // ROVER's next SYNC hands back KIT's daemon; KIT's hands back ROVER's and takes its own; ROVER's next takes its own
    expect((await sync(rover, hub, A)).traded).toEqual([]);
    expect((await sync(kit, kitStore, B)).traded).toMatchObject([{ species: 1 }]);
    expect((await sync(rover, hub, A)).traded).toMatchObject([{ species: 4 }]);
    expect(readAway(A.save).map((d) => d.personality)).toEqual([1002]);
    expect(readBoxes(B.save)[0].personality).toBe(2002);
    expect(X.board(hub, X.players(hub)[0].id).trades[0]).toMatchObject({ state: "returned", done: true });
    // and both are their games' own again
    expect((await tradeRoute(rover, hub, A.save, "CONTENT", "POST", "/api/trade/offer", { personality: 1002 })).status).toBe(200);
  });

  it("a game cannot trade with itself, nor take an offer meant for someone else", async () => {
    const hub = new Store(":memory:");
    const one = X.join(hub, KEYS, { name: "ONE" }, true), two = X.join(hub, KEYS, { name: "TWO" }, true), three = X.join(hub, KEYS, { name: "THREE" }, true);
    if (X.failed(one) || X.failed(two) || X.failed(three)) throw new Error("join");
    const a = tradeRecord(saveA(), 1002), b = tradeRecord(saveB(), 2002);
    if (typeof a === "string" || typeof b === "string") throw new Error("record");
    const game = (s: Uint8Array) => ({ name: readSave(s).playerName, trainerId: readSave(s).trainerId, secretId: readSave(s).trainerId >>> 16 });
    const o = X.offer(hub, one.player.id, { game: game(saveA()), edition: "CONTENT", record: toB64(a.record), to: two.player.id });
    if (X.failed(o)) throw new Error(o.error);
    expect(X.accept(hub, three.player.id, o.id, { game: game(saveB()), edition: "CONTEXT", record: toB64(b.record) })).toMatchObject({ error: /someone else/ });
    expect(X.accept(hub, two.player.id, o.id, { game: game(saveA()), edition: "CONTENT", record: toB64(a.record) })).toMatchObject({ error: /itself|already/ });
  });
});
