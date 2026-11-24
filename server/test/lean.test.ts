// T-609, C-486: THE LEAN, the player's balance -- the lean, the integrated view, the edition's mirror and each type's side (DAEMONS vision 0.7).
import { describe, expect, it } from "vitest";
import { balanceOf, sideOn, TYPE_SIDE, typeSide } from "../src/psyche/lean.js";
import songsJson from "../data/songs.json" with { type: "json" };

const marks = (n: number, trueMark = false) => [...Array(7)].map((_, i) => i < n).concat(trueMark);
const roots = (n: number) => [...Array(7)].map((_, i) => i < n);

describe("the lean (the user, 2026-11-23)", () => {
  it("is in balance with nothing held, and HARMONIA", () => {
    expect(balanceOf({ marks: marks(0), roots: roots(0), choice: "REASON" }))
      .toEqual({ lean: 0, side: null, inBalance: true, view: "HARMONIA" });
  });
  it("leans REASON as far as the MARKS outrun the understandings", () => {
    const b = balanceOf({ marks: marks(7, true), roots: roots(0), choice: "INSTINCT" });
    expect(b).toEqual({ lean: 7, side: "REASON", inBalance: false, view: "SOPHROSYNE" });
  });
  it("leans INSTINCT when understanding runs ahead", () => {
    expect(balanceOf({ marks: marks(2), roots: roots(4), choice: "REASON" }))
      .toMatchObject({ lean: -2, side: "INSTINCT", view: "TECHNE" });
  });
  it("counts the TRUE MARK on neither side", () => {
    expect(balanceOf({ marks: marks(0, true), roots: roots(0), choice: "REASON" }).lean).toBe(0);
    expect(balanceOf({ marks: marks(7, true), roots: roots(7), choice: "INSTINCT" }).view).toBe("HARMONIA");
  });
  it("does not care which pairs are held", () => {
    const a = [true, false, false, false, false, false, false, false];
    const r = [false, true, false, false, false, false, false];
    expect(balanceOf({ marks: a, roots: r, choice: "REASON" }).inBalance).toBe(true);
  });
});

describe("the edition mirrors the sides, never the meaning", () => {
  it("draws REASON left in CONTENT and right in CONTEXT", () => {
    expect(sideOn("REASON", "CONTENT")).toBe("left");
    expect(sideOn("INSTINCT", "CONTENT")).toBe("right");
    expect(sideOn("REASON", "CONTEXT")).toBe("right");
    expect(sideOn("INSTINCT", "CONTEXT")).toBe("left");
  });
});

describe("each type's side (C-486)", () => {
  it("gives every type a side, nine a side", () => {
    const types = Object.keys((songsJson as unknown as { keys: Record<string, unknown> }).keys);
    expect(types.length).toBe(18);
    for (const t of types) expect(TYPE_SIDE[t], t).toBeDefined();
    const sides = Object.values(TYPE_SIDE);
    expect(sides.filter((s) => s === "REASON").length).toBe(9);
    expect(sides.filter((s) => s === "INSTINCT").length).toBe(9);
  });
  it("puts LOGIC and CONTEXT on opposite sides, as the chart's thesis has them", () => {
    expect(typeSide(["LOGIC"])).toBe("REASON");
    expect(typeSide(["CONTEXT", "EMERGENT"])).toBe("INSTINCT");
    expect(typeSide([])).toBeNull();
  });
});
