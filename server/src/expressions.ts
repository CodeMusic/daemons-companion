// C-119 (the user, 2026-10-12): expressions on any daemon's sprite -- "it still is the base sprite, but it can overlay
// changes to the base sprite ... asleep, awake, and even expressions for after train/water/food events like happy ...
// that way we can apply it to any given daemon we bring from the game." No art is drawn for any daemon: every sprite
// DAEMONS exports shares one palette layout (0 clear, 1..5 the body from light to the outline, 6..10 a second ramp,
// 11..14 the routines' streaks), so an expression is a SHADE of the body's colours, a POSE, a MARK drawn above the head,
// and the EYES (C-119's face map, when a daemon's are known).
//
// ONE DEFINITION, EVERY HOST. The server -- or a phone hosting alone (C-111) -- works out which expression is showing and
// hands each host a finished description (`expression` in the device state and the daemon's life). The boards, the
// Tab5, the app and the widget only draw what it says: none of them holds a rule of its own. The app and the widget
// take the shaded picture ready-made (GET /api/art?party=N&expression=NAME); the boards shade their own sixteen colours.
//
// Which one shows: asleep or drowsy first (C-114), then the strongest feeling past its threshold (C-120), else awake.
// The names are the code's -- a screen never says them (feelings.ts).
import type { Life } from "./life.js";
import type { Axis, Feelings } from "./feelings.js";

export type Shade = { sat: number; val: number; tint: [number, number, number]; mix: number };
export type Pose = { dy: number; squash: number; bob: number; still: boolean; shake: boolean };
export type Mark = { rows: string[]; rgb: [number, number, number] };
export type Expression = { name: string; shade: Shade; pose: Pose; mark: Mark | null; eyes: "closed" | "happy" | "wide" | "low" | null };

// 8x8 marks: '#' is the mark's colour, 'o' white
const MARKS: Record<string, Mark> = {
  zz:    { rgb: [170, 200, 255], rows: ["....####", "......#.", ".....#..", "....####", "###.....", "..#.....", ".#......", "###....."] },
  z:     { rgb: [170, 200, 255], rows: ["........", "........", "........", "........", "###.....", "..#.....", ".#......", "###....."] },
  heart: { rgb: [235, 70, 110],  rows: [".##..##.", "#oo##oo#", "#o######", "########", ".######.", "..####..", "...##...", "........"] },
  drop:  { rgb: [90, 160, 255],  rows: ["...#....", "...#....", "..###...", "..#o#...", ".##o##..", ".#####..", "..###...", "........"] },
  vein:  { rgb: [225, 50, 50],   rows: ["#..#....", ".##.....", ".##..#..", "#..#.##.", ".....##.", "....#..#", "........", "........"] },
  bang:  { rgb: [255, 220, 60],  rows: ["...##...", "...##...", "...##...", "...##...", "...##...", "........", "...##...", "...##..."] },
  dots:  { rgb: [230, 230, 230], rows: ["........", "........", "........", "........", "........", "........", "#..#..#.", "#..#..#."] },
};

const plain: Shade = { sat: 1, val: 1, tint: [0, 0, 0], mix: 0 };
const still = (dy: number, squash: number): Pose => ({ dy, squash, bob: 0, still: true, shake: false });
const moving = (dy = 0, squash = 1, bob = 1): Pose => ({ dy, squash, bob, still: false, shake: false });

// DRAFT -- the values the user saw on the mock-up sheet (2026-10-12)
export const EXPRESSIONS: Record<string, Expression> = {
  awake:    { name: "awake",    shade: plain,                                                         pose: moving(),          mark: null,         eyes: null },
  drowsy:   { name: "drowsy",   shade: { sat: 0.8, val: 0.85, tint: [60, 80, 150], mix: 0.08 },        pose: moving(1, 0.97, 0.5), mark: MARKS.z,    eyes: "low" },
  asleep:   { name: "asleep",   shade: { sat: 0.55, val: 0.62, tint: [60, 80, 150], mix: 0.18 },       pose: still(3, 0.92),    mark: MARKS.zz,     eyes: "closed" },
  glad:     { name: "glad",     shade: { sat: 1.12, val: 1.08, tint: [255, 220, 170], mix: 0.1 },      pose: moving(-2, 1.03, 1.4), mark: MARKS.heart, eyes: "happy" },
  sad:      { name: "sad",      shade: { sat: 0.45, val: 0.85, tint: [90, 110, 160], mix: 0.15 },     pose: moving(2, 0.95, 0.4), mark: MARKS.drop, eyes: "low" },
  mad:      { name: "mad",      shade: { sat: 1.15, val: 1, tint: [220, 60, 40], mix: 0.16 },          pose: { ...moving(), shake: true }, mark: MARKS.vein, eyes: null },
  afraid:   { name: "afraid",   shade: { sat: 0.5, val: 1.12, tint: [235, 240, 255], mix: 0.22 },     pose: { ...moving(1, 0.94, 0.3), shake: true }, mark: MARKS.bang, eyes: "wide" },
  restless: { name: "restless", shade: { sat: 0.85, val: 0.95, tint: [0, 0, 0], mix: 0 },              pose: moving(0, 1, 1.8), mark: MARKS.dots,  eyes: null },
};

// A feeling shows once it is past its threshold; the one furthest past it wins (calm counts when it is afraid)
const SHOWS: [Axis, string, number][] = [["glad", "glad", 25], ["mad", "mad", 25], ["sad", "sad", 25], ["calm", "afraid", -25], ["restless", "restless", 45]];

export function expressionFor(life: Pick<Life, "tired">, f: Feelings | null): Expression {
  if (life.tired === "asleep") return EXPRESSIONS.asleep;
  if (life.tired === "drowsy") return EXPRESSIONS.drowsy;
  if (!f) return EXPRESSIONS.awake;
  let best: string | null = null, by = 1;
  for (const [axis, name, at] of SHOWS) {
    const past = f[axis] / at;                      // 1 at the threshold; afraid's threshold is negative, so is calm
    if (past >= by) { best = name; by = past; }
  }
  return EXPRESSIONS[best ?? "awake"];
}

// A colour in an expression's shade: saturation and brightness scaled, then mixed toward the tint. The boards do the
// same sum in their own code; the app and the widget take the picture this shades (paint.ts repaint, indexes 1..10).
export function shade(rgb: number[], s: Shade): [number, number, number] {
  let [r, g, b] = rgb.map((x) => x / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), v = max, d = max - min, sat = max === 0 ? 0 : d / max;
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  const s2 = Math.min(1, sat * s.sat), v2 = Math.min(1, v * s.val), c = v2 * s2, x = c * (1 - Math.abs(((h % 6) + 6) % 6 % 2 - 1)), m = v2 - c;
  const hh = ((h % 6) + 6) % 6;
  [r, g, b] = hh < 1 ? [c, x, 0] : hh < 2 ? [x, c, 0] : hh < 3 ? [0, c, x] : hh < 4 ? [0, x, c] : hh < 5 ? [x, 0, c] : [c, 0, x];
  return [r + m, g + m, b + m].map((y, i) => Math.round(Math.max(0, Math.min(255, y * 255 * (1 - s.mix) + s.tint[i] * s.mix)))) as [number, number, number];
}

// The body's and the second ramp's colours (1..10) in an expression's shade; the clear colour and the streaks are kept
export const SHADED = { first: 1, count: 10 };
export const shadePalette = (palette: number[][], e: Expression) =>
  palette.slice(SHADED.first, SHADED.first + SHADED.count).map((c) => shade(c, e.shade));
