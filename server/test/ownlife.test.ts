// C-472: a household daemon's own care and dream in its dialogue persona -- core.ownLife, read from the cares given to it
// (the interactions kept under its personality) and its own last dream; nothing when it has neither.
import { describe, expect, it } from "vitest";
import { Store } from "../src/shared/db.js";
import { ownLife } from "../src/core.js";
import { personaOf, speciesFacts } from "../src/psyche/personaof.js";

const at = (h: number, d = 23) => new Date(2026, 10, d, h);

describe("C-472: a household daemon's own life", () => {
  it("is nothing for a daemon with no care of its own and no dream", () => {
    const store = new Store(":memory:", { now: () => at(12).getTime() });
    store.logInteraction("feed", null, at(9), null);                    // a shared care counts for no one daemon on its own
    expect(ownLife(store, 0xdeadbeef, at(12))).toBeNull();
  });
  it("reads its mood and care from the cares given to it, and its own last dream of two days", () => {
    const store = new Store(":memory:", { now: () => at(12).getTime() });
    const p = 0xdeadbeef;
    store.logInteraction("feed", null, at(9), p);
    store.logInteraction("water", null, at(9), p);
    store.setSetting("dreams", JSON.stringify([
      { id: 2, at: at(7).toISOString(), text: "A  lantern   floated over the pier.", personality: p, nickname: "EMBER", species: 4, device: "d" },
      { id: 1, at: at(7, 18).toISOString(), text: "An old dream.", personality: p, nickname: "EMBER", species: 4, device: "d" },
      { id: 3, at: at(8).toISOString(), text: "Someone else's.", personality: 7, nickname: "OTHER", species: 1, device: "e" },
    ]));
    const own = ownLife(store, p, at(12))!;
    expect(own.dream).toBe("A lantern floated over the pier.");
    expect(typeof own.mood).toBe("string");
    expect(own.care).toBeTruthy();
    const persona = personaOf({ ...speciesFacts(4, "EMBER"), mood: own.mood, care: own.care, dream: own.dream });
    expect(persona).toMatch(/Last night you dreamt: A lantern floated over the pier\./);
    expect(persona).toMatch(/Today you feel/);
  });
  it("counts a dream alone as a life of its own", () => {
    const store = new Store(":memory:", { now: () => at(12).getTime() });
    store.setSetting("dreams", JSON.stringify([{ id: 1, at: at(6).toISOString(), text: "Rain falling up.", personality: 9, nickname: "X", species: 1, device: "d" }]));
    expect(ownLife(store, 9, at(12))?.dream).toBe("Rain falling up.");
  });
});
