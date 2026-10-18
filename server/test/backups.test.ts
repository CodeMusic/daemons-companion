import { describe, expect, it } from "vitest";
import { prunable } from "../src/backups.js";

const name = (d: Date) => `daemonsContent.sav.${d.toISOString().replace(/[:.]/g, "-")}`;
const day = 86400000, now = new Date("2026-10-18T12:00:00.000Z");

describe("the save's backups that may go (C-157)", () => {
  it("keeps the newest sixty and every one from the last fortnight", () => {
    const names = Array.from({ length: 100 }, (_, i) => name(new Date(now.getTime() - i * day / 2)));   // two a day for fifty days
    const gone = prunable(names, "daemonsContent.sav", now);
    expect(gone.length).toBe(40);                                     // 100, less the newest 60 (which cover thirty days)
    for (const n of gone) expect(names.indexOf(n)).toBeGreaterThanOrEqual(60);
  });
  it("never takes one younger than a fortnight, however many there are", () => {
    const names = Array.from({ length: 200 }, (_, i) => name(new Date(now.getTime() - i * 60000)));   // 200 in three hours
    expect(prunable(names, "daemonsContent.sav", now)).toEqual([]);
  });
  it("leaves other files alone", () => {
    const names = ["daemonsContent.sav.bak", "notes.txt", "daemonsContext.sav." + name(new Date(0)).split(".sav.")[1]];
    expect(prunable(names, "daemonsContent.sav", now, 0, 0)).toEqual([]);
  });
});
