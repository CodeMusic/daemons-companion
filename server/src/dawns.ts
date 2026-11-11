// C-290: this file runs on the phone too (C-111) -- the app imports it, directly or through another file -- so keep it free of Node-only APIs (node:*, fs).
// C-314 (the user, 2026-11-10, by multiple choice: "Dawns kept", and "Yes, a small mark"): the companion's own way into
// THE EUDAIMON LAYER, the third book's dawn half. Be with your daemon in THE CREATOR'S HOUR (4:24 to 5:12, witching.ts)
// on seven mornings -- the den open in the hour tells the companion, once a morning -- and the dawn half is yours in the
// companion, marked "kept in the app" until the game's save holds it too. Nothing is written to the save; the game's
// flag still opens it as before. The mornings need not run together.
import { creatorNow } from "./witching.js";

export const DAWNS_TO_EARN = 7;
const KEY = "dawn.kept";
type Kv = { getSetting(k: string): string | null; setSetting(k: string, v: string | null): void };

const dateOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export function dawnsKept(store: Kv): string[] {
  try { const l = JSON.parse(store.getSetting(KEY) ?? "[]"); return Array.isArray(l) ? l.filter((x) => typeof x === "string") : []; }
  catch { return []; }
}
export const dawnEarned = (store: Kv) => dawnsKept(store).length >= DAWNS_TO_EARN;
// this morning kept, if it is the creator's hour on the companion's clock; the mornings kept, and whether it is earned
export function keepDawn(store: Kv, now = new Date()): { kept: number; needed: number; earned: boolean; now: boolean } {
  const list = dawnsKept(store), today = dateOf(now), inHour = creatorNow(now);
  if (inHour && !list.includes(today)) { list.push(today); store.setSetting(KEY, JSON.stringify(list.slice(-60))); }
  return { kept: list.length, needed: DAWNS_TO_EARN, earned: list.length >= DAWNS_TO_EARN, now: inHour };
}
