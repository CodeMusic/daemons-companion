import { describe, expect, it } from "vitest";
import speciesJson from "../data/species.json" with { type: "json" };
import { calcStats } from "../src/save/stats.js";
import { expFor } from "../src/save/growth.js";
import { syncSave } from "../src/save/writer.js";
import { readSave, blocks } from "../src/save/reader.js";
import { buildSave, type DaemonSpec } from "./build_save.js";

const SPECIES = speciesJson as unknown as Record<string, any>;
const curve = SPECIES["1"].growth;                              // ROVERCUB

describe("stats, as the game's CalculateMonStats gives them (C-45)", () => {
  it("works the formula as the game does, nature included", () => {
    const base = [45, 49, 49, 45, 65, 65], ivs = [31, 31, 31, 31, 31, 31], evs = [0, 0, 0, 0, 0, 0];
    expect(calcStats(base, 50, ivs, evs, 0)).toEqual({ maxHP: 120, atk: 69, def: 69, speed: 65, spAtk: 85, spDef: 85 });
    const lonely = calcStats(base, 50, ivs, evs, 1);             // LONELY: +Attack, -Defense
    expect([lonely.atk, lonely.def]).toEqual([75, 62]);
  });
});

const pip = (extra: Partial<DaemonSpec>): DaemonSpec => ({ personality: 4200, otId: 7, species: 1, nickname: "PIP", level: 9,
  exp: expFor(curve, 9), hp: 17, maxHP: 27, ...extra });   // 27: its real max HP at 9, with no IVs or EVs
const save = (d: DaemonSpec) => buildSave({ player: "ROVER", trainerId: 7, slots: [{ counter: 2, party: [d] }, { counter: 1, party: [] }] });

describe("coming home grown (C-45)", () => {
  it("writes nothing while it is still away", () => {
    const r = syncSave(save(pip({ away: true })), { link: false, grow: { personality: 4200, exp: 5000 } });
    expect(r.grew).toBeNull();
  });

  it("writes the experience, the level and the stats once it is home, keeping its damage", () => {
    const gain = expFor(curve, 11) - expFor(curve, 9);
    const r = syncSave(save(pip({ away: true, asked: true })), { link: false, grow: { personality: 4200, exp: gain } });
    expect(r.answered[0].now).toBe("home");
    expect(r.grew).toMatchObject({ nickname: "PIP", exp: gain, from: 9, to: 11 });
    const d = readSave(r.save).party[0];                         // throws if the record no longer adds up
    expect([d.level, d.exp]).toEqual([11, expFor(curve, 11)]);
    const { sb1 } = blocks(r.save);
    const v = new DataView(sb1.buffer, sb1.byteOffset);
    const maxHP = v.getUint16(56 + 88, true), hp = v.getUint16(56 + 86, true);
    expect(maxHP).toBe(30);                                      // (2*45*11)/100 + 11 + 10, as the game reckons it
    expect(maxHP - hp).toBe(10);                                 // ten points of damage before, ten after
  });

  it("never passes level 100", () => {
    const r = syncSave(save(pip({})), { link: false, grow: { personality: 4200, exp: 99999999 } });
    expect(r.grew!.to).toBe(100);
  });
});
