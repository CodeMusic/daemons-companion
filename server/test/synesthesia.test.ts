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

// T-612 (the user, 2026-11-23, every recommendation; DAEMONS vision 9.36, docs/three-notes-draft.md): a daemon's three notes
describe("a daemon's three notes", () => {
  const G_MINOR = { tonic: 7, minor: true }, EB_MINOR = { tonic: 3, minor: true };
  const AB_MAJOR = { tonic: 8, minor: false }, A_MINOR = { tonic: 9, minor: true };
  it("56 PREEMPT (LOGIC): G minor, Sunday's C, September's G#/Ab its accidental", () => {
    const d = Synesthesia.daemon(56, G_MINOR);
    expect(d.key).toMatchObject({ note: "G", minor: true, bright: false, label: "G MINOR", hues: ["blue"] });
    expect([d.day.name, d.day.note, d.day.hues]).toEqual(["Sunday", "C", ["red"]]);
    expect([d.month.name, d.month.note, d.month.hues]).toEqual(["September", "G#/Ab", ["blue", "indigo"]]);
    expect(d.accidentals).toEqual(["month"]);
  });
  it("58 SENTRY (ENTROPY): E-flat minor, a black-key tonic, Tuesday's E its accidental", () => {
    const d = Synesthesia.daemon(58, EB_MINOR);
    expect(d.key).toMatchObject({ note: "D#/Eb", label: "D#/Eb MINOR", hues: ["orange", "yellow"], blend: true });
    expect([d.day.name, d.day.note, d.month.name, d.month.note]).toEqual(["Tuesday", "E", "November", "A#/Bb"]);
    expect(d.accidentals).toEqual(["day"]);
  });
  it("60 LOOP (FLOW) is all in A-flat major, bright", () => {
    const d = Synesthesia.daemon(60, AB_MAJOR);
    expect(d.key).toMatchObject({ bright: true, label: "G#/Ab MAJOR" });
    expect([d.day.name, d.month.name, d.accidentals]).toEqual(["Thursday", "January", []]);
  });
  it("151 ARTSAI: its day and month are one note, both in A minor", () => {
    const d = Synesthesia.daemon(151, A_MINOR);
    expect([d.day.note, d.month.note, d.accidentals]).toEqual(["G", "G", []]);
  });
  it("every DAY note is in CONTENT's and CONTEXT's keys: the week is C major's seven", () => {
    for (let n = 1; n <= 84; n++) {
      expect(Synesthesia.daemon(n, { tonic: 0, minor: false }).accidentals).not.toContain("day");
      expect(Synesthesia.daemon(n, A_MINOR).accidentals).not.toContain("day");
    }
  });
});
