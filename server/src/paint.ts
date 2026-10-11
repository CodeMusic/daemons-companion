// C-18: a party daemon as the game draws it. DAEMONS exports each daemon's front sprite in its type palette as an
// indexed PNG (data/art/), with the four streak slots, palette 11..14, left the game's blank grey. Here they are painted
// as the game paints them for THIS daemon: slot k takes the colour of its k-th routine's type on its body
// (data/streaks.json, the game's own table), and an empty slot takes the body's mid tone. Only the PNG's palette chunk
// changes, so no image library is needed -- and no Node either (C-111: a phone hosting on its own paints them too).
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
export function repaint(png: Uint8Array, colourAt: (palette: number[][]) => number[][], first = STREAKS.first_index): Uint8Array {
  const out = new Uint8Array(png);
  const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
  let at = 8;
  while (at < out.length) {
    const len = view.getUint32(at), type = String.fromCharCode(...out.subarray(at + 4, at + 8));
    if (type === "PLTE") {
      const data = out.subarray(at + 8, at + 8 + len);
      const palette: number[][] = [];
      for (let i = 0; i + 2 < len; i += 3) palette.push([data[i], data[i + 1], data[i + 2]]);
      colourAt(palette).forEach((c, k) => {
        const i = (first + k) * 3;
        if (i + 2 < len) [data[i], data[i + 1], data[i + 2]] = c;
      });
      view.setUint32(at + 8 + len, crc32(out.subarray(at + 4, at + 8 + len)));
      return out;
    }
    at += 12 + len;
  }
  return out;
}


// The PNG chunk checksum (CRC-32, as zlib's), so a repainted palette chunk stays valid
const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
