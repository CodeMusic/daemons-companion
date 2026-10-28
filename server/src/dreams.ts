// C-200 (the user, 2026-10-28: "sleep tracking ... it should be creative relating to daemons and dreams"; decided by
// multiple choice): a night on the watch, and the dream the daemon had in it. The watch knows the night two ways -- a
// long stillness at night (its motion sensor, C-201) or the daemon tucked in -- and tells it here when it ends: when it
// began and ended, how often it stirred, whether it was tucked in. The night's shape is its quality -- VIVID (long and
// still), QUIET, BROKEN (short, or restless) -- and the quality shapes the dream: the hub's modules write it in the
// daemon's own voice (ai/house.ts), and without them it is made from written lines here, the same night always the same
// dream. Every dream is kept in the journal (the store's `dreams`, the newest first, ninety of them) for the app and the
// site; a rested night counts toward the carried daemon's bond (evolve.ts). Every word is DRAFT. No node: imports (it
// runs on the phone, hosting alone).
import type { Store } from "./store.js";

export type Night = { from: string; to: string; hours: number; stirs: number; tucked: boolean };
export type Quality = "vivid" | "quiet" | "broken";
export type Dream = Night & { id: number; at: string; quality: Quality; text: string; by: "module" | "words";
                              nickname: string; species: number; personality: number | null; device: string };

// the night as the watch tells it: two times, an hour or more apart and at most sixteen; its stirs; tucked in or not
export function checkNight(b: any): Night | string {
  const from = new Date(b?.from), to = new Date(b?.to);
  if (isNaN(from.getTime()) || isNaN(to.getTime())) return "a night needs from and to (ISO times)";
  const hours = (to.getTime() - from.getTime()) / 3600000;
  if (hours < 1 || hours > 16) return "a night is one to sixteen hours";
  const stirs = Number.isInteger(b?.stirs) && b.stirs >= 0 ? Math.min(b.stirs, 999) : 0;
  return { from: from.toISOString(), to: to.toISOString(), hours: Math.round(hours * 10) / 10, stirs, tucked: b?.tucked === true };
}

// a stir is a waking turn: more than one an hour is restless; under four hours is short
export function quality(n: Night): Quality {
  if (n.hours < 4 || n.stirs > Math.max(4, n.hours * 1.2)) return "broken";
  if (n.hours >= 6.5 && n.stirs <= Math.max(2, n.hours / 3)) return "vivid";
  return "quiet";
}
// a good night for the bond: long enough, and not broken
export const rested = (n: Night) => n.hours >= 6 && quality(n) !== "broken";

// ---- the written dreams (DRAFT) ---------------------------------------------------------------------------------------
const IMAGES = [
  "running beside you through tall grass that hummed", "a city where every window was lit and every door was open",
  "the sea, counting its own waves and losing count", "a library whose books read themselves aloud",
  "a door it had never been through, standing open", "falling slowly upward into the stars",
  "a tree that grew a leaf for every step you took", "its own name, written in light on the water",
  "the old cartridge, warm in a sunlit room", "a long walk with no end it minded",
  "rain that fell upward and hummed a tune", "a bridge of numbers over a river of moonlight",
  "you, small and far away, waving", "a garden where every seed was a word",
  "the hum of the house at night, and a song inside it", "a map that drew itself as it walked",
];
const WAKES = ["bright", "rested", "humming", "glad of you", "ready for the day"];
// the same night, the same dream: chosen by the night's end and the daemon
function pickFrom<T>(list: T[], seed: number, k: number) { return list[Math.abs((seed * 2654435761 + k * 40503) | 0) % list.length]; }
const seedOf = (n: Night, personality: number | null) => Math.floor(new Date(n.to).getTime() / 3600000) ^ ((personality ?? 7) >>> 0);
export function dreamWords(n: Night, nickname: string, personality: number | null = null): string {
  const s = seedOf(n, personality), q = quality(n), name = nickname || "Your daemon";
  if (q === "vivid") return `${name} dreamt of ${pickFrom(IMAGES, s, 1)}. It woke ${pickFrom(WAKES, s, 2)}.`;
  if (q === "broken") return `${name} dreamt in pieces: ${pickFrom(IMAGES, s, 3)}... then ${pickFrom(IMAGES, s, 4)}.`;
  return `${name} dreamt of ${pickFrom(IMAGES, s, 5)}, and slept on.`;
}

// what the daemon is asked, as the user would hear it: the night, and what kind of telling (never shown)
export function dreamAsk(n: Night): string {
  const how = { vivid: "a long, deep sleep", quiet: "a quiet night", broken: "a short, restless night" }[quality(n)];
  return `You have just woken after ${n.hours} hours of sleep${n.tucked ? ", tucked in by the user" : ""}: ${how}. ` +
         "Tell the user the dream you had, in two short sentences -- strange and gentle, in images, as a daemon dreams. " +
         "No more than 160 characters.";
}

// ---- the journal -----------------------------------------------------------------------------------------------------
const KEEP = 90;
export function dreamsOf(store: Store): Dream[] {
  try { const l = JSON.parse(store.getSetting("dreams") ?? "[]"); return Array.isArray(l) ? l : []; } catch { return []; }
}
function keep(store: Store, list: Dream[]) { store.setSetting("dreams", JSON.stringify(list.slice(0, KEEP))); }
// a night kept with its written dream (the module's, if it comes, replaces it: rewriteDream). The same night told twice
// (the watch told it again, its answer lost) is the dream already kept.
export function keepNight(store: Store, n: Night, who: { nickname: string; species: number; personality: number | null; device: string }): Dream {
  const list = dreamsOf(store);
  const same = list.find((d) => d.to === n.to && d.device === who.device);
  if (same) return same;
  const d: Dream = { ...n, ...who, id: (list[0]?.id ?? 0) + 1, at: new Date().toISOString(), quality: quality(n),
                     text: dreamWords(n, who.nickname, who.personality), by: "words" };
  keep(store, [d, ...list]);
  return d;
}
export function rewriteDream(store: Store, id: number, text: string): Dream | null {
  const t = text.replace(/\s+/g, " ").trim().slice(0, 240);
  if (!t) return null;
  const list = dreamsOf(store), d = list.find((x) => x.id === id);
  if (!d) return null;
  d.text = t; d.by = "module";
  keep(store, list);
  return d;
}
// the newest dream, for a device's state while it is fresh (eighteen hours): the watch shows the module's telling once
export function freshDream(store: Store, now = new Date()) {
  const d = dreamsOf(store)[0];
  return d && now.getTime() - new Date(d.at).getTime() < 18 * 3600000 ? { id: d.id, text: d.text, by: d.by, quality: d.quality } : null;
}
