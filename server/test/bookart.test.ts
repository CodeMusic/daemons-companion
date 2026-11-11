// C-299: the third book's three forms show the game's own cover and pictures as THE SUBTLE LAYER does (T-423) -- DAEMONS
// companion_export writes data/art/<book>_<picture>_<frame>.png and <book>_cover.png and sets each entry's "frames" and
// the book's "cover" (T-519). Every picture a book names is on disk, and the server hands each one out, and nothing else.
// DAEMONS T-533: THE ORIGIN OF A DAEMON's emblems alike.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeServer } from "../src/api.js";
import { DEFAULTS } from "../src/config.js";
import { buildSave } from "./build_save.js";
import subtle from "../data/subtle.json" with { type: "json" };
import hermetic from "../data/hermetic.json" with { type: "json" };
import eudaimon from "../data/eudaimon.json" with { type: "json" };
import unity from "../data/unity.json" with { type: "json" };
import origin from "../data/origin.json" with { type: "json" };

type Book = { cover?: string; sections: { entries: { picture: string; frames?: number }[] }[] };
const BOOKS = { subtle, hermetic, eudaimon, unity, origin } as unknown as Record<string, Book>;
const ART = join(import.meta.dirname, "..", "data", "art");

describe("the books' pictures (T-423, C-299)", () => {
  it("are on disk for every frame an entry says it has, and the cover a book names", () => {
    for (const [book, b] of Object.entries(BOOKS)) {
      for (const e of b.sections.flatMap((s) => s.entries)) {
        expect(e.picture, `${book}: a picture key the route reads`).toMatch(/^[a-z]{1,24}$/);
        for (let f = 0; f < (e.frames ?? 0); f++) expect(existsSync(join(ART, `${book}_${e.picture}_${f}.png`)), `${book}_${e.picture}_${f}.png`).toBe(true);
      }
      if (b.cover) expect(existsSync(join(ART, `${book}_cover.png`)), `${book}_cover.png`).toBe(true);
    }
  });
});

const dir = mkdtempSync(join(tmpdir(), "companion-bookart-"));
const savePath = join(dir, "copy.sav");
writeFileSync(savePath, buildSave({ player: "ROVER", trainerId: 7, slots: [{ counter: 1, party: [] }, { counter: 0, party: [] }] }));
const server = makeServer({ ...DEFAULTS, database: ":memory:", savePath, edition: "CONTENT" as const });
let base = "";
beforeAll(async () => {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

describe("GET /art/<book>/...", () => {
  it("hands out each book's cover and pictures where they exist, a 404 where the game has not drawn one", async () => {
    for (const [book, b] of Object.entries(BOOKS)) {
      const e = b.sections[0].entries[0];
      for (const name of ["cover", `${e.picture}_0`]) {
        const r = await fetch(`${base}/art/${book}/${name}.png`);
        expect(r.status, `${book}/${name}`).toBe(existsSync(join(ART, `${book}_${name}.png`)) ? 200 : 404);
        if (r.status === 200) expect(r.headers.get("content-type")).toBe("image/png");
        await r.arrayBuffer();
      }
    }
  });
  it("reads no other book's name and no path out of the folder", async () => {
    for (const p of ["/art/guide/cover.png", "/art/hermetic/../subtle_cover.png", "/art/hermetic/cover_0_0.png", "/art/unity/COVER.png", "/art/origin/../unity_cover.png"]) {
      const r = await fetch(base + p);
      expect(r.status, p).not.toBe(200);
      await r.arrayBuffer();
    }
  });
  // T-533: the books a phone away asks for as JSON (app/platform/net.ts artByJson): THE SUBTLE LAYER's and THE ORIGIN OF A DAEMON's
  it("hands the same out as JSON for a phone away", async () => {
    for (const book of ["subtle", "origin"]) {
      const e = BOOKS[book].sections[0].entries[0];
      for (const name of ["cover", `${e.picture}_0`]) {
        const r = await fetch(`${base}/api/art?${book}=${name}`);
        expect(r.status, `?${book}=${name}`).toBe(200);
        expect(((await r.json()) as { png: string }).png, `?${book}=${name}`).toMatch(/^iVBORw0KGgo/);   // a PNG, in base64
      }
    }
  });
});
