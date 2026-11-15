// The hub's one slow core: what every device asks for each time it looks is kept between looks -- the daemon's life and
// feelings while the log is unwritten and the minute unturned, the INDEX while the save is the same bytes (2026-11-14).
import { describe, expect, it } from "vitest";
import { Store } from "../src/db.js";
import { daemonFeelings, daemonLife, indexOf } from "../src/core.js";
import { readIndex } from "../src/save/index.js";
import { casinoPending, casinoResults } from "../src/casino.js";
import { bondOf, bondSeen } from "../src/evolve.js";
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
  it("keeps the CASINO's results until the log is written", () => {
    const store = new Store(":memory:");
    store.logInteraction("casino", "-20 1a.1 board-1 2");
    const a = casinoResults(store);
    expect(casinoResults(store)).toBe(a);
    store.logInteraction("casino", "10 1a.2 board-1 1");
    expect(casinoResults(store)).not.toBe(a);
    expect(casinoPending(store).delta).toBe(-10);
  });
  it("writes the bond only when a look has moved it", () => {
    const store = new Store(":memory:");
    let writes = 0;
    const set = store.setSetting.bind(store);
    store.setSetting = (k: string, v: string) => { writes++; return set(k, v); };
    bondSeen(store, 9, "2026-11-14", 100);
    bondSeen(store, 9, "2026-11-14", 100);
    expect(writes).toBe(1);
    bondSeen(store, 9, "2026-11-14", 300);
    expect(writes).toBe(2);
    expect(bondOf(store, 9)).toMatchObject({ days: 1, stepsToday: 300 });
  });
});
