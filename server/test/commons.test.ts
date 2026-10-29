// C-222: THE COMMONS -- two homes, each its own hub with its own player and save, trading through a commons over HTTP:
// registered, approved by the keeper, friends by code; strangers see nothing; each SYNC writes its own save.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import speciesJson from "../data/species.json" with { type: "json" };
import { makeServer } from "../src/api.js";
import { makeCommons } from "../src/commons_api.js";
import { DEFAULTS } from "../src/config.js";
import { Store } from "../src/db.js";
import { readAway, readBoxes } from "../src/save/reader.js";
import { expFor } from "../src/save/growth.js";
import { buildSave, type DaemonSpec } from "./build_save.js";

const SPECIES = speciesJson as unknown as Record<string, any>;
const mon = (personality: number, otId: number, species: number, level: number, away = false): DaemonSpec =>
  ({ personality, otId, species, nickname: SPECIES[String(species)].name, level, exp: expFor(SPECIES[String(species)].growth ?? 0, level), hp: 20, maxHP: 20, away });
const dir = mkdtempSync(join(tmpdir(), "commons-"));
const A = join(dir, "a.sav"), B = join(dir, "b.sav");
writeFileSync(A, buildSave({ player: "ROVER", trainerId: 0x110007, slots: [{ counter: 4, party: [mon(1001, 0x110007, 1, 12), mon(1002, 0x110007, 4, 15, true)] }, { counter: 3, party: [] }] }));
writeFileSync(B, buildSave({ player: "KIT", trainerId: 0x220009, slots: [{ counter: 4, party: [mon(2001, 0x220009, 7, 10)] }, { counter: 3, party: [] }],
                            boxes: [mon(2002, 0x220009, 1, 20, true)] }));

const servers: Server[] = [];
const up = async (s: Server) => { servers.push(s); await new Promise<void>((r) => s.listen(0, "127.0.0.1", () => r())); return `http://127.0.0.1:${(s.address() as AddressInfo).port}`; };
let commons = "", hubA = "", hubB = "";
beforeAll(async () => {
  commons = await up(makeCommons(new Store(":memory:")));
  hubA = await up(makeServer({ ...DEFAULTS, database: ":memory:", savePath: A, edition: "CONTENT" as const }));
  hubB = await up(makeServer({ ...DEFAULTS, database: ":memory:", savePath: B, edition: "CONTEXT" as const }));
});
afterAll(() => servers.forEach((s) => s.close()));
const get = (u: string) => fetch(u).then((r) => r.json());
const post = (u: string, b: unknown) => fetch(u, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) }).then((r) => r.json());

describe("THE COMMONS (C-222)", () => {
  it("two homes register, are approved, become friends, and trade -- each SYNC writing its own save", async () => {
    await post(`${hubA}/api/trade/join`, { name: "ROVER" });
    await post(`${hubB}/api/trade/join`, { name: "KIT" });
    expect((await post(`${hubA}/api/commons`, { url: commons, name: "Rover House" })).home).toMatchObject({ name: "ROVER HOUSE", approved: false });
    await post(`${hubB}/api/commons`, { url: commons, name: "Kit House" });
    // waiting for the keeper: nothing goes through yet
    expect((await post(`${hubA}/api/trade/offer`, { personality: 1002, scope: "friends" }))).toMatchObject({ error: /not let this home in|waiting/ });
    const keeper = await get(`${commons}/commons/keeper`);
    expect(keeper.homes.map((h: any) => h.name)).toEqual(["ROVER HOUSE", "KIT HOUSE"]);
    expect(JSON.stringify(keeper)).not.toMatch(/"key"/);
    for (const h of keeper.homes) await post(`${commons}/commons/approve`, { id: h.id });

    // an offer to friends, seen by no stranger
    const offer = await post(`${hubA}/api/trade/offer`, { personality: 1002, scope: "friends", kind: "full" });
    expect(offer).toMatchObject({ commons: true, state: "open" });
    expect(offer.id).toMatch(/^c:/);
    expect((await get(`${hubB}/api/trade`)).board.open).toEqual([]);

    // friends by code: ROVER HOUSE's code given to KIT HOUSE, and accepted
    const a = (await get(`${hubA}/api/commons`)).home;
    expect((await post(`${hubB}/api/commons/friend`, { code: a.code })).asked).toMatchObject([{ name: "ROVER HOUSE" }]);
    const asks = (await get(`${hubA}/api/commons`)).home.asks;
    expect((await post(`${hubA}/api/commons/friend/accept`, { id: asks[0].id })).friends).toMatchObject([{ name: "KIT HOUSE" }]);

    const seen = (await get(`${hubB}/api/trade`)).board.open;
    expect(seen).toMatchObject([{ id: offer.id, commons: true, from: { player: "ROVER · ROVER HOUSE", nickname: SPECIES["4"].name } }]);
    expect(await post(`${hubB}/api/trade/accept`, { offer: offer.id, personality: 2002 })).toMatchObject({ state: "agreed" });

    const ra = await post(`${hubA}/api/sync`, {}), rb = await post(`${hubB}/api/sync`, {});
    expect(ra.traded).toMatchObject([{ species: 1, where: "party" }]);
    expect(rb.traded).toMatchObject([{ species: 4, where: "box" }]);
    expect(readAway(new Uint8Array(readFileSync(A))).map((d) => d.personality)).toEqual([2002]);
    expect(readBoxes(new Uint8Array(readFileSync(B)))[0].personality).toBe(1002);
    expect((await get(`${hubA}/api/trade`)).board.trades).toMatchObject([{ state: "done", commons: true }]);
    // C-220: the trade's hello was made on the commons, and both homes list it
    expect((await get(`${hubA}/api/trade`)).out.met).toMatchObject([{ trade: "full", commons: true }]);
    // OUT TOGETHER across homes: each sends its daemon out; ROVER HOUSE sees KIT's beside its own and meets it there
    expect((await post(`${hubA}/api/trade/out`, { personality: 2002 })).error).toBeUndefined();
    expect((await post(`${hubB}/api/trade/out`, { personality: 1002 })).error).toBeUndefined();
    const others = (await get(`${hubA}/api/trade`)).out.others;
    expect(others).toMatchObject([{ player: "KIT · KIT HOUSE", commons: true }]);
    const after = await post(`${hubA}/api/trade/meet`, { with: others[0].id });
    expect(after.met[0]).toMatchObject({ commons: true, a: { player: "ROVER · ROVER HOUSE" }, b: { player: "KIT · KIT HOUSE" } });
    expect(after.met[0].lines.map((l: any) => l.by)).toEqual(["written", "written", "written", "written"]);   // no model on this commons
    expect((await get(`${hubB}/api/trade`)).out.met.some((m: any) => m.commons && !m.trade)).toBe(true);
  });

  it("the keeper's list and approval answer only on the commons' own machine; a home needs its key", async () => {
    expect((await fetch(`${commons}/commons/home`)).status).toBe(401);
    expect((await post(`${commons}/commons/register`, { name: "x" }))).toMatchObject({ error: /2 to 16/ });
  });
});
