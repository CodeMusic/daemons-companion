// C-290: this file runs on the phone too (C-111) -- the app imports it, directly or through another file -- so keep it free of Node-only APIs (node:*, fs).
// C-80: a daemon per device (the user, 2026-10-08: "most people will have one device, but others like myself would like
// to put different daemons in each device from my party"). The game still says WHO goes out -- SEND in its party menu,
// answered at SYNC -- and any number may be AWAY; the app and the site say WHERE each one goes (docs/DEVICES.md, Q2).
//
// Which device carries which daemon is kept by the daemon's PERSONALITY (it never changes; its party slot does) under
// the device's own id. A device that asks and has none takes the first daemon away that no other device has -- so one
// device and one daemon away, the common case, needs no choosing at all. A daemon is in one device at a time.
import type { Store } from "./shared/store.js";
import { validDeviceId } from "./deviceid.js";

const KEY = "carry";
type Away = { personality: number };

export function carrying(store: Store): Record<string, number> {
  try { return JSON.parse(store.getSetting(KEY) ?? "{}"); } catch { return {}; }
}
function keep(store: Store, map: Record<string, number>) { store.setSetting(KEY, JSON.stringify(map)); }

// The daemon this device carries, out of those away. With no device named (the site, an older board, a plan run in the
// night), YOUR daemon (C-470, below).
// C-124: a device that gave its daemon to a card hosts none, by choice, until it takes one back -- never refilled
export const NONE = -1;
export function hostNone(store: Store, deviceId: string) { const map = carrying(store); map[deviceId] = NONE; keep(store, map); }

export function carriedFor<T extends Away>(store: Store, away: T[], deviceId: string): T | null {
  if (!away.length) return null;
  if (!validDeviceId(deviceId)) return yoursOf(store, away)?.daemon ?? null;
  const map = carrying(store);
  if (map[deviceId] === NONE) return null;
  const mine = away.find((d) => d.personality === map[deviceId]);
  if (mine) return mine;
  const taken = new Set(Object.entries(map).filter(([id]) => id !== deviceId).map(([, p]) => p));
  const free = away.find((d) => !taken.has(d.personality));
  if (!free) return null;
  keep(store, { ...map, [deviceId]: free.personality });
  return free;
}

// C-470 (the user, 2026-11-11: "overloaded at times then flipping back to the correct daemon"): with no device named --
// the site in a browser, MENTIONS FROM YOUR DAEMON, a walk, the persona of the day -- YOUR daemon, not simply the save's
// first away (which was OVERLOADED, in a board idle for three weeks): the one you name on the DEVICES card (YOURS), or
// else the one in the device used most recently, or else the first away, as it always was. Asking assigns nothing.
// USED (devices.ts lastUsed) is a device asking for something -- a care, a talk, a TRAIN -- where a watch polling its
// state every few seconds only checks in and would always be the newest heard: so lastSeen counts only while no device
// carrying a daemon has been used (on the hub, 2026-11-22, the T-Watch Ultra was heard after the phone every time).
export const YOURS = "carry.yours";
const DEVICES = "devices";      // devices.ts's own record of every device heard -- read here for when each was last seen
export type Yours<T> = { daemon: T; by: "named" | "recent" | "first" };
export function yoursOf<T extends Away>(store: Store, away: T[]): Yours<T> | null {
  if (!away.length) return null;
  const named = store.getSetting(YOURS);
  const chosen = named !== null ? away.find((d) => d.personality === Number(named)) : undefined;
  if (chosen) return { daemon: chosen, by: "named" };
  let rows: Record<string, { lastSeen?: unknown; lastUsed?: unknown }> = {};
  try { const v = JSON.parse(store.getSetting(DEVICES) ?? "{}"); if (v && typeof v === "object") rows = v; } catch { /* none heard */ }
  const at = (id: string, f: "lastUsed" | "lastSeen") => { const t = Date.parse(String(rows[id]?.[f] ?? "")); return Number.isFinite(t) ? t : null; };
  const newest = (f: "lastUsed" | "lastSeen") => {
    let recent: { t: number; d: T } | null = null;
    for (const [id, p] of Object.entries(carrying(store))) {
      const t = at(id, f), d = away.find((a) => a.personality === p);
      if (t !== null && d && (!recent || t > recent.t)) recent = { t, d };
    }
    return recent;
  };
  const recent = newest("lastUsed") ?? newest("lastSeen");
  return recent ? { daemon: recent.d, by: "recent" } : { daemon: away[0], by: "first" };
}
/** C-470: name your daemon (a personality away), or null for the one in the device used most recently */
export function setYours(store: Store, personality: number | null) { store.setSetting(YOURS, personality === null ? null : String(personality)); }

// Put this daemon in this device (null: nothing in it). It leaves whichever device had it.
export function assign(store: Store, deviceId: string, personality: number | null) {
  const map = carrying(store);
  for (const [id, p] of Object.entries(map)) if (p === personality) delete map[id];
  if (personality === null) delete map[deviceId]; else map[deviceId] = personality;
  keep(store, map);
}

// Every device's daemon as the site shows it, only those still away (one that came home leaves its device empty), and
// the daemons away that no device has yet.
export function carryView<T extends Away>(store: Store, away: T[]) {
  const map = carrying(store);
  const byDevice: Record<string, T> = {};
  for (const [id, p] of Object.entries(map)) { const d = away.find((a) => a.personality === p); if (d) byDevice[id] = d; }
  const held = new Set(Object.values(byDevice).map((d) => d.personality));
  return { byDevice, unplaced: away.filter((d) => !held.has(d.personality)) };
}
