// C-415 (the user, 2026-11-18, by multiple choice: per daemon by default): one daemon fed is not another fed -- unless the
// setting "cares" says the household shares one set, as it did before.
import { describe, expect, it } from "vitest";
import { Store } from "../src/shared/db.js";
import { caresFor, daemonLife } from "../src/core.js";

const A = 0x12345678, B = 0x9abcdef0;

describe("cares kept apart", () => {
  it("counts a daemon's own cares and leaves another's out", () => {
    const store = new Store(":memory:"), now = new Date();
    store.logInteraction("feed", "site", now, A);
    store.logInteraction("water", "site", now, A);
    expect(daemonLife(store, now, caresFor(store, A)).fed.today).toBe(1);
    expect(daemonLife(store, now, caresFor(store, A)).watered.today).toBe(1);
    expect(daemonLife(store, now, caresFor(store, B)).fed.today).toBe(0);
  });
  it("still counts the household's rows, and every care from before, for each", () => {
    const store = new Store(":memory:"), now = new Date();
    store.logInteraction("feed", "site", now);
    expect(daemonLife(store, now, caresFor(store, A)).fed.today).toBe(1);
    expect(daemonLife(store, now, caresFor(store, B)).fed.today).toBe(1);
  });
  it("shares one set when the setting says so", () => {
    const store = new Store(":memory:"), now = new Date();
    store.setSetting("cares", "shared");
    store.logInteraction("feed", "site", now, A);
    expect(caresFor(store, B)).toBeNull();
    expect(daemonLife(store, now, caresFor(store, B)).fed.today).toBe(1);
  });
});
