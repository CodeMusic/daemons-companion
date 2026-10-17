// C-145: the GUIDE is readable on the companion once the save holds it, and nothing of it before (a find stays blind).
import { describe, expect, it } from "vitest";
import { buildSave } from "./build_save.js";
import { readGuide } from "../src/save/guide.js";
import P from "../data/profile_layout.json" with { type: "json" };
import G from "../data/guide.json" with { type: "json" };

function saveWith(flags: number[]) {
  return buildSave({
    player: "CHRIS", trainerId: 0x12345678, slots: [{ counter: 1, party: [] }],
    edit: (sb2, sb1) => {
      for (const f of flags) {
        if (f < P.flags.daemons_flags_start) sb1[P.sb1.flags + (f >> 3)] |= 1 << (f & 7);
        else { const g = f - P.flags.daemons_flags_start; sb2[P.sb2.daemons_flags + (g >> 3)] |= 1 << (g & 7); }
      }
    },
  });
}

describe("the GUIDE", () => {
  it("shows nothing before it is found", () => {
    expect(readGuide(saveWith([]))).toEqual({ held: false });
  });
  it("is the whole book once found, in the game's order, and DRAFT", () => {
    const g = readGuide(saveWith([G.flag]));
    expect(g.held).toBe(true);
    expect(g.draft).toBe(true);
    expect(g.sections?.length).toBe(9);
    expect(g.sections?.reduce((n, s) => n + s.entries.length, 0)).toBe(28);
    expect(g.sections?.[0].entries[0].paragraphs.length).toBeGreaterThan(0);
    for (const s of g.sections ?? []) for (const e of s.entries) for (const p of e.paragraphs) expect(p).not.toMatch(/\\[pn]|\n/);
  });
});
