import { describe, expect, it } from "vitest";
import { readSave, readSlot } from "../src/save/reader.js";
import { answerRequests } from "../src/save/writer.js";
import { buildSave } from "./build_save.js";

const SENDING = { personality: 0x12345678, otId: 0x00ab1234, species: 1, nickname: "PIP", level: 12, asked: true };
const STAYING = { personality: 0x0000002f, otId: 0x00ab1234, species: 4, nickname: "LABEL", level: 9 };
const RETURNING = { personality: 0x00000101, otId: 0x00ab1234, species: 7, nickname: "CLUSTER", level: 20, away: true, asked: true };

describe("answering the game's AWAY requests (C-10)", () => {
  const save = () => buildSave({ player: "ROVER", trainerId: 0x00ab1234,
    slots: [{ counter: 7, party: [STAYING] }, { counter: 8, party: [SENDING, STAYING, RETURNING] }] });

  it("sends an asked daemon away, brings an AWAY one home, and clears every request", () => {
    const { save: out, answered } = answerRequests(save());
    expect(answered.map((a) => [a.nickname, a.now])).toEqual([["PIP", "away"], ["CLUSTER", "home"]]);
    const r = readSave(out);
    expect(r.counter).toBe(8);                                  // the same slot, answered in place
    expect(r.party.map((d) => [d.nickname, d.away, d.asked])).toEqual(
      [["PIP", true, false], ["LABEL", false, false], ["CLUSTER", false, false]]);
  });

  it("re-signs the sector, so the game still accepts the slot", () => {
    const { save: out } = answerRequests(save());
    expect(readSlot(out, 1)).not.toBeNull();                    // every section's checksum holds
    expect(readSlot(out, 0)).not.toBeNull();                    // and the older slot is untouched
  });

  it("changes nothing when nothing was asked", () => {
    const once = answerRequests(save()).save;
    const twice = answerRequests(once);
    expect(twice.answered).toEqual([]);
    expect(Buffer.compare(Buffer.from(twice.save), Buffer.from(once))).toBe(0);
  });
});
