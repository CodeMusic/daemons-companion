// C-18 / C-36: a daemon's art -- painted for this daemon (paint.ts, which a phone runs too) and, for a board, decoded to
// the GBA's own four bits a pixel.
import { inflateSync } from "node:zlib";
import { gameRoutines, repaint as paint, streakColours } from "./paint.js";

export { gameRoutines, streakColours };
export const repaint = (png: Buffer, colourAt: (palette: number[][]) => number[][], first?: number): Buffer =>
  Buffer.from(paint(png, colourAt, first));

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
