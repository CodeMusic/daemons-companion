// C-18: a party daemon as the game draws it. DAEMONS exports each daemon's front sprite in its type palette as an
// indexed PNG (data/art/), with the four streak slots, palette 11..14, left the game's blank grey. Here they are painted
// as the game paints them for THIS daemon: slot k takes the colour of its k-th routine's type on its body
// (data/streaks.json, the game's own table), and an empty slot takes the body's mid tone. Only the PNG's palette chunk
// changes, so no image library is needed.
import { crc32, inflateSync } from "node:zlib";
import streaksJson from "../data/streaks.json" with { type: "json" };
import movesJson from "../data/moves.json" with { type: "json" };
import routinesJson from "../data/routines.json" with { type: "json" };

const STREAKS = streaksJson as { colours: (number[] | null)[][]; blank: number[]; first_index: number; body_mid_index: number };
const MOVE_TYPE = movesJson as Record<string, number>;
const ROUTINES = routinesJson as { types: string[]; moves: Record<string, string> };

export function streakColours(palette: number[][], bodyType: number | null, moves: number[]): number[][] {
  return moves.map((m) => {
    if (!m) return palette[STREAKS.body_mid_index];
    const t = MOVE_TYPE[String(m)];
    if (bodyType == null || t == null) return STREAKS.blank;
    return STREAKS.colours[bodyType][t] ?? STREAKS.blank;
  });
}

// C-68: a daemon's routines as GAME ROUTINES shows them -- each one's name, its type, and the colour its streak takes on
// this daemon's body (the colour the handheld's ring lights), as #rrggbb.
export function gameRoutines(bodyType: number | null, moves: number[]) {
  return moves.filter(Boolean).map((m) => {
    const t = MOVE_TYPE[String(m)];
    const rgb = t == null ? STREAKS.blank : (STREAKS.colours[bodyType ?? t]?.[t] ?? STREAKS.colours[t]?.[t] ?? STREAKS.blank);
    return { name: ROUTINES.moves[String(m)] ?? "?", type: t == null ? "" : ROUTINES.types[t],
             colour: "#" + rgb.map((c) => c.toString(16).padStart(2, "0")).join("") };
  });
}

// Rewrite an indexed PNG's palette entries first..first+n-1; every other byte is left as it was.
export function repaint(png: Buffer, colourAt: (palette: number[][]) => number[][], first = STREAKS.first_index): Buffer {
  const out = Buffer.from(png);
  let at = 8;
  while (at < out.length) {
    const len = out.readUInt32BE(at), type = out.toString("latin1", at + 4, at + 8);
    if (type === "PLTE") {
      const data = out.subarray(at + 8, at + 8 + len);
      const palette: number[][] = [];
      for (let i = 0; i + 2 < len; i += 3) palette.push([data[i], data[i + 1], data[i + 2]]);
      colourAt(palette).forEach((c, k) => {
        const i = (first + k) * 3;
        if (i + 2 < len) [data[i], data[i + 1], data[i + 2]] = c;
      });
      out.writeUInt32BE(crc32(out.subarray(at + 4, at + 8 + len)) >>> 0, at + 8 + len);
      return out;
    }
    at += 12 + len;
  }
  return out;
}

// C-36: the art a device draws. An ESP32 has no PNG decoder worth its flash, and the GBA's own form is the small one:
// sixteen colours and four bits a pixel. So the indexed PNG is decoded here (zlib and the five scanline filters, no
// image library) and sent as `palette` (RGB565, index 0 transparent, as the game's is) and `pixels` (two to a byte, the
// left one in the high nibble), base64. 64x64 is 2 KB.
export function decodeIndexedPng(png: Buffer): { w: number; h: number; palette: number[][]; px: Uint8Array } {
  let at = 8, w = 0, h = 0, depth = 8, palette: number[][] = [];
  const idat: Buffer[] = [];
  while (at < png.length) {
    const len = png.readUInt32BE(at), type = png.toString("latin1", at + 4, at + 8), data = png.subarray(at + 8, at + 8 + len);
    if (type === "IHDR") {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8];
      if (data[9] !== 3 || data[12] !== 0) throw new Error("only indexed, non-interlaced PNGs");
    } else if (type === "PLTE") {
      for (let i = 0; i + 2 < len; i += 3) palette.push([data[i], data[i + 1], data[i + 2]]);
    } else if (type === "IDAT") idat.push(Buffer.from(data));
    else if (type === "IEND") break;
    at += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = Math.ceil((w * depth) / 8), bpp = Math.max(1, depth / 8);
  const rows = new Uint8Array(stride * h);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? rows[y * stride + x - bpp] : 0, b = y ? rows[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y ? rows[(y - 1) * stride + x - bpp] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const pred = f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : f === 4 ? (pa <= pb && pa <= pc ? a : pb <= pc ? b : c) : 0;
      rows[y * stride + x] = (src[x] + pred) & 255;
    }
  }
  const px = new Uint8Array(w * h), mask = (1 << depth) - 1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const bit = x * depth;
      px[y * w + x] = (rows[y * stride + (bit >> 3)] >> (8 - depth - (bit & 7))) & mask;
    }
  return { w, h, palette, px };
}

export const rgb565 = ([r, g, b]: number[]) => ((r & 0xf8) << 8) | ((g & 0xfc) << 3) | (b >> 3);

export function deviceArt(png: Buffer) {
  const { w, h, palette, px } = decodeIndexedPng(png);
  if (px.some((i) => i > 15)) throw new Error("more than sixteen colours");   // the PLTE may be padded past 16
  const packed = Buffer.alloc((w * h) >> 1);
  for (let i = 0; i < w * h; i += 2) packed[i >> 1] = (px[i] << 4) | px[i + 1];
  return { w, h, palette: palette.slice(0, 16).map(rgb565), pixels: packed.toString("base64") };
}
