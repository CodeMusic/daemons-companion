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
  store.setSetting("where", JSON.stringify([fix, ...fixesOf(store)].slice(0, KEEP)));
  if (store.getSetting(`find.${device}`)) store.setSetting(`find.${device}`, null);   // found: the ask is answered
  return fix;
}
// FIND: asked now, for ten minutes (a watch out of reach for longer is not still asked to sound)
export function askFind(store: Store, device: string, now = new Date()) { store.setSetting(`find.${device}`, now.toISOString()); }
export function findAsked(store: Store, device: string, now = new Date()): string | null {
  const at = device ? store.getSetting(`find.${device}`) : null;
  return at && now.getTime() - new Date(at).getTime() < 10 * 60000 ? at : null;
}
