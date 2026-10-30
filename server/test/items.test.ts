// C-223: an ITEM given, nothing back -- out of the giver's bag (then PC) first, into the receiver's PC only after.
// Scratch saves only; the pockets are passed in (global.h's offsets) until profile_layout carries them.
import { describe, expect, it } from "vitest";
import speciesJson from "../data/species.json" with { type: "json" };
import { expFor } from "../src/save/growth.js";
import { syncSave } from "../src/save/writer.js";
import { giftableItems, putItem, takeItem, PC_MAX, type Pockets, type Words } from "../src/save/items.js";
import * as X from "../src/exchange.js";
import { Store } from "../src/db.js";
import { buildSave, type DaemonSpec } from "./build_save.js";

const PK: Pockets = { PC: { at: 0x298, count: 30 }, ITEMS: { at: 0x310, count: 42 }, BALLS: { at: 0x430, count: 13 }, BERRIES: { at: 0x54c, count: 43 } };
const RECOVER = 13;
const SPECIES = speciesJson as unknown as Record<string, any>;
const mon = (personality: number, otId: number, species: number, level: number): DaemonSpec =>
  ({ personality, otId, species, nickname: SPECIES[String(species)].name, level, exp: expFor(SPECIES[String(species)].growth ?? 0, level), hp: 20, maxHP: 20 });
const save = () => buildSave({ player: "KIT", trainerId: 9, slots: [{ counter: 4, party: [mon(2001, 9, 7, 10)] }, { counter: 3, party: [] }] });
const words = () => { const m = new Map<number, number>(); return { m, w: { get: (o) => m.get(o) ?? 0, set: (o, v) => { m.set(o, v); } } as Words }; };

describe("an item given (C-223)", () => {
  it("takes from the bag (sealed with the key) before the PC, and closes the pocket up", () => {
    const { m, w } = words(), key = 0xabcd1234;
    w.set(0x310, 99); w.set(0x312, 1 ^ 0x1234);                 // another item first
    w.set(0x314, RECOVER); w.set(0x316, 2 ^ 0x1234);             // 2 in the bag
    w.set(0x318, 50); w.set(0x31a, 3 ^ 0x1234);
    w.set(0x298, RECOVER); w.set(0x29a, 5);                      // 5 in the PC, plain
    expect(takeItem(w, PK, key, RECOVER, 8)).toBe(false);        // only 7 held: nothing changed
    expect(m.get(0x316)).toBe(2 ^ 0x1234);
    expect(takeItem(w, PK, key, RECOVER, 4)).toBe(true);
    expect([w.get(0x314), w.get(0x316) ^ 0x1234]).toEqual([50, 3]);   // the bag's slot emptied and closed up
    expect([w.get(0x318), w.get(0x31a)]).toEqual([0, 0]);
    expect([w.get(0x298), w.get(0x29a)]).toEqual([RECOVER, 3]);
  });

  it("puts into the PC: stacked while at or under 999, else the first empty slot, else not at all", () => {
    const { w } = words();
    w.set(0x298, RECOVER); w.set(0x29a, PC_MAX - 1);
    expect(putItem(w, PK, RECOVER, 1)).toBe(true);
    expect(w.get(0x29a)).toBe(PC_MAX);
    expect(putItem(w, PK, RECOVER, 2)).toBe(true);
    expect([w.get(0x29c), w.get(0x29e)]).toEqual([RECOVER, 2]);
    for (let i = 2; i < 30; i++) w.set(0x298 + i * 4, 200 + i);
    expect(putItem(w, PK, 4, 1)).toBe(false);
    expect(putItem({ get: () => 0, set: () => {} }, { ITEMS: PK.ITEMS }, RECOVER, 1)).toBe(false);   // a layout without the PC
  });

  it("is written by SYNC on a scratch save: received into the PC, then given away, and waits when too few are held", () => {
    const got = syncSave(save(), { link: false, itemPockets: PK, trade: [{ id: "i1:swap", out: 0, record: null, item: { id: RECOVER, count: 3 } }] });
    expect(got.traded[0]).toMatchObject({ where: "pc", item: { id: RECOVER, count: 3 } });
    expect(giftableItems(got.save, PK)).toEqual([{ item: RECOVER, count: 3, name: "RECOVER" }]);
    const gave = syncSave(got.save, { link: false, itemPockets: PK, trade: [{ id: "i2:give", out: 0, record: null, give: true, item: { id: RECOVER, count: 2 } }] });
    expect(gave.traded[0]).toMatchObject({ where: "bag", gave: true });
    expect(giftableItems(gave.save, PK)[0].count).toBe(1);
    const short = syncSave(gave.save, { link: false, itemPockets: PK, trade: [{ id: "i3:give", out: 0, record: null, give: true, item: { id: RECOVER, count: 2 } }] });
    expect(short.tradeWaits[0].why).toMatch(/no longer holds 2 RECOVER/);
  });

  it("reaches the receiver only once the giver's save has let it go, and can be called off before", () => {
    const hub = new Store(":memory:");
    const KEYS: X.Keys = { token: (() => { let n = 0; return () => `t${++n}`; })(), hash: (t) => t, password: (p) => p, check: (p, k) => p === k, code: () => "C" };
    const a = X.join(hub, KEYS, { name: "ROVER" }, true), b = X.join(hub, KEYS, { name: "KIT" }, true);
    if (X.failed(a) || X.failed(b)) throw new Error("join");
    const ga = { name: "ROVER", id: 1 } as any, gb = { name: "KIT", id: 2 } as any;
    const o = X.offerItem(hub, a.player.id, { game: ga, edition: "CONTENT", item: RECOVER, count: 2, name: "recover" });
    if (X.failed(o)) throw new Error(o.error);
    expect(X.failed(X.offerItem(hub, a.player.id, { game: ga, edition: "CONTENT", item: RECOVER, count: 1, name: "RECOVER" }))).toBe(true);   // once at a time
    expect(X.accept(hub, b.player.id, o.id, { game: gb, edition: "CONTEXT", record: "" })).toMatchObject({ state: "agreed" });
    expect(X.inbox(hub, b.player.id, gb).deliveries).toEqual([]);                         // not yet: still in ROVER's save
    expect(X.inbox(hub, a.player.id, ga).deliveries).toMatchObject([{ phase: "give", item: { id: RECOVER, count: 2 } }]);
    expect(X.inbox(hub, a.player.id, ga).locked).toEqual([]);
    X.written(hub, a.player.id, [`${o.id}:give`]);
    expect(X.inbox(hub, b.player.id, gb).deliveries).toMatchObject([{ phase: "swap", item: { id: RECOVER, count: 2 } }]);
    expect(X.withdraw(hub, a.player.id, o.id)).toMatchObject({ error: expect.any(String) });   // it has left: no calling off
    X.written(hub, b.player.id, [`${o.id}:swap`]);
    expect(X.board(hub, a.player.id).trades[0]).toMatchObject({ kind: "item", state: "done", item: { name: "RECOVER" }, given: true });

    const o2 = X.offerItem(hub, a.player.id, { game: ga, edition: "CONTENT", item: RECOVER, count: 1, name: "RECOVER" });
    if (X.failed(o2)) throw new Error(o2.error);
    X.accept(hub, b.player.id, o2.id, { game: gb, edition: "CONTEXT", record: "" });
    expect(X.withdraw(hub, a.player.id, o2.id)).toMatchObject({ state: "withdrawn" });     // taken, but not yet out of the save
    expect(X.inbox(hub, a.player.id, ga).deliveries).toEqual([]);
  });
});
