// C-218, C-219 (the user, 2026-10-28, by multiple choice): THE EXCHANGE -- where players with different saves trade. It
// lives on the hub, on the home network and the tailnet (never the internet, until a lobby is its own decision, C-222),
// and every companion trades through it: the hub's own, and any other a player runs (tradelink.ts).
//
// PLAYERS (C-218): a name and the devices that joined as it -- no email, nothing to remember (kids may play). A
// password is optional, and only for joining as the same player from a second device or after losing one; it is kept
// as the hub's own slow hash (api.ts: scrypt), never the password. A device joins with an invite code made on the hub's
// site or a paired phone, so being on the tailnet is not enough.
//
// TRADES (C-219): a player OFFERS a daemon that is AWAY (its whole record, save/trade.ts), FULL or ON LOAN, to anyone or
// to one player; another ACCEPTS with one of theirs, and the swap is agreed at once, both sides together (one write of
// the exchange). Each side's next SYNC writes what it receives into the slot its own left (writer.ts `trade`) and says
// so (`written`). A LOAN is the owner's to call home: then each side hands back the daemon it borrowed, as it is now
// (its next SYNC sends it), and once both are in, each gets its own back the same way.
//
// FAIRNESS: an offered daemon is in one offer at a time; once a daemon has left a game in a trade, that game cannot
// offer it again (a restored save still holding it is refused: the LEDGER). The game itself will not bring a daemon on
// offer home (DAEMONS T-467); until then the writer refuses a trade whose daemon came home, and it waits.
//
// No node: imports: the keys (tokens, password hashes) are the caller's to make.
import type { Store } from "./store.js";
import { describe, fromB64, gameId, type GameKey } from "./save/trade.js";

export interface Keys { token(): string; hash(token: string): string; password(pw: string): string; check(pw: string, kept: string): boolean; code(): string }
export interface Player { id: string; name: string; at: string; tokens: string[]; password: string | null }
export type Kind = "full" | "loan";
export interface Side { player: string; game: GameKey; edition: string; personality: number; species: number; nickname: string; level: number; record: string }
export type OfferState = "open" | "agreed" | "done" | "withdrawn" | "returning" | "returned";   // done: a full trade both SYNCs wrote
export interface Offer { id: string; at: string; kind: Kind; to: string | null; state: OfferState; from: Side; with: Side | null;
                         agreedAt: string | null; written: string[];        // which deliveries a SYNC has written ("<player>:swap" / ":return")
                         handback: Record<string, string> }                 // a loan's return: each player's borrowed daemon, as it is now
interface State { players: Player[]; offers: Offer[]; ledger: Record<string, number[]>; invites: { code: string; until: string }[]; next: number }

const KEY = "exchange", INVITE_MS = 15 * 60 * 1000, NAME = /^[A-Z0-9][A-Z0-9 .'-]{1,11}$/;
const load = (store: Store): State => {
  try { const s = JSON.parse(store.getSetting(KEY) ?? "null"); if (s?.players) return s; } catch { /* a new exchange */ }
  return { players: [], offers: [], ledger: {}, invites: [], next: 1 };
};
// every change is one read and one write of the whole exchange, inside the store's transaction: two accepts of one
// offer cannot both succeed
function change<T>(store: Store, f: (s: State) => T): T {
  return store.together(() => { const s = load(store); const r = f(s); store.setSetting(KEY, JSON.stringify(s)); return r; });
}
const fail = (error: string) => ({ error });
export type Result<T> = T | { error: string };
export const failed = <T>(r: Result<T>): r is { error: string } => typeof r === "object" && r !== null && "error" in r;

// ---- players ----
export function invite(store: Store, keys: Keys, now = new Date()): { code: string; until: string } {
  return change(store, (s) => {
    s.invites = s.invites.filter((i) => new Date(i.until) > now);
    const inv = { code: keys.code(), until: new Date(now.getTime() + INVITE_MS).toISOString() };
    s.invites.push(inv);
    return inv;
  });
}
// a new player (with an invite), or the same player from another device (with its password); `local` is the hub's own
// companion, which needs no invite
export function join(store: Store, keys: Keys, b: { name?: unknown; code?: unknown; password?: unknown }, local = false, now = new Date()):
    Result<{ token: string; player: PlayerView; created: boolean }> {
  const name = typeof b.name === "string" ? b.name.trim().toUpperCase() : "";
  if (!NAME.test(name)) return fail("a player's name is 2 to 12 letters or numbers");       // DRAFT
  const pw = typeof b.password === "string" && b.password ? b.password : null;
  if (pw && pw.length < 6) return fail("a password is at least 6 letters");                  // DRAFT
  return change(store, (s) => {
    const was = s.players.find((p) => p.name === name);
    if (was) {
      if (!pw || !was.password || !keys.check(pw, was.password)) return fail("that name is taken -- its password joins it from another device");   // DRAFT
      const token = keys.token(); was.tokens.push(keys.hash(token));
      return { token, player: view(was), created: false };
    }
    s.invites = s.invites.filter((i) => new Date(i.until) > now);
    const inv = s.invites.findIndex((i) => i.code === b.code);
    if (!local && inv < 0) return fail("that invite code is not right, or has run out -- ask for a new one on the hub");   // DRAFT
    if (inv >= 0) s.invites.splice(inv, 1);
    const token = keys.token();
    const p: Player = { id: `p${s.next++}`, name, at: now.toISOString(), tokens: [keys.hash(token)], password: pw ? keys.password(pw) : null };
    s.players.push(p);
    return { token, player: view(p), created: true };
  });
}
export function playerFor(store: Store, keys: Keys, token: string): Player | null {
  if (!token) return null;
  const h = keys.hash(token);
  return load(store).players.find((p) => p.tokens.includes(h)) ?? null;
}
export function setPassword(store: Store, keys: Keys, player: string, pw: unknown): Result<PlayerView> {
  if (typeof pw !== "string" || pw.length < 6) return fail("a password is at least 6 letters");   // DRAFT
  return change(store, (s) => { const p = s.players.find((x) => x.id === player); if (!p) return fail("no such player"); p.password = keys.password(pw); return view(p); });
}
export type PlayerView = { id: string; name: string; at: string; password: boolean };
const view = (p: Player): PlayerView => ({ id: p.id, name: p.name, at: p.at, password: !!p.password });
export const players = (store: Store) => load(store).players.map(view);

// ---- trades ----
// a side, from what a companion sent: its game, its edition and its daemon's record (checked whole here too)
function side(player: string, game: GameKey, edition: string, record: string): Result<Side> {
  const bytes = fromB64(record), d = bytes && describe(bytes);
  if (!d) return fail("that daemon's record is damaged");                                       // DRAFT
  if (edition !== "CONTENT" && edition !== "CONTEXT") return fail("which edition?");
  return { player, game, edition, personality: d.personality, species: d.species, nickname: d.nickname, level: d.level, record };
}
const live = (o: Offer) => o.state === "open" || o.state === "agreed" || o.state === "returning";
const holds = (s: State, game: GameKey, personality: number) =>
  s.offers.some((o) => live(o) && [o.from, o.with].some((x) => x && gameId(x.game) === gameId(game) && x.personality === personality));
// a daemon on loan, held by the game that borrowed it, is not that game's to offer
const borrowed = (s: State, game: GameKey, personality: number) =>
  s.offers.some((o) => o.kind === "loan" && (o.state === "agreed" || o.state === "returning") && o.with &&
    ((gameId(o.with.game) === gameId(game) && o.from.personality === personality) || (gameId(o.from.game) === gameId(game) && o.with.personality === personality)));
const gone = (s: State, game: GameKey, personality: number) => (s.ledger[gameId(game)] ?? []).includes(personality >>> 0);

export function offer(store: Store, player: string, b: { game: GameKey; edition: string; record: string; kind?: unknown; to?: unknown }, now = new Date()): Result<Offer> {
  const kind: Kind = b.kind === "loan" ? "loan" : "full";
  return change(store, (s) => {
    const sd = side(player, b.game, b.edition, b.record);
    if (failed(sd)) return sd;
    if (gone(s, b.game, sd.personality)) return fail(`${sd.nickname} was traded away from this game already`);   // DRAFT
    if (holds(s, b.game, sd.personality)) return fail(`${sd.nickname} is already in a trade`);                  // DRAFT
    if (borrowed(s, b.game, sd.personality)) return fail(`${sd.nickname} is on loan -- it goes home before it can be traded`);   // DRAFT
    const to = typeof b.to === "string" && b.to ? b.to : null;
    if (to && (to === player || !s.players.some((p) => p.id === to))) return fail("no such player to offer to");
    const o: Offer = { id: `t${s.next++}`, at: now.toISOString(), kind, to, state: "open", from: sd, with: null, agreedAt: null, written: [], handback: {} };
    s.offers.push(o);
    return o;
  });
}
// the swap, agreed at once: both daemons leave their games' hands together
export function accept(store: Store, player: string, id: string, b: { game: GameKey; edition: string; record: string }, now = new Date()): Result<Offer> {
  return change(store, (s) => {
    const o = s.offers.find((x) => x.id === id);
    if (!o || o.state !== "open") return fail("that offer is not open any more");               // DRAFT
    if (o.from.player === player) return fail("that is your own offer");                        // DRAFT
    if (o.to && o.to !== player) return fail("that offer is for someone else");                 // DRAFT
    const sd = side(player, b.game, b.edition, b.record);
    if (failed(sd)) return sd;
    if (gameId(sd.game) === gameId(o.from.game)) return fail("a game cannot trade with itself");   // DRAFT
    if (gone(s, b.game, sd.personality)) return fail(`${sd.nickname} was traded away from this game already`);
    if (holds(s, b.game, sd.personality)) return fail(`${sd.nickname} is already in a trade`);
    if (borrowed(s, b.game, sd.personality)) return fail(`${sd.nickname} is on loan -- it goes home before it can be traded`);
    o.with = sd; o.state = "agreed"; o.agreedAt = now.toISOString();
    for (const x of [o.from, sd]) (s.ledger[gameId(x.game)] ??= []).push(x.personality >>> 0);   // gone from its game, for good or until it is lent back
    return o;
  });
}
export function withdraw(store: Store, player: string, id: string): Result<Offer> {
  return change(store, (s) => {
    const o = s.offers.find((x) => x.id === id);
    if (!o || o.from.player !== player) return fail("no such offer of yours");
    if (o.state !== "open") return fail("that offer was taken already -- a loan is called home instead");   // DRAFT
    o.state = "withdrawn";
    return o;
  });
}
// a loan, called home by its owner (the one who offered or the one who accepted -- each lent theirs)
export function recall(store: Store, player: string, id: string): Result<Offer> {
  return change(store, (s) => {
    const o = s.offers.find((x) => x.id === id);
    if (!o || (o.from.player !== player && o.with?.player !== player)) return fail("no such trade of yours");
    if (o.kind !== "loan") return fail("a full trade does not come back");                       // DRAFT
    if (o.state !== "agreed") return fail(o.state === "returning" ? "it is on its way home already" : "that loan has not begun");   // DRAFT
    o.state = "returning";
    return o;
  });
}

// ---- what a companion does at SYNC (tradelink.ts) ----
// what this player's game receives now (each once it is written), and which borrowed daemons it is asked to hand back
export interface Delivery { id: string; out: number; record: string; from: string; kind: Kind; phase: "swap" | "return" }
export function inbox(store: Store, player: string, game: GameKey): { deliveries: Delivery[]; handbacks: { id: string; personality: number }[] } {
  const s = load(store), me = gameId(game);
  const deliveries: Delivery[] = [], handbacks: { id: string; personality: number }[] = [];
  const name = (id: string) => s.players.find((p) => p.id === id)?.name ?? "?";
  for (const o of s.offers) {
    if (!o.with || (o.state !== "agreed" && o.state !== "returning")) continue;
    const mine = [o.from, o.with].find((x) => x.player === player && gameId(x.game) === me);
    if (!mine) continue;
    const theirs = mine === o.from ? o.with : o.from;
    if (!o.written.includes(`${player}:swap`)) {
      deliveries.push({ id: `${o.id}:swap`, out: mine.personality, record: theirs.record, from: name(theirs.player), kind: o.kind, phase: "swap" });
      continue;
    }
    if (o.state !== "returning") continue;
    // both sides must have the borrowed daemon in hand before either is given its own back
    if (!o.written.includes(`${theirs.player}:swap`)) continue;
    if (!o.written.includes(`${player}:return`)) {
      if (o.handback[theirs.player]) deliveries.push({ id: `${o.id}:return`, out: theirs.personality, record: o.handback[theirs.player], from: name(theirs.player), kind: o.kind, phase: "return" });
      if (!o.handback[player]) handbacks.push({ id: o.id, personality: theirs.personality });
    }
  }
  return { deliveries, handbacks };
}
// a borrowed daemon handed back, as it is now in the borrower's save (AWAY: save/trade.ts tradeRecord)
export function handback(store: Store, player: string, id: string, record: string): Result<Offer> {
  return change(store, (s) => {
    const o = s.offers.find((x) => x.id === id);
    if (!o || o.state !== "returning" || !o.with) return fail("that loan is not coming home");
    const mine = o.from.player === player ? o.from : o.with.player === player ? o.with : null;
    if (!mine) return fail("no such trade of yours");
    const theirs = mine === o.from ? o.with : o.from;
    const d = fromB64(record), dd = d && describe(d);
    if (!dd || dd.personality !== theirs.personality) return fail("that is not the daemon you borrowed");   // DRAFT
    if (!o.handback[player]) o.handback[player] = record;   // once: the other side may already have its own back from this one
    return o;
  });
}
// a SYNC wrote these deliveries; a loan whose two returns are written is over, and both daemons are their games' again
export function written(store: Store, player: string, ids: string[]) {
  return change(store, (s) => {
    for (const full of ids) {
      const [id, phase] = full.split(":"), o = s.offers.find((x) => x.id === id);
      if (!o || !o.with || (phase !== "swap" && phase !== "return")) continue;
      const k = `${player}:${phase}`;
      if (!o.written.includes(k)) o.written.push(k);
      // a daemon that has just arrived in a game is that game's again (one traded away and traded back, say)
      const mine = o.from.player === player ? o.from : o.with, arrived = phase === "swap" ? (mine === o.from ? o.with : o.from) : mine;
      s.ledger[gameId(mine.game)] = (s.ledger[gameId(mine.game)] ?? []).filter((p) => p !== arrived.personality >>> 0);
      if (o.state === "agreed" && o.kind === "full" && o.written.includes(`${o.from.player}:swap`) && o.written.includes(`${o.with.player}:swap`)) o.state = "done";
      if (o.state === "returning" && o.written.includes(`${o.from.player}:return`) && o.written.includes(`${o.with.player}:return`)) {
        o.state = "returned";
        for (const x of [o.from, o.with]) s.ledger[gameId(x.game)] = (s.ledger[gameId(x.game)] ?? []).filter((p) => p !== x.personality >>> 0);
      }
    }
    return true;
  });
}

// what a player sees: every open offer (theirs, to everyone, or to them) and their own trades, without records
// an offer as a player may see it: names, never a record or a game's secret id
export function shown(store: Store, player: string, o: Offer, s = load(store)) {
  const name = (id: string | null) => (id ? s.players.find((p) => p.id === id)?.name ?? "?" : null);
  const brief = (x: Side | null) => x && { player: name(x.player), personality: x.personality, species: x.species, nickname: x.nickname, level: x.level, edition: x.edition };
  return { id: o.id, at: o.at, kind: o.kind, state: o.state, to: name(o.to), mine: o.from.player === player || o.with?.player === player,
           from: brief(o.from), with: brief(o.with), agreedAt: o.agreedAt, done: o.state === "returned" || o.state === "done",
           held: o.written.filter((w) => w.endsWith(":swap")).length === 2 };   // both SYNCs wrote the swap
}
export function board(store: Store, player: string) {
  const s = load(store), show = (o: Offer) => shown(store, player, o, s);
  return {
    open: s.offers.filter((o) => o.state === "open" && (o.from.player === player || !o.to || o.to === player)).map(show),
    trades: s.offers.filter((o) => o.state !== "open" && o.state !== "withdrawn" && (o.from.player === player || o.with?.player === player)).map(show),
    players: s.players.map(view),
  };
}
