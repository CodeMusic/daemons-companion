// C-23: the PROFILE, read from a synthetic save that sets every fact it shows, at the offsets the game exports.
import { describe, expect, it } from "vitest";
import P from "../data/profile_layout.json" with { type: "json" };
import { readProfile } from "../src/save/profile.js";
import { buildSave } from "./build_save.js";

function setFlag(sb2: Uint8Array, sb1: Uint8Array, f: number) {
  if (f < P.flags.daemons_flags_start) sb1[P.sb1.flags + (f >> 3)] |= 1 << (f & 7);
  else { const g = f - P.flags.daemons_flags_start; sb2[P.sb2.daemons_flags + (g >> 3)] |= 1 << (g & 7); }
}

describe("readProfile", () => {
  const save = buildSave({
    player: "CRYSTAL", trainerId: (0xbeef << 16) | 12345, slots: [{ counter: 5, party: [] }, { counter: 4, party: [] }],
    edit: (sb2, sb1) => {
      const v2 = new DataView(sb2.buffer), v1 = new DataView(sb1.buffer);
      v2.setUint16(P.sb2.play_time_hours, 27, true); sb2[P.sb2.play_time_minutes] = 41; sb2[P.sb2.play_time_seconds] = 9;
      sb2[P.sb2.index_seen] = 0b1111; sb2[P.sb2.index_seen + 1] = 0b1;      // five seen
      sb2[P.sb2.index_bound] = 0b11;                                         // two bound
      setFlag(sb2, sb1, P.flags.index);
      for (const n of [0, 1, 2]) setFlag(sb2, sb1, P.flags.marks_first + n); // three MARKS
      setFlag(sb2, sb1, P.flags.diploma);
      v1.setUint16(P.sb1.key_items + 4 * 3, P.items.opus, true);            // OPUS in the fourth key-item slot
      sb1[P.sb1.location] = 5; sb1[P.sb1.location + 1] = 2;                  // saved in CALLOW's school
    },
  });

  it("reads the trainer, the play time and the INDEX", () => {
    const p = readProfile(save);
    expect(p.name).toBe("CRYSTAL");
    expect(p.trainerId).toBe(12345);
    expect(p.secretId).toBe(0xbeef);
    expect(p.playTime).toEqual({ hours: 27, minutes: 41, seconds: 9 });
    expect(p.index).toEqual({ held: true, seen: 5, bound: 2 });
  });

  it("reads the MARKS, the DIPLOMA, OPUS and where it was saved", () => {
    const p = readProfile(save);
    expect(p.marks).toEqual([true, true, true, false, false, false, false, false]);
    expect(p.diploma).toBe(true);
    expect(p.opus).toBe(true);
    expect(p.gameClear).toBe(false);
    expect(p.savedIn).toEqual({ map: "ViridianCity_School", place: "CALLOW CITY" });
    expect(p.slot).toBe("A");
  });

  it("reads a flag in DAEMONS' own space, in SaveBlock2", () => {
    const s2 = buildSave({ player: "AL", trainerId: 1, slots: [{ counter: 1, party: [] }, { counter: 0, party: [] }],
      edit: (sb2, sb1) => setFlag(sb2, sb1, P.flags.daemons_flags_start + 0x6c) });
    expect(readProfile(s2).diploma).toBe(false);   // a DAEMONS flag set, nothing of SaveBlock1's
  });
});
