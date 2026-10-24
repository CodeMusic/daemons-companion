import { describe, expect, it } from "vitest";
import speciesJson from "../data/species.json" with { type: "json" };
import { expFor } from "../src/save/growth.js";
import { syncSave } from "../src/save/writer.js";
import { readSave, blocks, ORDERS } from "../src/save/reader.js";
import { evolveTarget, judgeEvolution, evolvedOf, bondAdd, bondOf, bondScore, bondSeen } from "../src/evolve.js";
import { Store } from "../src/db.js";
import { buildSave, type DaemonSpec } from "./build_save.js";

const SPECIES = speciesJson as unknown as Record<string, any>;
const curve = SPECIES["1"].growth;                              // ROVERCUB: LEVEL 16 -> 2

describe("evolving while carried (C-184)", () => {
  it("judges the game's own rule, only what the companion may judge", () => {
    expect(evolveTarget({ species: 1, level: 15, friendship: 0, personality: 1 }, 10)).toBeNull();
    expect(evolveTarget({ species: 1, level: 16, friendship: 0, personality: 1 }, 10)).toBe(2);
    const unjudged = Object.entries(SPECIES).find(([, r]) => (r.evolutions ?? []).length && r.evolutions.every((e: any) => !e.judged));
    if (unjudged) expect(evolveTarget({ species: Number(unjudged[0]), level: 100, friendship: 255, personality: 1 }, 12)).toBeNull();
  });

  it("keeps what it became, and goes on from there", () => {
    const store = new Store(":memory:");
    expect(judgeEvolution(store, { species: 1, level: 10, friendship: 0, personality: 99 })).toBeNull();
    expect(judgeEvolution(store, { species: 1, level: 16, friendship: 0, personality: 99 })).toMatchObject({ from: 1, to: 2 });
    expect(evolvedOf(store, 99)).toMatchObject({ to: 2 });
  });

  const pip = (extra: Partial<DaemonSpec>): DaemonSpec => ({ personality: 4200, otId: 7, species: 1, nickname: "ROVERCUB", level: 16,
    exp: expFor(curve, 16), hp: 40, maxHP: 40, ...extra });
  const save = (d: DaemonSpec) => buildSave({ player: "ROVER", trainerId: 7, slots: [{ counter: 2, party: [d] }, { counter: 1, party: [] }] });

  it("writes the new species once it is home, renames a default name, and sets the game's marker", () => {
    expect(syncSave(save(pip({ away: true })), { link: false, evolve: [{ personality: 4200, species: 2 }] }).evolved).toEqual([]);
    const r = syncSave(save(pip({})), { link: false, evolve: [{ personality: 4200, species: 2 }] });
    expect(r.evolved).toMatchObject([{ personality: 4200, from: 1, to: 2 }]);
    const d = readSave(r.save).party[0];                          // throws if the record no longer adds up
    expect(d.species).toBe(2);
    expect(d.nickname).toBe(SPECIES["2"].name);
    const { sb1 } = blocks(r.save);
    const rec = new DataView(sb1.buffer, sb1.byteOffset + 56);      // the party's first record, as grow.test reads it
    const key = (4200 ^ rec.getUint32(4, true)) >>> 0, misc = ORDERS[4200 % 24].indexOf("M") * 12;
    expect(((rec.getUint32(32 + misc + 8, true) ^ key) >>> 29) & 1).toBe(1);
  });

  it("keeps a name it was given", () => {
    const r = syncSave(save(pip({ nickname: "PIP" })), { link: false, evolve: [{ personality: 4200, species: 2 }] });
    expect(readSave(r.save).party[0].nickname).toBe("PIP");
  });
});

describe("a bond built while carried (C-185)", () => {
  it("counts a day once, caps a day's steps, and adds cares and goals", () => {
    const store = new Store(":memory:");
    bondSeen(store, 7, "2026-10-24", 3000);
    bondSeen(store, 7, "2026-10-24", 50000);                   // the same day: counted once, steps capped at 20,000
    expect(bondOf(store, 7)).toMatchObject({ days: 1, stepsToday: 20000 });
    bondSeen(store, 7, "2026-10-25", 1500);                    // the next: the day before is banked
    bondAdd(store, 7, "cares"); bondAdd(store, 7, "cares"); bondAdd(store, 7, "goals");
    expect(bondScore(bondOf(store, 7))).toBe(21 + 2 * 5 + 2 + 3);
    expect(bondScore(bondOf(store, 8))).toBe(0);               // kept by personality
  });

  it("judges CARRIED on the bond alone", () => {
    const evos = SPECIES["1"].evolutions;
    SPECIES["1"].evolutions = [{ method: "CARRIED", param: 60, target: 2, judged: true }];
    try {
      expect(evolveTarget({ species: 1, level: 100, friendship: 255, personality: 1, bond: 59 }, 12)).toBeNull();
      expect(evolveTarget({ species: 1, level: 2, friendship: 0, personality: 1, bond: 60 }, 12)).toBe(2);
      expect(evolveTarget({ species: 1, level: 2, friendship: 0, personality: 1 }, 12)).toBeNull();
    } finally { SPECIES["1"].evolutions = evos; }
  });
});
