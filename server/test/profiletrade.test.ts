// C-226 piece 4: THE EXCHANGE ON PROFILES -- a home's player claimed into a guardian's profile through its hub, a kid's
// device playing as another profile on the commons, friends by a profile's friend code (one waiting for its guardian),
// the controls deciding who sees whose offers, the guardian's ledger and block, and a deleted account letting go.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import speciesJson from "../data/species.json" with { type: "json" };
import { makeServer } from "../src/api.js";
import { makeCommons } from "../src/commons_api.js";
import { DEFAULTS } from "../src/config.js";
import { Store } from "../src/db.js";
import { expFor } from "../src/save/growth.js";
import { buildSave, type DaemonSpec } from "./build_save.js";

const SPECIES = speciesJson as unknown as Record<string, any>;
const mon = (personality: number, otId: number, species: number, level: number, away = false): DaemonSpec =>
  ({ personality, otId, species, nickname: SPECIES[String(species)].name, level, exp: expFor(SPECIES[String(species)].growth ?? 0, level), hp: 20, maxHP: 20, away });
const dir = mkdtempSync(join(tmpdir(), "profiletrade-"));
const SAVE = join(dir, "a.sav");
writeFileSync(SAVE, buildSave({ player: "ROVER", trainerId: 0x110007, slots: [{ counter: 4, party: [mon(1001, 0x110007, 1, 12), mon(1002, 0x110007, 4, 15, true)] }, { counter: 3, party: [] }] }));

const servers: Server[] = [];
const up = async (s: Server) => { servers.push(s); await new Promise<void>((r) => s.listen(0, "127.0.0.1", () => r())); return `http://127.0.0.1:${(s.address() as AddressInfo).port}`; };
let commons = "", hub = "";
beforeAll(async () => {
  commons = await up(makeCommons(new Store(":memory:"), { audiences: { apple: [], google: [] }, rpId: null, origins: [], devSignIn: true }));
  hub = await up(makeServer({ ...DEFAULTS, database: ":memory:", savePath: SAVE, edition: "CONTENT" as const }));
});
afterAll(() => servers.forEach((s) => s.close()));
const call = async (u: string, body?: unknown, headers: Record<string, string> = {}) => {
  const r = await fetch(u, body === undefined ? { headers } : { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
  return { status: r.status, body: (await r.json()) as any };
};
const as = (token: string) => ({ authorization: `Bearer ${token}` });
const kid = (token: string) => ({ "x-daemons-profile": token });
const guardian = async (sub: string) => (await call(`${commons}/accounts/signin`, { provider: "dev", sub })).body.token as string;

describe("the exchange on profiles (profiletrade.ts)", () => {
  it("claims a home's player, makes friends by code through a guardian, keeps strangers out, and lets go on delete", async () => {
    // a home on the commons, approved, with its player
    await call(`${hub}/api/trade/join`, { name: "ROVER" });
    await call(`${hub}/api/commons`, { url: commons, name: "Rover House" });
    for (const h of (await call(`${commons}/commons/keeper`)).body.homes) await call(`${commons}/commons/approve`, { id: h.id });

    // ROVER's guardian claims it into a profile -- through the hub, which speaks for its player
    const g1 = await guardian("g1");
    const p1 = (await call(`${commons}/accounts/profile`, { first: 0, second: 0 }, as(g1))).body;
    expect((await call(`${hub}/api/trade/claim`, { guardian: "wrong", profile: p1.id })).status).toBe(400);
    const claimed = (await call(`${hub}/api/trade/claim`, { guardian: g1, profile: p1.id })).body;
    expect(claimed).toMatchObject({ claimed: p1.id, name: `${p1.name} #${p1.tag}` });
    const board1 = (await call(`${hub}/api/trade`)).body.board;
    expect(board1.profile).toMatchObject({ name: p1.name, controls: { trade: "friends", friends: "approve" } });
    const code1 = board1.profile.code;
    expect(code1).toMatch(/^[A-Z0-9]{8}$/);

    // another family: a profile that makes its own friends, played on a kid's device with no home at all
    const g2 = await guardian("g2");
    const p2 = (await call(`${commons}/accounts/profile`, { first: 1, second: 1 }, as(g2))).body;
    await call(`${commons}/accounts/profile/controls`, { id: p2.id, friends: "own" }, as(g2));
    const { code } = (await call(`${commons}/accounts/device/code`, { profile: p2.id }, as(g2))).body;
    const d2 = (await call(`${commons}/accounts/device/join`, { code, label: "a tablet" })).body.token;
    const code2 = (await call(`${commons}/accounts/profile/me`, undefined, kid(d2))).body.code;

    // ROVER offers a gift to its friends: the stranger sees nothing, not even ROVER
    const gift = (await call(`${hub}/api/trade/offer`, { personality: 1002, scope: "friends", kind: "gift" })).body;
    expect(gift).toMatchObject({ commons: true, state: "open" });
    let b2 = (await call(`${commons}/accounts/x/board`, undefined, kid(d2))).body;
    expect(b2.open).toEqual([]);
    expect(b2.players.map((x: any) => x.name)).toEqual([`${p2.name} #${p2.tag}`]);

    // friends by code: the kid asks (its own), ROVER asks back -- and waits for its guardian
    expect((await call(`${commons}/accounts/x/befriend`, { code: "NOTACODE" }, kid(d2))).status).toBe(400);
    expect((await call(`${commons}/accounts/x/befriend`, { code: code1 }, kid(d2))).body.asked).toMatchObject([{ name: `${p1.name} #${p1.tag}` }]);
    const waits = (await call(`${hub}/api/trade/befriend`, { code: code2 })).body;
    expect(waits.waiting).toMatchObject([{ name: `${p2.name} #${p2.tag}` }]);
    expect((await call(`${hub}/api/trade`)).body.board.friends.friends).toEqual([]);
    const me1 = (await call(`${commons}/accounts/me`, undefined, as(g1))).body.profiles[0];
    expect(me1.waiting).toHaveLength(1);
    const ok = (await call(`${commons}/accounts/profile/friend`, { profile: p1.id, player: me1.waiting[0].player }, as(g1))).body;
    expect(ok.friends.friends).toMatchObject([{ name: `${p2.name} #${p2.tag}` }]);
    expect((await call(`${hub}/api/trade`)).body.board.friends.friends).toMatchObject([{ id: expect.stringMatching(/^c:/), commons: true }]);

    // friends now: the kid sees ROVER's gift, and ROVER's guardian sees it in the ledger
    b2 = (await call(`${commons}/accounts/x/board`, undefined, kid(d2))).body;
    expect(b2.open).toMatchObject([{ kind: "gift", from: { player: `${p1.name} #${p1.tag}` } }]);
    expect((await call(`${commons}/accounts/profile/ledger`, { id: p1.id }, as(g1))).body.offers).toMatchObject([{ kind: "gift", state: "open", mine: true }]);
    expect((await call(`${commons}/accounts/profile/ledger`, { id: p1.id }, as(g2))).status).toBe(400);   // not g2's

    // ROVER's daemon goes out: its friend sees it -- until the kid's guardian turns meetings off
    expect((await call(`${hub}/api/trade/out`, { personality: 1002 })).body.error).toBeUndefined();
    expect(JSON.stringify((await call(`${commons}/accounts/x/out`, {}, kid(d2))).body.others)).toContain(p1.name);
    await call(`${commons}/accounts/profile/controls`, { id: p2.id, meet: "off" }, as(g2));
    expect(JSON.stringify((await call(`${commons}/accounts/x/out`, {}, kid(d2))).body.others ?? [])).not.toContain(p1.name);

    // the kid's guardian blocks ROVER: unfriended, and its offers gone from the kid's board
    const rover = b2.players.find((x: any) => x.name.startsWith(p1.name)).id;
    const blocked = (await call(`${commons}/accounts/profile/block`, { profile: p2.id, player: rover }, as(g2))).body;
    expect(blocked.friends.friends).toEqual([]);
    expect((await call(`${commons}/accounts/x/board`, undefined, kid(d2))).body.open).toEqual([]);
    expect((await call(`${commons}/accounts/x/befriend`, { code: code1 }, kid(d2))).status).toBe(400);
    expect((await call(`${commons}/accounts/me`, undefined, as(g2))).body.profiles[0].blocked).toMatchObject([{ player: rover }]);

    // ROVER's guardian deletes the account: the gift is withdrawn, ROVER is its home's again
    await call(`${commons}/accounts/delete`, { confirm: "DELETE" }, as(g1));
    const after = (await call(`${hub}/api/trade`)).body.board;
    expect(after.profile).toBeUndefined();
    expect(after.open.filter((o: any) => o.commons)).toEqual([]);
    expect(after.players.map((x: any) => x.name)).toContain("ROVER");
  });
});
