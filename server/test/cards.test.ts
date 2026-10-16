// C-124: NFC cards that hold a daemon -- a card is a host, as a board is: put the board's daemon onto it, take the
// card's, or swap; never in two places; a board that gave its daemon away hosts none until it takes one back.
import { describe, expect, it } from "vitest";
import { carriedFor, carrying } from "../src/carry.js";
import { cardId, cardOp, companionId, keepNote, noteFor, noteWritten, validUid } from "../src/cards.js";
import { Store } from "../src/db.js";

const FIRE = "m5-fire-a708a4", DIAL = "m5-dial-3a1b24", UID = "04a1b2c3d4e5f6", OTHER = "04ffeeddccbbaa";
const away = [{ personality: 1 }, { personality: 2 }, { personality: 3 }];

describe("cards that hold a daemon (cards.ts)", () => {
  it("puts the board's daemon onto an empty card, and the board then hosts none -- not a free one", () => {
    const store = new Store(":memory:");
    expect(carriedFor(store, away, FIRE)?.personality).toBe(1);
    const r = cardOp(store, away, FIRE, UID, "put");
    expect(r.error).toBeUndefined();
    expect(r.card?.personality).toBe(1);
    expect(carrying(store)[cardId(UID)]).toBe(1);
    expect(carriedFor(store, away, FIRE)).toBeNull();                       // 2 and 3 are free, but it chose none
  });

  it("takes the card's daemon onto an empty board, and the card is empty after", () => {
    const store = new Store(":memory:");
    cardOp(store, away, FIRE, UID, "put");                                   // the Fire's 1 onto the card
    const r = cardOp(store, away, DIAL, UID, "take");                        // a Dial that never hosted one takes it
    expect(r.error).toBeUndefined();
    expect(r.board?.personality).toBe(1);
    expect(carrying(store)[cardId(UID)]).toBeUndefined();
    expect(carriedFor(store, away, DIAL)?.personality).toBe(1);
    expect(carriedFor(store, away, FIRE)).toBeNull();                        // the Fire still chose none
    expect(cardOp(store, away, FIRE, UID, "take").error).toBe("the card is empty");
  });

  it("swaps a board's daemon for the card's, each in one place only", () => {
    const store = new Store(":memory:");
    carriedFor(store, away, FIRE);                                            // the Fire: 1
    carriedFor(store, away, DIAL);                                            // the Dial: 2
    cardOp(store, away, DIAL, UID, "put");                                   // the card: 2, the Dial: none
    const r = cardOp(store, away, FIRE, UID, "swap");
    expect(r.error).toBeUndefined();
    expect(r.board?.personality).toBe(2);
    expect(r.card?.personality).toBe(1);
    const held = Object.values(carrying(store)).filter((p) => p > 0);
    expect(new Set(held).size).toBe(held.length);                             // never in two places
  });

  it("says what to do instead: an empty card cannot be taken from, a full one is swapped, an empty board cannot put", () => {
    const store = new Store(":memory:");
    expect(cardOp(store, away, FIRE, UID, "take").error).toBe("the card is empty");
    cardOp(store, away, FIRE, UID, "put");
    expect(cardOp(store, away, FIRE, UID, "put").error).toBe("nothing is hosted here to put on it");
    carriedFor(store, away, DIAL);
    expect(cardOp(store, away, DIAL, UID, "put").error).toBe("the card holds one already: swap them");
    expect(cardOp(store, away, FIRE, OTHER, "swap").error).toBe("a swap needs a daemon on each");
  });

  it("reads what a card and a board hold without changing either", () => {
    const store = new Store(":memory:");
    cardOp(store, away, FIRE, UID, "put");
    const before = JSON.stringify(carrying(store));
    const r = cardOp(store, away, DIAL, UID, "read");
    expect(r.card?.personality).toBe(1);
    expect(JSON.stringify(carrying(store))).toBe(before.replace("}", `,"${DIAL}":2}`));   // only the Dial's first ask
  });

  it("keeps a card's id to hex, and the companion's own id steady", () => {
    expect(validUid(UID)).toBe(true);
    expect(validUid("04:a1")).toBe(false);
    expect(validUid("0")).toBe(false);
    const store = new Store(":memory:");
    expect(companionId(store)).toMatch(/^[0-9a-f]{8}$/);
    expect(companionId(store)).toBe(companionId(store));
  });

  it("keeps a note for a card until a reader has written it, plain and short", () => {
    const store = new Store(":memory:");
    expect(noteFor(store)).toBeNull();
    keepNote(store, "  Meet me by the pier ♥ at six  ", "t-deck-09ffa8");
    expect(noteFor(store)).toBe("Meet me by the pier  at six");
    keepNote(store, "x".repeat(200), "t-deck-09ffa8");
    expect(noteFor(store)?.length).toBe(80);
    noteWritten(store);
    expect(noteFor(store)).toBeNull();
  });
});
