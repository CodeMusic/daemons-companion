import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { repaint, streakColours } from "../src/art.js";
import speciesJson from "../data/species.json" with { type: "json" };
import streaksJson from "../data/streaks.json" with { type: "json" };

const SPECIES = speciesJson as unknown as Record<string, any>;
const plte = (png: Buffer) => {
  let at = 8;
  while (at < png.length) {
    const len = png.readUInt32BE(at);
    if (png.toString("latin1", at + 4, at + 8) === "PLTE") return png.subarray(at + 8, at + 8 + len);
    at += 12 + len;
  }
  throw new Error("no PLTE");
};

describe("a party daemon's streaks, painted as the game paints them (C-18)", () => {
  const artsai = Object.values(SPECIES).find((r) => r.name === "ARTSAI");
  const png = readFileSync(new URL("../data/art/artsai.png", import.meta.url));

  it("exports the daemon with its streak slots still the game's blank grey", () => {
    expect(artsai.streaks).toBe(true);
    const p = plte(png);
    for (let k = 11; k <= 14; k++) expect([...p.subarray(k * 3, k * 3 + 3)]).toEqual(streaksJson.blank);
  });

  it("paints each slot by its routine's type on the body, and an empty slot in the body's mid tone", () => {
    const out = repaint(png, (pal) => streakColours(pal, artsai.bodyType, [33, 0, 0, 0]));   // 33 is a NORMAL routine
    const p = plte(out);
    expect([...p.subarray(33, 36)]).toEqual(streaksJson.colours[artsai.bodyType][0]);
    expect([...p.subarray(36, 39)]).toEqual([...p.subarray(9, 12)]);                          // slot 2 = index 3
  });

  it("changes only the palette, and keeps the file a valid PNG", () => {
    const out = repaint(png, (pal) => streakColours(pal, artsai.bodyType, [33, 33, 33, 33]));
    expect(out.length).toBe(png.length);
    let at = 8, idat: Buffer[] = [];
    while (at < out.length) {
      const len = out.readUInt32BE(at), type = out.toString("latin1", at + 4, at + 8);
      if (type === "IDAT") idat.push(out.subarray(at + 8, at + 8 + len));
      at += 12 + len;
    }
    expect(inflateSync(Buffer.concat(idat)).length).toBeGreaterThan(0);
  });
});
