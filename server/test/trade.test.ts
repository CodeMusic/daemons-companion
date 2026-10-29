// C-218, C-219: two games trading through one exchange -- the hub's own companion (local) and another player's
// (over the network, here a fetch that answers as api.ts does), each SYNC writing its own save. Synthetic saves only.
import { describe, expect, it } from "vitest";
import speciesJson from "../data/species.json" with { type: "json" };
import { expFor } from "../src/save/growth.js";
import { blocks, LAYOUT, readAway, readBoxes, readSave, ORDERS, sectionSize, tradeBits } from "../src/save/reader.js";
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
  return out(await exchangeRoute(hub, KEYS, p, name, b));
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

describe("the game's bits (DAEMONS T-473)", () => {
  const bits = (save: Uint8Array, personality: number) => {
    const t = tradeRecord(save, personality);
    // tradeRecord clears them for the exchange; read them from the save itself
    const party = readSave(save).party.find((d) => d.personality === personality);
    return { party, t };
  };
  it("a swap arrives TRADED_IN (and LOAN on a loan), marked; a return arrives plain, LOAN and the marker cleared", () => {
    const b = tradeRecord(saveB(), 2002);
    if (typeof b === "string") throw new Error(b);
    const tb = tradeBits(LAYOUT), misc = ORDERS[2002 % 24].indexOf("M") * 12, key = (2002 ^ B_ID) >>> 0;
    const marker = (r: Uint8Array) => ((new DataView(r.buffer).getUint32(32 + misc + 8, true) ^ key) >>> 29) & 1;
    const full = arriving(b.record)!, loan = arriving(b.record, LAYOUT, { loan: true })!;
    expect([full[tb.at] & tb.tradedIn, full[tb.at] & tb.loan, marker(full)]).toEqual([tb.tradedIn, 0, 1]);
    expect([loan[tb.at] & tb.tradedIn, loan[tb.at] & tb.loan]).toEqual([tb.tradedIn, tb.loan]);
    const back = arriving(loan, LAYOUT, { phase: "return" })!;
    expect([back[tb.at] & (tb.tradedIn | tb.loan), marker(back)]).toEqual([0, 0]);
    expect(describeRecord(back)).not.toBeNull();                                                      // still sealed right
    // and none of the bits leave in a record sent to the exchange
    const written = syncSave(saveA(), { link: false, trade: [{ id: "x", out: 1002, record: b.record, loan: true }] }).save;
    const sent = tradeRecord(written, 2002);
    if (typeof sent === "string") throw new Error(sent);
    expect(sent.record[tb.at] & (tb.loan | tb.tradedIn)).toBe(0);
    expect(bits(written, 2002).party?.away).toBe(true);
  });

  it("T-474: a swap names the species given for it (party or box) beside TRADED_IN; a return names none", () => {
    const tb = tradeBits(LAYOUT), at = (save: Uint8Array, personality: number) => {
      const t = readSave(save).party.find((d) => d.personality === personality) ? "party" : "box";
      const { sb1 } = blocks(save);
      if (t === "party") { const i = readSave(save).party.findIndex((d) => d.personality === personality);
        return new DataView(sb1.buffer).getUint16(LAYOUT.party_offset + i * LAYOUT.pokemon_size + tb.at, true); }
      return -1;
    };
    const b = tradeRecord(saveB(), 2002), a = tradeRecord(saveA(), 1002);
    if (typeof b === "string" || typeof a === "string") throw new Error("record");
    // into A's party, for A's 1002 (species 4): partner 4
    const intoA = syncSave(saveA(), { link: false, trade: [{ id: "x", out: 1002, record: b.record }] }).save;
    const word = at(intoA, 2002);
    expect([(word & tb.partnerMask) >> tb.partnerShift, word & tb.tradedIn]).toEqual([4, tb.tradedIn]);
    // into B's box, for B's 2002 (species 1): partner 1, read from the record that arrived
    const intoB = syncSave(saveB(), { link: false, trade: [{ id: "y", out: 2002, record: a.record }] }).save;
    const boxed = readBoxes(intoB)[0];
    expect(boxed.personality).toBe(1002);
    const { slot } = blocks(intoB), storage = new Uint8Array(LAYOUT.storage_size);
    for (let id = 5; id <= 13; id++) { const sec = slot.sections.get(id); if (sec) storage.set(sec.subarray(0, sectionSize(id)), (id - 5) * 3968); }
    expect((new DataView(storage.buffer).getUint16(4 + tb.at, true) & tb.partnerMask) >> tb.partnerShift).toBe(1);
    // a loan's return names none, and nothing leaves in a record sent onward
    const back = arriving(arriving(b.record, LAYOUT, { partner: 4 })!, LAYOUT, { phase: "return" })!;
    expect(new DataView(back.buffer).getUint16(tb.at, true) & (tb.partnerMask | tb.tradedIn)).toBe(0);
    const sent = tradeRecord(intoA, 2002);
    if (typeof sent === "string") throw new Error(sent);
    expect(new DataView(sent.record.buffer).getUint16(tb.at, true) & tb.partnerMask).toBe(0);
  });

  it("TRADING locks a daemon in a trade: set, an ask home refused, cleared once it is not", () => {
    const tb = tradeBits(LAYOUT), flags = (save: Uint8Array, slot: number) => {
      const { sb1 } = blocks(save); return sb1[LAYOUT.party_offset + slot * LAYOUT.pokemon_size + LAYOUT.flags_byte];
    };
    const asked = buildSave({ player: "ROVER", trainerId: A_ID, slots: [{ counter: 4, party: [mon(1001, A_ID, 1, 12), mon(1002, A_ID, 4, 15, { away: true, asked: true })] }, { counter: 3, party: [] }] });
    const r = syncSave(asked, { link: false, locks: [1002] });
    expect(r.answered).toEqual([]);
    expect(r.refused[0]).toMatch(/in a trade/);
    expect(flags(r.save, 1) & tb.trading).toBe(tb.trading);
    expect(readSave(r.save).party[1]).toMatchObject({ away: true, asked: false });
    expect(flags(syncSave(r.save, { link: false, locks: [] }).save, 1) & tb.trading).toBe(0);
    expect(flags(syncSave(r.save, { link: false }).save, 1) & tb.trading).toBe(tb.trading);       // not asked: left as it is
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
    expect(X.inbox(hub, X.players(hub)[0].id, { name: "ROVER", trainerId: A_ID & 0xffff, secretId: A_ID >>> 16 }).locked).toEqual([1002]);
    expect((await tradeRoute(rover, hub, A.save, "CONTENT", "POST", "/api/trade/offer", { personality: 1002 })).body).toMatchObject({ error: /already in a trade/ });
    const view = await tradeRoute(kit, kitStore, B.save, "CONTEXT", "GET", "/api/trade", {});
    expect((view.body as any).board.open[0]).toMatchObject({ id, from: { player: "ROVER", nickname: SPECIES["4"].name } });
    const took = await tradeRoute(kit, kitStore, B.save, "CONTEXT", "POST", "/api/trade/accept", { offer: id, personality: 2002 });
    expect(took.body).toMatchObject({ state: "agreed" });
    // C-220: and the two daemons met once, to say hello -- both players see it
    const met = (await tradeRoute(kit, kitStore, B.save, "CONTEXT", "GET", "/api/trade", {})).body as any;
    expect(met.out.met[0]).toMatchObject({ trade: "full", a: { nickname: SPECIES["4"].name }, b: { nickname: SPECIES["1"].name } });
    expect(met.out.met[0].lines).toHaveLength(4);
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

describe("a gift (C-223): given with nothing back", () => {
  it("leaves the giver's party, closing it up, and arrives in the receiver's first empty box slot", async () => {
    const hub = new Store(":memory:"), kitStore = new Store(":memory:");
    const A = { save: saveA() }, B = { save: saveB() };
    const rover = localLink(hub, KEYS), kit = remoteLink(kitStore, "http://coremp135:4730", viaHub(hub));
    await rover.join({ name: "ROVER" });
    await kit.join({ name: "KIT", code: X.invite(hub, KEYS).code });
    const given = await tradeRoute(rover, hub, A.save, "CONTENT", "POST", "/api/trade/offer", { personality: 1002, kind: "gift" });
    expect(given.body).toMatchObject({ kind: "gift", state: "open" });
    const id = (given.body as X.Offer).id;
    expect((await tradeRoute(rover, hub, A.save, "CONTENT", "POST", "/api/trade/accept", { offer: id, gift: true })).body).toMatchObject({ error: /your own offer/ });
    const took = await tradeRoute(kit, kitStore, B.save, "CONTEXT", "POST", "/api/trade/accept", { offer: id, gift: true });
    expect(took.body).toMatchObject({ kind: "gift", state: "agreed" });
    expect((await tradeRoute(rover, hub, A.save, "CONTENT", "POST", "/api/trade/recall", { id })).body).toMatchObject({ error: /gift does not come back/ });

    const ra = await sync(rover, hub, A), rb = await sync(kit, kitStore, B);
    expect(ra.traded).toEqual([{ nickname: SPECIES["4"].name, species: 4, where: "party", gave: true }]);
    expect(rb.traded).toEqual([{ nickname: SPECIES["4"].name, species: 4, where: "box" }]);
    expect(readSave(A.save).party.map((d) => d.personality)).toEqual([1001]);                        // closed up behind it
    const boxes = readBoxes(B.save).map((d) => d.personality);
    expect(boxes).toContain(1002);
    expect(boxes).toContain(2002);                                                                    // nothing of KIT's left
    expect(X.board(hub, X.players(hub)[0].id).trades[0]).toMatchObject({ state: "done", kind: "gift" });
    expect((await sync(rover, hub, A)).traded).toEqual([]);                                           // once
    // the save it left, restored, cannot give it again
    expect((await tradeRoute(rover, hub, saveA(), "CONTENT", "POST", "/api/trade/offer", { personality: 1002, kind: "gift" })).body)
      .toMatchObject({ error: /traded away from this game already/ });
  });

  it("waits when the daemon given is the last in the party, or came home", () => {
    const solo = buildSave({ player: "ROVER", trainerId: A_ID, slots: [{ counter: 4, party: [mon(1002, A_ID, 4, 15, { away: true })] }, { counter: 3, party: [] }] });
    expect(syncSave(solo, { link: false, trade: [{ id: "g:give", out: 1002, record: null, give: true }] }).tradeWaits[0].why).toMatch(/last in the party/);
    expect(syncSave(saveA(), { link: false, trade: [{ id: "g:give", out: 1001, record: null, give: true }] }).tradeWaits[0].why).toMatch(/home in the game/);
    const fromBox = syncSave(saveB(), { link: false, trade: [{ id: "g:give", out: 2002, record: null, give: true }] });
    expect(fromBox.traded[0]).toMatchObject({ gave: true, where: "box" });
    expect(readBoxes(fromBox.save).map((d) => d.personality)).toEqual([2003]);
  });

  it("finds the giver's daemon by its trainer too, never lets one asked home go, and puts an arrival after the AWAY ones", () => {
    // the same personality under another trainer is not the one given
    expect(syncSave(saveA(), { link: false, trade: [{ id: "g:give", out: 1002, ot: B_ID, record: null, give: true }] }).tradeWaits[0].why).toMatch(/not in this save/);
    expect(syncSave(saveA(), { link: false, trade: [{ id: "g:give", out: 1002, ot: A_ID, record: null, give: true }] }).traded[0]).toMatchObject({ gave: true });
    // KIT's PC: 2002 AWAY in the first slot, 2003 home in the second -- an arrival goes after 2002, into the third
    const a = tradeRecord(saveA(), 1002);
    if (typeof a === "string") throw new Error(a);
    const r = syncSave(saveB(), { link: false, trade: [{ id: "g:swap", out: 0, record: a.record }] });
    expect(readBoxes(r.save).map((d) => d.personality)).toEqual([2002, 2003, 1002]);
    expect(readBoxes(r.save)[2]).toMatchObject({ away: true });
    // DAEMONS T-492: GIFTED (0x1E bit 11) beside TRADED_IN, partner 0; a trade's arrival is not GIFTED, and none leaves in a record sent
    const tb = tradeBits(LAYOUT), f = (r: Uint8Array) => new DataView(r.buffer).getUint16(tb.at, true);
    const gift = arriving(a.record, LAYOUT, { phase: "swap", gift: true })!, trade = arriving(a.record, LAYOUT, { phase: "swap", partner: 7 })!;
    expect([f(gift) & tb.gifted, f(gift) & tb.tradedIn, f(gift) & tb.partnerMask]).toEqual([tb.gifted, tb.tradedIn, 0]);
    expect(f(trade) & tb.gifted).toBe(0);
    const sent = tradeRecord(r.save, 1002);
    if (typeof sent === "string") throw new Error(sent);
    expect(f(sent.record) & (tb.gifted | tb.tradedIn)).toBe(0);
  });
});

describe("friends at home (C-223)", () => {
  it("are friends once both ask; an offer for friends is seen and taken only by them", async () => {
    const hub = new Store(":memory:"), kitStore = new Store(":memory:");
    const A = { save: saveA() }, B = { save: saveB() };
    const rover = localLink(hub, KEYS), kit = remoteLink(kitStore, "http://coremp135:4730", viaHub(hub));
    await rover.join({ name: "ROVER" });
    await kit.join({ name: "KIT", code: X.invite(hub, KEYS).code });
    const [r, k] = X.players(hub).map((p) => p.id);
    expect((await tradeRoute(rover, hub, A.save, "CONTENT", "POST", "/api/trade/offer", { personality: 1002, kind: "gift", friends: true })).body)
      .toMatchObject({ error: /no friends here yet/ });
    expect((await tradeRoute(rover, hub, A.save, "CONTENT", "POST", "/api/trade/befriend", { id: k })).body).toMatchObject({ friends: [], asked: [{ name: "KIT" }] });
    expect(X.board(hub, k).friends.asks).toEqual([{ id: r, name: "ROVER" }]);
    expect((await tradeRoute(kit, kitStore, B.save, "CONTEXT", "POST", "/api/trade/befriend", { id: r })).body).toMatchObject({ friends: [{ name: "ROVER" }], asks: [] });
    expect(X.board(hub, r).friends.friends).toEqual([{ id: k, name: "KIT" }]);
    const o = await tradeRoute(rover, hub, A.save, "CONTENT", "POST", "/api/trade/offer", { personality: 1002, kind: "gift", friends: true });
    expect(o.body).toMatchObject({ kind: "gift" });
    expect(X.board(hub, k).open.map((x) => x.id)).toEqual([(o.body as X.Offer).id]);
    await tradeRoute(kit, kitStore, B.save, "CONTEXT", "POST", "/api/trade/unfriend", { id: r });
    expect(X.board(hub, k).open).toEqual([]);                                                        // friends only: gone from KIT's view
    expect((await tradeRoute(kit, kitStore, B.save, "CONTEXT", "POST", "/api/trade/accept", { offer: (o.body as X.Offer).id, gift: true })).body)
      .toMatchObject({ error: /for their friends/ });
  });
});
