import { describe, expect, it } from "vitest";
import profileJson from "../data/profile_layout.json" with { type: "json" };
import marginsJson from "../data/margins.json" with { type: "json" };
import { readIndex } from "../src/save/index.js";
import { expFor, levelFromExp } from "../src/save/growth.js";
import { buildSave, type DaemonSpec } from "./build_save.js";

const P = profileJson;
const M = (marginsJson as any).margins;
const mon = (species: number, level: number, metLevel: number, extra: Partial<DaemonSpec> = {}): DaemonSpec =>
  ({ personality: 1000 + species, otId: 7, species, nickname: "X", level, metLevel, ...extra });

// ROVERCUB (1), LABEL (4), CLUSTER (7) and PACKET (16) all have margins; all but PACKET an INSTINCT voice too.
function save(opts: { opus: boolean; gender?: number; party: DaemonSpec[]; boxes?: DaemonSpec[]; seen: number[]; bound: number[] }) {
  return buildSave({ player: "ROVER", trainerId: 7, slots: [{ counter: 1, party: opts.party }, { counter: 0, party: [] }],
    boxes: opts.boxes,
    edit: (sb2, sb1) => {
      sb2[P.sb2.player_gender] = opts.gender ?? 0;
      for (const n of opts.seen) sb2[P.sb2.index_seen + ((n - 1) >> 3)] |= 1 << ((n - 1) & 7);
      for (const n of opts.bound) sb2[P.sb2.index_bound + ((n - 1) >> 3)] |= 1 << ((n - 1) & 7);
      if (opts.opus) new DataView(sb1.buffer).setUint16(P.sb1.key_items, P.items.opus, true);
    } });
}

describe("a boxed daemon's level, from its experience (C-24)", () => {
  it("reads the level the game would, on every curve", () => {
    for (let g = 0; g < 6; g++) for (const lv of [2, 5, 17, 50, 99, 100]) {
      expect(levelFromExp(g, expFor(g, lv))).toBe(lv);
      expect(levelFromExp(g, expFor(g, lv) - 1)).toBe(lv - 1);
    }
  });
});

describe("the save's INDEX (C-24)", () => {
  it("shows only what was met: a seen daemon's name, a bound one's entry", () => {
    const ix = readIndex(save({ opus: false, party: [], seen: [1, 4], bound: [1] }), "CONTENT");
    expect(ix.entries.map((e) => [e.national, e.bound])).toEqual([[1, true], [4, false]]);
    expect(ix.entries[0].entry!.length).toBeGreaterThan(10);
    expect(ix.entries[1].entry).toBeUndefined();
  });

  it("gives no margin without OPUS, as the game does", () => {
    const ix = readIndex(save({ opus: false, party: [mon(1, 20, 5)], seen: [1], bound: [1] }), "CONTENT");
    expect(ix.entries[0].margin).toBeUndefined();
  });

  it("chooses carried, neglected or nothing exactly as the game does", () => {
    const ix = readIndex(save({ opus: true, seen: [1, 4, 7], bound: [1, 4, 7],
      party: [mon(1, 20, 5), mon(7, 6, 5)],                         // ROVERCUB grew 15: carried. CLUSTER grew 1: nothing yet
      boxes: [mon(4, 0, 5, { exp: expFor(3, 6) })] }), "CONTENT");  // LABEL boxed at 6 after meeting at 5: neglected
    const by = (n: number) => ix.entries.find((e) => e.national === n)!;
    expect(by(1).margin).toEqual({ state: "carried", text: M["1"].carried });
    expect(by(4).margin).toEqual({ state: "neglected", text: M["4"].neglected });
    expect(by(7).margin).toBeUndefined();
  });

  it("counts a boxed daemon that has grown as carried", () => {
    const ix = readIndex(save({ opus: true, seen: [4], bound: [4], party: [],
      boxes: [mon(4, 0, 5, { exp: expFor(3, 30) })] }), "CONTENT");
    expect(ix.entries[0].margin!.state).toBe("carried");
  });

  it("speaks in INSTINCT's voice for a player who chose it, where OPUS had a second thought", () => {
    const ix = readIndex(save({ opus: true, gender: 1, seen: [1, 16], bound: [1, 16], party: [mon(1, 20, 5), mon(16, 20, 5)] }), "CONTENT");
    expect(ix.entries[0].margin!.text).toBe(M["1"].instinctCarried);
    expect(ix.entries[1].margin!.text).toBe(M["16"].carried);      // PACKET has no second voice
  });
});
