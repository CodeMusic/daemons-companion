// C-385: SYNESTHESIA -- the week's seven and the year's twelve, and every translation between them.
import { describe, expect, it } from "vitest";
import { CARRY, PITCHES, Synesthesia, VOID } from "../src/psyche/synesthesia.js";
import { monthOf } from "../src/psyche/months.js";

describe("the twelve-tone year (the user, 2026-11-16)", () => {
  const want: [number, string, string[]][] = [
    [1, "C", ["red"]], [2, "C#/Db", ["red", "orange"]], [3, "D", ["orange"]], [4, "D#/Eb", ["orange", "yellow"]],
    [5, "E", ["yellow"]], [6, "F", ["green"]], [7, "F#/Gb", ["green", "blue"]], [8, "G", ["blue"]],
    [9, "G#/Ab", ["blue", "indigo"]], [10, "A", ["indigo"]], [11, "A#/Bb", ["indigo", "violet"]], [12, "B", ["violet"]],
  ];
  it.each(want)("month %i is %s, %j", (m, note, hues) => {
    const q = Synesthesia.month(m);
    expect(q.note).toBe(note);
    expect(q.hues).toEqual(hues);
    expect(q.blend).toBe(hues.length > 1);
    expect(monthOf(m).hues).toEqual(hues);
  });
  it("the months lean on the wheel's days", () => {
    expect(monthOf(6).leans.map((l) => l.day)).toEqual(["Wednesday"]);
    expect(monthOf(7).leans.map((l) => l.day)).toEqual(["Wednesday", "Thursday"]);
    expect(monthOf(11).leans.map((l) => l.day)).toEqual(["Friday", "Saturday"]);
    expect(monthOf(11).chord).toEqual(["A", "B"]);
  });
  it("March, June and August by the user's choice", () => {
    expect([monthOf(3).tone, monthOf(6).tone, monthOf(8).tone]).toEqual(["Balance", "Devotion", "Voice"]);
  });
});

describe("the week", () => {
  it("Sunday C red .. Saturday B violet, on the natural notes", () => {
    expect(["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((d) => Synesthesia.day(d).note))
      .toEqual(["C", "D", "E", "F", "G", "A", "B"]);
    expect(Synesthesia.day("monday").hues).toEqual(["orange"]);
    expect(Synesthesia.day(2).name).toBe("Monday");
  });
});

describe("translations", () => {
  it("a note to its month, or its day", () => {
    expect(Synesthesia.note("Bb").name).toBe("November");
    expect(Synesthesia.note("A♯/B♭").name).toBe("November");
    expect(Synesthesia.note("D", "day").name).toBe("Monday");
    expect(() => Synesthesia.note("Bb", "day")).toThrow(/black key/);
    expect(Synesthesia.pitchOf("Cb")).toBe(11);
    expect(PITCHES.map((p) => Synesthesia.pitchOf(p))).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });
  it("the key a music model reads, and the hertz", () => {
    expect(Synesthesia.keyscale(Synesthesia.month(11))).toBe("Bb major");
    expect(Synesthesia.keyscale(Synesthesia.month(2), true)).toBe("Db minor");
    expect(Synesthesia.hz(9, 4)).toBe(440);
    expect(Synesthesia.hz(Synesthesia.month(1))).toBe(131);
    expect(Synesthesia.hz(Synesthesia.month(6))).toBe(175);   // F3, as the drift's old carrier for "F major"
  });
  it("a beat inside a band, climbing the week", () => {
    const alpha = [8, 12] as const;
    expect([1, 2, 3, 4, 5, 6, 7].map((d) => Synesthesia.beatIn(alpha, Synesthesia.day(d)))).toEqual([8, 9, 9, 10, 11, 11, 12]);
    expect(Synesthesia.beatIn([1, 4], Synesthesia.day(1))).toBe(1);
    expect(Synesthesia.beatIn([1, 4], Synesthesia.day(7))).toBe(4);
  });
  it("the ordinal: 0 is off, past the top the carry", () => {
    expect(Synesthesia.ordinal(0, 7)).toBe(VOID);
    expect(Synesthesia.ordinal(8, 7)).toBe(CARRY);
    expect(Synesthesia.ordinal(13, 12)).toBe(CARRY);
    expect((Synesthesia.ordinal(12, 12) as { name: string }).name).toBe("December");
  });
  it("a number in colour, for a clock", () => {
    const names = (n: number, base: 7 | 12, places = 0) =>
      Synesthesia.digits(n, base, places).map((c) => ("name" in c ? c.name : c.word));
    expect(names(0, 7)).toEqual(["off"]);
    expect(names(7, 7)).toEqual(["Saturday"]);
    expect(names(8, 7)).toEqual(["Sunday", "off"]);           // base 8: one eight and nothing over
    expect(names(13, 12, 1)).toEqual(["carry", "off"]);       // a thirteen will not fit one place
  });
});
