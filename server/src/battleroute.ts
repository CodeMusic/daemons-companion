// C-290: this file runs on the phone too (C-111) -- the app imports it, directly or through another file -- so keep it free of Node-only APIs (node:*, fs).
// C-328: BATTLE, as every device asks its own companion for it (/api/battle*), and as the exchange answers players
// (exchangeBattle, through /api/exchange/battle*). The arena is battles.ts; the fight is battle.ts.
//
// A SEAT is whoever asks: a board or watch by its device id (x-device), the app or the site by the id it made for
// itself (?device=app-...). Online is a board heard in the last minute (devices.ts) or an app or site that asked here in
// the last minute. A board fights with the daemon it carries (carry.ts); the app and the site pick one of the daemons away.
//
// Between players the battle is the exchange's (arena "exchange.battles" on the hub, the seat "player:<id>"); this
// companion keeps which of its seats is in it (`battle.remote`), asks the exchange each time it is asked, and gives its
// own daemon's experience once. Within the household both daemons are this save's, and both are given theirs.
import type { Store } from "./store.js";
import type { Reply } from "./routes.js";
import type { Link } from "./tradelink.js";
import * as A from "./battles.js";
import type { Card } from "./battle.js";
import { battleCard, cardOfRecord } from "./save/battler.js";
import { tradeRecord, toB64, fromB64 } from "./save/trade.js";
import { readAway } from "./save/reader.js";
import { levelFromExp } from "./save/growth.js";
import { carrying } from "./carry.js";
import { pendingExp } from "./core.js";
import { validDeviceId } from "./deviceid.js";
import speciesJson from "../data/species.json" with { type: "json" };

const SPECIES = speciesJson as unknown as Record<string, { growth?: number }>;
const HOME = "battles", SEATS = "battle.seats", REMOTE = "battle.remote", FRESH = 60_000;
type SeatRow = { label: string; at: string; personality: number | null };
type Remote = Record<string, { seat: string; personality: number; awarded?: boolean }>;
const parsed = <T>(s: string | null, d: T): T => { try { return (JSON.parse(s ?? "null") as T) ?? d; } catch { return d; } };
const ok = (body: unknown, status = 200): Reply => ({ status, body });
const no = (status: number, error: string): Reply => ({ status, body: { error } });
const answer = (r: any): Reply => (r?.error ? no(400, r.error) : ok(r));
const X = "x:";                                                 // a battle on the exchange, as this companion names it

export interface BoardSeen { id: string; kind: string; here: boolean }
export interface BattleHost { save: Uint8Array | null; boards: () => BoardSeen[]; link: Link | null }

// the daemon a seat fights with: a board's own; the app's or site's chosen one (or the first away, until it chooses)
function daemonOf(store: Store, save: Uint8Array | null, seat: string, chosen: number | null) {
  if (!save) return null;
  let away; try { away = readAway(save); } catch { return null; }
  const map = carrying(store), carried = map[seat];
  const chosenOne = away.find((d) => d.personality >>> 0 === (chosen ?? carried) >>> 0);
  if (chosenOne || chosen !== null || carried !== undefined) return chosenOne ?? null;
  // none chosen yet: the first away that no device carries (a device fights with its own)
  const held = new Set(Object.values(map).map((p) => p >>> 0));
  return away.find((d) => !held.has(d.personality >>> 0)) ?? away[0] ?? null;
}
// its card at the level it has grown to here (the experience waiting for the next SYNC counts)
function cardOf(store: Store, save: Uint8Array | null, personality: number): Card | string {
  if (!save) return "no save named -- set it in Settings";                                   // DRAFT
  const d = readAway(save).find((x) => x.personality >>> 0 === personality >>> 0);
  if (!d) return "only a daemon AWAY can fight -- SEND it from the game first";              // DRAFT
  const level = Math.max(d.level, levelFromExp(SPECIES[String(d.species)]?.growth ?? 0, d.exp + pendingExp(store, d.personality).exp));
  return battleCard(save, d.personality, level);
}
const seatLabel = (b: BoardSeen) => b.kind.toUpperCase();

// the experience, written as a step's is (core.ts pendingExp): "<personality> <gain> battle <id>"
function give(store: Store, personality: number, exp: number, id: string) {
  if (exp > 0) store.logInteraction("exp", `${personality >>> 0} ${exp} battle ${id}`);
}

export async function battleRoute(h: BattleHost, store: Store, method: string, path: string, seatAsked: string, q: Record<string, string>, b: any, now = new Date()): Promise<Reply> {
  const seat = validDeviceId(seatAsked) ? seatAsked : "";
  if (!seat) return no(400, "name this device: ?device=");                                  // DRAFT
  const seats = parsed<Record<string, SeatRow>>(store.getSetting(SEATS), {});
  const boards = h.boards();
  const isBoard = boards.some((x) => x.id === seat);
  // here now: an app or site that asks is online for a minute; it says what it is called and which daemon it chose
  if (!isBoard) {
    const was = seats[seat], pick = b.personality ?? q.personality;
    seats[seat] = { label: String(q.label ?? b.label ?? was?.label ?? "a device").slice(0, 24), at: now.toISOString(),
                    personality: pick !== undefined && pick !== "" ? Number(pick) >>> 0 : was?.personality ?? null };
    for (const [k, v] of Object.entries(seats)) if (now.getTime() - Date.parse(v.at) > 7 * 86400_000) delete seats[k];
    store.setSetting(SEATS, JSON.stringify(seats));
  }
  const myLabel = isBoard ? seatLabel(boards.find((x) => x.id === seat)!) : seats[seat].label;
  const mine = daemonOf(store, h.save, seat, isBoard ? null : seats[seat]?.personality ?? null);
  const remote = parsed<Remote>(store.getSetting(REMOTE), {});
  const keepRemote = () => store.setSetting(REMOTE, JSON.stringify(remote));
  const me = h.link ? await h.link.me().catch(() => null) : null;
  // to the exchange a daemon goes as its record and its level: the hub works its card out itself
  const sent = (c: Card) => { const t = tradeRecord(h.save!, c.personality); return { record: typeof t === "string" ? "" : toB64(t.record), level: c.level }; };
  const myCard = () => (mine ? cardOf(store, h.save, mine.personality) : "choose a daemon to fight with");   // DRAFT

  // ---- the household's arena, and what it owes: both sides' experience, both daemons being this save's ----
  const settle = (fs: A.Fight[]) => {
    for (const f of fs) if (f.phase === "over") for (const i of [0, 1] as const) {
      const card = (f.battle?.sides[i].card) ?? null, exp = card ? A.award(store, HOME, f.id, i) : 0;
      if (card && exp) give(store, card.personality, exp, f.id);
    }
  };

  if (method === "GET" && path === "/api/battle") {
    const all = A.fights(store, HOME, now); settle(all);
    const ours = A.fightsOf(all, seat);
    // the exchange: this player online, the others online, and its battles (a request to this player shows on every seat)
    let far: any = null;
    if (me) { far = await h.link!.call("battle", {}); if (far?.error) far = null; }
    const farFights: any[] = (far?.fights ?? []).filter((f: any) => remote[f.id]?.seat === seat || (f.phase === "asked" && f.me === 1));
    for (const f of far?.fights ?? []) {                         // over: this side's experience, once
      const r = remote[f.id];
      if (f.phase === "over" && r && !r.awarded && f.me !== null) {
        const exp = await h.link!.call("battle/award", { id: f.id });
        r.awarded = true; keepRemote();
        if (exp && !exp.error && exp.exp > 0) give(store, r.personality, exp.exp, X + f.id);
      }
    }
    const online = [
      ...boards.filter((x) => x.here && x.id !== seat).map((x) => {
        const d = daemonOf(store, h.save, x.id, null);
        return { seat: x.id, label: seatLabel(x), kind: "device", daemon: d ? { nickname: d.nickname, name: d.name, species: d.species, level: d.level } : null };
      }),
      ...Object.entries(seats).filter(([k, v]) => k !== seat && !boards.some((x) => x.id === k) && now.getTime() - Date.parse(v.at) < FRESH)
        .map(([k, v]) => ({ seat: k, label: v.label, kind: "app", daemon: null })),
      ...(far?.players ?? []).map((p: any) => ({ seat: `player:${p.id}`, label: p.name, kind: "player", daemon: null })),
    ];
    let away: { personality: number; nickname: string; name: string; species: number; level: number }[] = [];
    try { away = h.save ? readAway(h.save).map((d) => ({ personality: d.personality >>> 0, nickname: d.nickname, name: d.name, species: d.species, level: d.level })) : []; } catch { /* none */ }
    return ok({
      seat, label: myLabel, player: me ? { id: me.id, name: me.name } : null,
      daemon: mine ? { personality: mine.personality >>> 0, nickname: mine.nickname, name: mine.name, species: mine.species, level: mine.level } : null,
      chooses: !isBoard, away, online,
      fights: [...ours.map((f) => A.view(f, seat, now)), ...farFights.map((f) => ({ ...f, id: X + f.id, far: true }))]
        .sort((x: any, y: any) => String(y.at).localeCompare(String(x.at))),
    });
  }
  if (method !== "POST") return no(404, "not found");
  const id = String(b.id ?? ""), isFar = id.startsWith(X), farId = id.slice(X.length);

  if (path === "/api/battle/pick") return ok({ personality: seats[seat]?.personality ?? null });   // an app's or site's daemon, kept above
  if (path === "/api/battle/request") {
    const to = String(b.to ?? "");
    const card = myCard();
    if (typeof card === "string") return no(400, card);
    if (to.startsWith("player:")) {
      if (!me) return no(400, "join the exchange first -- TRADE on the YOU tab");             // DRAFT
      const r = await h.link!.call("battle/request", { to: to.slice("player:".length), ...sent(card) });
      if (r?.error) return no(400, r.error);
      remote[r.id] = { seat, personality: card.personality }; keepRemote();
      return ok({ ...r, id: X + r.id, far: true });
    }
    const target = boards.find((x) => x.id === to && x.here) ?? (seats[to] && now.getTime() - Date.parse(seats[to].at) < FRESH ? { label: seats[to].label } : null);
    if (!target) return no(400, "that device is not online now");                             // DRAFT
    const label = "kind" in target ? seatLabel(target as BoardSeen) : (target as { label: string }).label;
    return answer(viewed(A.request(store, HOME, { seat, label: myLabel, card }, { seat: to, label }, now), seat, now));
  }
  if (path === "/api/battle/answer") {
    const yes = b.accept === true;
    let card: Card | string | null = null;
    if (yes) {
      const pick = b.personality !== undefined ? Number(b.personality) >>> 0 : mine?.personality;
      card = pick === undefined ? "choose a daemon to fight with" : cardOf(store, h.save, pick);   // DRAFT
      if (typeof card === "string") return no(400, card);
    }
    if (isFar) {
      const r = await h.link!.call("battle/answer", { id: farId, accept: yes, ...(yes && card ? sent(card as Card) : {}) });
      if (r?.error) return no(400, r.error);
      if (yes && card) { remote[farId] = { seat, personality: (card as Card).personality }; keepRemote(); }
      return ok({ ...r, id: id, far: true });
    }
    return answer(viewed(A.answer(store, HOME, id, seat, yes, card as Card | null, myLabel, now), seat, now));
  }
  if (path === "/api/battle/choose" || path === "/api/battle/leave") {
    const what = path.endsWith("choose") ? "choose" : "leave";
    if (isFar) {
      if (remote[farId]?.seat !== seat) return no(400, "that battle is another device's");      // DRAFT
      const r = await h.link!.call(`battle/${what}`, { id: farId, slot: b.slot });
      return r?.error ? no(400, r.error) : ok({ ...r, id, far: true });
    }
    const r = what === "choose" ? A.choose(store, HOME, id, seat, b.slot, now) : A.leave(store, HOME, id, seat, now);
    if (!A.failed(r)) settle([r]);
    return answer(viewed(r, seat, now));
  }
  return no(404, "not found");
}
const viewed = (r: A.Result<A.Fight>, seat: string, now: Date) => (A.failed(r) ? r : A.view(r, seat, now));
export const BATTLE_PATHS = ["/api/battle", "/api/battle/pick", "/api/battle/request", "/api/battle/answer", "/api/battle/choose", "/api/battle/leave"];

// ---- the exchange's half: players battle as "player:<id>" (tradelink.ts exchangeRoute sends these here) ----
const XKEY = "exchange.battles", XSEEN = "exchange.battle.seen";
export function exchangeBattle(store: Store, player: { id: string; name: string }, name: string, b: any,
                               players: { id: string; name: string }[], reach: (a: string, b: string) => boolean = () => true, now = new Date()): any {
  const seat = `player:${player.id}`;
  const seen = parsed<Record<string, string>>(store.getSetting(XSEEN), {});
  seen[player.id] = now.toISOString(); store.setSetting(XSEEN, JSON.stringify(seen));
  const v = (r: A.Result<A.Fight>) => (A.failed(r) ? r : A.view(r, seat, now));
  const card = (): Card | string => {
    const rec = fromB64(String(b.record ?? ""));
    return rec ? cardOfRecord(rec, Number(b.level) || null) : "that daemon's record is damaged";   // DRAFT
  };
  switch (name) {
    case "battle": {
      const online = players.filter((p) => p.id !== player.id && reach(player.id, p.id) && now.getTime() - Date.parse(seen[p.id] ?? "0") < FRESH);
      return { players: online.map((p) => ({ id: p.id, name: p.name })),
               fights: A.fightsOf(A.fights(store, XKEY, now), seat).map((f) => A.view(f, seat, now)) };
    }
    case "battle/request": {
      const to = players.find((p) => p.id === String(b.to ?? ""));
      if (!to || !reach(player.id, to.id)) return { error: "no such player" };                 // DRAFT
      const c = card();
      if (typeof c === "string") return { error: c };
      return v(A.request(store, XKEY, { seat, label: player.name, card: c }, { seat: `player:${to.id}`, label: to.name }, now));
    }
    case "battle/answer": {
      const c = b.accept === true ? card() : null;
      if (typeof c === "string") return { error: c };
      return v(A.answer(store, XKEY, String(b.id ?? ""), seat, b.accept === true, c, player.name, now));
    }
    case "battle/choose": return v(A.choose(store, XKEY, String(b.id ?? ""), seat, b.slot, now));
    case "battle/leave": return v(A.leave(store, XKEY, String(b.id ?? ""), seat, now));
    case "battle/award": {
      const f = A.fights(store, XKEY, now).find((x) => x.id === String(b.id ?? ""));
      const side = f ? (f.from.seat === seat ? 0 : f.to.seat === seat ? 1 : null) : null;
      return side === null ? { error: "not found" } : { exp: A.award(store, XKEY, f!.id, side) };
    }
    default: return { error: "not found" };
  }
}
