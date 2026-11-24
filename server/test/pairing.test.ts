// C-560: several pairing codes at once, each its own ten minutes and used once; wrong tries counted per address
import { describe, expect, it } from "vitest";
import { Pairing } from "../src/api.js";

describe("pairing codes (C-560)", () => {
  it("keeps several live at once: two browsers pairing together both pair", () => {
    const p = new Pairing(), a = p.start(0), b = p.start(1000);
    expect(a).not.toBe(b);
    expect(p.take(b, "10.0.0.5", 2000)).toBe(true);
    expect(p.take(a, "10.0.0.6", 3000)).toBe(true);           // the older one was not replaced
    expect(p.take(a, "10.0.0.6", 4000)).toBe(false);          // each is used once
  });
  it("lets each code run its own ten minutes", () => {
    const p = new Pairing(), a = p.start(0);
    expect(p.take(a, "x", 10 * 60 * 1000 + 1)).toBe(false);
    const b = p.start(0);
    expect(p.take(b, "x", 9 * 60 * 1000)).toBe(true);
  });
  it("counts wrong tries per address: five pause that address, never anyone else's code", () => {
    const p = new Pairing(), mine = p.start(0), theirs = p.start(0);
    for (let i = 0; i < 5; i++) expect(p.take("wrong!", "10.0.0.9", 100 + i)).toBe(false);
    expect(p.take(mine, "10.0.0.9", 200)).toBe(false);         // that address is paused...
    expect(p.take(theirs, "10.0.0.5", 300)).toBe(true);       // ...another's code still works
    const later = p.start(10 * 60 * 1000 + 150);
    expect(p.take(later, "10.0.0.9", 10 * 60 * 1000 + 200)).toBe(true);   // and the pause passes with its ten minutes
  });
  it("never pauses this machine (an empty address)", () => {
    const p = new Pairing(), c = p.start(0);
    for (let i = 0; i < 9; i++) p.take("wrong!", "", i);
    expect(p.take(c, "", 100)).toBe(true);
  });
  it("keeps the newest eight", () => {
    const p = new Pairing(), first = p.start(0);
    for (let i = 1; i <= 8; i++) p.start(i);
    expect(p.take(first, "x", 100)).toBe(false);
  });
});
