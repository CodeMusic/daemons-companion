// C-124 (the user, 2026-10-15): NFC cards that hold a daemon -- "like pokeballs -- u can put your daemon easily into it
// -- or receive one that is there or swap". A card is a HOST, as a board is (C-80): its id is card-<uid> in the same
// carry table, so a daemon is never in two places, and the companion keeps who is where. The card itself carries its
// daemon's name and species and this companion's id (firmware: the card's pages), so any reader can say whose it is --
// a stranger's card means the two daemons meet (C-15), and nothing changes hands. The T-Deck writes a NOTE onto a card
// too, through a reader: the companion keeps it until a reader has written it to the next card held.
import type { Store } from "./store.js";
import { assign, carriedFor, carrying, hostNone } from "./carry.js";

type Away = { personality: number };
export type CardOp = "read" | "put" | "take" | "swap";

export const cardId = (uid: string) => `card-${uid}`;
export function validUid(uid: unknown): uid is string { return typeof uid === "string" && /^[0-9a-f]{8,20}$/.test(uid); }

// This companion's own short id, written on its cards: a reader tells ours from a stranger's by it. Not a secret, and
// core.ts (which a phone hosting on its own runs too) asks for it -- so no Node crypto here
export function companionId(store: Store): string {
  let id = store.getSetting("companion.id");
  if (!id || !/^[0-9a-f]{8}$/.test(id)) {
    id = Array.from({ length: 8 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
    store.setSetting("companion.id", id);
  }
  return id;
}

// One card held to one board. read: what each holds. put: the board's daemon onto the empty card (the board then hosts
// none). take: the card's daemon onto the empty board. swap: the one for the other. An error says what to do instead.
export function cardOp<T extends Away>(store: Store, away: T[], deviceId: string, uid: string, op: CardOp):
    { error?: string; card: T | null; board: T | null } {
  const map = carrying(store), card = cardId(uid);
  const onCard = away.find((d) => d.personality === map[card]) ?? null;
  const onBoard = op === "read" || op === "put" ? carriedFor(store, away, deviceId) : away.find((d) => d.personality === map[deviceId]) ?? null;
  if (op === "read") return { card: onCard, board: onBoard };
  if (op === "put") {
    if (!onBoard) return { error: "nothing is hosted here to put on it", card: onCard, board: null };
    if (onCard) return { error: "the card holds one already: swap them", card: onCard, board: onBoard };
    assign(store, card, onBoard.personality); hostNone(store, deviceId);
    return { card: onBoard, board: null };
  }
  if (op === "take") {
    if (!onCard) return { error: "the card is empty", card: null, board: onBoard };
    if (onBoard) return { error: "this board hosts one already: swap them", card: onCard, board: onBoard };
    assign(store, deviceId, onCard.personality);
    return { card: null, board: onCard };
  }
  if (!onCard || !onBoard) return { error: "a swap needs a daemon on each", card: onCard, board: onBoard };
  assign(store, deviceId, onCard.personality); assign(store, card, onBoard.personality);
  return { card: onBoard, board: onCard };
}

// The note for a card, from the T-Deck: kept until a reader writes it
const NOTE = "card.note";
export const NOTE_MAX = 80;
export function noteFor(store: Store): string | null {
  try { return JSON.parse(store.getSetting(NOTE) ?? "null")?.text ?? null; } catch { return null; }
}
export function keepNote(store: Store, text: string, by: string) {
  const t = text.replace(/[^\x20-\x7e]/g, "").trim().slice(0, NOTE_MAX);
  store.setSetting(NOTE, t ? JSON.stringify({ text: t, by, at: new Date().toISOString() }) : "null");
  return t;
}
export function noteWritten(store: Store) { store.setSetting(NOTE, "null"); }
