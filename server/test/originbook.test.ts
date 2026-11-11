// DAEMONS T-533: THE ORIGIN OF A DAEMON -- held only with the game's flag, and read only as far as the save has given it
// back: the first section with the book, one more with each understanding held (whichever it is) up to four, VII with
// SCORN's TRUE MARK as well, and every section with all seven and the TRUE MARK. A section not yet back is never sent --
// not faint, not counted -- and the run always starts at the first and goes in order. ?preview=1 is the whole book.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import origin from "../data/origin.json" with { type: "json" };
import P from "../data/profile_layout.json" with { type: "json" };
import { ORIGIN_FLAG, readOrigin, savedOrigin, type Origin } from "../src/originbook.js";
import { readProfile } from "../src/save/profile.js";
import { makeServer } from "../src/api.js";
import { DEFAULTS } from "../src/config.js";
import { buildSave } from "./build_save.js";

type Opens = { understandings: number; trueMark: boolean };
type Book = { flag: number; sections: { label: string; heading: string; opens: Opens; entries: { title: string; paragraphs: { text: string }[] }[] }[] };
const O = origin as unknown as Book;
const LABELS = O.sections.map((s) => s.label);
const TRUE_MARK = P.flags.marks_last;                      // the eighth MARK, SCORN's (FLAG_BADGE08_GET)
const SEVEN = [0, 1, 2, 3, 4, 5, 6];

function setFlag(sb2: Uint8Array, sb1: Uint8Array, f: number) {
  if (f < P.flags.daemons_flags_start) sb1[P.sb1.flags + (f >> 3)] |= 1 << (f & 7);
  else { const g = f - P.flags.daemons_flags_start; sb2[P.sb2.daemons_flags + (g >> 3)] |= 1 << (g & 7); }
}
// a save holding the book or not, these of the seven understandings (by their place) and the TRUE MARK or not
function saveWith({ book = true, roots = [] as number[], mark = false } = {}) {
  return buildSave({ player: "ROVER", trainerId: 7, slots: [{ counter: 1, party: [] }, { counter: 0, party: [] }],
    edit: (sb2, sb1) => {
      if (book) setFlag(sb2, sb1, O.flag);
      for (const k of roots) setFlag(sb2, sb1, P.flags.understandings[k]);
      if (mark) setFlag(sb2, sb1, TRUE_MARK);
    } });
}
const first = (n: number) => SEVEN.slice(0, n), last = (n: number) => SEVEN.slice(7 - n);
const labels = (o: Origin) => (o.sections ?? []).map((s) => s.label);
const readWith = (s: Parameters<typeof saveWith>[0]) => readOrigin(saveWith(s));

describe("DAEMONS T-533: THE ORIGIN OF A DAEMON", () => {
  it("is held by FLAG_GOT_ORIGIN_BOOK, in DAEMONS' own flags at + 0x1C0, and its saves say what the PROFILE says", () => {
    expect(ORIGIN_FLAG).toBe(P.flags.daemons_flags_start + 0x1c0);
    expect(ORIGIN_FLAG).toBe(2752);
    const s = saveWith({ roots: [1, 4], mark: true }), p = readProfile(s);
    expect(savedOrigin(s)).toBe(true);
    expect(p.roots.filter(Boolean)).toHaveLength(2);
    expect(p.marks[7]).toBe(true);
  });

  it("is nothing while the save does not hold it, whatever else the save holds", () => {
    expect(readOrigin(null)).toEqual({ held: false });
    const not = saveWith({ book: false, roots: SEVEN, mark: true });
    expect(savedOrigin(not)).toBe(false);
    expect(readOrigin(not)).toEqual({ held: false });
  });

  it("opens only its first section with no understandings, even with the TRUE MARK", () => {
    expect(readWith({})).toMatchObject({ held: true, how: "game", title: "THE ORIGIN OF A DAEMON", draft: true });
    expect(labels(readWith({}))).toEqual([LABELS[0]]);
    expect(labels(readWith({ mark: true }))).toEqual([LABELS[0]]);
  });

  it("opens one more section for each understanding held, whichever it is, up to four", () => {
    for (let n = 1; n <= 4; n++)
      for (const roots of [first(n), last(n)])
        expect(labels(readWith({ roots })), `understandings ${roots}`).toEqual(LABELS.slice(0, n + 1));
  });

  it("opens the sixth section, VII, only with SCORN's TRUE MARK as well", () => {
    expect(LABELS[5]).toBe("VII");
    for (let n = 4; n <= 7; n++)                                // without the mark it stops before VII, however many are held
      expect(labels(readWith({ roots: last(n) })), `${n} understandings`).toEqual(LABELS.slice(0, 5));
    expect(labels(readWith({ roots: first(4), mark: true }))).toEqual(LABELS.slice(0, 6));
    expect(labels(readWith({ roots: first(3), mark: true }))).toEqual(LABELS.slice(0, 4));   // the mark alone opens nothing
  });

  it("opens every section with all seven understandings and the TRUE MARK", () => {
    const all = readWith({ roots: SEVEN, mark: true });
    expect(labels(all)).toEqual(LABELS);
    expect(LABELS).toHaveLength(10);
    expect(all.sections).toEqual(readOrigin(null, true).sections);
  });

  it("never sends a hidden section or counts one: always the first sections, in order, as many as are back and no more", () => {
    const back = (s: Opens, n: number, mark: boolean) => s.understandings <= n && (!s.trueMark || mark);
    for (let n = 0; n <= 7; n++) for (const mark of [false, true]) for (const roots of [first(n), last(n)]) {
      const o = readWith({ roots, mark }), k = labels(o).length, why = `${n} understandings, ${mark ? "" : "no "}TRUE MARK`;
      expect(labels(o), why).toEqual(LABELS.slice(0, k));                                    // a run from the first, in order
      expect(O.sections.slice(0, k).every((s) => back(s.opens, n, mark)), why).toBe(true);    // each one sent is back
      if (k < LABELS.length) expect(back(O.sections[k].opens, n, mark), why).toBe(false);    // and the next is not
      const sent = JSON.stringify(o);
      for (const s of O.sections.slice(k))                                                    // nothing of the rest, anywhere
        for (const e of s.entries) for (const p of e.paragraphs) expect(sent.includes(p.text), `${why}: ${s.label}`).toBe(false);
      expect(Object.keys(o).sort(), why).toEqual(["cover", "draft", "held", "how", "sections", "subtitle", "title"]);
      for (const s of o.sections ?? []) expect(Object.keys(s).sort(), why).toEqual(["entries", "heading", "label"]);   // no `opens`
    }
  });

  it("is the whole book as a preview, held or not, and keeps when each section comes back to itself", () => {
    for (const save of [null, saveWith({ book: false }), saveWith({})]) {
      const o = readOrigin(save, true);
      expect(o).toMatchObject({ held: true, how: "preview" });
      expect(labels(o)).toEqual(LABELS);
      expect(JSON.stringify(o)).not.toContain("opens");
    }
  });
});

// ---- through the server: GET /api/origin ------------------------------------------------------------------------------
function serve(save: Uint8Array) {
  const dir = mkdtempSync(join(tmpdir(), "companion-origin-")), savePath = join(dir, "copy.sav");
  writeFileSync(savePath, save);
  return makeServer({ ...DEFAULTS, database: ":memory:", savePath, edition: "CONTENT" as const });
}
const servers = { two: serve(saveWith({ roots: [2, 6] })), not: serve(saveWith({ book: false, roots: SEVEN, mark: true })) };
const base = { two: "", not: "" };
beforeAll(async () => {
  for (const k of ["two", "not"] as const) {
    await new Promise<void>((r) => servers[k].listen(0, "127.0.0.1", () => r()));
    base[k] = `http://127.0.0.1:${(servers[k].address() as AddressInfo).port}`;
  }
});
afterAll(() => { servers.two.close(); servers.not.close(); });
const get = (k: "two" | "not", p: string) => fetch(base[k] + p).then((r) => r.json() as Promise<Origin>);

describe("GET /api/origin", () => {
  it("answers nothing of a book the save does not hold, and the whole book as a preview", async () => {
    expect(await get("not", "/api/origin")).toEqual({ held: false });
    expect(labels(await get("not", "/api/origin?preview=1"))).toEqual(LABELS);
  });
  it("answers the sections the save has back, and no more", async () => {
    const o = await get("two", "/api/origin");
    expect(o).toMatchObject({ held: true, how: "game" });
    expect(labels(o)).toEqual(LABELS.slice(0, 3));
  });
});
