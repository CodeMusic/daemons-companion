// C-18: a party daemon as the game draws it. DAEMONS exports each daemon's front sprite in its type palette as an
// indexed PNG (data/art/), with the four streak slots, palette 11..14, left the game's blank grey. Here they are painted
// as the game paints them for THIS daemon: slot k takes the colour of its k-th routine's type on its body
// (data/streaks.json, the game's own table), and an empty slot takes the body's mid tone. Only the PNG's palette chunk
// changes, so no image library is needed.
import { crc32 } from "node:zlib";
import streaksJson from "../data/streaks.json" with { type: "json" };
import movesJson from "../data/moves.json" with { type: "json" };

const STREAKS = streaksJson as { colours: (number[] | null)[][]; blank: number[]; first_index: number; body_mid_index: number };
const MOVE_TYPE = movesJson as Record<string, number>;

export function streakColours(palette: number[][], bodyType: number | null, moves: number[]): number[][] {
  return moves.map((m) => {
    if (!m) return palette[STREAKS.body_mid_index];
    const t = MOVE_TYPE[String(m)];
    if (bodyType == null || t == null) return STREAKS.blank;
    return STREAKS.colours[bodyType][t] ?? STREAKS.blank;
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
