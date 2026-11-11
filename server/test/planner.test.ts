import { describe, expect, it } from "vitest";
import P from "../data/profile_layout.json" with { type: "json" };
import { readPlan, readWild } from "../src/planner.js";
import { buildSave, encodeText } from "./build_save.js";

// C-191: the planner shows what the save has reached -- up to the next step, nothing past it
const LEAD = { personality: 0x0000002f, otId: 0x00ab1234, species: 4, nickname: "LABEL", level: 9 };
const saveWith = (flags: number[]) => buildSave({ player: "ROVER", trainerId: 0x00ab1234, slots: [{ counter: 3, party: [LEAD] }],
  edit: (_sb2, sb1) => { for (const f of flags) sb1[P.sb1.flags + (f >> 3)] |= 1 << (f & 7); sb1.set(encodeText("GARY", 7), P.sb1.rival_name); } });

describe("the planner (C-191)", () => {
  it("at the start: the first step next, the first places open, nothing further", () => {
    const p = readPlan(saveWith([]));
    expect(p.done).toBe(0);
    expect(p.next?.label).toBe("Starter DAEMON");
    const names = p.places.map((x) => x.place);
    expect(names).toContain("BLANCHE TOWN");
    expect(names).not.toContain("SLATE CITY");
    expect(p.fights.every((f) => f.class === "RIVAL" && f.who === "GARY")).toBe(true);   // the save's own rival name
    expect(p.fights.some((f) => f.who === "CAIRN")).toBe(false);
  });

  it("two steps done: the next one, and the leader it opens", () => {
    const p = readPlan(saveWith([2088, 2089]));
    expect(p.done).toBe(2);
    expect(p.next?.label).toMatch(/CALLOW SCHOOL/);
    expect(p.fights.map((f) => f.who)).toContain("CAIRN");
    expect(p.levels.trainers).not.toBeNull();
  });

  it("the ways opened: only gates the steps done have passed, the latest first", () => {
    expect(readPlan(saveWith([])).opened).toEqual([]);
    expect(readPlan(saveWith([2088])).opened).toEqual([]);   // ROUTE 2's old man is held until step 2
    const two = readPlan(saveWith([2088, 2089]));
    expect(two.opened.map((w) => w.why)).toEqual(["the old man across CALLOW's north road until the parcel is home"]);
    expect(two.opened[0].places).toContain("ROUTE 2");
    expect(two.opened.some((w) => w.step > two.done)).toBe(false);
    const eight = readPlan(saveWith([2088, 2089, 785, 788, 2080, 2195, 2081, 135]));
    expect(eight.opened[0].step).toBe(8);                      // PRUNE's tree, on the map and between ROUTE 2 and the cave
    expect(eight.opened.every((w, i, all) => i === 0 || all[i - 1].step >= w.step)).toBe(true);
  });

  it("a place's wild daemons only once it is open, in the edition asked", () => {
    expect(readWild(saveWith([]), "THE UNDERTONE", "CONTENT")).toBeNull();
    const w = readWild(saveWith([2088, 2089]), "THE UNDERTONE", "CONTENT");
    expect(w && Object.keys(w.ways).length).toBeGreaterThan(0);
    expect(readWild(saveWith([]), "ROUTE 1", "CONTEXT")?.ways.land?.length).toBeGreaterThan(0);
  });
});
