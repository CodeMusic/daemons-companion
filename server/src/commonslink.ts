// C-290: this file runs on the phone too (C-111) -- the app imports it, directly or through another file -- so keep it free of Node-only APIs (node:*, fs).
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
import { kindOf } from "./profiletrade.js";   // C-226 piece 4

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
// the home's OUT TOGETHER view with the commons' beside it: friends' daemons out, and meetings, marked "c:"; this home's
// own players, which the commons lists too (as "KIT · THIS HOME"), left out of its list of others
function merged(store: Store, home: any, far: any): any {
  if (!far || far.error || !home || home.error) return home;
  const suffix = ` · ${store.getSetting("commons.name") ?? ""}`;
  return { ...home,
           others: [...(home.others ?? []), ...(far.others ?? []).filter((o: any) => !String(o.player).endsWith(suffix))
                                                             .map((o: any) => ({ ...o, id: C + o.id, commons: true }))],
           met: [...(home.met ?? []), ...(far.met ?? []).map((m: any) => ({ ...m, id: C + m.id, commons: true }))]
             .sort((x: any, y: any) => String(y.at).localeCompare(String(x.at))).slice(0, 10) };
}
const marked = (o: any) => (o && !o.error && o.id ? { ...o, id: C + o.id, commons: true } : o);
const strip = (id: unknown) => String(id ?? "").slice(C.length);
const isC = (id: unknown) => String(id ?? "").startsWith(C);

// C-226 piece 4: a player here claimed into an ACCOUNTS profile carries its guardian's controls home too (the commons
// hands them back with each board, and the hub keeps them): at home, a profile that trades or meets only with friends
// does so only with its friends here. Making friends at home stays open -- the home is the family's own.
type Controls = { trade: string; meet: string };
const controlsHere = (store: Store): Record<string, Controls> => { try { return JSON.parse(store.getSetting("accounts.controls") ?? "{}"); } catch { return {}; } };
function keepControls(store: Store, player: string, c: Controls | undefined) {
  const all = controlsHere(store);
  if (c) all[player] = { trade: c.trade, meet: c.meet }; else delete all[player];
  store.setSetting("accounts.controls", Object.keys(all).length ? JSON.stringify(all) : null);
}
export function localReach(store: Store, name: string): X.Reach | undefined {
  const all = controlsHere(store), kind = kindOf(name);
  if (!Object.keys(all).length || name === "befriend" || name === "unfriend") return undefined;
  const friends = (a: string, b: string) => (X.playerById(store, a)?.friends ?? []).includes(b), traded = X.traded(store);
  const allows = (a: string, b: string) => {
    const c = all[a];
    if (!c) return true;
    if (kind === "meet") return c.meet === "off" ? false : c.meet === "trades" ? friends(a, b) || traded(a, b) : friends(a, b);
    return c.trade === "friends" ? friends(a, b) : true;
  };
  return (a, b) => a === b || (allows(a, b) && allows(b, a));
}
const sides = (v: any) => ({ friends: (v?.friends ?? []).map((x: any) => ({ ...x, id: C + x.id, commons: true })),
                             asked: (v?.asked ?? []).map((x: any) => ({ ...x, id: C + x.id, commons: true })),
                             asks: (v?.asks ?? []).map((x: any) => ({ ...x, id: C + x.id, commons: true })) });

export async function homeRoute(store: Store, keys: X.Keys, p: X.Player, name: string, b: any, f: typeof fetch = fetch): Promise<any> {
  const here = (n: string, body: any) => exchangeRoute(store, keys, p, n, body, localReach(store, n));
  const c = commonsOf(store);
  if (!c) return name === "claim" ? { error: "Accounts live on THE COMMONS: link this home to it first (TRADE, THE COMMONS)." } : here(name, b);   // DRAFT
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
      keepControls(store, p.id, far.profile?.controls);                                     // C-226 piece 4
      const fs = sides(far.friends);
      return { friends: { friends: [...home.friends.friends, ...fs.friends], asked: [...home.friends.asked, ...fs.asked], asks: [...home.friends.asks, ...fs.asks] },   // C-223: friends at home, and on the commons
               ...(far.profile ? { profile: far.profile } : {}),                             // C-226 piece 4: the profile it is
               open: [...home.open, ...far.open.map(marked)], trades: [...home.trades, ...far.trades.map(marked)],
               // the friends' players; this home's own are listed already, from home
               players: [...home.players, ...far.players.filter((x: any) => !x.name.endsWith(` · ${store.getSetting("commons.name") ?? ""}`))
                                                     .map((x: any) => ({ ...x, id: C + x.id, commons: true }))],
               commons: true };
    }
    // C-226 piece 4: claimed into a guardian's profile; friends on the commons, by a profile's friend code or a "c:" id
    case "claim": return there("claim", b);
    case "befriend": case "unfriend": {
      if (b.code === undefined && !isC(b.id)) return here(name, b);
      const r = await there(name, b.code !== undefined ? { code: b.code } : { id: strip(b.id) });
      return r.error ? r : { ...sides(r), ...(r.waiting ? { waiting: r.waiting } : {}) };
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
    // C-220: OUT TOGETHER across homes -- a daemon sent out is out at home and on the commons; friends' daemons out, and
    // the meetings with them, are listed beside the home's ("c:" before an id); a meeting with one is made on the commons
    case "out": {
      if (b.nickname !== undefined) { const r = here("out", b); if (!r.error) await there("out", b); return r; }
      return merged(store, await here("out", b), await there("out", {}));
    }
    case "back": { const r = here("back", b); await there("back", {}); return r; }
    case "meet": {
      if (!isC(b.with)) return here("meet", b);
      const r = await there("meet", { with: strip(b.with) });
      return r.error ? r : merged(store, await here("out", {}), r);
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
