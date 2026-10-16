// C-141: the phone's Bluetooth pieces are the boards' (broadcast.cpp): the same bytes out, the same broadcast back.
import { describe, expect, it } from "vitest";
import { bytesOf, Gatherer, toPieces } from "../src/blecast.js";

describe("a broadcast as Bluetooth pieces", () => {
  it("lays out a piece as the boards do: DA E1, kind|count|part, FROM, ID, seven bytes", () => {
    const [p] = toPieces({ id: "07d32c300001", kind: "act", species: 270, name: "EMERGENCE", act: "WAVE" }).slice(-1);
    const all = toPieces({ id: "07d32c300001", kind: "act", species: 270, name: "EMERGENCE", act: "WAVE" });
    const b = bytesOf(all[0])!;
    expect(all[0].startsWith("dae1")).toBe(true);
    expect(b[2] >> 6).toBe(2);                                   // act
    expect(((b[2] >> 3) & 7) + 1).toBe(all.length);
    expect(Array.from(b.slice(3, 9))).toEqual([0x07, 0xd3, 0x2c, 0x30, 0x00, 0x01]);
    expect(Array.from(b.slice(9, 12))).toEqual([1, 14, 9]);      // species 270, the name's length
    expect(bytesOf(p)![2] & 7).toBe(all.length - 1);
  });
  for (const c of [
    { id: "a1b2c3d40007", kind: "say" as const, species: 25, name: "STARR", text: "hello from the room" },
    { id: "a1b2c3d40008", kind: "act" as const, species: 400, name: "ARCHIVER", act: "BERRY" },
    { id: "0000000f0002", kind: "reply" as const, species: 7, name: "RELAY", act: "WAVE", replyTo: "07d32c300001" },
  ]) it(`comes back whole, its pieces in any order (${c.kind})`, () => {
    const g = new Gatherer();
    const ps = toPieces(c).reverse();
    const got = ps.map((u) => g.take(u, 1000)).filter(Boolean);
    expect(got).toEqual([c]);
  });
  it("keeps a word to 43 letters and eight pieces", () => {
    const ps = toPieces({ id: "a1b2c3d40009", kind: "say", species: 1, name: "ABCDEFGHIJ", text: "x".repeat(80) });
    expect(ps.length).toBeLessThanOrEqual(8);
    expect(new Gatherer().take(ps[0])).toBeNull();
  });
  it("lets go of a broadcast that never completes", () => {
    const g = new Gatherer(), ps = toPieces({ id: "a1b2c3d4000a", kind: "say", species: 1, name: "A", text: "two pieces at least" });
    g.take(ps[0], 0);
    expect(g.take(ps[1], 40000)).toBeNull();                     // the first piece was let go after 30 s
  });
});
