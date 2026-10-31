// C-261: SYNC's writes put into the running game -- found in a state by the save's own bytes, written everywhere the
// game keeps them, and nothing written when the game has moved on since its save.
import { describe, expect, it } from "vitest";
import { buildSave } from "./build_save.js";
import { LAYOUT as l, readSlot, sectionSize } from "../src/save/reader.js";
import { syncSave } from "../src/save/writer.js";
import { applyPlan, livePlan, WRAM_AT, WRAM_SIZE } from "../src/game/live.js";
import P from "../data/profile_layout.json" with { type: "json" };

// a game's SaveBlock2 is not empty, as the builder's is: its INDEX, options and records, here as noise
const lived = (sb2: Uint8Array) => { let x = 99; for (let i = 0x20; i < 0xe00; i++) { x = (x * 69069 + 1) >>> 0; sb2[i] = x >>> 24; } };
const save = () => buildSave({ player: "ASH", trainerId: 0x12345678, edit: lived, slots: [{ counter: 7, party: [
  { personality: 0xdeadbeef, otId: 0x12345678, species: 4, nickname: "KERNEL", level: 9, asked: true },
  { personality: 0x0badf00d, otId: 0x12345678, species: 7, nickname: "SHELL", level: 8 }] }] });
// the save's blocks as the game holds them in memory, from the newest slot
function blocks(s: Uint8Array) {
  const slot = readSlot(s, 0, l)!, sb1 = new Uint8Array(l.saveblock1_size);
  for (let id = 1; id <= 4; id++) sb1.set(slot.sections.get(id)!.subarray(0, sectionSize(id)), (id - 1) * l.sector_data_size);
  return { sb2: slot.sections.get(0)!.subarray(0, l.saveblock2_size).slice(), sb1 };
}
// a running game: noise, with SaveBlock2 and SaveBlock1 in EWRAM and the party it plays with apart from them
const SB2_AT = 0x4000, SB1_AT = 0x9000, PARTY_AT = 0x24284;
function stateOf(s: Uint8Array, tail = false) {
  const st = new Uint8Array(WRAM_AT + WRAM_SIZE + (tail ? s.length + 64 : 0));
  let x = 12345;
  for (let i = 0; i < st.length; i++) { x = (x * 1103515245 + 12345) >>> 0; st[i] = x >>> 24; }
  st.set([0x06, 0, 0, 0x01], 0);
  const { sb2, sb1 } = blocks(s);
  st.set(sb2, WRAM_AT + SB2_AT); st.set(sb1, WRAM_AT + SB1_AT);
  st.set(sb1.subarray(l.party_offset, l.party_offset + 6 * l.pokemon_size), WRAM_AT + PARTY_AT);
  if (tail) st.set(s, WRAM_AT + WRAM_SIZE + 32);
  return st;
}
const flags = (st: Uint8Array, at: number, i: number) => st[WRAM_AT + at + i * l.pokemon_size + l.flags_byte];

describe("SYNC into the running game (C-261)", () => {
  it("writes a SEND's AWAY into the party the game plays with and its save block, and the LINKED flag", () => {
    const before = save(), after = syncSave(before, { link: true }).save;
    const plan = livePlan(before, after)!;
    expect(plan.length).toBeGreaterThan(0);
    const st = stateOf(before, true), r = applyPlan(st, plan, { before, after });
    expect(r.ok).toBe(true);
    for (const at of [PARTY_AT, SB1_AT + l.party_offset]) {
      expect(flags(st, at, 0) >> l.away_bit & 1).toBe(1);
      expect(flags(st, at, 0) >> l.asked_bit & 1).toBe(0);
      expect(flags(st, at, 1)).toBe(blocks(before).sb1[l.party_offset + l.pokemon_size + l.flags_byte]);   // the other untouched
    }
    expect(blocks(after).sb2[P.sb2.daemons_flags + ((P.flags.companion_linked - P.flags.daemons_flags_start) >> 3)])
      .toBe(st[WRAM_AT + SB2_AT + P.sb2.daemons_flags + ((P.flags.companion_linked - P.flags.daemons_flags_start) >> 3)]);
    expect([...st.subarray(WRAM_AT + WRAM_SIZE + 32, WRAM_AT + WRAM_SIZE + 32 + after.length)]).toEqual([...after]);   // and the save beside it
  });

  it("finds the mGBA state inside RetroArch's RASTATE wrapping, as EmulatorJS gives it", () => {
    const before = save(), after = syncSave(before, { link: true }).save, core = stateOf(before);
    const wrapped = new Uint8Array(16 + Math.ceil(core.length / 8) * 8 + 8);
    wrapped.set([..."RASTATE"].map((c) => c.charCodeAt(0)), 0); wrapped[7] = 1;
    wrapped.set([..."MEM "].map((c) => c.charCodeAt(0)), 8); new DataView(wrapped.buffer).setUint32(12, core.length, true);
    wrapped.set(core, 16);
    wrapped.set([..."END "].map((c) => c.charCodeAt(0)), 16 + Math.ceil(core.length / 8) * 8);
    expect(applyPlan(wrapped, livePlan(before, after)!).ok).toBe(true);
    const inside = wrapped.subarray(16, 16 + core.length);
    expect(flags(inside, PARTY_AT, 0) >> l.away_bit & 1).toBe(1);
  });

  it("writes nothing when what SYNC changed has moved on in the game since its save", () => {
    const before = save(), after = syncSave(before, { link: true }).save, plan = livePlan(before, after)!;
    const st = stateOf(before);
    // the byte SYNC writes, changed in play since the save (the ask taken back): SYNC's answer would undo the game's
    st[WRAM_AT + PARTY_AT + l.flags_byte] ^= 1 << l.asked_bit;  st[WRAM_AT + SB1_AT + l.party_offset + l.flags_byte] ^= 1 << l.asked_bit;
    const was = st.slice(), r = applyPlan(st, plan);
    expect(r.ok).toBe(false);
    expect(st).toEqual(was);
  });

  it("is nothing to do when SYNC changed nothing, and refuses what SYNC never writes", () => {
    const before = save();
    expect(livePlan(before, before.slice())).toEqual([]);
    const other = before.slice(); other[0x1c000] ^= 1;      // outside the slot SYNC wrote
    expect(livePlan(before, other)).toBeNull();
    expect(applyPlan(new Uint8Array(100), [])).toMatchObject({ ok: false, why: expect.stringMatching(/^not a state mGBA wrote/) });
  });
});
