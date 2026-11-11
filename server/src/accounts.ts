// C-226 (docs/ACCOUNTS.md; the user, 2026-11-11, by multiple choice): ACCOUNTS -- a GUARDIAN holds the account and kids
// are PROFILES inside it. A child never gives an email, an age or a password:
//
//   * a guardian is made by signing in with Apple or Google (idtoken.ts checks the token; we keep the provider's `sub`),
//     then a passkey on each of their devices (webauthn.ts) -- a guardian token (30 days) either way;
//   * a profile's public name is built from two word lists (data/names.json), never typed, with a four-digit tag the
//     player never chooses; a friends-only nickname only the guardian sets;
//   * a kid's device opens ONE profile with a one-time code the guardian makes (eight letters, fifteen minutes) -- a
//     device token, revocable by the guardian;
//   * the guardian's controls per profile, safest first; and DELETE, which erases the guardian and everything theirs.
//
// The exchange, friends and THE COMMONS move onto profiles in piece 4; this is piece 1, the accounts themselves, on
// roverbyteseer beside the commons (accounts_api.ts). Tokens are kept only as hashes. No node: imports -- the keys are
// the caller's, as exchange.ts's are.
import type { Store } from "./store.js";
import type { Keys, Result } from "./exchange.js";
import namesJson from "../data/names.json" with { type: "json" };

const KEY = "accounts";
export const SESSION_MS = 30 * 24 * 60 * 60 * 1000, CODE_MS = 15 * 60 * 1000, CHALLENGE_MS = 5 * 60 * 1000;
export const PROFILES_MOST = 8, DEVICES_MOST = 16, PASSKEYS_MOST = 10;
const NAMES = namesJson as { first: (string | null)[]; second: (string | null)[] };

// The controls, each with its choices safest first (the first is the default)
export const CONTROLS = {
  friends: ["approve", "own"],                 // the guardian approves each friend / the profile accepts its own
  trade: ["friends", "home", "lobby"],         // who may trade, lend or give with it
  meet: ["friends", "trades", "off"],          // C-220's meetings
  lobby: ["off", "on"],                        // the lobby and players nearby (C-227)
} as const;
export type Controls = { [K in keyof typeof CONTROLS]: (typeof CONTROLS)[K][number] };
const DEFAULT_CONTROLS = Object.fromEntries(Object.entries(CONTROLS).map(([k, v]) => [k, v[0]])) as Controls;

export interface AccountKeys extends Keys { tag(): number }   // a profile's four digits, 1000-9999
export type Guardian = { id: string; provider: string; sub: string; at: string };
export type Profile = { id: string; guardian: string; first: number; second: number; tag: number; nickname: string | null; controls: Controls; at: string };
type Session = { hash: string; guardian: string; until: string };
type DeviceCode = { hash: string; profile: string; until: string };
type Device = { id: string; hash: string; profile: string; label: string; at: string };
export type StoredPasskey = { id: string; guardian: string; jwk: unknown; alg: number; count: number; label: string; at: string };
type Challenge = { id: string; value: string; kind: "register" | "login"; guardian: string | null; until: string };
type State = { guardians: Guardian[]; profiles: Profile[]; sessions: Session[]; codes: DeviceCode[]; devices: Device[];
               passkeys: StoredPasskey[]; challenges: Challenge[]; next: number };

const load = (store: Store): State => {
  try { const s = JSON.parse(store.getSetting(KEY) ?? "null"); if (s?.guardians) return s; } catch { /* new */ }
  return { guardians: [], profiles: [], sessions: [], codes: [], devices: [], passkeys: [], challenges: [], next: 1 };
};
function change<T>(store: Store, now: Date, f: (s: State) => T): T {
  return store.together(() => {
    const s = load(store), t = now.getTime(), live = (x: { until: string }) => Date.parse(x.until) > t;
    s.sessions = s.sessions.filter(live); s.codes = s.codes.filter(live); s.challenges = s.challenges.filter(live);
    const r = f(s);
    store.setSetting(KEY, JSON.stringify(s));
    return r;
  });
}
const fail = (error: string) => ({ error });
const later = (now: Date, ms: number) => new Date(now.getTime() + ms).toISOString();

// ---- names
export const nameOf = (p: { first: number; second: number }) => `${NAMES.first[p.first] ?? "?"} ${NAMES.second[p.second] ?? "?"}`;
export const names = () => ({ first: NAMES.first, second: NAMES.second });
const validName = (first: unknown, second: unknown) =>
  Number.isInteger(first) && Number.isInteger(second) && !!NAMES.first[first as number] && !!NAMES.second[second as number];

// ---- guardians: signed in by a provider (the token already checked), or by a passkey
export function signIn(store: Store, keys: AccountKeys, provider: string, sub: string, now = new Date()): { token: string; guardian: Guardian } {
  return change(store, now, (s) => {
    let g = s.guardians.find((x) => x.provider === provider && x.sub === sub);
    if (!g) { g = { id: `g${s.next++}`, provider, sub, at: now.toISOString() }; s.guardians.push(g); }
    const token = keys.token();
    s.sessions.push({ hash: keys.hash(token), guardian: g.id, until: later(now, SESSION_MS) });
    return { token, guardian: g };
  });
}
export function guardianFor(store: Store, keys: Keys, token: string, now = new Date()): Guardian | null {
  if (!token) return null;
  const s = load(store), h = keys.hash(token), t = now.getTime();
  const sess = s.sessions.find((x) => x.hash === h && Date.parse(x.until) > t);
  return sess ? s.guardians.find((g) => g.id === sess.guardian) ?? null : null;
}
export function signOut(store: Store, keys: Keys, token: string, now = new Date()) {
  change(store, now, (s) => { const h = keys.hash(token); s.sessions = s.sessions.filter((x) => x.hash !== h); });
}

// What the guardian sees: profiles, the devices each is open on, passkeys (never a hash, a key or a sub)
export function guardianView(store: Store, g: Guardian) {
  const s = load(store);
  return { id: g.id, provider: g.provider, at: g.at,
           profiles: s.profiles.filter((p) => p.guardian === g.id).map((p) => ({ ...profileView(p),
             devices: s.devices.filter((d) => d.profile === p.id).map((d) => ({ id: d.id, label: d.label, at: d.at })) })),
           passkeys: s.passkeys.filter((k) => k.guardian === g.id).map((k) => ({ id: k.id, label: k.label, at: k.at })) };
}
export const profileView = (p: Profile) => ({ id: p.id, name: nameOf(p), tag: p.tag, first: p.first, second: p.second,
                                               nickname: p.nickname, controls: p.controls, at: p.at });
// what another player may see of a profile: its built name and tag, never the guardian
export const publicView = (p: Profile) => ({ id: p.id, name: nameOf(p), tag: p.tag });

// ---- profiles
export function addProfile(store: Store, keys: AccountKeys, g: Guardian, b: { first?: unknown; second?: unknown }, now = new Date()): Result<Profile> {
  if (!validName(b.first, b.second)) return fail("choose a word from each list");                    // DRAFT
  return change(store, now, (s) => {
    if (s.profiles.filter((p) => p.guardian === g.id).length >= PROFILES_MOST) return fail(`at most ${PROFILES_MOST} profiles`);   // DRAFT
    const p: Profile = { id: `p${s.next++}`, guardian: g.id, first: b.first as number, second: b.second as number, tag: keys.tag(),
                         nickname: null, controls: { ...DEFAULT_CONTROLS }, at: now.toISOString() };
    s.profiles.push(p);
    return p;
  });
}
function mine(s: State, g: Guardian, id: unknown) { return s.profiles.find((p) => p.id === id && p.guardian === g.id) ?? null; }

export function rename(store: Store, g: Guardian, b: { id?: unknown; first?: unknown; second?: unknown }, now = new Date()): Result<Profile> {
  if (!validName(b.first, b.second)) return fail("choose a word from each list");                    // DRAFT
  return change(store, now, (s) => { const p = mine(s, g, b.id); if (!p) return fail("no such profile"); p.first = b.first as number; p.second = b.second as number; return p; });
}
export function setControls(store: Store, g: Guardian, b: { id?: unknown } & Record<string, unknown>, now = new Date()): Result<Profile> {
  return change(store, now, (s) => {
    const p = mine(s, g, b.id);
    if (!p) return fail("no such profile");
    for (const [k, choices] of Object.entries(CONTROLS)) {
      if (b[k] === undefined) continue;
      if (!(choices as readonly string[]).includes(b[k] as string)) return fail(`${k} is one of ${choices.join(", ")}`);
    }
    for (const k of Object.keys(CONTROLS)) if (b[k] !== undefined) (p.controls as any)[k] = b[k];
    return p;
  });
}
// The friends-only nickname: set by the guardian alone (so it is approved as it is set); letters, digits and a space
const NICK = /^[A-Z0-9][A-Z0-9 ]{0,9}$/;
export function setNickname(store: Store, g: Guardian, b: { id?: unknown; text?: unknown }, now = new Date()): Result<Profile> {
  const text = typeof b.text === "string" ? b.text.trim().toUpperCase() : "";
  if (text && !NICK.test(text)) return fail("a nickname is up to ten letters and digits");          // DRAFT
  return change(store, now, (s) => { const p = mine(s, g, b.id); if (!p) return fail("no such profile"); p.nickname = text || null; return p; });
}
export function removeProfile(store: Store, g: Guardian, id: unknown, now = new Date()): Result<{ removed: string }> {
  return change(store, now, (s) => {
    const p = mine(s, g, id);
    if (!p) return fail("no such profile");
    s.profiles = s.profiles.filter((x) => x.id !== p.id);
    s.devices = s.devices.filter((d) => d.profile !== p.id); s.codes = s.codes.filter((c) => c.profile !== p.id);
    return { removed: p.id };
  });
}

// ---- a kid's device: a one-time code for one profile, then a device token for that profile only
export function deviceCode(store: Store, keys: AccountKeys, g: Guardian, profile: unknown, now = new Date()): Result<{ code: string; until: string }> {
  return change(store, now, (s) => {
    const p = mine(s, g, profile);
    if (!p) return fail("no such profile");
    if (s.devices.filter((d) => d.profile === p.id).length >= DEVICES_MOST) return fail(`at most ${DEVICES_MOST} devices a profile`);   // DRAFT
    const code = keys.code(), until = later(now, CODE_MS);
    s.codes = s.codes.filter((c) => c.profile !== p.id);       // one code waiting per profile: a new one replaces it
    s.codes.push({ hash: keys.hash(code), profile: p.id, until });
    return { code, until };
  });
}
export function joinDevice(store: Store, keys: AccountKeys, b: { code?: unknown; label?: unknown }, now = new Date()): Result<{ token: string; profile: ReturnType<typeof profileView> }> {
  const code = typeof b.code === "string" ? b.code.trim().toUpperCase() : "";
  const label = typeof b.label === "string" ? b.label.trim().slice(0, 32) : "";
  return change(store, now, (s) => {
    const h = keys.hash(code), c = code ? s.codes.find((x) => x.hash === h) : null;
    if (!c) return fail("that code is not one, or it has expired");                                  // DRAFT
    s.codes = s.codes.filter((x) => x !== c);
    const p = s.profiles.find((x) => x.id === c.profile);
    if (!p) return fail("that profile is gone");
    const token = keys.token();
    s.devices.push({ id: `d${s.next++}`, hash: keys.hash(token), profile: p.id, label: label || "a device", at: now.toISOString() });
    return { token, profile: profileView(p) };
  });
}
export function profileForDevice(store: Store, keys: Keys, token: string): Profile | null {
  if (!token) return null;
  const s = load(store), h = keys.hash(token), d = s.devices.find((x) => x.hash === h);
  return d ? s.profiles.find((p) => p.id === d.profile) ?? null : null;
}
export function revokeDevice(store: Store, g: Guardian, id: unknown, now = new Date()): Result<{ revoked: string }> {
  return change(store, now, (s) => {
    const d = s.devices.find((x) => x.id === id && !!mine(s, g, x.profile));
    if (!d) return fail("no such device");
    s.devices = s.devices.filter((x) => x !== d);
    return { revoked: d.id };
  });
}

// ---- passkeys: a challenge, then the device's answer (webauthn.ts checks it; this keeps what it gives back)
export function challenge(store: Store, keys: AccountKeys, kind: "register" | "login", g: Guardian | null, now = new Date()) {
  return change(store, now, (s) => {
    const c: Challenge = { id: `c${s.next++}`, value: keys.token(), kind, guardian: g?.id ?? null, until: later(now, CHALLENGE_MS) };
    s.challenges.push(c);
    return { id: c.id, challenge: c.value, until: c.until,
             ...(kind === "login" ? {} : { exclude: s.passkeys.filter((k) => k.guardian === g?.id).map((k) => k.id) }) };
  });
}
// The challenge, taken once
export function takeChallenge(store: Store, id: unknown, kind: "register" | "login", now = new Date()): Challenge | null {
  return change(store, now, (s) => {
    const c = s.challenges.find((x) => x.id === id && x.kind === kind) ?? null;
    s.challenges = s.challenges.filter((x) => x !== c);
    return c;
  });
}
export function keepPasskey(store: Store, g: Guardian, k: { id: string; jwk: unknown; alg: number; count: number }, label: unknown, now = new Date()): Result<{ id: string }> {
  return change(store, now, (s) => {
    if (s.passkeys.some((x) => x.id === k.id)) return fail("that passkey is kept already");
    if (s.passkeys.filter((x) => x.guardian === g.id).length >= PASSKEYS_MOST) return fail(`at most ${PASSKEYS_MOST} passkeys`);   // DRAFT
    s.passkeys.push({ ...k, guardian: g.id, label: typeof label === "string" && label.trim() ? label.trim().slice(0, 32) : "a passkey", at: now.toISOString() });
    return { id: k.id };
  });
}
export const passkeyOf = (store: Store, id: unknown): StoredPasskey | null => load(store).passkeys.find((k) => k.id === id) ?? null;
export function passkeyUsed(store: Store, keys: AccountKeys, id: string, count: number, now = new Date()): { token: string; guardian: Guardian } | null {
  return change(store, now, (s) => {
    const k = s.passkeys.find((x) => x.id === id), g = k && s.guardians.find((x) => x.id === k.guardian);
    if (!k || !g) return null;
    k.count = count;
    const token = keys.token();
    s.sessions.push({ hash: keys.hash(token), guardian: g.id, until: later(now, SESSION_MS) });
    return { token, guardian: g };
  });
}
export function removePasskey(store: Store, g: Guardian, id: unknown, now = new Date()): Result<{ removed: string }> {
  return change(store, now, (s) => {
    const k = s.passkeys.find((x) => x.id === id && x.guardian === g.id);
    if (!k) return fail("no such passkey");
    s.passkeys = s.passkeys.filter((x) => x !== k);
    return { removed: k.id };
  });
}

// ---- DELETE: the guardian and everything theirs, at once (the design allows 30 days; nothing here needs them)
export function deleteGuardian(store: Store, g: Guardian, now = new Date()): { deleted: string; profiles: number } {
  return change(store, now, (s) => {
    const ps = new Set(s.profiles.filter((p) => p.guardian === g.id).map((p) => p.id));
    s.guardians = s.guardians.filter((x) => x.id !== g.id);
    s.profiles = s.profiles.filter((p) => !ps.has(p.id));
    s.devices = s.devices.filter((d) => !ps.has(d.profile)); s.codes = s.codes.filter((c) => !ps.has(c.profile));
    s.sessions = s.sessions.filter((x) => x.guardian !== g.id);
    s.passkeys = s.passkeys.filter((k) => k.guardian !== g.id);
    s.challenges = s.challenges.filter((c) => c.guardian !== g.id);
    return { deleted: g.id, profiles: ps.size };
  });
}
