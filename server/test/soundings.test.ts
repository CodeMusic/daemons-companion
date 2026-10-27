import { describe, expect, it } from "vitest";
import { readBoxes, readSave, readSlot } from "../src/save/reader.js";
import { syncSave } from "../src/save/writer.js";
import { soundingOf } from "../src/core.js";
import { life } from "../src/life.js";
import { buildSave } from "./build_save.js";

// C-195: SOUNDINGS -- how each carried daemon is doing, in bits 6-7 of its flags byte, written at each SYNC
const OT = 0x00ab1234;
const OUT = { personality: 0x00000101, otId: OT, species: 7, nickname: "CLUSTER", level: 20, away: true };
const LEAVING = { personality: 0x12345678, otId: OT, species: 1, nickname: "PIP", level: 12, asked: true };
const HOME = { personality: 0x0000002f, otId: OT, species: 4, nickname: "LABEL", level: 9 };
const BOXED = { personality: 0x00000999, otId: OT, species: 4, nickname: "BOXED", level: 5, away: true };
const save = () => buildSave({ player: "ROVER", trainerId: OT, slots: [{ counter: 8, party: [OUT, LEAVING, HOME] }], boxes: [BOXED] });

describe("SOUNDINGS (C-195)", () => {
  it("gives every daemon already away its level, and 0 to one that only now left or is home", () => {
    const r = syncSave(save(), { link: false, sounding: 3 });
    const party = readSave(r.save).party;
    expect(party.map((d) => [d.nickname, d.away, d.sounding])).toEqual([["CLUSTER", true, 3], ["PIP", true, 0], ["LABEL", false, 0]]);
    expect(readBoxes(r.save).map((d) => [d.nickname, d.sounding])).toEqual([["BOXED", 3]]);
    expect(r.sounded.map((s) => s.personality).sort()).toEqual([OUT.personality, BOXED.personality].sort());
    expect(readSlot(r.save, 0)).not.toBeNull();                 // every touched sector re-signed
  });

  it("clears the level when a daemon comes home, and keeps away and asked as they were", () => {
    const once = syncSave(save(), { link: false, sounding: 2 }).save;
    const back = buildSave({ player: "ROVER", trainerId: OT, slots: [{ counter: 8, party: [{ ...OUT, asked: true }, HOME] }] });
    const home = readSave(syncSave(back, { link: false, sounding: 1 }).save).party[0];
    expect([home.away, home.asked, home.sounding]).toEqual([false, false, 0]);
    expect(readSave(once).party[0].sounding).toBe(2);
  });

  it("writes nothing without a level to write", () => {
    const r = syncSave(save(), { link: false });
    expect(readSave(r.save).party.every((d) => d.sounding === 0)).toBe(true);
    expect(r.sounded).toEqual([]);
  });

  it("is gentle: a new daemon is fine, any time together is well, the worst is quiet", () => {
    const now = new Date(2026, 9, 27, 15);
    expect(soundingOf(life([], now))).toBe(2);
    const morning = new Date(2026, 9, 27, 9, 30), at = new Date(2026, 9, 27, 9).toISOString();
    expect(soundingOf(life([{ at, kind: "feed" }, { at, kind: "water" }], morning))).toBe(3);
    const long = life([{ at: new Date(2026, 8, 1, 9).toISOString(), kind: "feed" }], now);
    expect(soundingOf(long)).toBe(1);                          // weeks of nothing: quiet, never lower
  });
});
