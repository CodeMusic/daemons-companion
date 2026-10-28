// C-174 (the user, 2026-10-21: "gps could be shown on the companion app"; 2026-10-27, by multiple choice: "walks + regular
// polling so u can track its location on the iphone app -- also a where am I ping that also makes an audible tone on the
// watch"): where a watch with a GNSS has been. The watch tells each fix as a `where` interaction -- "<lat> <lon> <metres>"
// -- and they are kept here (the store's `where`, the newest first, five hundred of them) for the app's map. Never
// public: only the companion's own clients read them. FIND asks one device to say where it is, and to sound so it can be
// found -- the ask rides that device's own state (`find`), so no other board takes it. No node: imports.
import type { Store } from "./store.js";

export type Fix = { at: string; lat: number; lon: number; metres: number; device: string };
const KEEP = 500;

export function checkFix(detail: string): Omit<Fix, "at" | "device"> | string {
  const [lat, lon, metres] = detail.split(" ").map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || (lat === 0 && lon === 0))
    return "a fix is <lat> <lon> <metres>";
  return { lat: Math.round(lat * 1e6) / 1e6, lon: Math.round(lon * 1e6) / 1e6, metres: Number.isFinite(metres) ? Math.max(0, Math.round(metres)) : 0 };
}
export function fixesOf(store: Store, device?: string): Fix[] {
  let l: Fix[] = [];
  try { const j = JSON.parse(store.getSetting("where") ?? "[]"); l = Array.isArray(j) ? j : []; } catch { /* none */ }
  return device ? l.filter((f) => f.device === device) : l;
}
export function keepFix(store: Store, f: Omit<Fix, "at" | "device">, device: string, now = new Date()): Fix {
  const fix: Fix = { ...f, at: now.toISOString(), device };
  // newest first, a fix told late (C-199) put in its place among the rest
  const list = [fix, ...fixesOf(store)].sort((a, b) => b.at.localeCompare(a.at));
  store.setSetting("where", JSON.stringify(list.slice(0, KEEP)));
  const asked = store.getSetting(`find.${device}`);
  if (asked && fix.at >= asked) store.setSetting(`find.${device}`, null);   // found: the ask is answered (by a fix since it)
  return fix;
}
// FIND: asked now, for ten minutes (a watch out of reach for longer is not still asked to sound)
export function askFind(store: Store, device: string, now = new Date()) { store.setSetting(`find.${device}`, now.toISOString()); }
export function findAsked(store: Store, device: string, now = new Date()): string | null {
  const at = device ? store.getSetting(`find.${device}`) : null;
  return at && now.getTime() - new Date(at).getTime() < 10 * 60000 ? at : null;
}

// C-174: the distance walked since a time (the app's own midnight), from one device's fixes: the legs between fixes ten minutes or less apart, each
// between eight metres (the receiver's wander) and two kilometres (a gap, not a walk) -- the watch's own rule (gps.cpp)
export function walkedSince(fixes: Fix[], since: Date): number {
  const l = fixes.filter((f) => new Date(f.at) >= since).sort((a, b) => a.at.localeCompare(b.at));
  let m = 0;
  for (let i = 1, from = l[0]; i < l.length; i++) {
    const f = l[i], gap = new Date(f.at).getTime() - new Date(from.at).getTime();
    const leg = metresBetween(from, f);
    if (leg < 8 && gap <= 10 * 60000) continue;           // standing: the leg still starts where it did
    if (gap <= 10 * 60000 && leg < 2000) m += leg;
    from = f;
  }
  return Math.round(m);
}
function metresBetween(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const r = Math.PI / 180, x = Math.sin((b.lat - a.lat) * r / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin((b.lon - a.lon) * r / 2) ** 2;
  return 12742000 * Math.asin(Math.sqrt(x));
}
