import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { readSave, readDaemon, sectionChecksum } from "../src/save/reader.js";
import { buildDaemon, buildSave } from "./build_save.js";

const ROVERCUB = { personality: 0x12345678, otId: 0x00ab1234, species: 1, nickname: "PIP", level: 12, friendship: 140 };
const LABEL = { personality: 0x0000002f, otId: 0x00ab1234, species: 4, nickname: "LABEL", level: 9 };

describe("the save reader (C-02)", () => {
  it("reads the newer slot's party, by our names", () => {
    const save = buildSave({ player: "ROVER", trainerId: 0x00ab1234,
      slots: [{ counter: 7, party: [ROVERCUB] }, { counter: 8, party: [ROVERCUB, LABEL] }] });
    const r = readSave(save);
    expect(r.slot).toBe("B");
    expect(r.counter).toBe(8);
    expect(r.playerName).toBe("ROVER");
    expect(r.trainerId).toBe(0x00ab1234);
    expect(r.party.map((d) => [d.name, d.nickname, d.level])).toEqual([["ROVERCUB", "PIP", 12], ["LABEL", "LABEL", 9]]);
    expect(r.party[0].friendship).toBe(140);
  });

  it("falls back to the other slot when the newer one is damaged", () => {
    const save = buildSave({ player: "ROVER", trainerId: 1,
      slots: [{ counter: 7, party: [ROVERCUB] }, { counter: 8, party: [ROVERCUB, LABEL] }] });
    save[0xe000 + 100] ^= 0xff;                             // one byte in slot B: its sector's checksum fails
    const r = readSave(save);
    expect(r.slot).toBe("A");
    expect(r.party).toHaveLength(1);
  });

  it("refuses a save with no valid slot", () => {
    expect(() => readSave(new Uint8Array(0x20000))).toThrow(/neither save slot/);
  });

  it("reads AWAY and ASKED, the companion's two bits", () => {
    const d = readDaemon(buildDaemon({ ...ROVERCUB, away: true }), 0)!;
    expect(d.away).toBe(true);
    expect(d.asked).toBe(false);
    const e = readDaemon(buildDaemon({ ...ROVERCUB, asked: true }), 0)!;
    expect([e.away, e.asked]).toEqual([false, true]);
  });

  it("decrypts every one of the 24 substruct orders", () => {
    for (let p = 0; p < 24; p++) {
      const d = readDaemon(buildDaemon({ ...ROVERCUB, personality: 0x1000 * 24 + p }), 0)!;
      expect(d.species).toBe(1);
    }
  });

  it("rejects a record whose own checksum fails", () => {
    const rec = buildDaemon(ROVERCUB);
    rec[40] ^= 0x01;
    expect(() => readDaemon(rec, 0)).toThrow(/checksum/);
  });

  it("folds the checksum as the game does", () => {
    const data = new Uint8Array(8);
    new DataView(data.buffer).setUint32(0, 0xffff0001, true);
    new DataView(data.buffer).setUint32(4, 0x00010001, true);
    expect(sectionChecksum(data, 8)).toBe(((0x00000002 >>> 16) + 0x00000002) & 0xffff);
  });
});

// A real scratch save, when one is named: DAEMONS_SCRATCH_SAV=/path/to/copy.sav npm test. Never the user's own.
const scratch = process.env.DAEMONS_SCRATCH_SAV;
describe.skipIf(!scratch || !existsSync(scratch))("a real scratch save", () => {
  it("reads a party out of it", () => {
    const r = readSave(new Uint8Array(readFileSync(scratch!)));
    console.log(JSON.stringify({ slot: r.slot, player: r.playerName, party: r.party.map((d) => `${d.name} L${d.level}`) }));
    expect(r.party.length).toBeGreaterThan(0);
  });
});
