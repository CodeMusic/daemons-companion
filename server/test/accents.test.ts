// C-349, C-352, C-355: THE ACCENTS unlocked as the save reaches each place, and THE MONTHS. On synthetic saves built as
// the game builds them; never the user's own.
import { describe, expect, it } from "vitest";
import { Store } from "../src/db.js";
import { route } from "../src/routes.js";
import { ACCENTS } from "../src/accents.js";
import { hemisphereOf, monthOf } from "../src/months.js";
import maps from "../data/maps.json" with { type: "json" };
import regions from "../data/regions.json" with { type: "json" };
import layout from "../data/profile_layout.json" with { type: "json" };
import { buildSave } from "./build_save.js";

const P = layout as any;
const keyOf = (place: string) => Object.entries(maps).find(([k, m]) => !k.startsWith("_") && (m as any).place === place)![0];
const flagOf = (name: string) => (regions as any).regions.flatMap((r: any) => Object.values(r.sections)).find((s: any) => s.name === name).visited_flag;

function host(place: string, lit: string[] = []) {
  const [group, num] = keyOf(place).split(".").map(Number);
  const save = buildSave({ player: "ASH", trainerId: 0x00ab1234, slots: [{ counter: 3, party: [] }], edit: (_sb2, sb1) => {
    sb1[P.sb1.location] = group; sb1[P.sb1.location + 1] = num;
    for (const n of lit) { const f = flagOf(n); sb1[P.sb1.flags + (f >> 3)] |= 1 << (f & 7); }
  } });
  return { edition: "CONTENT" as const, save: { read: () => save, write: () => null } };
}
const ask = (h: any, store: Store) => route(h, store, { method: "GET", path: "/api/accents", body: {}, deviceId: "" }).body as any;

describe("THE ACCENTS", () => {
  it("has every place's four colours, and THE BLACKOUT breathes its purple with its green threads", () => {
    expect(Object.keys(ACCENTS).length).toBeGreaterThan(80);
    for (const a of Object.values(ACCENTS)) for (const c of [a.deep, a.main, a.light, a.spark]) expect(c).toMatch(/^#[0-9a-f]{6}$/);
    expect(ACCENTS["THE BLACKOUT"]).toMatchObject({ main: "#8838a4", spark: "#a8ff78", breathe: true });
  });
  it("unlocks where the save was made and the towns the map has lit, and remembers a place once saved in", () => {
    const store = new Store(":memory:");
    const first = ask(host("THE BLACKOUT", ["BLANCHE TOWN"]), store);
    expect(first.here).toBe("THE BLACKOUT");
    expect(first.unlocked).toEqual(["BLANCHE TOWN", "THE BLACKOUT"]);
    const later = ask(host("ROUTE 1"), store);                      // saved somewhere else: THE BLACKOUT stays unlocked
    expect(later.here).toBe("ROUTE 1");
    expect(later.unlocked).toEqual(["ROUTE 1", "THE BLACKOUT"]);
  });
});

describe("THE MONTHS", () => {
  it("lean on the week's hues around the year, blending every other month", () => {
    expect(monthOf(1).hues).toEqual(["red"]);
    expect(monthOf(2).hues).toEqual(["red", "orange"]);
    expect(monthOf(11).hues).toEqual(["indigo"]);
    expect(monthOf(12).hues).toEqual(["violet"]);
    expect(monthOf(2).chord).toEqual(["C", "D"]);
    expect(monthOf(2).tone).toBe("Love");
  });
  it("turns the season with the hemisphere, CONTEXT south unless set", () => {
    expect(monthOf(1, "north").movement).toBe("resting");
    expect(monthOf(1, "south").movement).toBe("ripening");
    expect(hemisphereOf("CONTENT")).toBe("north");
    expect(hemisphereOf("CONTEXT")).toBe("south");
    expect(hemisphereOf("CONTEXT", "north")).toBe("north");
  });
  it("never says the word for the dead", () => {
    for (let m = 1; m <= 12; m++) expect(JSON.stringify(monthOf(m))).not.toMatch(/dead/i);
  });
});
