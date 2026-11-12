// C-357 (5): CONTAINER -- the companion remembers the carried daemon's form, and a change of it is kept for a week.
import { describe, expect, it } from "vitest";
import { Store } from "../src/db.js";
import { VESSEL_DAYS, vesselOf } from "../src/vessel.js";

const T0 = new Date("2026-11-12T12:00:00Z");
const later = (days: number) => new Date(T0.getTime() + days * 86400000);

describe("C-357 (5): CONTAINER, the same one in a new vessel", () => {
  it("only remembers the first form it sees, and says nothing", () => {
    const store = new Store(":memory:");
    expect(vesselOf(store, 1234, 4, T0)).toBeNull();
    expect(vesselOf(store, 1234, 4, later(1))).toBeNull();
  });
  it("keeps a change of form, by the daemon's personality, for a week", () => {
    const store = new Store(":memory:");
    vesselOf(store, 1234, 4, T0);
    expect(vesselOf(store, 1234, 5, later(1))).toEqual({ from: 4, to: 5, at: later(1).toISOString() });
    expect(vesselOf(store, 1234, 5, later(1 + VESSEL_DAYS - 0.5))).toMatchObject({ from: 4, to: 5 });
    expect(vesselOf(store, 1234, 5, later(1 + VESSEL_DAYS + 0.5))).toBeNull();
    expect(vesselOf(store, 999, 5, later(2))).toBeNull();               // another daemon: its own first sight
  });
});
