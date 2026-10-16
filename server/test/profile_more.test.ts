// C-125..C-133: what the phone's PROFILE, GAME EVENTS and SCHOOL read from a save -- built here with chosen flags, vars
// and items through the test builder, never a real save.
import { describe, expect, it } from "vitest";
import { buildSave, encodeText } from "./build_save.js";
import { readProfile } from "../src/save/profile.js";
import { readProgress } from "../src/save/progress.js";
import { readNotebook } from "../src/save/notebook.js";
import P from "../data/profile_layout.json" with { type: "json" };
import EV from "../data/events.json" with { type: "json" };
import SC from "../data/school.json" with { type: "json" };
import NB from "../data/notebook.json" with { type: "json" };
import GV from "../data/groves.json" with { type: "json" };

function saveWith(flags: number[], opts: { vars?: [number, number][]; plugins?: number[]; rival?: string } = {}) {
  return buildSave({
    player: "CHRIS", trainerId: 0x12345678, slots: [{ counter: 1, party: [] }],
    edit: (sb2, sb1) => {
      for (const f of flags) {
        if (f < P.flags.daemons_flags_start) sb1[P.sb1.flags + (f >> 3)] |= 1 << (f & 7);
        else { const g = f - P.flags.daemons_flags_start; sb2[P.sb2.daemons_flags + (g >> 3)] |= 1 << (g & 7); }
      }
      const v1 = new DataView(sb1.buffer, sb1.byteOffset, sb1.byteLength);
      for (const [n, val] of opts.vars ?? []) v1.setUint16(EV.sb1_vars + 2 * (n - EV.vars_start), val, true);
      (opts.plugins ?? []).forEach((id, i) => v1.setUint16((P.sb1 as Record<string, number>).tmhm + i * 4, id, true));
      if (opts.rival) sb1.set(encodeText(opts.rival, 7), P.sb1.rival_name);
    },
  });
}

describe("PROFILE, GAME EVENTS and SCHOOL from a save", () => {
  it("reads the rival, the MARKS, a grove found and a ROOT", () => {
    const grove = GV.groves[0];
    const p = readProfile(saveWith([P.flags.marks_first, grove.found_flag, P.flags.understandings[1]], { rival: "AL" }));
    expect(p.rival).toBe("AL");
    expect(p.marks[0]).toBe(true);
    expect(p.marks[1]).toBe(false);
    expect(p.groves).toEqual([grove.grove]);
    expect(p.roots[1]).toBe(true);
  });
  it("holds a GAME EVENTS row by its flags, and a DRIVER by the PLUGIN pocket", () => {
    const byFlag = EV.events.find((e) => e.held && (e.held as { all_flags: number[] }).all_flags.length && !(e.held as { var?: unknown }).var)!;
    const driver = EV.events.find((e) => e.section === "DRIVERS")!;
    const ev = readProgress(saveWith((byFlag.held as { all_flags: number[] }).all_flags, { plugins: [driver.items![0].id] })).events;
    expect(ev.find((e) => e.n === byFlag.n)!.held).toBe(true);
    expect(ev.find((e) => e.n === driver.n)!.held).toBe(true);
    expect(ev.filter((e) => e.section === "DRIVERS" && e.n !== driver.n).every((e) => e.held === false)).toBe(true);
  });
  it("reads CALLOW SCHOOL: a floor stood on, the DIPLOMA, the best mark and its letter", () => {
    const s = readProgress(saveWith([SC.floors[2].visited_flag, SC.flags.diploma],
      { vars: [[SC.vars.best, 91], [SC.vars.attempts, 2], [SC.vars.last, 84]] })).school;
    expect(s.floors[2]).toBe(true);
    expect(s.floors[0]).toBe(false);
    expect(s.diploma).toBe(true);
    expect([s.best, s.last, s.attempts]).toEqual([91, 84, 2]);
    expect(s.grade).toBe(SC.grades.find((g) => 91 >= g.from)!.letter);
  });
  it("reads the NOTEBOOK's pages from the save, unread until seen", () => {
    const page = NB.pages.find((p) => p.text && !p.flag2 && p.seen != null)!;
    const n = readNotebook(saveWith([P.flags.notebook, page.flag]));
    const got = n.sections.flatMap((s) => s.pages);
    expect(n.held).toBe(true);
    expect(got).toHaveLength(1);
    expect(got[0].unread).toBe(true);
    expect(readNotebook(saveWith([P.flags.notebook, page.flag, page.seen!])).sections[0].pages[0].unread).toBe(false);
  });
});
