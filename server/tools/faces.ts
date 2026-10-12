// C-119 (the user, 2026-10-12: eyes "found by a tool"): where each daemon's eyes are, so an expression can close them
// (asleep), lift them (glad), lower them (sad, drowsy) or widen them (afraid) -- on any daemon, without drawing one.
//
//   npx tsx tools/faces.ts                 report: how many daemons have eyes checked, and how many the tool suggests
//   npx tsx tools/faces.ts --write         data/faces.json's colours filled in; data/faces.suggested.json rewritten
//   npx tsx tools/faces.ts --sheet DIR     picture sheets for checking, each sprite with its eyes boxed
//
// How it looks: every sprite DAEMONS exports shares one palette layout (0 clear, 1..5 the body from light to the outline,
// 6..10 a second ramp, 11..14 streaks). An eye is a small, compact patch of the darkest colours -- or a glint of the
// lightest inside dark -- in the top of the body, ENCLOSED (not touching the clear colour, so not the outline). Two of a
// size, side by side, are a pair; one, very sure, is one eye (a profile). Anything less sure is left out.
//
// ONLY CHECKED EYES ARE DRAWN. On the user's own daemons the tool was right for a third (2026-10-12): it boxes ears,
// antennae and hair as readily as eyes, and its sureness does not tell them apart. So data/faces.json holds eyes a person
// has checked (by hand: x, y, w, h in the 64x64 sprite; `fill` the palette index around them, `line` the eye's own) and
// this tool only fills in their colours and writes its guesses to data/faces.suggested.json, to be checked on the sheets
// and moved across. A daemon with no checked eyes still takes every other part of an expression.
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { decodeIndexedPng } from "../src/art.js";
import { png } from "./png.js";

const DATA = new URL("../data/", import.meta.url).pathname;
const ART = join(DATA, "art");
type Box = [number, number, number, number];        // x, y, w, h in the 64x64 sprite
type Face = { eyes: Box[]; sure: number; fill: number; line: number; fillRgb?: number[]; lineRgb?: number[] };   // fill: around them; line: the eye's own

const DARK = new Set([4, 5]), GLINT = new Set([1]);

function find(px: Uint8Array, w: number, h: number): Face | null {
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : px[y * w + x]);
  let top = h, bottom = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (at(x, y)) { top = Math.min(top, y); bottom = Math.max(bottom, y); }
  if (bottom < 0) return null;
  const headTo = top + Math.round((bottom - top) * 0.6);
  const seen = new Uint8Array(w * h);
  type Comp = { cells: [number, number][]; x0: number; y0: number; x1: number; y1: number; kind: "dark" | "glint"; score: number };
  const comps: Comp[] = [];
  for (const [set, kind] of [[DARK, "dark"], [GLINT, "glint"]] as const) {
    seen.fill(0);
    for (let y = top; y <= headTo; y++) for (let x = 0; x < w; x++) {
      if (seen[y * w + x] || !set.has(at(x, y))) continue;
      const cells: [number, number][] = [], stack: [number, number][] = [[x, y]];
      seen[y * w + x] = 1;
      while (stack.length) {
        const [cx, cy] = stack.pop()!;
        cells.push([cx, cy]);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h || seen[ny * w + nx] || !set.has(at(nx, ny))) continue;
          seen[ny * w + nx] = 1; stack.push([nx, ny]);
        }
      }
      if (cells.length > 20) continue;
      const xs = cells.map((c) => c[0]), ys = cells.map((c) => c[1]);
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      if (x1 - x0 > 5 || y1 - y0 > 5 || y0 > headTo) continue;
      // enclosed: no cell of it touches the clear colour, so it is not the outline
      if (cells.some(([cx, cy]) => [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]].some(([dx, dy]) => at(cx + dx, cy + dy) === 0))) continue;
      const fill = cells.length / ((x1 - x0 + 1) * (y1 - y0 + 1));                 // compact
      // an eye stands out: most of what is around it is lighter (an ear's or a mane's dark edge runs into more dark)
      const ring: number[] = [];
      for (const [cx, cy] of cells) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (!cells.some(([ex, ey]) => ex === nx && ey === ny)) ring.push(at(nx, ny));
      }
      const lighter = ring.filter((v) => kind === "dark" ? v >= 1 && v <= 3 || v >= 6 && v <= 8 : DARK.has(v)).length / Math.max(1, ring.length);
      if (lighter < 0.55) continue;
      // and a dark eye often holds a glint: the lightest colour inside it or touching it
      const glint = kind === "dark" && cells.some(([cx, cy]) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => GLINT.has(at(cx + dx, cy + dy))));
      const rel = (y0 - top) / Math.max(1, bottom - top);                         // eyes sit a little way down, not at the very top
      const place = rel < 0.08 ? 0.4 : rel <= 0.5 ? 1 : 0.6;
      const size = cells.length >= 2 && cells.length <= 12 ? 1 : 0.5;
      comps.push({ cells, x0, y0, x1, y1, kind, score: fill * 0.25 + lighter * 0.25 + (glint || kind === "glint" ? 0.25 : 0) + place * 0.15 + size * 0.1 });
    }
  }
  if (!comps.length) return null;
  const box = (c: Comp): Box => [c.x0, c.y0, c.x1 - c.x0 + 1, c.y1 - c.y0 + 1];
  // the best pair: the same kind, level, a little apart, much the same size
  let best: { eyes: Comp[]; sure: number } | null = null;
  for (let i = 0; i < comps.length; i++) for (let j = i + 1; j < comps.length; j++) {
    const a = comps[i], b = comps[j];
    if (a.kind !== b.kind) continue;
    const dy = Math.abs((a.y0 + a.y1) - (b.y0 + b.y1)) / 2, dx = Math.abs((a.x0 + a.x1) - (b.x0 + b.x1)) / 2;
    const ratio = Math.min(a.cells.length, b.cells.length) / Math.max(a.cells.length, b.cells.length);
    if (dy > 2 || dx < 3 || dx > 20 || ratio < 0.5) continue;
    const sure = ((a.score + b.score) / 2) * (0.7 + 0.3 * ratio) * (dy <= 1 ? 1 : 0.85);
    if (!best || sure > best.sure) best = { eyes: [a, b], sure };
  }
  if (!best) {
    const one = comps.sort((a, b) => b.score - a.score)[0];
    if (one.score >= 0.9) best = { eyes: [one], sure: one.score * 0.8 };
  }
  if (!best || best.sure < 0.72) return null;                                 // leave out the doubtful: no eyes beats wrong eyes
  // the colour the eyes sit in (what a closed eye is drawn over with), and the outline
  const around = new Map<number, number>();
  for (const e of best.eyes) for (const [cx, cy] of e.cells)
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const v = at(cx + dx, cy + dy);
      if (v && !DARK.has(v) && !GLINT.has(v)) around.set(v, (around.get(v) ?? 0) + 1);
    }
  const fill = [...around.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 3;
  // a glint's eye is the dark around it: grow the box by one so closing it covers the glint and its socket
  const eyes = best.eyes.map((c) => { const [x, y, bw, bh] = box(c); return (c.kind === "glint" ? [x - 1, y - 1, bw + 2, bh + 2] : [x, y, bw, bh]) as Box; });
  return { eyes, sure: Math.round(best.sure * 100) / 100, fill: best.eyes[0].kind === "glint" ? 5 : fill, line: 5 };
}

const names = readdirSync(ART).filter((f) => f.endsWith(".png")).map((f) => f.slice(0, -4)).sort();
const checkedPath = join(DATA, "faces.json");
const checked: Record<string, Face> = existsSync(checkedPath) ? JSON.parse(readFileSync(checkedPath, "utf8")) : {};
const suggested: Record<string, Face> = {};
const decoded: Record<string, ReturnType<typeof decodeIndexedPng>> = {};
for (const n of names) {
  const d = decodeIndexedPng(readFileSync(join(ART, n + ".png")));
  decoded[n] = d;
  if (checked[n]) { checked[n].fillRgb = d.palette[checked[n].fill]; checked[n].lineRgb = d.palette[checked[n].line]; continue; }
  const f = find(d.px, d.w, d.h);
  if (f) suggested[n] = f;
}
const faces: Record<string, Face> = { ...suggested, ...checked };
const args = process.argv.slice(2);
console.log(`faces: ${Object.keys(checked).length} of ${names.length} daemons have eyes checked; the tool suggests eyes for ${Object.keys(suggested).length} more`);
const lines = (o: Record<string, Face>) => "{\n" + Object.entries(o).sort().map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(",\n") + "\n}\n";
if (args.includes("--write")) {
  writeFileSync(checkedPath, lines(checked));
  writeFileSync(join(DATA, "faces.suggested.json"), lines(suggested));
  console.log("wrote data/faces.json (colours) and data/faces.suggested.json");
}
const sheetAt = args.indexOf("--sheet");
if (sheetAt >= 0) {
  const dir = args[sheetAt + 1]; mkdirSync(dir, { recursive: true });
  const K = 2, CELL = 64 * K + 8, COLS = 16, PER = COLS * 13;
  for (let p = 0; p * PER < names.length; p++) {
    const page = names.slice(p * PER, (p + 1) * PER), rows = Math.ceil(page.length / COLS);
    const W = COLS * CELL, H = rows * CELL, rgb = new Uint8Array(W * H * 3).fill(40);
    const put = (x: number, y: number, c: number[]) => { if (x < 0 || y < 0 || x >= W || y >= H) return; rgb.set(c, (y * W + x) * 3); };
    page.forEach((n, i) => {
      const d = decoded[n], ox = (i % COLS) * CELL + 4, oy = Math.floor(i / COLS) * CELL + 4, f = faces[n];
      for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
        const v = d.px[y * 64 + x], c = v ? d.palette[v] : [52, 58, 74];
        for (let a = 0; a < K; a++) for (let b = 0; b < K; b++) put(ox + x * K + a, oy + y * K + b, c);
      }
      const ink = !f ? [255, 70, 70] : checked[n] ? [80, 255, 120] : [255, 210, 60];   // none, checked, a suggestion
      for (const [x, y, bw, bh] of f?.eyes ?? []) for (let t = -1; t <= bw * K; t++) {
        put(ox + x * K + t, oy + y * K - 1, ink); put(ox + x * K + t, oy + (y + bh) * K, ink);
        for (let s = -1; s <= bh * K; s++) { put(ox + x * K - 1, oy + y * K + s, ink); put(ox + (x + bw) * K, oy + y * K + s, ink); }
      }
      if (!f) for (let t = 0; t < 10; t++) { put(ox + t, oy + t, ink); put(ox + 9 - t, oy + t, ink); }
    });
    writeFileSync(join(dir, `faces-${p + 1}.png`), png(W, H, rgb));
  }
  console.log(`sheets in ${dir}: green checked, yellow the tool's suggestion, a red cross none (in name order)`);
}
