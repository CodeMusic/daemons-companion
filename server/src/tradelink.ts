// C-219: a companion's way to THE EXCHANGE (exchange.ts) -- the hub's own, in the same process, or the hub's over the
// network (the tailnet: `trade.hub` is its address) for any other companion a player runs. The app's TRADE screen and
// the site ask their own companion (/api/trade/*), which asks the exchange as the player it joined as.
//
// At SYNC, in three steps so SYNC itself stays as it is (core.ts, no waiting): BEFORE, what this game receives is
// fetched into the store (`trade.inbox`), and any borrowed daemon a loan asks back is handed back as it is now; SYNC
// writes the inbox (writer.ts `trade`) and keeps what it wrote (`trade.outbox`); AFTER, the exchange is told.
// No node: imports -- fetch is the platform's, and the keys are made by whoever made the link (api.ts).
import type { Store } from "./store.js";
import type { Reply } from "./routes.js";
import type { TradeIn } from "./save/writer.js";
import { readAway } from "./save/reader.js";
import { fromB64, gameId, gameOf, toB64, tradeRecord, type GameKey } from "./save/trade.js";
import * as X from "./exchange.js";

export interface Link {
  hub: string;                                                            // "" -- the exchange is this companion's own
  me(): Promise<X.PlayerView | null>;
  join(b: { name?: unknown; code?: unknown; password?: unknown }): Promise<X.Result<{ player: X.PlayerView }>>;
  call(path: string, body?: unknown): Promise<any>;                       // the exchange's own requests, as this player
}

// The exchange on this companion: the hub's own player (no invite needed -- it is the hub)
export function localLink(store: Store, keys: X.Keys): Link {
  const token = () => store.getSetting("trade.token") ?? "";
  const me = () => X.playerFor(store, keys, token());
  return {
    hub: "",
    async me() { const p = me(); return p ? X.players(store).find((v) => v.id === p.id) ?? null : null; },
    async join(b) {
      const r = X.join(store, keys, b, true);
      if (X.failed(r)) return r;
      store.setSetting("trade.token", r.token);
      return { player: r.player };
    },
    async call(path, body) {
      const p = me();
      if (!p) return { error: "join the exchange first" };                // DRAFT
      return exchangeRoute(store, keys, p, path, body ?? {});
    },
  };
}

// The exchange on the hub, over the network
export function remoteLink(store: Store, hub: string, f: typeof fetch = fetch): Link {
  const base = hub.replace(/\/+$/, "");
  const ask = async (path: string, body?: unknown) => {
    const token = store.getSetting("trade.token");
    const r = await f(`${base}${path}`, { method: body === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json", ...(token ? { "x-daemons-player": token } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body) });
    try { return await r.json(); } catch { return { error: `the exchange answered ${r.status}` }; }
  };
  return {
    hub: base,
    async me() { const r = await ask("/api/exchange/me").catch(() => null); return r && !r.error ? r : null; },
    async join(b) {
      const r = await ask("/api/exchange/join", b).catch((e) => ({ error: `the hub did not answer: ${(e as Error).message}` }));
      if (r.error) return { error: r.error };
      store.setSetting("trade.token", r.token);
      return { player: r.player };
    },
    async call(path, body) {
      return ask(`/api/exchange/${path}`, body ?? {}).catch((e) => ({ error: `the hub did not answer: ${(e as Error).message}` }));
    },
  };
}

// The exchange's requests, by name, as one player -- the same for the hub's own companion and for one over the network
// (api.ts answers /api/exchange/<name> with this)
export function exchangeRoute(store: Store, keys: X.Keys, p: X.Player, name: string, b: any): any {
  const shown = (r: X.Result<X.Offer>) => (X.failed(r) ? r : X.shown(store, p.id, r));
  switch (name) {
    case "board": return X.board(store, p.id);
    case "offer": return shown(X.offer(store, p.id, b));
    case "accept": return shown(X.accept(store, p.id, String(b.id ?? ""), b));
    case "withdraw": return shown(X.withdraw(store, p.id, String(b.id ?? "")));
    case "recall": return shown(X.recall(store, p.id, String(b.id ?? "")));
    case "inbox": return X.inbox(store, p.id, b.game);
    case "handback": return shown(X.handback(store, p.id, String(b.id ?? ""), String(b.record ?? "")));
    case "written": return { ok: X.written(store, p.id, Array.isArray(b.ids) ? b.ids.map(String) : []) };
    case "password": return X.setPassword(store, keys, p.id, b.password);
    default: return { error: "not found" };
  }
}

// ---- SYNC ----
type Inbox = { game: string; deliveries: X.Delivery[]; locked?: number[] };
const inboxOf = (store: Store): Inbox | null => { try { return JSON.parse(store.getSetting("trade.inbox") ?? "null"); } catch { return null; } };
const outbox = (store: Store): string[] => { try { return JSON.parse(store.getSetting("trade.outbox") ?? "[]"); } catch { return []; } };

// Before a SYNC: what arrives, into the store; what a loan asks back, handed back. Never fails the SYNC -- a hub that
// does not answer only means nothing is traded this time.
export async function beforeSync(link: Link | null, store: Store, save: Uint8Array | null): Promise<string | null> {
  if (!link || !save || !store.getSetting("trade.token")) return null;
  try {
    const game = gameOf(save);
    const r = await link.call("inbox", { game });
    if (r?.error) return r.error;
    for (const h of r.handbacks ?? []) {
      const t = tradeRecord(save, h.personality);
      if (typeof t !== "string") await link.call("handback", { id: h.id, record: toB64(t.record) });
    }
    store.setSetting("trade.inbox", JSON.stringify({ game: gameId(game), deliveries: r.deliveries ?? [], locked: r.locked ?? [] }));
    return null;
  } catch (e) { return (e as Error).message; }
}
// What SYNC writes: this game's deliveries only, never another save's (C-215: the save read now may not be the one the
// inbox was fetched for), and none already written
export function tradesToWrite(store: Store, game: GameKey): TradeIn[] {
  const ib = inboxOf(store), done = outbox(store);
  if (!ib || ib.game !== gameId(game)) return [];
  return ib.deliveries.filter((d) => !done.includes(d.id)).flatMap((d) => {
    const record = fromB64(d.record);
    return record ? [{ id: d.id, out: d.out, record, loan: d.kind === "loan", phase: d.phase }] : [];
  });
}
// What the game must keep AWAY (TRADING): this game's daemons in a trade, as the exchange said before this SYNC -- or
// undefined when it was not asked (not joined, the hub away), and the save's lock bits are left as they are
export function tradeLocks(store: Store, game: GameKey): number[] | undefined {
  const ib = inboxOf(store);
  return ib && ib.game === gameId(game) && Array.isArray(ib.locked) ? ib.locked : undefined;
}
export function tradesWritten(store: Store, ids: string[]) {
  if (!ids.length) return;
  store.setSetting("trade.outbox", JSON.stringify([...new Set([...outbox(store), ...ids])]));
}
// After: the exchange told what this SYNC wrote (kept until it hears, so a hub that was away hears at the next one)
export async function afterSync(link: Link | null, store: Store): Promise<void> {
  const ids = outbox(store);
  if (!link || !ids.length) return;
  try {
    const r = await link.call("written", { ids });
    if (r?.ok) { store.setSetting("trade.outbox", null); store.setSetting("trade.inbox", null); }
  } catch { /* told next time */ }
}

// ---- the app's and the site's TRADE (/api/trade/*), asked of this companion ----
const ok = (body: unknown, status = 200): Reply => ({ status, body });
const no = (status: number, error: string): Reply => ({ status, body: { error } });
const answer = (r: any): Reply => (r?.error ? no(400, r.error) : ok(r));

export async function tradeRoute(link: Link | null, store: Store, save: Uint8Array | null, edition: string, method: string, path: string, b: any): Promise<Reply> {
  // no exchange in reach (a phone hosting alone with no hub named): TRADE asks for the hub's address and nothing else
  if (!link) return method === "GET" && path === "/api/trade"
    ? ok({ hub: null, needsHub: true, me: null, game: save ? gameOf(save).name : null, edition, away: [], board: null, pending: 0, waiting: 0 })
    : no(400, "set the hub's address first -- trading goes through the hub");          // DRAFT
  if (method === "GET" && path === "/api/trade") {
    const me = await link.me();
    const board = me ? await link.call("board") : null;
    const game = save ? gameOf(save) : null;
    // the daemons this save could offer now: AWAY, and in no trade of this player's
    const busy = new Set<number>((board?.open ?? []).concat(board?.trades ?? [])
      .filter((o: any) => o.state === "open" || o.state === "agreed" || o.state === "returning")
      .filter((o: any) => o.mine).flatMap((o: any) => [o.from, o.with]).filter(Boolean).map((x: any) => x.personality));   // its own, and one it borrowed
    const away = save ? readAway(save).map((d) => ({ personality: d.personality >>> 0, species: d.species, name: d.name, nickname: d.nickname,
                                                     level: d.level, busy: busy.has(d.personality >>> 0) })) : [];
    return ok({ hub: link.hub, me, game: game?.name ?? null, edition, away, board: board?.error ? null : board,
                pending: outbox(store).length, waiting: (inboxOf(store)?.deliveries ?? []).length });
  }
  if (method !== "POST") return no(404, "not found");
  if (path === "/api/trade/join") return answer(await link.join(b));
  if (path === "/api/trade/withdraw" || path === "/api/trade/recall" || path === "/api/trade/password")
    return answer(await link.call(path.slice("/api/trade/".length), b));
  if (path === "/api/trade/offer" || path === "/api/trade/accept") {
    if (!save) return no(404, "no save named -- set it in Settings");
    const t = tradeRecord(save, Number(b.personality));
    if (typeof t === "string") return no(400, t);
    const sent = { game: gameOf(save), edition, record: toB64(t.record) };
    return answer(path.endsWith("offer") ? await link.call("offer", { ...sent, kind: b.kind, to: b.to })
                                         : await link.call("accept", { ...sent, id: b.offer }));
  }
  return no(404, "not found");
}
// The hub's address as TRADE's THE HUB sets it: http(s)://name[:port], or "" for none. A new hub forgets the old token.
export function setHub(store: Store, raw: unknown): { hub: string } | string {
  const url = typeof raw === "string" ? raw.trim().replace(/\/+$/, "") : "";
  if (url && !/^https?:\/\/[^\s/]+(:\d+)?$/.test(url)) return "the hub's address, as http://your-hub:4730";   // DRAFT
  if (url !== (store.getSetting("trade.hub") ?? "")) { store.setSetting("trade.hub", url || null); store.setSetting("trade.token", null); }
  return { hub: url };
}
export const TRADE_PATHS = ["/api/trade", "/api/trade/join", "/api/trade/offer", "/api/trade/accept", "/api/trade/withdraw", "/api/trade/recall", "/api/trade/password"];
