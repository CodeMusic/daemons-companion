// C-226 piece 4 (docs/ACCOUNTS.md): THE EXCHANGE ON PROFILES, on THE COMMONS. A profile is a player there: one made for
// it (a kid's device plays as it, through /accounts/x/<name>), or a home's player its guardian CLAIMED into it (it keeps
// its offers, ledger and friends; its hub goes on speaking for it through /commons/x/<name>). Either way the guardian's
// controls (accounts.ts CONTROLS) decide who reaches it:
//
//   * TRADE  friends -- only its friends; home -- friends, or the players its home already reaches; lobby -- anyone
//   * MEET   friends / anyone it has traded with / off -- meetings, OUT TOGETHER, shared dreams, battles
//   * FRIENDS approve -- a friend it asks for (or accepts) waits for the guardian; own -- it accepts its own
//   * BLOCKED players, each the guardian's, never reach it either way
//
// Both sides' rules hold: two players reach each other only when each one's controls allow the other. A profile has a
// FRIEND CODE (eight letters) its players give each other; that is how two profiles with no home in common meet.
// The guardian sees each profile's LEDGER (every trade, loan and gift), approves or refuses the friends waiting, and
// blocks a player. No node: imports.
import type { Store } from "./store.js";
import * as A from "./accounts.js";
import * as C from "./commons.js";
import * as X from "./exchange.js";
import { exchangeRoute } from "./tradelink.js";

const KEY = "accounts.social";
type Waiting = { profile: string; player: string; at: string };
type Social = { codes: Record<string, string>; waiting: Waiting[]; blocks: { profile: string; player: string }[] };
const load = (store: Store): Social => {
  try { const s = JSON.parse(store.getSetting(KEY) ?? "null"); if (s?.codes) return s; } catch { /* new */ }
  return { codes: {}, waiting: [], blocks: [] };
};
function change<T>(store: Store, f: (s: Social) => T): T {
  return store.together(() => { const s = load(store); const r = f(s); store.setSetting(KEY, JSON.stringify(s)); return r; });
}
const fail = (error: string) => ({ error });

// ---- who reaches whom
const MEETS = new Set(["out", "back", "meet", "converse", "dreams", "share", "unshare", "talks", "talk", "integrate",
                       "battle", "battle/request", "battle/answer", "battle/choose", "battle/leave", "battle/award"]);
export const kindOf = (name: string): "meet" | "trade" => (MEETS.has(name) ? "meet" : "trade");

export function reachFor(store: Store, kind: "trade" | "meet"): X.Reach {
  const home = C.reach(store), social = load(store), traded = X.traded(store);
  const controls = new Map(A.profiles(store).map((p) => [p.id, p.controls]));
  const blocked = new Set(social.blocks.map((b) => `${b.profile}|${b.player}`));
  const friends = (a: string, b: string) => (X.playerById(store, a)?.friends ?? []).includes(b);
  const allows = (a: string, b: string): boolean => {
    const pa = X.playerById(store, a), c = pa?.profile ? controls.get(pa.profile) : undefined;
    if (!pa) return false;
    if (!pa.profile) return home(a, b) || friends(a, b);                    // a home's player, as THE COMMONS has it
    if (!c || blocked.has(`${pa.profile}|${b}`)) return false;
    if (kind === "meet") return c.meet === "friends" ? friends(a, b) : c.meet === "trades" ? friends(a, b) || traded(a, b) : false;
    return c.trade === "friends" ? friends(a, b) : c.trade === "home" ? friends(a, b) || home(a, b) : true;
  };
  return (a, b) => a === b || (allows(a, b) && allows(b, a));
}

// ---- a profile's friend code (made the first time it is asked for)
export function codeOf(store: Store, keys: X.Keys, profile: string): string {
  const had = load(store).codes[profile];
  return had ?? change(store, (s) => (s.codes[profile] ??= keys.code()));
}
const profileOfCode = (store: Store, code: unknown) => {
  const c = String(code ?? "").trim().toUpperCase(), e = Object.entries(load(store).codes).find(([, v]) => v === c);
  return e ? e[0] : null;
};

// ---- the exchange's requests as a profile's player: the reach its controls give it, and friends by code or approval
export function profileRoute(store: Store, keys: X.Keys, p: X.Player, name: string, b: any): any {
  const reach = reachFor(store, kindOf(name));
  const prof = p.profile ? A.profileById(store, p.profile) : null;
  if (name === "befriend") {
    // the other player: by a profile's friend code, or by id when it is already in reach or asked first
    let other: string | null = null;
    if (b.code !== undefined) {
      const theirs = profileOfCode(store, b.code), q = theirs ? X.playerOfProfile(store, theirs) ?? X.profilePlayer(store, theirs, label(store, theirs)) : null;
      if (!q || q.id === p.id) return fail("no player has that friend code");                    // DRAFT
      other = q.id;
    } else {
      const id = String(b.id ?? ""), q = X.playerById(store, id);
      const asked = (q?.asks ?? []).includes(p.id);
      if (!q || (!asked && !C.reach(store)(p.id, q.id))) return fail("no such player");          // DRAFT
      other = q.id;
    }
    if (prof && load(store).blocks.some((x) => x.profile === prof.id && x.player === other)) return fail("no such player");
    if (prof?.controls.friends === "approve") {                                                     // its guardian decides
      change(store, (s) => { if (!s.waiting.some((w) => w.profile === prof.id && w.player === other)) s.waiting.push({ profile: prof.id, player: other!, at: new Date().toISOString() }); });
      return { ...X.friendsNow(store, p.id), waiting: waitingFor(store, prof.id) };
    }
    return X.befriend(store, p.id, other, () => true);
  }
  const r = exchangeRoute(store, keys, p, name, b, reach);
  if (name === "board" && prof && r && !r.error)
    return { ...r, profile: { ...A.publicView(prof), code: codeOf(store, keys, prof.id), controls: prof.controls, waiting: waitingFor(store, prof.id) } };
  return r;
}
const label = (store: Store, profile: string) => { const p = A.profileById(store, profile); return p ? `${A.nameOf(p)} #${p.tag}` : "?"; };
const waitingFor = (store: Store, profile: string) =>
  load(store).waiting.filter((w) => w.profile === profile).map((w) => ({ player: w.player, name: X.playerById(store, w.player)?.label ?? "?", at: w.at }));

// a profile's own player, made the first time it plays
export const playerFor = (store: Store, profile: A.Profile) => X.profilePlayer(store, profile.id, label(store, profile.id));

// ---- the guardian's side
export function claim(store: Store, g: A.Guardian, profile: unknown, p: X.Player): X.Result<{ claimed: string; name: string }> {
  const prof = A.profileById(store, String(profile ?? ""));
  if (!prof || prof.guardian !== g.id) return fail("no such profile");
  const r = X.claim(store, p.id, prof.id, label(store, prof.id));
  return X.failed(r) ? r : { claimed: prof.id, name: r.label ?? r.name };
}
export function ledger(store: Store, g: A.Guardian, profile: unknown) {
  const prof = A.profileById(store, String(profile ?? ""));
  if (!prof || prof.guardian !== g.id) return fail("no such profile");
  const p = X.playerOfProfile(store, prof.id);
  return { profile: prof.id, offers: p ? X.offersOf(store, p.id) : [], friends: p ? X.friendsNow(store, p.id) : { friends: [], asked: [], asks: [] } };
}
export function decide(store: Store, g: A.Guardian, b: { profile?: unknown; player?: unknown; yes?: unknown }) {
  const prof = A.profileById(store, String(b.profile ?? ""));
  if (!prof || prof.guardian !== g.id) return fail("no such profile");
  const player = String(b.player ?? "");
  const was = change(store, (s) => { const n = s.waiting.length; s.waiting = s.waiting.filter((w) => !(w.profile === prof.id && w.player === player)); return n !== s.waiting.length; });
  if (!was) return fail("that friend is not waiting");                                             // DRAFT
  if (b.yes !== false) { const me = playerFor(store, prof); const r = X.befriend(store, me.id, player, () => true); if (X.failed(r)) return r; }
  return ledger(store, g, prof.id);
}
export function block(store: Store, g: A.Guardian, b: { profile?: unknown; player?: unknown; yes?: unknown }) {
  const prof = A.profileById(store, String(b.profile ?? ""));
  if (!prof || prof.guardian !== g.id) return fail("no such profile");
  const player = String(b.player ?? "");
  if (!X.playerById(store, player)) return fail("no such player");
  change(store, (s) => {
    s.blocks = s.blocks.filter((x) => !(x.profile === prof.id && x.player === player));
    s.waiting = s.waiting.filter((w) => !(w.profile === prof.id && w.player === player));
    if (b.yes !== false) s.blocks.push({ profile: prof.id, player });
  });
  const me = X.playerOfProfile(store, prof.id);
  if (me && b.yes !== false) X.unfriend(store, me.id, player);
  return ledger(store, g, prof.id);
}
// what the GUARDIAN card shows of each profile beside accounts.ts's view: its friend code, friends waiting, blocks
export function socialOf(store: Store, keys: X.Keys, profile: string) {
  const s = load(store);
  return { code: codeOf(store, keys, profile), waiting: waitingFor(store, profile),
           blocked: s.blocks.filter((x) => x.profile === profile).map((x) => ({ player: x.player, name: X.playerById(store, x.player)?.label ?? "?" })) };
}
// a profile gone: off the exchange, and its codes, waits and blocks forgotten
export function forget(store: Store, profiles: string[]) {
  for (const id of profiles) X.unclaim(store, id);
  change(store, (s) => {
    for (const id of profiles) delete s.codes[id];
    s.waiting = s.waiting.filter((w) => !profiles.includes(w.profile));
    s.blocks = s.blocks.filter((x) => !profiles.includes(x.profile));
  });
}
