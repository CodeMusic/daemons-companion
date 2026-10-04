import { describe, expect, it } from "vitest";
import profileJson from "../data/profile_layout.json" with { type: "json" };
import { syncSave } from "../src/save/writer.js";
import { readSave, blocks } from "../src/save/reader.js";
import { readIndex } from "../src/save/index.js";
import { buildSave } from "./build_save.js";

const P = profileJson;
const save = () => buildSave({ player: "ROVER", trainerId: 7, slots: [
  { counter: 2, party: [{ personality: 4242, otId: 7, species: 1, nickname: "PIP", level: 9, friendship: 100, away: true },
                        { personality: 77, otId: 7, species: 4, nickname: "LABEL", level: 9 }] },
  { counter: 1, party: [] }] });

describe("meeting others nearby, written at SYNC (C-15)", () => {
  it("marks each met species SEEN in all three copies the game keeps", () => {
    const r = syncSave(save(), { link: false, met: { seen: [7, 7, 19], friendship: 0 } });
    expect(r.newlySeen).toEqual([7, 19]);
    const { sb1, sb2 } = blocks(r.save);
    for (const n of [7, 19]) {
      const i = (n - 1) >> 3, mask = 1 << ((n - 1) & 7);
      for (const at of [P.sb2.index_seen + i]) expect(sb2[at] & mask).toBe(mask);
      for (const at of [P.sb1.seen1 + i, P.sb1.seen2 + i]) expect(sb1[at] & mask).toBe(mask);
    }
    expect(readIndex(r.save, "CONTENT").entries.map((e) => e.national)).toEqual([7, 19]);
  });

  it("grows the carried daemon's friendship, its record still whole, and only the carried one", () => {
    const r = syncSave(save(), { link: false, met: { seen: [], friendship: 3 } });
    expect(r.friendship).toEqual({ nickname: "PIP", from: 100, to: 103 });
    const party = readSave(r.save).party;                       // throws if a record's checksum broke
    expect(party.map((d) => d.friendship)).toEqual([103, 70]);
    expect(party[0]).toMatchObject({ species: 1, nickname: "PIP", away: true });
  });

  it("never passes 255, and changes nothing when nothing was met", () => {
    const r = syncSave(save(), { link: false, met: { seen: [], friendship: 500 } });
    expect(r.friendship!.to).toBe(255);
    expect(syncSave(save(), { link: false, met: { seen: [], friendship: 0 } }).changed).toBe(false);
  });
});
