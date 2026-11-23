// C-422: BATTLES across homes through THE COMMONS, as trades go (C-222) -- three homes' hubs and a commons over HTTP:
// two friends battle live and by CHALLENGE (C-421), each home giving its own daemon's experience; a stranger home sees
// neither of them. Synthetic saves only.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import speciesJson from "../data/species.json" with { type: "json" };
import { makeServer } from "../src/api.js";
import { makeCommons } from "../src/commons/commons_api.js";
import { DEFAULTS } from "../src/config.js";
import { Store } from "../src/db.js";
import { expFor } from "../src/game/save/growth.js";
import { buildSave, type DaemonSpec } from "./build_save.js";

const SPECIES = speciesJson as unknown as Record<string, any>;
const mon = (personality: number, otId: number, species: number, level: number, moves: number[]): DaemonSpec =>
  ({ personality, otId, species, nickname: SPECIES[String(species)].name, level, exp: expFor(SPECIES[String(species)].growth ?? 0, level),
     hp: 20, maxHP: 20, away: true, moves });
const dir = mkdtempSync(join(tmpdir(), "battle-commons-"));
const saves = { a: join(dir, "a.sav"), b: join(dir, "b.sav"), s: join(dir, "s.sav") };
writeFileSync(saves.a, buildSave({ player: "ROVER", trainerId: 0x110007, slots: [{ counter: 4, party: [mon(1001, 0x110007, 1, 20, [22, 33])] }, { counter: 3, party: [] }] }));
writeFileSync(saves.b, buildSave({ player: "KIT", trainerId: 0x220009, slots: [{ counter: 4, party: [mon(2001, 0x220009, 4, 18, [10, 45])] }, { counter: 3, party: [] }] }));
writeFileSync(saves.s, buildSave({ player: "SAM", trainerId: 0x330005, slots: [{ counter: 4, party: [mon(3001, 0x330005, 7, 15, [55])] }, { counter: 3, party: [] }] }));

const servers: Server[] = [];
const up = async (s: Server) => { servers.push(s); await new Promise<void>((r) => s.listen(0, "127.0.0.1", () => r())); return `http://127.0.0.1:${(s.address() as AddressInfo).port}`; };
let commons = "", hubA = "", hubB = "", hubS = "";
beforeAll(async () => {
  commons = await up(makeCommons(new Store(":memory:")));
  hubA = await up(makeServer({ ...DEFAULTS, database: ":memory:", savePath: saves.a, edition: "CONTENT" as const }));
  hubB = await up(makeServer({ ...DEFAULTS, database: ":memory:", savePath: saves.b, edition: "CONTEXT" as const }));
  hubS = await up(makeServer({ ...DEFAULTS, database: ":memory:", savePath: saves.s, edition: "CONTENT" as const }));
});
afterAll(() => servers.forEach((s) => s.close()));
const get = (u: string) => fetch(u).then((r) => r.json());
const post = (u: string, b: unknown) => fetch(u, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) }).then((r) => r.json());

// each home's app is a seat of its own; ask(0) is ROVER's, ask(1) KIT's, sam() the stranger's
const seat = (hub: string, device: string, label: string) => (path: string, b?: unknown) => {
  const u = `${hub}${path}?device=${device}&label=${label}`;
  return b === undefined ? get(u) : post(u, b);
};
const ask = (who: 0 | 1, path: string, b?: unknown) => (who === 0 ? seat(hubA, "app-rover001", "IPHONE") : seat(hubB, "app-kit00001", "IPAD"))(path, b);
const sam = (path: string, b?: unknown) => seat(hubS, "app-sam00001", "PHONE")(path, b);

async function playOut(id: string) {
  for (let i = 0; i < 300; i++) {
    const v = [(await ask(0, "/api/battle")).fights.find((f: any) => f.id === id), (await ask(1, "/api/battle")).fights.find((f: any) => f.id === id)];
    if (v[0]?.phase === "over" && v[1]?.phase === "over") return v;
    for (const w of [0, 1] as const) {
      const f = v[w];
      if (!f || f.phase !== "on" || f.chosen[f.me]) continue;
      const m = f.sides[f.me].daemon.moves.find((x: any) => x.pp > 0);
      expect((await ask(w, "/api/battle/choose", { id: f.id, slot: m ? m.slot : -1 })).error).toBeUndefined();
    }
  }
  throw new Error("no winner");
}

describe("BATTLES across homes, through THE COMMONS (C-422)", () => {
  it("friends' homes battle live and by CHALLENGE, each home giving its own daemon's experience; a stranger home sees neither", async () => {
    await post(`${hubA}/api/trade/join`, { name: "ROVER" });
    await post(`${hubB}/api/trade/join`, { name: "KIT" });
    await post(`${hubS}/api/trade/join`, { name: "SAM" });
    await post(`${hubA}/api/commons`, { url: commons, name: "Rover House" });
    await post(`${hubB}/api/commons`, { url: commons, name: "Kit House" });
    await post(`${hubS}/api/commons`, { url: commons, name: "Sam House" });
    for (const h of (await get(`${commons}/commons/keeper`)).homes) await post(`${commons}/commons/approve`, { id: h.id });
    const a = (await get(`${hubA}/api/commons`)).home;
    await post(`${hubB}/api/commons/friend`, { code: a.code });
    await post(`${hubA}/api/commons/friend/accept`, { id: (await get(`${hubA}/api/commons`)).home.asks[0].id });

    // KIT's hub has spoken for KIT on the commons (its TRADE page) but KIT has not looked at BATTLE: a friend to leave a
    // challenge for, not online; the stranger is neither
    await get(`${hubB}/api/trade`);
    const first = await ask(0, "/api/battle");
    expect(first.friends).toBe(true);
    expect(first.known).toEqual([expect.objectContaining({ label: "KIT · KIT HOUSE", kind: "friend" })]);
    await sam("/api/battle");
    await ask(1, "/api/battle");                                       // KIT looks: online now
    const kitSeat = (await ask(0, "/api/battle")).online.find((o: any) => o.kind === "friend");
    expect(kitSeat).toMatchObject({ label: "KIT · KIT HOUSE" });
    expect(kitSeat.seat).toMatch(/^player:c:/);
    const strangers = await sam("/api/battle");
    expect([...strangers.online, ...strangers.known].map((o: any) => o.label)).toEqual([]);   // ROVER and KIT, unseen

    // live: ROVER asks KIT, KIT accepts, both choose to the end
    const asked = await ask(0, "/api/battle/request", { to: kitSeat.seat });
    expect(asked).toMatchObject({ far: true, commons: true, phase: "asked" });
    expect(asked.id).toMatch(/^x:c:/);
    const theirs = (await ask(1, "/api/battle")).fights.find((f: any) => f.id === asked.id);
    expect(theirs).toMatchObject({ phase: "asked", me: 1, asking: "ROVER · ROVER HOUSE wants to engage!" });
    expect((await ask(1, "/api/battle/answer", { id: asked.id, accept: true })).error).toBeUndefined();
    const live = await playOut(asked.id);
    expect(live[0].result).toMatch(/outscored/);
    const seenA = (await ask(0, "/api/battle")).fights.find((f: any) => f.id === asked.id);
    const seenB = (await ask(1, "/api/battle")).fights.find((f: any) => f.id === asked.id);
    expect(seenA.counted[0]).toBe(true);                               // each home gave its own daemon its experience
    expect(seenB.counted[1]).toBe(true);
    expect(seenA.counted[1]).toBeNull();                               // and not the other home's

    // a CHALLENGE open to friends' homes: KIT leaves it, ROVER takes it, KIT's daemon fights by itself
    const left = await ask(1, "/api/battle/challenge", { where: "friends" });
    expect(left).toMatchObject({ commons: true, challenge: true, open: true, me: 0 });
    expect((await sam("/api/battle")).fights).toEqual([]);              // a stranger is never shown it
    const open = (await ask(0, "/api/battle")).fights.find((f: any) => f.id === left.id);
    expect(open).toMatchObject({ phase: "asked", open: true, me: null, commons: true });
    expect((await ask(0, "/api/battle/answer", { id: left.id, accept: true })).error).toBeUndefined();
    const end = await playOut(left.id);
    expect(end[1]).toMatchObject({ phase: "over", auto: [true, false], watched: [false, true] });
    expect((await ask(1, "/api/battle/seen", { id: left.id })).watched).toEqual([true, true]);
  }, 60_000);
});
