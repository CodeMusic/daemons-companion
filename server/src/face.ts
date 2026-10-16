// C-138 (the user, 2026-10-16): the ESP32-S3-BOX-3 is Home Assistant's voice assistant, and its face is the daemon it
// carries -- "when it talks we draw sprites over its mouth or eyes -- I think it just needs one for thinking, idle, and a
// few others". So each of the assistant's phases is the daemon in its own expression (C-119) with the phase drawn over
// it: its eyes closed for a blink or lidded when muted, its mouth open when it speaks (where a mouth is known), a mark
// above its head for listening, thinking, an error, a timer. Two frames a phase; the board alternates them.
//
// ONE DEFINITION, EVERY HOST (expressions.ts). The board runs ESPHome, not our firmware, so it holds no rule at all: it
// asks GET /api/device/face for the face's revision and fetches the pictures again when it changes -- the whole 320x240
// screen, the daemon standing in its den (C-113), drawn here.
import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";
import { decodeIndexedPng } from "./art.js";
import { crc32 } from "./paint.js";
import { EXPRESSIONS, SHADED, eyePatch, shade, type Expression, type Eyes, type Face, type Mark } from "./expressions.js";

export const SCREEN = { w: 320, h: 240 };
export const PHASES = ["idle", "listening", "thinking", "replying", "error", "muted", "timer"] as const;
export type Phase = (typeof PHASES)[number];
export const FRAMES = 2;
const MARK_PX = 4;                                  // a mark's pixel on this screen (8x8 marks: 32 pixels square)
// The screen's rows: the board writes what was said on the floor (FLOOR..240) and the daemon's name at the top left, so
// the daemon stands on the floor's edge with room above it for a mark
export const FLOOR = 196;
const HEADROOM = 8 * MARK_PX + 10;

// The phases' marks, 8x8 as expressions.ts draws them ('#' the mark's colour, 'o' white), a frame each
const mark = (rgb: [number, number, number], ...rows: string[]): Mark => ({ rgb, rows });
const PHASE_MARKS: Partial<Record<Phase, (Mark | null)[]>> = {
  listening: [                                       // sound arriving: one ring, then two
    mark([120, 200, 255], "........", "..##....", "....#...", ".....#..", ".....#..", "....#...", "..##....", "........"),
    mark([120, 200, 255], "##......", "..##....", "#...#...", ".#...#..", ".#...#..", "#...#...", "..##....", "##......"),
  ],
  thinking: [                                        // a thought rising: two dots, then the bubble
    mark([235, 235, 245], "........", "........", "........", "........", "...##...", "...##...", "........", "#......."),
    mark([235, 235, 245], "..####..", ".#oooo#.", ".#oooo#.", "..####..", "...##...", "...##...", "........", "#......."),
  ],
  error: [
    mark([255, 220, 60], "...##...", "...##...", "...##...", "...##...", "...##...", "........", "...##...", "...##..."),
    null,
  ],
  muted: [                                           // hushed: a line through a ring
    mark([200, 200, 210], "..####..", ".#....##", "#....#.#", "#...#..#", "#..#...#", "#.#....#", "##....#.", "..####.."),
    mark([200, 200, 210], "..####..", ".#....##", "#....#.#", "#...#..#", "#..#...#", "#.#....#", "##....#.", "..####.."),
  ],
  timer: [                                           // a bell, swinging
    mark([255, 210, 90], "...##...", "..####..", ".######.", ".######.", ".######.", "########", "........", "..##...."),
    mark([255, 210, 90], "...##...", "..####..", ".######.", ".######.", ".######.", "########", "........", "....##.."),
  ],
};
// Speaking, for a daemon whose mouth is not known: a speech bubble, its words moving
const SPEECH: Mark[] = [
  mark([245, 245, 250], ".######.", "#oooooo#", "#o#o#oo#", "#oooooo#", ".######.", "..#.....", ".#......", "........"),
  mark([245, 245, 250], ".######.", "#oooooo#", "#oo#o#o#", "#oooooo#", ".######.", "..#.....", ".#......", "........"),
];

// What a phase changes: the eyes, the mouth, a mark, a nudge (a shake is one pixel either way)
type Look = { e: Expression; eyes: Eyes; mouth: "open" | null; mark: Mark | null; dx: number; dy: number };
const ASLEEP = new Set(["asleep", "drowsy"]);

export function lookFor(own: Expression, phase: Phase, frame: number, hasMouth: boolean): Look {
  // Asked something, it wakes to answer; idle and muted it is as it is
  const woke = ASLEEP.has(own.name) && !["idle", "muted"].includes(phase) ? EXPRESSIONS.awake : own;
  const look: Look = { e: woke, eyes: woke.eyes, mouth: null, mark: woke.mark, dx: 0, dy: 0 };
  const f = frame % FRAMES;
  switch (phase) {
    case "idle": if (f === 1 && !woke.eyes) look.eyes = "closed"; break;          // a blink
    case "replying":
      if (hasMouth) { look.mouth = f === 0 ? "open" : null; look.mark = null; }
      else look.mark = SPEECH[f];
      look.dy = f === 0 ? -1 : 0;
      break;
    case "muted": look.eyes = woke.eyes ?? "low"; look.mark = PHASE_MARKS.muted![f]; break;
    case "error": look.mark = PHASE_MARKS.error![f]; look.dx = f === 0 ? -1 : 1; break;
    default: look.mark = PHASE_MARKS[phase]![f];
  }
  return look;
}

// A daemon's mouth, when a person has found it (data/faces.json `mouth`: x, y, w, h in the 64x64 sprite)
export type Den = { wall: string; deep: string; floor: string; glow: string };
const rgbOf = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];

// The whole screen for one phase and frame: the den, the daemon on its floor in the phase's look. `sprite` is the
// daemon's indexed PNG as the game paints it (streaks and all); null draws the den empty.
export function renderFace(sprite: Buffer | null, own: Expression, face: Face | null, den: Den, phase: Phase, frame: number): Buffer {
  const { w, h } = SCREEN, rgb = new Uint8Array(w * h * 3);
  const put = (x: number, y: number, c: number[]) => { if (x >= 0 && y >= 0 && x < w && y < h) rgb.set(c, (y * w + x) * 3); };
  const block = (x: number, y: number, k: number, c: number[]) => { for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) put(x + a, y + b, c); };
  const deep = rgbOf(den.deep), wall = rgbOf(den.wall), floor = rgbOf(den.floor), glow = rgbOf(den.glow);
  let top = 0, bottom = 63, left = 0, right = 63, d: ReturnType<typeof decodeIndexedPng> | null = null;
  if (sprite) {
    d = decodeIndexedPng(sprite);
    top = 64; bottom = 0; left = 64; right = 0;
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++)
      if (d.px[y * 64 + x]) { top = Math.min(top, y); bottom = Math.max(bottom, y); left = Math.min(left, x); right = Math.max(right, x); }
  }
  // As large as the room allows, whole pixels only (three to six): a small daemon is not lost in its den
  const K = Math.max(3, Math.min(6, Math.floor(Math.min((FLOOR + 4 - HEADROOM) / (bottom - top + 1), 300 / (right - left + 1)))));
  const ox = Math.round(w / 2 - ((left + right + 1) / 2) * K), oy = FLOOR + 4 - (bottom + 1) * K;   // its feet just on the floor
  const floorAt = FLOOR;
  // The den: the deep colour at the top falling to the wall, a glow behind where the daemon stands, the floor
  for (let y = 0; y < h; y++) {
    const t = Math.min(1, y / floorAt), row = y < floorAt ? deep.map((c, i) => Math.round(c + (wall[i] - c) * t)) : floor;
    for (let x = 0; x < w; x++) rgb.set(row, (y * w + x) * 3);
  }
  const gx = w / 2, gy = floorAt, rx = 120, ry = 26;
  for (let y = gy - ry; y <= gy + ry; y++) for (let x = gx - rx; x <= gx + rx; x++) {
    const q = ((x - gx) / rx) ** 2 + ((y - gy) / ry) ** 2;
    if (q <= 1 && y >= floorAt) put(x, y, floor.map((c, i) => Math.round(c + (glow[i] - c) * 0.35 * (1 - q))));
  }
  if (!d) return encodeRgb(w, h, rgb);

  const look = lookFor(own, phase, frame, !!face?.mouth);
  const e = look.e;
  const pal = d.palette.map((p, i) => (i >= SHADED.first && i < SHADED.first + SHADED.count ? shade(p, e.shade) : p));
  const px: (number[] | null)[] = Array.from({ length: 64 * 64 }, (_, i) => (d!.px[i] ? pal[d!.px[i]] : null));
  if (face) for (const p of eyePatch(face, { ...e, eyes: look.eyes }))
    for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) if (px[y * 64 + x]) px[y * 64 + x] = p.rgb;
  if (face?.mouth && look.mouth === "open") {
    // Open: the mouth's box in the eye's own dark colour, a row deeper, and red inside when there is room for it
    const [mx, my, mw, mh] = face.mouth, line = shade(face.lineRgb ?? [16, 16, 16], e.shade), tall = mh + 1;
    for (let y = my; y < my + tall; y++) for (let x = mx; x < mx + mw; x++) if (y < 64 && px[y * 64 + x]) px[y * 64 + x] = line;
    if (mw >= 3 && tall >= 3) for (let y = my + 1; y < my + tall - 1; y++) for (let x = mx + 1; x < mx + mw - 1; x++) if (px[y * 64 + x]) px[y * 64 + x] = shade([200, 70, 90], e.shade);
  }
  // The pose at rest (expressions.ts: squashed toward its feet, lifted or lowered), and the phase's nudge
  const dy = e.pose.dy + look.dy, rowOf = (y: number) => bottom - Math.round((bottom - y) * e.pose.squash) + dy;
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const c = px[y * 64 + x];
    if (!c) continue;
    const ny = rowOf(y), tall = Math.max(1, rowOf(y + 1) - ny);
    for (let t = 0; t < tall; t++) block(ox + (x + look.dx) * K, oy + (ny + t) * K, K, c);
  }
  // The mark: above its head, at the back, kept on the screen (beside the head if it must be)
  if (look.mark) {
    const mx = Math.max(4, Math.min(w - 8 * MARK_PX - 4, ox + (right - 2) * K)), my = Math.max(4, oy + (top + dy) * K - 8 * MARK_PX - 4);
    look.mark.rows.forEach((r, ry) => [...r].forEach((ch, rx) => {
      if (ch !== ".") block(mx + rx * MARK_PX, my + ry * MARK_PX, MARK_PX, ch === "o" ? [255, 255, 255] : look.mark!.rgb);
    }));
  }
  return encodeRgb(w, h, rgb);
}

// A PNG of RGB rows: eight bits, no filter, Node's zlib (the board decodes it with ESPHome's online_image)
function chunk(type: string, data: Buffer) {
  const head = Buffer.alloc(8); head.writeUInt32BE(data.length); head.write(type, 4, "latin1");
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(new Uint8Array(Buffer.concat([head.subarray(4), data]))) >>> 0);
  return Buffer.concat([head, data, crc]);
}
export function encodeRgb(w: number, h: number, rgb: Uint8Array): Buffer {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) Buffer.from(rgb.buffer, rgb.byteOffset + y * w * 3, w * 3).copy(raw, y * (w * 3 + 1) + 1);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })),
                        chunk("IEND", Buffer.alloc(0))]);
}

// The face's revision: it changes when anything drawn would -- another daemon, new routines painting its streaks, its
// expression, its den, or this file's drawing (FACE_DRAWING, bumped by hand when the pictures change)
const FACE_DRAWING = 1;
export function faceRev(parts: { artKey?: string | null; expression?: string | null; den?: Den | null; mouth?: unknown }): string {
  return createHash("sha1").update(JSON.stringify([FACE_DRAWING, parts.artKey ?? null, parts.expression ?? null, parts.den ?? null, parts.mouth ?? null]))
    .digest("hex").slice(0, 10);
}
