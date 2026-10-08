// C-80: a daemon per device (the user, 2026-10-08: "most people will have one device, but others like myself would like
// to put different daemons in each device from my party"). The game still says WHO goes out -- SEND in its party menu,
// answered at SYNC -- and any number may be AWAY; the app and the site say WHERE each one goes (docs/DEVICES.md, Q2).
//
// Which device carries which daemon is kept by the daemon's PERSONALITY (it never changes; its party slot does) under
// the device's own id. A device that asks and has none takes the first daemon away that no other device has -- so one
// device and one daemon away, the common case, needs no choosing at all. A daemon is in one device at a time.
import type { Store } from "./db.js";
import { validDeviceId } from "./devices.js";

const KEY = "carry";
type Away = { personality: number };

export function carrying(store: Store): Record<string, number> {
  try { return JSON.parse(store.getSetting(KEY) ?? "{}"); } catch { return {}; }
}
function keep(store: Store, map: Record<string, number>) { store.setSetting(KEY, JSON.stringify(map)); }

// The daemon this device carries, out of those away. With no device named (the site, an older board), the first away,
// as it always was.
export function carriedFor<T extends Away>(store: Store, away: T[], deviceId: string): T | null {
  if (!away.length) return null;
  if (!validDeviceId(deviceId)) return away[0];
  const map = carrying(store);
  const mine = away.find((d) => d.personality === map[deviceId]);
  if (mine) return mine;
  const taken = new Set(Object.entries(map).filter(([id]) => id !== deviceId).map(([, p]) => p));
  const free = away.find((d) => !taken.has(d.personality));
  if (!free) return null;
  keep(store, { ...map, [deviceId]: free.personality });
  return free;
}

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
