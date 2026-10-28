// A home hub's link to THE COMMONS (commons.ts; C-222, the user 2026-10-28): the home's players and devices go on
// talking only to their hub, and the hub speaks for them on the commons -- it registers the home once (the commons'
// keeper approves it), vouches for each player as it first trades there, and passes their friends' trades through.
//
// On the hub, the exchange's requests (/api/exchange/<name>, and the hub's own companion) go through homeRoute: the
// home's own exchange as before, and, once the commons is linked, its friends' offers beside them -- an offer or trade
// that lives on the commons carries "c:" before its id, and every request for one is passed there. An offer made with
// scope "friends" goes to the commons; one made at home stays home. A commons that does not answer leaves the home's
// own trading as it was. No node: imports.
import type { Store } from "./store.js";
import * as X from "./exchange.js";
import type { HomeView } from "./commons.js";
import { exchangeRoute } from "./tradelink.js";

const C = "c:";
type Linked = { url: string; key: string };
export function commonsOf(store: Store): Linked | null {
  const url = store.getSetting("commons.url"), key = store.getSetting("commons.key");
  return url && key ? { url, key } : null;
}
const tokens = (store: Store): Record<string, string> => { try { return JSON.parse(store.getSetting("commons.tokens") ?? "{}"); } catch { return {}; } };

async function ask(f: typeof fetch, url: string, path: string, headers: Record<string, string>, body?: unknown): Promise<any> {
  const r = await f(`${url}${path}`, { method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  try { return await r.json(); } catch { return { error: `the commons answered ${r.status}` }; }
}
const unreachable = (e: unknown) => ({ error: `the commons did not answer: ${(e as Error).message}` });   // DRAFT

// ---- the hub's keeper: link the home, see it, make friends (/api/commons on the hub) ----
export async function linkCommons(store: Store, b: { url?: unknown; name?: unknown }, f: typeof fetch = fetch): Promise<X.Result<HomeView>> {
  const url = typeof b.url === "string" ? b.url.trim().replace(/\/+$/, "") : "";
  if (!url) { for (const k of ["commons.url", "commons.key", "commons.name", "commons.tokens"]) store.setSetting(k, null); return { error: "unlinked" }; }
  if (!/^https?:\/\/[^\s/]+(:\d+)?$/.test(url)) return { error: "the commons' address, as http://roverbyteseer:4750" };   // DRAFT
  const r = await ask(f, url, "/commons/register", {}, { name: b.name }).catch(unreachable);
  if (r.error) return r;
  store.setSetting("commons.url", url); store.setSetting("commons.key", r.key); store.setSetting("commons.name", r.home.name);
  store.setSetting("commons.tokens", null);
  return r.home;
}
export async function commonsHome(store: Store, f: typeof fetch = fetch): Promise<{ url: string | null; home: HomeView | null; error?: string }> {
  const c = commonsOf(store);
  if (!c) return { url: null, home: null };
  const r = await ask(f, c.url, "/commons/home", { "x-daemons-home": c.key }).catch(unreachable);
  return r.error ? { url: c.url, home: null, error: r.error } : { url: c.url, home: r };
}
export async function commonsFriend(store: Store, what: "friend" | "friend/accept" | "friend/forget", b: unknown, f: typeof fetch = fetch): Promise<any> {
  const c = commonsOf(store);
  if (!c) return { error: "link this home to the commons first" };                             // DRAFT
  return ask(f, c.url, `/commons/${what}`, { "x-daemons-home": c.key }, b).catch(unreachable);
}

// ---- a player's requests, at home and on the commons ----
async function tokenFor(store: Store, c: Linked, p: X.Player, f: typeof fetch): Promise<string | null> {
  const t = tokens(store);
  if (t[p.id]) return t[p.id];
  const r = await ask(f, c.url, "/commons/player", { "x-daemons-home": c.key }, { name: p.name });
  if (r.error || !r.token) return null;
  store.setSetting("commons.tokens", JSON.stringify({ ...tokens(store), [p.id]: r.token }));
  return r.token;
}
const marked = (o: any) => (o && !o.error && o.id ? { ...o, id: C + o.id, commons: true } : o);
const strip = (id: unknown) => String(id ?? "").slice(C.length);
const isC = (id: unknown) => String(id ?? "").startsWith(C);

export async function homeRoute(store: Store, keys: X.Keys, p: X.Player, name: string, b: any, f: typeof fetch = fetch): Promise<any> {
  const here = (n: string, body: any) => exchangeRoute(store, keys, p, n, body);
  const c = commonsOf(store);
  if (!c) return here(name, b);
  const there = async (n: string, body: any): Promise<any> => {
    try {
      const token = await tokenFor(store, c, p, f);
      if (!token) return { error: "the commons has not let this home in yet" };                 // DRAFT
      return await ask(f, c.url, `/commons/x/${n}`, { "x-daemons-home": c.key, "x-daemons-player": token }, body);
    } catch (e) { return unreachable(e); }
  };
  switch (name) {
    case "board": {
      const home = here("board", b), far = await there("board", {});
      if (far.error) return { ...home, commons: false };
      return { open: [...home.open, ...far.open.map(marked)], trades: [...home.trades, ...far.trades.map(marked)],
               // the friends' players; this home's own are listed already, from home
               players: [...home.players, ...far.players.filter((x: any) => !x.name.endsWith(` · ${store.getSetting("commons.name") ?? ""}`))
                                                     .map((x: any) => ({ ...x, id: C + x.id, commons: true }))],
               commons: true };
    }
    case "offer":
      return b.scope === "friends" || isC(b.to) ? marked(await there("offer", { ...b, to: isC(b.to) ? strip(b.to) : undefined })) : here("offer", b);
    case "accept": case "withdraw": case "recall": case "handback":
      return isC(b.id) ? marked(await there(name, { ...b, id: strip(b.id) })) : here(name, b);
    case "inbox": {
      const home = here("inbox", b), far = await there("inbox", b);
      if (far.error) return home;
      return { deliveries: [...home.deliveries, ...(far.deliveries ?? []).map((d: any) => ({ ...d, id: C + d.id }))],
               handbacks: [...home.handbacks, ...(far.handbacks ?? []).map((h: any) => ({ ...h, id: C + h.id }))],
               locked: [...home.locked, ...(far.locked ?? [])] };
    }
    case "written": {
      const ids: string[] = Array.isArray(b.ids) ? b.ids.map(String) : [];
      here("written", { ids: ids.filter((i) => !isC(i)) });
      const far = ids.filter(isC).map(strip);
      if (far.length) { const r = await there("written", { ids: far }); if (r.error) return r; }   // told next time
      return { ok: true };
    }
    default: return here(name, b);
  }
}
