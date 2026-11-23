import { describe, expect, it } from "vitest";
import speciesJson from "../data/species.json" with { type: "json" };
import { expFor } from "../src/game/save/growth.js";
import { heardAt, learnedOf, lesson, noteColours, shareOf, songOf, SONGS, trainGain, TRAINS_A_DAY, TRAIN_DAYS } from "../src/ownsong.js";

const SPECIES = speciesJson as unknown as Record<string, any>;
const curve = SPECIES["1"].growth;                         // ROVERCUB (1) -> ROVERSEER (2) -> ROVERBYTE (3)

describe("a daemon's own song (C-418, DAEMONS T-594)", () => {
  it("is its line's parts, oldest first, each in its type's key", () => {
    expect(songOf(3).map((p) => p.name)).toEqual(["ROVERCUB", "ROVERSEER", "ROVERBYTE"]);
    expect(songOf(1)).toHaveLength(1);
    expect(songOf(3)[0]).toBe(songOf(1)[0]);               // a final form carries its first form's part, note for note
    for (const p of Object.values(SONGS.parts)) {
      expect(SONGS.keys[p.type].name).toBe(p.key);
      expect(((p.notes.at(-1)![0] - p.tonic) % 12 + 12) % 12).toBe(0);   // every part ends home, on its tonic
      expect(p.notes.at(-1)![2]).toBe(1);                  // and its last note is learned only at perfect
    }
    expect(new Set(Object.values(SONGS.keys).map((k) => k.name)).size).toBe(Object.keys(SONGS.keys).length);   // a key a type
  });

  it("is learned between its form's two levels, the earlier parts already whole", () => {
    const [cub] = songOf(1);
    expect(cub.from).toBe(1); expect(cub.to).toBe(16);     // ROVERCUB evolves at 16
    expect(shareOf(cub, expFor(curve, 1), curve)).toBe(0);
    expect(shareOf(cub, expFor(curve, 16), curve)).toBe(1);
    expect(learnedOf(3, expFor(curve, 32), curve)).toEqual([1, 1, 0]);
  });

  it("sings a note it has not learned as static: candidates in the key, thinning to the note", () => {
    const [cub] = songOf(1);
    const none = heardAt(cub, 0), half = heardAt(cub, 0.5), all = heardAt(cub, 1);
    expect(all.every((n) => n.sure === 1 && n.candidates.length === 1)).toBe(true);
    const last = none.at(-1)!;
    expect(last.sure).toBe(0);
    expect(last.candidates[0]).toBe(last.midi);            // the true note is always among them, first
    expect(last.candidates).toHaveLength(1 + SONGS.static.candidates.length);
    const scale = cub.minor ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11];
    for (const c of last.candidates) expect(scale).toContain(((c - cub.tonic) % 12 + 12) % 12);   // "agreeing": in the key
    expect(half.filter((n) => n.sure === 1).length).toBeGreaterThan(none.filter((n) => n.sure === 1).length);
  });

  it("takes about two weeks of three TRAINs a day to make a part whole, and no more past it", () => {
    const [cub] = songOf(1);
    let exp = expFor(curve, 1), trains = 0;
    while (shareOf(cub, exp, curve) < 1 && trains < 100) {
      const l = lesson(1, exp, curve, 0, true);
      expect(l.counted).toBe(true);
      exp += l.gain; trains++;
    }
    expect(trains).toBe(TRAINS_A_DAY * TRAIN_DAYS);
    expect(exp).toBe(expFor(curve, 16));                   // never past perfect
    const done = lesson(1, exp, curve, 0, true);
    expect(done).toMatchObject({ gain: 0, counted: false, perfect: true, ready: true });
    expect(lesson(3, expFor(curve, 48), curve, 0, false).ready).toBe(false);   // a final form matures; nothing to become
  });

  it("teaches nothing past the day's three, and carries each moved note back as a group of binary", () => {
    const [cub] = songOf(1);
    expect(lesson(1, expFor(curve, 5), curve, TRAINS_A_DAY, true)).toMatchObject({ gain: 0, counted: false });
    let exp = expFor(curve, 1), moved = 0;
    for (let i = 0; i < 10; i++) { const l = lesson(1, exp, curve, 0, true); moved += l.adjusted.length; exp += l.gain;
      for (const a of l.adjusted) { expect(a.bits).toMatch(/^[01]{4} [01]{4}$/); expect(a.to).toBeGreaterThan(a.from); } }
    expect(moved).toBeGreaterThan(0);
    expect(trainGain(cub, curve)).toBe(Math.ceil((expFor(curve, 16) - expFor(curve, 1)) / 42));
  });

  it("draws a note in its pitch's colour, a black key in the two either side", () => {
    expect(noteColours(60)).toHaveLength(1);              // C
    expect(noteColours(61)).toEqual([...noteColours(60), ...noteColours(62)]);   // C-sharp: C's and D's
  });
});

// C-418 through the companion's own routes, on a synthetic save built as the game builds them -- never the user's own
import * as core from "../src/core.js";
import { carriedFor } from "../src/carry.js";
import { Store } from "../src/shared/db.js";
import { route } from "../src/routes.js";
import { evolvedOf } from "../src/evolve.js";
import { buildSave } from "./build_save.js";

describe("TRAIN sings, through the routes (C-418)", () => {
  const PHONE = "iphone-widget-0a0b0c", T0 = new Date("2026-11-18T15:00:00");
  function carried(level: number, exp = expFor(curve, level)) {
    const pip = { personality: 0x12345678, otId: 0x00ab1234, species: 1, nickname: "PIP", level, exp, away: true };
    const bytes = { save: buildSave({ player: "ASH", trainerId: 0x00ab1234, slots: [{ counter: 3, party: [pip] }] }) };
    const h: core.Host = { edition: "CONTENT", save: { read: () => bytes.save, write: (b) => { bytes.save = b; return null; } } };
    const store = new Store(":memory:");
    carriedFor(store, core.awayNow(h), PHONE);
    const post = (path: string, now = T0) => route(h, store, { method: "POST", path, body: {}, deviceId: PHONE }, now).body as any;
    const life = (now = T0) => route(h, store, { method: "GET", path: "/api/daemon/life", body: {}, deviceId: PHONE }, now).body as any;
    return { h, store, post, life };
  }

  it("gives its lesson with the care, three a day, and the life carries where its song stands", () => {
    const { post, life } = carried(12);
    const before = life().song;
    expect(before).toMatchObject({ species: 1, stage: 1, trainsToday: 0, perfect: false });
    const r = post("/api/daemon/train");
    expect(r.lesson).toMatchObject({ species: 1, counted: true });
    expect(r.lesson.gain).toBeGreaterThan(0);
    expect(r.song.share).toBeGreaterThan(before.share);
    expect(r.song.total).toBe(before.total + r.lesson.gain);   // kept as experience, as a step's is, until SYNC
    post("/api/daemon/train"); post("/api/daemon/train");
    const fourth = post("/api/daemon/train");
    expect(fourth.lesson).toMatchObject({ counted: false, gain: 0 });
    expect(post("/api/daemon/feed").lesson).toBeUndefined();  // only TRAIN is a lesson
  });

  it("makes its part whole and sends it home to SING, never evolving it here before it is AT HOME", () => {
    const { h: hostOf, store, post, life } = carried(15, expFor(curve, 16) - 1);
    const r = post("/api/daemon/train");
    expect(r.lesson).toMatchObject({ perfect: true, ready: true });
    expect(life().song).toMatchObject({ perfect: true, ready: true, atHome: false });
    // the device looks, which is when an evolution is judged (C-184): level 16, but not AT HOME, so still ROVERCUB
    expect((core.deviceState(hostOf, store, T0, PHONE) as any).daemon.species).toBe(1);
    expect(evolvedOf(store, 0x12345678)).toBeNull();
  });
});

describe("the widget's song (C-418)", () => {
  it("is the song now, with the part it is learning and how static is made", () => {
    const pip = { personality: 0x2468ace0, otId: 0x00ab1234, species: 1, nickname: "PIP", level: 9, exp: expFor(curve, 9), away: true };
    const bytes = buildSave({ player: "ASH", trainerId: 0x00ab1234, slots: [{ counter: 3, party: [pip] }] });
    const h: core.Host = { edition: "CONTENT", save: { read: () => bytes, write: () => null } };
    const store = new Store(":memory:");
    carriedFor(store, core.awayNow(h), "iphone-widget-0a0b0c");
    const r = route(h, store, { method: "GET", path: "/api/daemon/song", body: {}, deviceId: "iphone-widget-0a0b0c" }, new Date()).body as any;
    expect(r).toMatchObject({ species: 1, stage: 1, window: SONGS.window, candidates: SONGS.static.candidates });
    expect(r.part.name).toBe("ROVERCUB");
    expect(r.share).toBeGreaterThan(0); expect(r.share).toBeLessThan(1);
  });
});

// C-419: the song on a staff, and the INDEX singing it
import profileJson from "../data/profile_layout.json" with { type: "json" };
import { BOTTOM, fifthsOf, keySignature, ledgersAt, signatureSteps, spell, staffOf } from "../src/ownsong.js";

describe("a part on a staff (C-419, DAEMONS T-600's staff)", () => {
  it("reads every type's key signature from its key's name", () => {
    expect(fifthsOf("C major")).toBe(0); expect(fifthsOf("A minor")).toBe(0);
    expect(fifthsOf("F-sharp major")).toBe(6); expect(fifthsOf("E-flat minor")).toBe(-6);
    expect(fifthsOf("D-flat major")).toBe(-5); expect(fifthsOf("F-sharp minor")).toBe(3); expect(fifthsOf("B minor")).toBe(2);
    expect(keySignature("F major")).toMatchObject({ accidental: -1, letters: ["B"], pcs: [10] });
    expect(keySignature("E major").letters).toEqual(["F", "C", "G", "D"]);
    for (const k of Object.values(SONGS.keys)) {           // every note of a type's scale is in its signature's seven
      const sig = keySignature(k.name), scale = k.minor ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11];
      for (const d of scale) expect(spell(60 + k.tonic + d, sig).shown).toBeNull();
    }
  });

  it("spells a note as its key has it, and an off-key note with its accidental", () => {
    expect(spell(60, keySignature("C major"))).toMatchObject({ letter: "C", step: 28, shown: null });   // middle C
    expect(spell(77, keySignature("F-sharp major"))).toMatchObject({ letter: "E", accidental: 1, shown: null });   // E-sharp
    const cflat = spell(71, keySignature("E-flat minor"));
    expect(cflat).toMatchObject({ letter: "C", accidental: -1, shown: null });
    expect(cflat.step).toBe(spell(72, keySignature("C major")).step);   // C-flat sits on C's space, not B's line
    expect(spell(65, keySignature("G major"))).toMatchObject({ letter: "F", shown: 0 });       // F natural in G: a natural
    expect(spell(61, keySignature("C major"))).toMatchObject({ letter: "C", shown: 1 });       // C-sharp
    expect(spell(66, keySignature("F major"))).toMatchObject({ letter: "G", shown: -1 });      // G-flat in a flat key
  });

  it("writes a signature where it is written, and counts ledger lines", () => {
    expect(signatureSteps(keySignature("D major"), "treble")).toEqual([8, 5]);   // F-sharp on the top line, C-sharp the third space
    expect(signatureSteps(keySignature("F major"), "bass")).toEqual([2]);        // B-flat on the bass's second line
    expect([ledgersAt(-1), ledgersAt(-2), ledgersAt(-3), ledgersAt(0), ledgersAt(8), ledgersAt(9), ledgersAt(10), ledgersAt(12)])
      .toEqual([0, 1, 1, 0, 0, 0, 1, 2]);
    expect(BOTTOM.treble - BOTTOM.bass).toBe(12);
  });

  it("sets every part on the clef with fewer ledger lines, in bars of four beats", () => {
    let bass = 0;
    for (const p of Object.values(SONGS.parts)) {
      const s = staffOf(p);
      expect(s.notes).toHaveLength(p.notes.length);
      expect(s.notes[0]).toMatchObject({ at: 0, bar: 0 });
      expect(s.sigSteps).toHaveLength(s.sig.letters.length);
      if (s.clef === "bass") bass++;
      const most = Math.max(...s.notes.map((n) => ledgersAt(n.r)));
      expect(most).toBeLessThanOrEqual(5);
    }
    expect(bass).toBeGreaterThan(0);                       // the low parts read on the bass
    const cub = staffOf(songOf(1)[0]);
    expect(cub.clef).toBe("treble");
    expect(cub.notes.at(-1)!.bar).toBe(Math.floor((cub.notes.reduce((n, x) => n + x.beats, 0) - 4) / 4));   // its cadence in the last bar
  });
});

describe("the INDEX sings (C-419, DAEMONS T-595)", () => {
  const P = profileJson as any, PHONE = "iphone-widget-0a0b0c", T0 = new Date("2026-11-18T15:00:00");
  const mark = (sb2: Uint8Array, at: number, ns: number[]) => { for (const n of ns) sb2[at + ((n - 1) >> 3)] |= 1 << ((n - 1) & 7); };
  function index(party: any[], boxes: any[] = [], bound = [1, 2, 3, 4]) {
    const bytes = buildSave({ player: "ASH", trainerId: 0x00ab1234, slots: [{ counter: 3, party }], boxes,
      edit: (sb2) => { mark(sb2, P.sb2.index_seen, bound); mark(sb2, P.sb2.index_bound, bound); } });
    const h: core.Host = { edition: "CONTENT", save: { read: () => bytes, write: () => null } };
    const store = new Store(":memory:");
    carriedFor(store, core.awayNow(h), PHONE);
    const get = () => route(h, store, { method: "GET", path: "/api/index", body: {}, deviceId: PHONE }, T0).body as any;
    return { h, store, get };
  }
  const nat = (species: number) => SPECIES[String(species)].national;

  it("sings the carried daemon's form as it knows it, a past form whole, and a form no one holds whole", () => {
    const seer = { personality: 0x13572468, otId: 0x00ab1234, species: 2, nickname: "PIP", level: 20, exp: expFor(curve, 20), away: true };
    const { get } = index([seer], [], [nat(1), nat(2), nat(3)]);
    const by = Object.fromEntries(get().entries.map((e: any) => [e.species, e.song]));
    const [, part] = songOf(2);
    expect(by[2]).toBeCloseTo(shareOf(part, expFor(curve, 20), curve));
    expect(by[2]).toBeGreaterThan(0); expect(by[2]).toBeLessThan(1);
    expect(by[1]).toBe(1);                                 // ROVERCUB: its past form, whole
    expect(by[3]).toBe(1);                                 // ROVERBYTE: held by no one, whole
  });

  it("hears what it has learned here since SYNC, and a boxed one as its box has it", () => {
    const pip = { personality: 0x2468ace0, otId: 0x00ab1234, species: 1, nickname: "PIP", level: 8, exp: expFor(curve, 8), away: true };
    const label = SPECIES["4"], boxed = { personality: 0x0badf00d, otId: 0x00ab1234, species: 4, nickname: "BOX", level: 6, exp: expFor(label.growth, 6) };
    const { store, get } = index([pip], [boxed], [nat(1), nat(4)]);
    const before = get().entries.find((e: any) => e.species === 1).song;
    store.logInteraction("exp", `${pip.personality} 40 train ${T0.toISOString()}`);
    expect(get().entries.find((e: any) => e.species === 1).song).toBeGreaterThan(before);
    const own = songOf(4).at(-1)!;
    expect(get().entries.find((e: any) => e.species === 4).song).toBeCloseTo(shareOf(own, expFor(label.growth, 6), label.growth));
  });
});
