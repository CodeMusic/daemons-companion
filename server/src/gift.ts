// C-185 (the user, 2026-10-24: the first goal done together brings it, one a save): HANDSHAKE, the line that only grows
// with you (DAEMONS T-450: HANDSHAKE 261 -> TETHERING 262 -> COROUTINE 263, met only by its bond, evolve.ts). The
// companion gives the first one: offered the first time a goal is finished while a daemon is carried, told on the boards,
// and written by the next SYNC into the PC's first empty box slot, already AWAY -- so it is carried from the moment it
// arrives, and the game finishes it on load (the C-184 marker: its moves, its ability, the INDEX).
import { randomInt } from "node:crypto";
import type { Store } from "./store.js";
import type { Gift } from "./save/writer.js";

export const HANDSHAKE = { species: 261, name: "HANDSHAKE", level: 5 };   // DRAFT: the name is T-450's, for the user
export const LINE = [261, 262, 263];
export interface GiftState { state: "offered" | "written"; personality: number; ivs: number; at: string }
const KEY = "gift.handshake";

export function giftOf(store: Store): GiftState | null {
  try { return JSON.parse(store.getSetting(KEY) ?? "null"); } catch { return null; }
}
// one a save: never offered twice, nor to a save that already holds one of the line
export function offerGift(store: Store, saveHolds: number[], now = new Date(), rand = (n: number) => randomInt(0, n)): GiftState | null {
  if (giftOf(store) || saveHolds.some((sp) => LINE.includes(sp))) return null;
  const g: GiftState = { state: "offered", personality: (rand(0x10000) * 0x10000 + rand(0x10000)) >>> 0,
                         ivs: (rand(0x8000) * 0x8000 + rand(0x8000)) >>> 0, at: now.toISOString() };
  store.setSetting(KEY, JSON.stringify(g));
  store.logInteraction("gift", `${HANDSHAKE.species} ${g.personality}`);
  return g;
}
// what SYNC writes, while it is only offered: FireRed's game number for CONTENT, LeafGreen's for CONTEXT
export function giftToWrite(store: Store, edition: string): Gift | null {
  const g = giftOf(store);
  return g?.state === "offered" ? { ...HANDSHAKE, personality: g.personality, ivs: g.ivs, game: edition === "CONTEXT" ? 5 : 4 } : null;
}
export function giftWritten(store: Store) {
  const g = giftOf(store);
  if (g) store.setSetting(KEY, JSON.stringify({ ...g, state: "written" }));
}
