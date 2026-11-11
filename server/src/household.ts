// C-290: this file runs on the phone too (C-111) -- the app imports it, directly or through another file -- so keep it free of Node-only APIs (node:*, fs).
// C-327 (the user, 2026-11-11): social within the household, between one home's own devices (the phone is one too, by
// its widget's id, C-100) -- no exchange, no other player:
// - SWAP: a trade between two of the household's devices is only a swap of what each carries (carry.ts). Nothing is
//   written to the save; the two daemons stay AWAY and change devices.
// - TOGETHER: two devices' daemons in one space, shown on both -- each device's state names the other daemon and the
//   side it stands on (the first device's on the left). A device is in one space at a time; a space lasts twelve hours,
//   as OUT TOGETHER does (C-220), or until either leaves.
// - A care given on either is seen on both: the space keeps the last few cares (kind, which device, when), each device
//   draws it for CARE_SHOWN_MS -- the PROVISION in the middle (C-302's, chosen by the kind as each host's GIVEN does)
//   and a daemon either side eating -- and the other daemon's bond counts it too (core.careGiven).
// DRAFT: every rule here is the companion lane's first reading of the user's words, to be seen and changed.
import type { Store } from "./store.js";
import { carriedFor, carrying } from "./carry.js";
import { validDeviceId } from "./deviceid.js";

const KEY = "household.spaces";
export const SPACE_MS = 12 * 60 * 60 * 1000, CARE_SHOWN_MS = 90 * 1000, CARES_KEPT = 6;
export type SharedCare = { kind: string; by: string; at: string };
export type Space = { a: string; b: string; since: string; until: string; cares: SharedCare[] };
type Away = { personality: number };
type Result<T> = T | string;

export function spaces(store: Store, now = new Date()): Space[] {
  let all: Space[] = [];
  try { all = JSON.parse(store.getSetting(KEY) ?? "[]"); } catch { all = []; }
  return all.filter((s) => Date.parse(s.until) > now.getTime());
}
function keep(store: Store, all: Space[]) { store.setSetting(KEY, JSON.stringify(all)); }

// SWAP: what each device carries, exchanged. One carrying nothing takes the other's (a move); both empty is refused.
export function swap<T extends Away>(store: Store, away: T[], a: string, b: string): Result<{ [device: string]: T | null }> {
  if (!validDeviceId(a) || !validDeviceId(b)) return "name two devices";                          // DRAFT
  if (a === b) return "a device cannot swap with itself";                                          // DRAFT
  const da = carriedFor(store, away, a), db = carriedFor(store, away, b);
  if (!da && !db) return "neither device carries a daemon";                                        // DRAFT
  const map = carrying(store);
  if (db) map[a] = db.personality; else delete map[a];
  if (da) map[b] = da.personality; else delete map[b];
  store.setSetting("carry", JSON.stringify(map));
  return { [a]: db, [b]: da };
}

// TOGETHER: two devices' daemons in one space. Either already in another space leaves it first.
export function together(store: Store, a: string, b: string, now = new Date()): Result<Space> {
  if (!validDeviceId(a) || !validDeviceId(b)) return "name two devices";                          // DRAFT
  if (a === b) return "a device cannot share a space with itself";                                 // DRAFT
  const s: Space = { a, b, since: now.toISOString(), until: new Date(now.getTime() + SPACE_MS).toISOString(), cares: [] };
  keep(store, [...spaces(store, now).filter((x) => ![x.a, x.b].some((d) => d === a || d === b)), s]);
  return s;
}
export function apart(store: Store, device: string, now = new Date()): boolean {
  const all = spaces(store, now), left = all.filter((x) => x.a !== device && x.b !== device);
  keep(store, left);
  return left.length !== all.length;
}
export function spaceOf(store: Store, device: string, now = new Date()): Space | null {
  return spaces(store, now).find((x) => x.a === device || x.b === device) ?? null;
}
export const partnerIn = (s: Space, device: string) => (s.a === device ? s.b : s.a);

// A care given on a device in a space: kept for both to draw; the other device's name, for its daemon's bond
export function shareCare(store: Store, device: string, kind: string, now = new Date()): string | null {
  const all = spaces(store, now), s = all.find((x) => x.a === device || x.b === device);
  if (!s) return null;
  s.cares = [...s.cares, { kind, by: device, at: now.toISOString() }].slice(-CARES_KEPT);
  keep(store, all);
  return partnerIn(s, device);
}

// What a device draws: the other daemon, which side its own stands on, and a care given in the last CARE_SHOWN_MS
export function togetherView<T extends Away>(store: Store, away: T[], device: string, now = new Date()) {
  const s = validDeviceId(device) ? spaceOf(store, device, now) : null;
  if (!s) return null;
  const other = partnerIn(s, device);
  const care = [...s.cares].reverse().find((c) => now.getTime() - Date.parse(c.at) < CARE_SHOWN_MS) ?? null;
  return { device: other, daemon: carriedFor(store, away, other), side: s.a === device ? "left" as const : "right" as const,
           since: s.since, until: s.until, care: care && { ...care, mine: care.by === device } };
}
