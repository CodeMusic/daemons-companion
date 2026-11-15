// The hub's one slow core: what every device asks for each time it looks is kept between looks -- the daemon's life and
// feelings while the log is unwritten and the minute unturned, the INDEX while the save is the same bytes (2026-11-14).
import { describe, expect, it } from "vitest";
import { Store } from "../src/db.js";
import { daemonFeelings, daemonLife, indexOf } from "../src/core.js";
import { readIndex } from "../src/save/index.js";
import { buildSave } from "./build_save.js";

describe("kept readings", () => {
  it("keeps the daemon's life and feelings until the log is written or the minute turns", () => {
    const store = new Store(":memory:"), now = new Date("2026-11-14T12:00:30Z");
    const a = daemonLife(store, now), f = daemonFeelings(store, now);
    expect(daemonLife(store, now)).toBe(a);
    expect(daemonFeelings(store, now)).toBe(f);
    store.logInteraction("meal", null, new Date("2026-11-14T12:00:00Z"));
    const b = daemonLife(store, now);
    expect(b).not.toBe(a);
    expect(daemonLife(store, new Date("2026-11-14T12:01:00Z"))).not.toBe(b);
  });
  it("reads feelings with a life it was handed, never the kept one", () => {
    const store = new Store(":memory:"), now = new Date("2026-11-14T12:00:30Z");
    const kept = daemonFeelings(store, now), other = { ...daemonLife(store, now) };
    expect(daemonFeelings(store, now, other)).not.toBe(kept);
  });
  it("reads the INDEX again when the save's bytes change, and only then", () => {
    const mk = (species: number) => buildSave({ player: "ROVER", trainerId: 7, slots: [{ counter: 1, party: [{ personality: 9, otId: 7, species, nickname: "PIP", level: 5 }] }, { counter: 0, party: [] }] });
    const now = new Date("2026-11-14T12:00:00Z"), one = mk(1), two = mk(4);
    const a = indexOf(one, "CONTENT", now);
    expect(indexOf(one.slice(), "CONTENT", now)).toBe(a);
    expect(a).toEqual(readIndex(one, "CONTENT", undefined, now));
    const b = indexOf(two, "CONTENT", now);
    expect(b).toEqual(readIndex(two, "CONTENT", undefined, now));
    expect(indexOf(one, "CONTEXT", now)).toEqual(readIndex(one, "CONTEXT", undefined, now));
  });
});
