// C-119: the expressions drawn exactly as the server describes them -- the reference every host's drawing is held to.
//
//   npx tsx tools/expressions.ts OUT.png caremusai codemusai relay ...   each daemon in every expression, one row each
//   npx tsx tools/expressions.ts --only awake,asleep OUT.png NAME...    only those expressions (checking eyes close)
//
// It draws from the same description a host receives (expressions.ts): the body's colours in the expression's shade,
// the eye patches, the mark above the head at the back, and the pose's rest (dy, squash) -- not the motion.
import { readFileSync, writeFileSync } from "node:fs";
import { decodeIndexedPng } from "../src/art.js";
import { EXPRESSIONS, eyePatch, faceOf, SHADED, shade } from "../src/expressions.js";
import { canvas, png } from "./png.js";

const argv = process.argv.slice(2), only = argv[0] === "--only" ? argv.splice(0, 2)[1].split(",") : null;
const [out, ...names] = argv;
if (!out || !names.length) { console.error("usage: tsx tools/expressions.ts [--only awake,asleep] OUT.png NAME..."); process.exit(64); }
const order = only ?? Object.keys(EXPRESSIONS), K = 4, CELL = 64 * K + 16;
for (const k of order) if (!EXPRESSIONS[k]) { console.error(`no expression ${k}: ${Object.keys(EXPRESSIONS).join(", ")}`); process.exit(64); }
const c = canvas(order.length * CELL, names.length * CELL);
names.forEach((name, row) => {
  const d = decodeIndexedPng(readFileSync(new URL(`../data/art/${name}.png`, import.meta.url)));
  const face = faceOf(name);
  let top = 64, bottom = 0, right = 0;
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) if (d.px[y * 64 + x]) { top = Math.min(top, y); bottom = Math.max(bottom, y); right = Math.max(right, x); }
  order.forEach((key, col) => {
    const e = EXPRESSIONS[key], ox = col * CELL + 8, oy = row * CELL + 8;
    const pal = d.palette.map((p, i) => (i >= SHADED.first && i < SHADED.first + SHADED.count ? shade(p, e.shade) : (i >= 11 && i <= 14 ? shade(d.palette[3], e.shade) : p)));
    const sprite: (number[] | null)[] = Array.from({ length: 64 * 64 }, (_, i) => (d.px[i] ? pal[d.px[i]] : null));
    for (const p of face ? eyePatch(face, e) : []) for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) if (sprite[y * 64 + x]) sprite[y * 64 + x] = p.rgb;
    const rowOf = (y: number) => bottom - Math.round((bottom - y) * e.pose.squash) + e.pose.dy;
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const col2 = sprite[y * 64 + x];
      if (!col2) continue;
      const ny = rowOf(y), tall = Math.max(1, rowOf(y + 1) - ny);   // stretched, a row reaches down to the next: no gap
      for (let t = 0; t < tall; t++) c.block(ox + x * K, oy + (ny + t) * K, K, col2);
    }
    if (e.mark) e.mark.rows.forEach((r, ry) => [...r].forEach((ch, rx) => {
      if (ch === ".") return;
      c.block(ox + (right - 2) * K + rx * 3, oy + (top + e.pose.dy) * K - 28 + ry * 3, 3, ch === "o" ? [255, 255, 255] : e.mark!.rgb);
    }));
  });
});
writeFileSync(out, png(c.w, c.h, c.rgb));
console.log(`${out}: ${names.length} daemons x ${order.length} expressions (${order.join(", ")})`);
