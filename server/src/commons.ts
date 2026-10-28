// THE COMMONS (C-222, the user 2026-10-28, by multiple choice): the exchange between HOMES. A home's hub keeps its own
// players, saves and devices; the commons, on a server of the project's (roverbyteseer, the tailnet only for now), knows
// homes, not people:
//
//   * a home's hub REGISTERS once and waits until the commons' keeper APPROVES it (on the commons' own machine);
//   * the hub VOUCHES for its players -- a player on the commons is "KIT · ITS HOME", made by its hub, no password;
//   * two homes trade only once they are FRIENDS: each hub shows a friend code, one home asks with the other's, the
//     other accepts. Strangers never see a home's players or daemons.
//
// Trades themselves are exchange.ts's, on the commons' own store, with a REACH that allows the same home or friends.
// The later path (docs/TRADING.md): personal accounts on a cloud service, nearby players and invite codes, a lobby.
// No node: imports -- the keys are the caller's (commons_main.ts).
import type { Store } from "./store.js";
import * as X from "./exchange.js";

export interface Home { id: string; name: string; key: string; approved: boolean; code: string; friends: string[]; asks: string[]; at: string }
type State = { homes: Home[]; next: number };
const KEY = "commons.homes", HOME_NAME = /^[A-Z0-9][A-Z0-9 .'-]{1,15}$/;
const load = (store: Store): State => {
  try { const s = JSON.parse(store.getSetting(KEY) ?? "null"); if (s?.homes) return s; } catch { /* a new commons */ }
  return { homes: [], next: 1 };
};
function change<T>(store: Store, f: (s: State) => T): T {
  return store.together(() => { const s = load(store); const r = f(s); store.setSetting(KEY, JSON.stringify(s)); return r; });
}
const fail = (error: string) => ({ error });

// what a home sees of itself, and of the homes it knows -- names only
export type HomeView = { id: string; name: string; approved: boolean; code: string; friends: { id: string; name: string }[];
                         asks: { id: string; name: string }[]; asked: { id: string; name: string }[] };
export function view(store: Store, home: Home): HomeView {
  const s = load(store), named = (id: string) => ({ id, name: s.homes.find((h) => h.id === id)?.name ?? "?" });
  return { id: home.id, name: home.name, approved: home.approved, code: home.code, friends: home.friends.map(named),
           asks: home.asks.map(named), asked: s.homes.filter((h) => h.asks.includes(home.id)).map((h) => named(h.id)) };
}

// a home's hub asks to join; the keeper approves it on the commons' machine
export function register(store: Store, keys: X.Keys, b: { name?: unknown }, now = new Date()): X.Result<{ key: string; home: HomeView }> {
  const name = typeof b.name === "string" ? b.name.trim().toUpperCase() : "";
  if (!HOME_NAME.test(name)) return fail("a home's name is 2 to 16 letters or numbers");          // DRAFT
  const key = keys.token();
  const home = change(store, (s) => {
    const h: Home = { id: `h${s.next++}`, name, key: keys.hash(key), approved: false, code: keys.code(), friends: [], asks: [], at: now.toISOString() };
    s.homes.push(h);
    return h;
  });
  return { key, home: view(store, home) };
}
export function homeFor(store: Store, keys: X.Keys, key: string): Home | null {
  if (!key) return null;
  const h = keys.hash(key);
  return load(store).homes.find((x) => x.key === h) ?? null;
}
export function approve(store: Store, id: string, yes = true): X.Result<Home> {
  return change(store, (s) => { const h = s.homes.find((x) => x.id === id); if (!h) return fail("no such home"); h.approved = yes; return h; });
}
export const homes = (store: Store) => load(store).homes.map(({ key: _key, ...h }) => h);   // the keeper's list, never a key

// FRIENDS: ask with the other home's code; asked back (or accepting an ask), they are friends
export function befriend(store: Store, home: Home, code: unknown): X.Result<HomeView> {
  const r = change(store, (s) => {
    const me = s.homes.find((h) => h.id === home.id)!, them = s.homes.find((h) => h.code === String(code ?? "").trim().toUpperCase());
    if (!them || !them.approved) return fail("no home has that friend code");                   // DRAFT
    if (them.id === me.id) return fail("that is this home's own code");                          // DRAFT
    if (me.friends.includes(them.id)) return fail(`${them.name} is a friend already`);           // DRAFT
    if (me.asks.includes(them.id)) befriended(me, them);                                         // they asked first
    else if (!them.asks.includes(me.id)) them.asks.push(me.id);
    return true;
  });
  return r === true ? view(store, homeFor_(store, home.id)) : r;
}
export function acceptFriend(store: Store, home: Home, id: string): X.Result<HomeView> {
  const r = change(store, (s) => {
    const me = s.homes.find((h) => h.id === home.id)!, them = s.homes.find((h) => h.id === id);
    if (!them || !me.asks.includes(id)) return fail("that home has not asked");                  // DRAFT
    befriended(me, them);
    return true;
  });
  return r === true ? view(store, homeFor_(store, home.id)) : r;
}
export function forgetFriend(store: Store, home: Home, id: string): HomeView {
  change(store, (s) => {
    const me = s.homes.find((h) => h.id === home.id)!, them = s.homes.find((h) => h.id === id);
    me.friends = me.friends.filter((f) => f !== id); me.asks = me.asks.filter((f) => f !== id);
    if (them) { them.friends = them.friends.filter((f) => f !== home.id); them.asks = them.asks.filter((f) => f !== home.id); }
  });
  return view(store, homeFor_(store, home.id));
}
function befriended(a: Home, b: Home) {
  a.asks = a.asks.filter((x) => x !== b.id); b.asks = b.asks.filter((x) => x !== a.id);
  if (!a.friends.includes(b.id)) a.friends.push(b.id);
  if (!b.friends.includes(a.id)) b.friends.push(a.id);
}
const homeFor_ = (store: Store, id: string) => load(store).homes.find((h) => h.id === id)!;

// who may trade with whom: the same home, or friends -- read once per request
export function reach(store: Store): X.Reach {
  const s = load(store), friends = new Map(s.homes.map((h) => [h.id, new Set(h.friends)]));
  return (a, b) => {
    const ha = X.homeOf(store, a), hb = X.homeOf(store, b);
    return !!ha && !!hb && (ha === hb || !!friends.get(ha)?.has(hb));
  };
}

// a home's player on the commons, vouched for by its hub: made the first time, a fresh token each time after
export function vouch(store: Store, keys: X.Keys, home: Home, name: unknown): X.Result<{ token: string; player: X.PlayerView }> {
  if (!home.approved) return fail("this home is waiting for the commons to approve it");         // DRAFT
  const r = X.join(store, keys, { name }, true, new Date(), { id: home.id, name: home.name });
  return X.failed(r) ? r : { token: r.token, player: r.player };
}
