// C-290: this file runs on the phone too (C-111) -- the app imports it, directly or through another file -- so keep it free of Node-only APIs (node:*, fs).
// C-385 (the user, 2026-11-16: "These synesthesia factors should be common code since we will use this sort of thing a
// lot -- and I like if parts of the code reflect psychology such as calling this method class something related to
// synesthesia"): SYNESTHESIA -- one sense heard as another. A moment of time is a note, a note a colour, a colour a
// number, and this is the one place that knows how each turns into the others.
//
// Two wheels, one keyboard:
//   THE WEEK, the small cycle: seven days on the seven natural notes and the seven colours of the bow --
//     Sunday C red, Monday D orange, Tuesday E yellow, Wednesday F green, Thursday G blue, Friday A indigo,
//     Saturday B violet (data/week.json, with each day's virtue, shadow and chakra).
//   THE YEAR, the great cycle: twelve months on the twelve notes of the octave -- January C red, February C#/Db red
//     into orange, March D orange, ... November A#/Bb indigo into violet, December B violet. A month on a white key
//     is one day's colour; a month on a black key is the BLEND of the two days either side of it (E to F and B to C
//     have no black key between them, so May runs straight into June as a keyboard does).
//
// A QUALIA is one point on a wheel, every sense of it at once: its ordinal, its note, its pitch, its colours, the days
// it leans on, and the hertz it sounds at. Synesthesia.of(...) finds one from any of those and translates.
//
// THE ORDINAL, for counting in colour (a colour clock, later): a day is 1..7 (Sunday 1), a month 1..12. Nothing --
// 0 -- is BLACK, the light off; past the top is WHITE, the carry, every colour at once spilling into the next place.
//
// A DAEMON'S THREE NOTES (T-612; the user, 2026-11-23, by multiple choice, every recommendation; DAEMONS vision 9.36):
// its KEY, its first type's (bright when major, dim when minor) -- its kind; its DAY, its INDEX number mod 7 + 1 on the
// week -- the day's virtue over its shadow, what it practises; its MONTH, mod 12 + 1 on the year -- the month's tone,
// what it brings. A note outside the key is the daemon's own ACCIDENTAL: true pitch, true colour, used in passing and
// resolved, never held in a drone. A second type adds nothing yet (T-615). Synesthesia.daemon(...) below; C-490 makes
// with them.
//
// Every word here DRAFT.
import week from "../../data/week.json" with { type: "json" };
import { deviceDay, type Palette } from "./days.js";

export type Cycle = "day" | "month";
export type Base = 7 | 12;

/** The twelve notes of the octave, as a musician spells them: sharps and flats both where a black key has two names. */
export const PITCHES = ["C", "C#/Db", "D", "D#/Eb", "E", "F", "F#/Gb", "G", "G#/Ab", "A", "A#/Bb", "B"] as const;
/** The same twelve as the music model reads a key ("Bb major"): one name each, flats for the black keys. */
const KEY_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"] as const;
/** For a screen: the black keys with their proper signs. */
const SHOWN = ["C", "C♯/D♭", "D", "D♯/E♭", "E", "F", "F♯/G♭", "G", "G♯/A♭", "A", "A♯/B♭", "B"] as const;
/** The white keys' pitches, Sunday's C to Saturday's B. */
const NATURALS = [0, 2, 4, 5, 7, 9, 11] as const;

export const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September",
                            "October", "November", "December"] as const;

type WeekDay = { day: string; virtue: string; shadow: string; chakra: string; note: string; colour: string; hue: string };
const DAYS = week.days as WeekDay[];

/** Black: nothing, the light off (ordinal 0). White: the carry, past the top of a wheel. */
export const VOID = { word: "off", colour: "#000000", hue: "black" } as const;
export const CARRY = { word: "carry", colour: "#FFFFFF", hue: "white" } as const;

export type Qualia = {
  cycle: Cycle;
  ordinal: number;          // 1..7 a day (Sunday 1), 1..12 a month (January 1)
  base: Base;               // 7 or 12: how many on its wheel
  name: string;             // "Monday", "November"
  pitch: number;            // 0..11, C = 0
  note: string;             // "D", "A#/Bb"
  shown: string;            // "D", "A♯/B♭"
  blend: boolean;           // a black key: the colours of the two days either side
  days: string[];           // the weekday(s) its colour is: one, or two in a blend
  hues: string[];           // their colour words, "indigo", "violet"
  colours: string[];        // their colours in the palette asked for, as a screen wears them
  led: string[];            // their pure hues, as a ring of lights shows them
};

const mod = (n: number, m: number) => ((n % m) + m) % m;
/** A type's key as songs.json carries it (DAEMONS 9.36): its tonic's pitch, 0..11 with C 0, and whether it is minor. */
export type TypeKey = { tonic: number; minor: boolean };
/** T-612: a daemon's three notes. key's colours are its tonic's; bright for a major key, dim for a minor. */
export type DaemonNotes = {
  n: number;
  key: Qualia & { minor: boolean; bright: boolean; label: string };   // label: "A#/Bb MAJOR", as DEVELOPER MODE shows it
  day: Qualia;                                                         // (n mod 7) + 1 on the week: always a white key
  month: Qualia;                                                       // (n mod 12) + 1 on the year
  accidentals: ("day" | "month")[];                                    // which of the two lie outside the key
};
/** The scales a song is made in (DAEMONS tools/gensongs.py: MAJOR, and the natural MINOR). */
const MAJOR = [0, 2, 4, 5, 7, 9, 11] as const, MINOR = [0, 2, 3, 5, 7, 8, 10] as const;

// the weekday(s) a pitch's colour is: a white key its own day, a black key the days either side
function daysOfPitch(pitch: number): WeekDay[] {
  const p = mod(pitch, 12), at = NATURALS.indexOf(p as never);
  if (at >= 0) return [DAYS[at]];
  return [DAYS[NATURALS.indexOf((p - 1) as never)], DAYS[NATURALS.indexOf((p + 1) as never)]];
}

function qualia(cycle: Cycle, ordinal: number, pitch: number, palette: Palette): Qualia {
  const days = daysOfPitch(pitch), p = mod(pitch, 12);
  return {
    cycle, ordinal, base: cycle === "day" ? 7 : 12,
    name: cycle === "day" ? DAYS[ordinal - 1].day : MONTH_NAMES[ordinal - 1],
    pitch: p, note: PITCHES[p], shown: SHOWN[p], blend: days.length > 1,
    days: days.map((d) => d.day), hues: days.map((d) => d.hue),
    colours: days.map((d) => deviceDay(d.day, palette).menu), led: days.map((d) => deviceDay(d.day, palette).led),
  };
}

export class Synesthesia {
  /** A weekday, by name ("Monday") or ordinal (1 = Sunday .. 7 = Saturday). */
  static day(d: string | number, palette: Palette = "checkpoint"): Qualia {
    const i = typeof d === "number" ? d - 1 : DAYS.findIndex((x) => x.day.toLowerCase() === String(d).toLowerCase());
    if (i < 0 || i > 6) throw new RangeError(`no such day: ${d}`);
    return qualia("day", i + 1, NATURALS[i], palette);
  }
  /** A month, by name ("November") or ordinal (1 = January .. 12 = December). */
  static month(m: string | number, palette: Palette = "checkpoint"): Qualia {
    const i = typeof m === "number" ? m - 1 : MONTH_NAMES.findIndex((x) => x.toLowerCase() === String(m).toLowerCase());
    if (i < 0 || i > 11) throw new RangeError(`no such month: ${m}`);
    return qualia("month", i + 1, i, palette);
  }
  /** A note ("Bb", "A#", "A#/Bb", "D") as the month on that key -- or, `as: "day"`, the day, if it is a white key. */
  static note(n: string, as: Cycle = "month", palette: Palette = "checkpoint"): Qualia {
    const p = Synesthesia.pitchOf(n);
    if (p < 0) throw new RangeError(`no such note: ${n}`);
    if (as === "month") return Synesthesia.month(p + 1, palette);
    const i = NATURALS.indexOf(p as never);
    if (i < 0) throw new RangeError(`${n} is a black key: no day sits on it`);
    return Synesthesia.day(i + 1, palette);
  }
  /** An ordinal on a wheel: 1..base a day or a month; 0 is the light off (VOID), past the top the carry (CARRY). */
  static ordinal(n: number, base: Base, palette: Palette = "checkpoint"): Qualia | typeof VOID | typeof CARRY {
    if (n <= 0) return VOID;
    if (n > base) return CARRY;
    return base === 7 ? Synesthesia.day(n, palette) : Synesthesia.month(n, palette);
  }
  /** Now, both wheels: the weekday and the month of a date (the device's own day). */
  static now(at = new Date(), palette: Palette = "checkpoint"): { day: Qualia; month: Qualia } {
    return { day: Synesthesia.day(at.getDay() + 1, palette), month: Synesthesia.month(at.getMonth() + 1, palette) };
  }

  /** "A#/Bb", "Bb", "a#", "B♭" -> 10; -1 if it is no note. */
  static pitchOf(n: string): number {
    const s = String(n).split("/")[0].trim().replace("♯", "#").replace("♭", "b");
    const m = /^([A-Ga-g])([#b]?)/.exec(s);
    if (!m) return -1;
    return mod(NATURALS["CDEFGAB".indexOf(m[1].toUpperCase())] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0), 12);
  }
  /** The key a music model is asked for ("Bb major"): a qualia's note, major or minor. */
  static keyscale(q: Qualia | number, minor = false): string {
    return `${KEY_NAMES[typeof q === "number" ? mod(q, 12) : q.pitch]} ${minor ? "minor" : "major"}`;
  }
  /** The note as a sound: whole hertz, in the octave from C3 by default (C3 131 Hz .. B3 247 Hz; A4 = 440). */
  static hz(q: Qualia | number, octave = 3): number {
    const p = typeof q === "number" ? mod(q, 12) : q.pitch;
    return Math.round(440 * 2 ** ((12 * (octave + 1) + p - 69) / 12));
  }
  /** Its colour in words, for a painter: "orange", "indigo into violet". */
  static colourWords(q: Qualia): string {
    return q.hues.join(" into ");
  }
  /**
   * A beat inside a band, placed by an ordinal: the band's floor for the first of the wheel, its ceiling for the last,
   * whole hertz between -- so Sunday drifts at the slow edge of each band and Saturday at the quick one (the week is a
   * climb, root to crown).
   */
  static beatIn(band: readonly [number, number], q: Qualia): number {
    const [lo, hi] = band;
    return Math.round(lo + ((hi - lo) * (q.ordinal - 1)) / (q.base - 1));
  }
  /** Whether a pitch (0..11) is one of a key's seven. */
  static inKey(pitch: number, key: TypeKey): boolean {
    return (key.minor ? MINOR : MAJOR).includes(mod(pitch - key.tonic, 12) as never);
  }
  /**
   * T-612: a daemon's three notes and colours, from its INDEX number and its first type's key. The key is read on the
   * year's twelve (its tonic may be a black key); the day and the month are the daemon's number on each wheel.
   */
  static daemon(n: number, key: TypeKey, palette: Palette = "checkpoint"): DaemonNotes {
    const k = Synesthesia.month(mod(key.tonic, 12) + 1, palette);
    const day = Synesthesia.day(mod(n, 7) + 1, palette), month = Synesthesia.month(mod(n, 12) + 1, palette);
    const accidentals = ([["day", day], ["month", month]] as const)
      .filter(([, q]) => !Synesthesia.inKey(q.pitch, key)).map(([w]) => w);
    return {
      n,
      key: { ...k, minor: key.minor, bright: !key.minor, label: `${k.note} ${key.minor ? "MINOR" : "MAJOR"}` },
      day, month, accidentals: [...accidentals],
    };
  }
  /**
   * A number in colour, for a colour clock: its digits in base+1 (0..base), the most significant first, each one a
   * colour -- 0 the light off, 1..base a day or a month -- and, when it will not fit in `places`, a CARRY in front.
   */
  static digits(n: number, base: Base, places = 0, palette: Palette = "checkpoint"): (Qualia | typeof VOID | typeof CARRY)[] {
    const radix = base + 1, out: number[] = [];
    let v = Math.max(0, Math.floor(n));
    do { out.unshift(v % radix); v = Math.floor(v / radix); } while (v > 0);
    while (out.length < places) out.unshift(0);
    const cells: (Qualia | typeof VOID | typeof CARRY)[] = out.map((d) => Synesthesia.ordinal(d, base, palette));
    return places && out.length > places ? [CARRY, ...cells.slice(-places)] : cells;
  }
}
