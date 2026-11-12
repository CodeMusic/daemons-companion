// C-346: a profile's daemon going to a player who is not its friend arrives without the names its child typed -- the
// species' own name, and the profile's first word for its trainer -- and a loan coming home gets its own names back.
import { describe as group, expect, it } from "vitest";
import speciesJson from "../data/species.json" with { type: "json" };
import { Store } from "../src/db.js";
import * as X from "../src/exchange.js";
import { KEYS } from "../src/keys.js";
import { describe, fromB64, toB64 } from "../src/save/trade.js";
import { decodeText, LAYOUT } from "../src/save/reader.js";
import { buildDaemon, buildSave } from "./build_save.js";
import { syncSave } from "../src/save/writer.js";
import { readAway, readSave } from "../src/save/reader.js";
import { expFor } from "../src/save/growth.js";

const SPECIES = speciesJson as unknown as Record<string, any>;
const record = (personality: number, otId: number, species: number, nickname: string) =>
  toB64(buildDaemon({ personality, otId, species, nickname, level: 15, exp: expFor(SPECIES[String(species)].growth ?? 0, 15), hp: 20, maxHP: 20 }).slice(0, LAYOUT.box_pokemon_size));
const names = (b64: string) => { const r = fromB64(b64)!; return { nickname: decodeText(r.subarray(8, 18)), trainer: decodeText(r.subarray(20, 27)), whole: !!describe(r) }; };
const gA = { name: "ROVER", trainerId: 0x110007, secretId: 1 }, gB = { name: "KIT", trainerId: 0x220009, secretId: 2 };

group("names blanked on the way (C-346)", () => {
  it("rewrites a profile's daemon for a non-friend, not for a friend, and gives a loan its own names back", () => {
    const store = new Store(":memory:");
    const a = X.profilePlayer(store, "p1", "QUIET KERNEL #4410");
    const b = (X.join(store, KEYS, { name: "KIT" }, true) as any).player;
    const mine = record(1002, 0x110007, 4, "SAM"), theirs = record(2002, 0x220009, 1, "BUDDY");
    expect(names(mine).nickname).toBe("SAM");

    const o = X.offer(store, a.id, { game: gA, edition: "CONTENT", record: mine, kind: "loan" }) as X.Offer;
    expect(X.failed(X.accept(store, b.id, o.id, { game: gB, edition: "CONTEXT", record: theirs }))).toBe(false);

    // KIT is not the profile's friend: its daemon arrives as its species, its trainer the profile's first word
    const toKit = X.inbox(store, b.id, gB).deliveries[0];
    expect(names(toKit.record)).toEqual({ nickname: SPECIES["4"].name.toUpperCase(), trainer: "QUIET", whole: true });
    // KIT's own daemon goes to the profile as KIT named it
    expect(names(X.inbox(store, a.id, gA).deliveries[0].record).nickname).toBe("BUDDY");
    // friends, and nothing is rewritten
    X.befriend(store, a.id, b.id, () => true); X.befriend(store, b.id, a.id, () => true);
    expect(names(X.inbox(store, b.id, gB).deliveries[0].record).nickname).toBe("SAM");
    X.unfriend(store, a.id, b.id);

    // the loan comes home: handed back as it is in KIT's save (blanked), it arrives with its own names
    X.written(store, a.id, [`${o.id}:swap`]); X.written(store, b.id, [`${o.id}:swap`]);
    expect(X.failed(X.recall(store, a.id, o.id))).toBe(false);
    expect(X.failed(X.handback(store, b.id, o.id, toKit.record))).toBe(false);
    expect(X.failed(X.handback(store, a.id, o.id, theirs))).toBe(false);
    const home = X.inbox(store, a.id, gA).deliveries.find((d) => d.phase === "return")!;
    expect(names(home.record)).toEqual({ nickname: "SAM", trainer: names(mine).trainer, whole: true });
  });

  it("writes a blanked daemon into a save that reads back whole, named as its species", () => {
    const store = new Store(":memory:");
    const a = X.profilePlayer(store, "p1", "BRIGHT SOCKET #1200");
    const b = (X.join(store, KEYS, { name: "KIT" }, true) as any).player;
    const o = X.offer(store, a.id, { game: gA, edition: "CONTENT", record: record(1002, 0x110007, 4, "SAM"), kind: "full" }) as X.Offer;
    X.accept(store, b.id, o.id, { game: gB, edition: "CONTEXT", record: record(2002, 0x220009, 1, "BUDDY") });
    const d = X.inbox(store, b.id, gB).deliveries[0];
    const save = buildSave({ player: "KIT", trainerId: 0x220009, slots: [{ counter: 4, party: [
      { personality: 2001, otId: 0x220009, species: 7, nickname: SPECIES["7"].name, level: 10, exp: expFor(SPECIES["7"].growth ?? 0, 10), hp: 20, maxHP: 20 },
      { personality: 2002, otId: 0x220009, species: 1, nickname: "BUDDY", level: 15, exp: expFor(SPECIES["1"].growth ?? 0, 15), hp: 20, maxHP: 20, away: true }] }, { counter: 3, party: [] }] });
    const written = syncSave(save, { link: false, trade: [{ id: d.id, out: 2002, record: fromB64(d.record)! }] }).save;
    expect(readSave(written)).toBeTruthy();
    expect(readAway(written).map((x) => [x.personality, x.nickname])).toEqual([[1002, SPECIES["4"].name.toUpperCase()]]);
  });
});
