// C-328: BATTLES -- the fight (battle.ts) from the game's own numbers, the arena's turns and clock (battles.ts), and a
// battle played end to end between two of one household's devices and between two players. Synthetic saves only.
import { describe, expect, it } from "vitest";
import speciesJson from "../data/species.json" with { type: "json" };
import battleJson from "../data/battle.json" with { type: "json" };
import { expFor } from "../src/save/growth.js";
import { calcStats } from "../src/save/stats.js";
import { battleCard } from "../src/save/battler.js";
import { autoPick, battleExp, effectiveness, gameExp, resolve, say, start } from "../src/battle.js";
import * as A from "../src/battles.js";
import { battleRoute, type BoardSeen } from "../src/battleroute.js";
import * as X from "../src/exchange.js";
import { exchangeRoute, localLink, remoteLink, type Link } from "../src/tradelink.js";
import { pendingExp } from "../src/core.js";
import { assign } from "../src/carry.js";
import { Store } from "../src/db.js";
import { buildSave, type DaemonSpec } from "./build_save.js";

const SPECIES = speciesJson as unknown as Record<string, any>;
const mon = (personality: number, otId: number, species: number, level: number, extra: Partial<DaemonSpec> = {}): DaemonSpec =>
  ({ personality, otId, species, nickname: SPECIES[String(species)].name, level, exp: expFor(SPECIES[String(species)].growth ?? 0, level),
     hp: 20, maxHP: 20, away: true, ...extra });
const ID = 0x00110007, KIT = 0x00220009;
// ROVERCUB (GROWTH) with BACKPROP and WRITE; LABEL (CONTENT) with FLIP and DERATE; CLUSTER (VECTOR) with TRICKLE
const household = () => buildSave({ player: "ROVER", trainerId: ID, slots: [{ counter: 4, party: [
  mon(1001, ID, 1, 20, { moves: [22, 33], ivs: 0x3fffffff }), mon(1002, ID, 4, 18, { moves: [10, 45] }), mon(1003, ID, 7, 5, { away: false, moves: [55] })] },
  { counter: 3, party: [] }] });
const kitSave = () => buildSave({ player: "KIT", trainerId: KIT, slots: [{ counter: 4, party: [mon(2001, KIT, 7, 19, { moves: [55, 33] })] }, { counter: 3, party: [] }] });

const card = (save: Uint8Array, p: number) => { const c = battleCard(save, p); if (typeof c === "string") throw new Error(c); return c; };
const playOut = (s: ReturnType<typeof start>) => { for (let t = 0; t < 200 && s.winner === null && !s.draw; t++) resolve(s, [autoPick(s, 0), autoPick(s, 1)]); return s; };

describe("the fight (battle.ts), from the game's own numbers", () => {
  it("reads a daemon AWAY as it would stand: the game's stats, its routines and their MP, its types", () => {
    const c = card(household(), 1001);
    expect(c).toMatchObject({ species: 1, level: 20, types: [12], nickname: "ROVERCUB" });
    expect(c.stats).toEqual(calcStats(SPECIES["1"].base, 20, [31, 31, 31, 31, 31, 31], [0, 0, 0, 0, 0, 0], 1001));
    expect(c.moves).toEqual([{ id: 22, pp: 10 }, { id: 33, pp: 35 }]);
    expect(battleCard(household(), 1003)).toMatch(/AWAY/);             // at home it is the game's, not the companion's
  });

  it("judges by the game's own chart, entry by entry (ENTROPY on GROWTH is twice; CONTENT on LATENT nothing)", () => {
    expect(effectiveness(10, [12])).toBe(2);
    const chart = (battleJson as any).chart as number[][];
    for (const [a, d] of chart.slice(0, 20)) expect(effectiveness(a, [d])).toBe(chart.filter((c) => c[0] === a && c[1] === d).reduce((m, c) => m * c[2] / 10, 1));
    expect(effectiveness(0, [7])).toBe(0);
    expect(x10(chart, 0, 7)).toBe(0);
  });

  it("speaks the game's words", () => {
    expect(say("AttackerUsedX", { atk: "PIP", buf2: "WRITE!" })).toBe("PIP invoked WRITE!");
    expect(say("SuperEffective")).toBe("It's super effective!");
  });

  it("plays to a winner the same way from the same seed, and gives the game's experience", () => {
    const h = household();
    const a = playOut(start(card(h, 1001), card(h, 1002), 42)), b = playOut(start(card(h, 1001), card(h, 1002), 42));
    expect(a.winner).not.toBeNull();
    expect(a.log).toEqual(b.log);
    const w = a.winner!, l = (1 - w) as 0 | 1, exp = battleExp(a);
    expect(exp[w]).toBe(Math.trunc(Math.trunc((SPECIES[String(a.sides[l].card.species)] && (battleJson as any).exp[String(a.sides[l].card.species)]) * a.sides[l].card.level / 7) * 1.5));
    expect(exp[l]).toBe(Math.trunc(gameExp(a.sides[w].card) / 3));
    expect(a.log.flat().some((x) => /invoked/.test(x.text))).toBe(true);
    expect(a.log.flat().some((x) => /HALTED!/.test(x.text))).toBe(true);
  });

  it("deals damage as the game's formula does: a WRITE from a level 20 ROVERCUB lands within the roll", () => {
    const h = household(), me = card(h, 1001), foe = card(h, 1002);
    const s = start(me, { ...foe, moves: [{ id: 45, pp: 40 }] }, 7);
    resolve(s, [1, 0]);
    const lost = foe.stats.maxHP - s.sides[1].hp;
    const base = Math.trunc(Math.trunc((me.stats.atk * 35 * Math.trunc(2 * 20 / 5 + 2)) / foe.stats.def) / 50) + 2;
    const crit = s.log[0].some((x) => x.text === "A critical hit!") ? 2 : 1;
    if (!s.log[0].some((x) => /missed/.test(x.text))) {   // WRITE is 95% sure
      expect(lost).toBeGreaterThanOrEqual(Math.trunc(base * crit * 85 / 100));
      expect(lost).toBeLessThanOrEqual(base * crit);
    }
  });
});

describe("the arena (battles.ts): asked, answered, turns, the clock", () => {
  const h = household(), c1 = card(h, 1001), c2 = card(h, 1002);
  it("asks one seat; a seat is in one battle at a time; a request lapses after a minute", () => {
    const s = new Store(":memory:"), t0 = new Date("2026-11-11T10:00:00Z");
    const f = A.request(s, "k", { seat: "app-aaa111", label: "IPHONE", card: c1 }, { seat: "watch-bbb222", label: "WATCH" }, t0);
    expect(A.failed(f)).toBe(false);
    expect(A.request(s, "k", { seat: "app-aaa111", label: "IPHONE", card: c1 }, { seat: "x-ccc333", label: "X" }, t0)).toMatchObject({ error: expect.stringMatching(/already/) });
    expect(A.fights(s, "k", new Date(t0.getTime() + 61_000))[0].phase).toBe("lapsed");
  });
  it("chooses for a side that does not, after the turn's 30 seconds, and three missed turns is a forfeit", () => {
    const s = new Store(":memory:"), t0 = new Date("2026-11-11T10:00:00Z");
    const f = A.request(s, "k", { seat: "app-aaa111", label: "IPHONE", card: c1 }, { seat: "watch-bbb222", label: "WATCH" }, t0) as A.Fight;
    A.answer(s, "k", f.id, "watch-bbb222", true, { ...c2, stats: { ...c2.stats, maxHP: 999 } }, "WATCH", t0, 1);
    let t = t0.getTime();
    // the iPhone chooses every turn; the watch never does
    for (let k = 0; k < 3; k++) {
      A.choose(s, "k", f.id, "app-aaa111", 1, new Date(t += 1000));
      t += A.TURN_MS + A.READ_MS;
    }
    const after = A.fights(s, "k", new Date(t + 1000)).find((x) => x.id === f.id)!;
    expect(after.phase).toBe("over");
    expect(after.forfeit).toBe(1);
    expect(after.battle!.winner).toBe(0);
    expect(A.award(s, "k", f.id, 0)).toBe(after.exp[0]);
    expect(A.award(s, "k", f.id, 0)).toBe(0);                          // once
  });
  it("a request declined, or withdrawn, ends it", () => {
    const s = new Store(":memory:");
    const f = A.request(s, "k", { seat: "app-aaa111", label: "IPHONE", card: c1 }, { seat: "watch-bbb222", label: "WATCH" }) as A.Fight;
    expect(A.answer(s, "k", f.id, "watch-bbb222", false, null)).toMatchObject({ phase: "declined" });
  });
});

// a battle played out: each side answers its own routine until there is a winner
async function fight(ask: (who: 0 | 1, path: string, b?: any) => Promise<any>, id: string) {
  for (let turn = 0; turn < 300; turn++) {
    const views = [await ask(0, "/api/battle"), await ask(1, "/api/battle")];
    const v = views.map((x) => x.body.fights.find((f: any) => f.id === id || f.id.endsWith(id)));
    if (v[0].phase === "over") return v;
    for (const w of [0, 1] as const) if (!v[w].chosen[v[w].me]) {
      const mine = v[w].sides[v[w].me].daemon.moves.find((m: any) => m.pp > 0);
      const r = await ask(w, "/api/battle/choose", { id: v[w].id, slot: mine ? mine.slot : 0 });
      expect(r.status).toBe(200);
    }
  }
  throw new Error("no winner");
}

describe("within the household: the app and a watch, both this save's daemons", () => {
  it("lists who is online, asks, accepts, plays to a winner, and gives both their experience once", async () => {
    const bytes = household(), store = new Store(":memory:");
    const watch = "t-watch-ultra-abc123";
    assign(store, watch, 1002);                                         // the watch carries LABEL
    const boards = (): BoardSeen[] => [{ id: watch, kind: "t-watch-ultra", here: true }];
    const ask = (who: 0 | 1, path: string, b?: any): Promise<any> => battleRoute({ save: bytes, boards, link: null }, store, b === undefined ? "GET" : "POST", path,
                                                                  who === 0 ? "app-phone01" : watch, who === 0 ? { label: "IPHONE", personality: "1001" } : {}, b ?? {});
    const first = await ask(0, "/api/battle");
    expect(first.body).toMatchObject({ seat: "app-phone01", daemon: { personality: 1001 }, chooses: true });
    expect(first.body.online).toEqual([expect.objectContaining({ seat: watch, kind: "device", daemon: expect.objectContaining({ nickname: "LABEL" }) })]);
    const asked = await ask(0, "/api/battle/request", { to: watch });
    expect(asked.status).toBe(200);
    const inbox = await ask(1, "/api/battle");
    expect(inbox.body.fights[0]).toMatchObject({ phase: "asked", me: 1, asking: "IPHONE wants to engage!" });
    expect((await ask(1, "/api/battle/answer", { id: asked.body.id, accept: true })).status).toBe(200);
    const end = await fight(ask, asked.body.id);
    expect(end[0].result).toMatch(/outscored/);
    const [e0, e1] = end[0].exp;
    expect(e0 + e1).toBeGreaterThan(0);
    await ask(0, "/api/battle"); await ask(1, "/api/battle");             // seen again: nothing given twice
    expect(pendingExp(store, 1001).exp).toBe(e0);
    expect(pendingExp(store, 1002).exp).toBe(e1);
    expect(bytes).toEqual(household());                                 // the save is untouched until SYNC writes the experience
  }, 30_000);
  it("an app that has not chosen fights with a daemon no device carries", async () => {
    const bytes = household(), store = new Store(":memory:");
    assign(store, "t-watch-ultra-abc123", 1001);
    const r: any = await battleRoute({ save: bytes, boards: () => [], link: null }, store, "GET", "/api/battle", "site-abcdef12", {}, {});
    expect(r.body.daemon.personality).toBe(1002);
  });
  it("refuses a device that is not online, and a daemon at home", async () => {
    const bytes = household(), store = new Store(":memory:");
    const r = await battleRoute({ save: bytes, boards: () => [], link: null }, store, "POST", "/api/battle/request", "app-phone01", {}, { to: "t-watch-ultra-abc123" });
    expect(r.status).toBe(400);
    const home: any = await battleRoute({ save: bytes, boards: () => [], link: null }, store, "GET", "/api/battle", "app-phone01", { personality: "1003" }, {});
    expect(home.body.daemon).toBeNull();
  });
});

describe("between players, through the exchange", () => {
  it("a request to another player online, accepted on their app, played out; each companion gives its own daemon's experience", async () => {
    let n = 0;
    const KEYS: X.Keys = { token: () => `tok${++n}`, hash: (t) => `h:${t}`, password: (pw) => pw, check: () => false, code: () => `CODE${++n}` };
    const hub = new Store(":memory:"), kitStore = new Store(":memory:");
    const viaHub = (async (url: string, init: any) => {
      const name = String(url).split("/api/exchange/")[1], b = init.body ? JSON.parse(init.body) : {};
      const out = (body: unknown) => ({ status: 200, json: async () => JSON.parse(JSON.stringify(body)) });
      if (name === "join") return out(X.join(hub, KEYS, b));
      const p = X.playerFor(hub, KEYS, init.headers["x-daemons-player"] ?? "");
      if (!p) return out({ error: "join the exchange first" });
      if (name === "me") return out(X.players(hub).find((v) => v.id === p.id));
      return out(await exchangeRoute(hub, KEYS, p, name, b));
    }) as unknown as typeof fetch;
    const rover: Link = localLink(hub, KEYS), kit: Link = remoteLink(kitStore, "http://hub:4730", viaHub);
    await rover.join({ name: "ROVER" });
    const code = X.invite(hub, KEYS).code;
    await kit.join({ name: "KIT", code });
    const roverSave = household(), kitBytes = kitSave();
    const ask = (who: 0 | 1, path: string, b?: any): Promise<any> => who === 0
      ? battleRoute({ save: roverSave, boards: () => [], link: rover }, hub, b === undefined ? "GET" : "POST", path, "app-rover01", { label: "IPHONE", personality: "1001" }, b ?? {})
      : battleRoute({ save: kitBytes, boards: () => [], link: kit }, kitStore, b === undefined ? "GET" : "POST", path, "site-kit0001", { label: "THE SITE" }, b ?? {});
    await ask(1, "/api/battle");                                        // KIT is online
    const list = await ask(0, "/api/battle");
    const kitSeat = list.body.online.find((o: any) => o.kind === "player");
    expect(kitSeat).toMatchObject({ label: "KIT" });
    const asked = await ask(0, "/api/battle/request", { to: kitSeat.seat });
    expect(asked.status).toBe(200);
    expect(asked.body.id).toMatch(/^x:/);
    const theirs = await ask(1, "/api/battle");
    const req = theirs.body.fights.find((f: any) => f.phase === "asked");
    expect(req).toMatchObject({ far: true, asking: "ROVER wants to engage!" });
    expect((await ask(1, "/api/battle/answer", { id: req.id, accept: true })).status).toBe(200);
    const end = await fight(ask, asked.body.id.slice(2));
    expect(end[0].result).toMatch(/outscored/);
    await ask(0, "/api/battle"); await ask(1, "/api/battle"); await ask(0, "/api/battle");
    expect(pendingExp(hub, 1001).exp).toBe(end[0].exp[0]);
    expect(pendingExp(kitStore, 2001).exp).toBe(end[1].exp[1]);
    expect(pendingExp(kitStore, 1001).exp).toBe(0);                    // ROVER's daemon is not KIT's to grow
  }, 30_000);
});

function x10(chart: number[][], a: number, d: number) { return chart.filter((c) => c[0] === a && c[1] === d).reduce((m, c) => m * c[2] / 10, 1); }
