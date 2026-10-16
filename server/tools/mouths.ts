// C-138 (the user, 2026-10-16: "when it talks we draw sprites over its mouth or eyes"): where each daemon's mouth is, so
// the BOX-3's face can open it while the voice assistant speaks. As with the eyes (tools/faces.ts), ONLY A MOUTH A PERSON
// HAS CHECKED IS DRAWN: this tool suggests, data/faces.json holds what was checked (`mouth`: x, y, w, h in the sprite).
// A daemon without one speaks with a speech bubble instead (face.ts).
//
//   npx tsx tools/mouths.ts                      report: how many daemons with checked eyes it finds a mouth for
//   npx tsx tools/mouths.ts --write              data/mouths.suggested.json rewritten
//   npx tsx tools/mouths.ts --sheet OUT.png      each daemon: the sprite with the suggestion boxed, and the mouth open
//
// How it looks: only below checked eyes. A mouth already drawn is a short run of the darkest colours inside the body,
// under the eyes and between them, within about an eye-spacing; failing that, a small mouth is placed there, if what
// is there is body.
import { readFileSync, writeFileSync } from "node:fs";
import { decodeIndexedPng } from "../src/art.js";
import { EXPRESSIONS, type Face } from "../src/expressions.js";
import facesJson from "../data/faces.json" with { type: "json" };
import { canvas, png } from "./png.js";

type Box = [number, number, number, number];
const FACES = facesJson as unknown as Record<string, Face>;
const DATA = new URL("../data/", import.meta.url).pathname;
const DARK = new Set([4, 5]);

export function suggestMouth(px: Uint8Array, face: Face): { mouth: Box; drawn: boolean } | null {
  const at = (x: number, y: number) => (x < 0 || y < 0 || x > 63 || y > 63 ? 0 : px[y * 64 + x]);
  const eyes = face.eyes, n = eyes.length;
  if (!n) return null;
  const centres = eyes.map(([x, y, w, h]) => [x + w / 2, y + h / 2]);
  const cx = centres.reduce((a, c) => a + c[0], 0) / n, below = Math.max(...eyes.map(([, y, , h]) => y + h));
  const span = n > 1 ? Math.abs(centres[1][0] - centres[0][0]) : Math.max(4, eyes[0][2] * 3);
  // A profile's mouth is toward the way it faces: front sprites look left, so ahead of its one eye
  const x0 = Math.round(n > 1 ? cx - span / 2 : eyes[0][0] - span), x1 = Math.round(n > 1 ? cx + span / 2 : eyes[0][0] + eyes[0][2]);
  const enclosed = (x: number, y: number) => at(x - 1, y) && at(x + 1, y) && at(x, y - 1) && at(x, y + 1);
  for (let y = below + 1; y <= Math.min(63, below + Math.max(4, Math.round(span * 1.3))); y++) {
    let run = 0, start = -1;
    for (let x = x0; x <= x1 + 1; x++) {
      const dark = x <= x1 && DARK.has(at(x, y)) && enclosed(x, y);
      if (dark) { if (!run) start = x; run++; continue; }
      if (run >= 2) return { mouth: [start, y, run, 1], drawn: true };
      run = 0;
    }
  }
  const w = Math.max(2, Math.round(span * 0.45)), y = below + Math.max(2, Math.round(span * 0.55));
  const mx = Math.round((n > 1 ? cx : (x0 + eyes[0][0]) / 2) - w / 2);
  for (let x = mx - 1; x <= mx + w; x++) for (let yy = y - 1; yy <= y + 1; yy++) if (!at(x, yy) || DARK.has(at(x, yy))) return null;
  return { mouth: [mx, y, w, 1], drawn: false };
}

const argv = process.argv.slice(2), sheet = argv.includes("--sheet") ? argv[argv.indexOf("--sheet") + 1] : null;
const out: Record<string, { mouth: Box; drawn: boolean }> = {};
const names = Object.keys(FACES).sort();
const decoded = new Map(names.map((n) => [n, decodeIndexedPng(readFileSync(`${DATA}art/${n}.png`))]));
for (const name of names) { const s = suggestMouth(decoded.get(name)!.px, FACES[name]); if (s) out[name] = s; }
const found = Object.values(out);
console.log(`mouths: ${found.length} of ${names.length} daemons with checked eyes (${found.filter((m) => m.drawn).length} drawn in the sprite, ` +
            `${found.filter((m) => !m.drawn).length} placed); ${names.filter((n) => FACES[n].mouth).length} checked in faces.json`);
if (argv.includes("--write")) { writeFileSync(`${DATA}mouths.suggested.json`, JSON.stringify(out, null, 1) + "\n"); console.log("wrote data/mouths.suggested.json"); }

if (sheet) {
  // Each daemon twice at 4x: as it is with the suggestion boxed in red, and with the mouth open as the BOX-3 draws it
  const K = 4, CELL = 64 * K + 12, COLS = 4;
  const c = canvas(COLS * CELL * 2 + 12, Math.ceil(names.length / COLS) * CELL + 12);
  names.forEach((name, i) => {
    const d = decodeIndexedPng(readFileSync(`${DATA}art/${name}.png`)), s = out[name];
    const ox = 12 + (i % COLS) * CELL * 2, oy = 12 + Math.floor(i / COLS) * CELL;
    for (const [dx, open] of [[0, false], [CELL, true]] as const) {
      for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
        let p = d.px[y * 64 + x] ? d.palette[d.px[y * 64 + x]] : null;
        if (open && s && p) {
          const [mx, my, mw, mh] = s.mouth;
          if (x >= mx && x < mx + mw && y >= my && y <= my + mh) p = FACES[name].lineRgb ?? [16, 16, 16];
        }
        if (p) c.block(ox + dx + x * K, oy + y * K, K, p);
      }
      if (!open && s) {
        const [mx, my, mw, mh] = s.mouth, red = s.drawn ? [255, 60, 60] : [255, 170, 40];
        for (let x = mx * K - 2; x < (mx + mw) * K + 2; x++) { c.put(ox + x, oy + my * K - 2, red); c.put(ox + x, oy + (my + mh) * K + 1, red); }
        for (let y = my * K - 2; y < (my + mh) * K + 2; y++) { c.put(ox + mx * K - 2, oy + y, red); c.put(ox + (mx + mw) * K + 1, oy + y, red); }
      }
    }
  });
  writeFileSync(sheet, png(c.w, c.h, c.rgb));
  console.log(`${sheet}: ${names.length} daemons (red: a mouth in the sprite; orange: one placed; none: no suggestion)`);
}
void EXPRESSIONS;
