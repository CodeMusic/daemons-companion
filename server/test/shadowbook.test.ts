// C-474 (DAEMONS T-606): THE SPELL LEFT RUNNING on the LIBRARY's shelf -- held only with the game's flag
// (FLAG_GOT_SHADOW_BOOK), then the whole book at once; nothing of it before. ?preview=1 is the whole book. Its plates are
// served by name, and their names have underscores (axe_word, first_spell).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import shadow from "../data/shadow.json" with { type: "json" };
import P from "../data/profile_layout.json" with { type: "json" };
import { SHADOW_FLAG, readShadow, savedShadow, type Shadow } from "../src/library/shadowbook.js";
import { makeServer } from "../src/api.js";
import { DEFAULTS } from "../src/shared/config.js";
import { buildSave } from "./build_save.js";

type Book = { flag: number; sections: { label: string; entries: { picture: string; frames: number; paragraphs: { text: string }[] }[] }[] };
const B = shadow as unknown as Book;
const ART = join(__dirname, "..", "data", "art");

function saveWith(book: boolean) {
  return buildSave({ player: "ROVER", trainerId: 7, slots: [{ counter: 1, party: [] }, { counter: 0, party: [] }],
    edit: (sb2) => {
      if (!book) return;
      const g = B.flag - P.flags.daemons_flags_start;
      sb2[P.sb2.daemons_flags + (g >> 3)] |= 1 << (g & 7);
    } });
}

describe("C-474: THE SPELL LEFT RUNNING", () => {
  it("is held by FLAG_GOT_SHADOW_BOOK, in DAEMONS' own flags at + 0x160", () => {
    expect(SHADOW_FLAG).toBe(P.flags.daemons_flags_start + 0x160);
    expect(savedShadow(saveWith(true))).toBe(true);
    expect(savedShadow(saveWith(false))).toBe(false);
  });

  it("is nothing until the save holds it, then the whole book, DRAFT", () => {
    expect(readShadow(null)).toEqual({ held: false });
    expect(readShadow(saveWith(false))).toEqual({ held: false });
    const b = readShadow(saveWith(true));
    expect(b).toMatchObject({ held: true, how: "game", title: "THE SPELL LEFT RUNNING", subtitle: "A BOOK OF SHADOWS", draft: true });
    expect(b.sections?.flatMap((s) => s.entries)).toHaveLength(24);
    expect(readShadow(null, true)).toMatchObject({ held: true, how: "preview" });
  });

  it("has every plate it names drawn, and the cover", () => {
    for (const e of B.sections.flatMap((s) => s.entries)) {
      expect(e.frames, e.picture).toBeGreaterThan(0);
      for (let f = 0; f < e.frames; f++) expect(existsSync(join(ART, `shadow_${e.picture}_${f}.png`)), e.picture).toBe(true);
    }
    expect(existsSync(join(ART, "shadow_cover.png"))).toBe(true);
    expect(existsSync(join(ART, "books", "shadow.png"))).toBe(true);
  });

  it("never writes the frightening word", () => {
    expect(JSON.stringify(shadow)).not.toMatch(/\bdemon/i);
  });
});

// ---- through the server -------------------------------------------------------------------------------------------
function serve(save: Uint8Array) {
  const dir = mkdtempSync(join(tmpdir(), "companion-shadow-")), savePath = join(dir, "copy.sav");
  writeFileSync(savePath, save);
  return makeServer({ ...DEFAULTS, database: ":memory:", savePath, edition: "CONTENT" as const });
}
const servers = { held: serve(saveWith(true)), not: serve(saveWith(false)) };
const base = { held: "", not: "" };
beforeAll(async () => {
  for (const k of ["held", "not"] as const) {
    await new Promise<void>((r) => servers[k].listen(0, "127.0.0.1", () => r()));
    base[k] = `http://127.0.0.1:${(servers[k].address() as AddressInfo).port}`;
  }
});
afterAll(() => { servers.held.close(); servers.not.close(); });

describe("GET /api/shadow and its plates", () => {
  it("answers nothing of a book the save does not hold, and the whole book once it does or as a preview", async () => {
    const get = (k: "held" | "not", p: string) => fetch(base[k] + p).then((r) => r.json() as Promise<Shadow>);
    expect(await get("not", "/api/shadow")).toEqual({ held: false });
    expect((await get("not", "/api/shadow?preview=1")).held).toBe(true);
    expect((await get("held", "/api/shadow")).sections?.length).toBe(B.sections.length);
  });
  it("serves a plate whose name has an underscore, and the cover, and refuses a name that climbs", async () => {
    for (const p of ["/art/shadow/axe_word_0.png", "/art/shadow/first_spell_0.png", "/art/shadow/cover.png"]) {
      const r = await fetch(base.held + p);
      expect(r.status, p).toBe(200);
      expect(r.headers.get("content-type"), p).toContain("image/png");
    }
    expect((await fetch(base.held + "/art/shadow/..%2Fsecret_0.png")).status).not.toBe(200);
    const j = await fetch(base.held + "/api/art?shadow=first_spell_0").then((r) => r.json() as Promise<{ png?: string }>);
    expect(j.png?.length).toBeGreaterThan(100);
  });
});
