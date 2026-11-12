// C-351, C-353: small pixel sprites drawn from rows of characters -- the tuning fork, the singing bowl and its patterns --
// in the game's own way, a palette and a grid. Each row is laid as runs (one view per run of one colour), so a bowl of
// a thousand cells is a couple of hundred views. Every sprite here DRAFT.
import { memo } from "react";
import { XStack, YStack } from "tamagui";

type RGB = [number, number, number];
const hex = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;
const css = (c: RGB) => "#" + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
/** a colour mixed toward another: t 0 is a, 1 is b */
export const mix = (a: string, b: string, t: number) => css(hex(a).map((v, i) => v + (hex(b)[i] - v) * t) as RGB);
export const PAPER = "#fbfaf6", NIGHT = "#111317";

/** rows of characters, each a key into `palette` -- or, for a blend, one palette per column; "." is nothing */
export const PixelSprite = memo(function PixelSprite({ rows, palette, cell }: { rows: string[]; palette: Record<string, string> | Record<string, string>[]; cell: number }) {
  const at = (x: number, ch: string) => ch === "." ? "transparent" : (Array.isArray(palette) ? palette[Math.min(x, palette.length - 1)] : palette)[ch] ?? "transparent";
  return (
    <YStack aria-hidden>
      {rows.map((row, y) => {
        const runs: [string, number][] = [];
        [...row].forEach((ch, x) => { const c = at(x, ch), last = runs[runs.length - 1]; if (last && last[0] === c) last[1] += 1; else runs.push([c, 1]); });
        return (
          <XStack key={y} height={cell}>
            {/* a pixel taller than its row, under the next: a scaled or turned sprite shows no seams between rows */}
            {runs.map(([c, n], i) => <YStack key={i} width={n * cell} height={cell + 1} marginBottom={-1} backgroundColor={c} />)}
          </XStack>
        );
      })}
    </YStack>
  );
});

// C-351: the tuning fork -- two tines, the yoke, the stem and its foot; a light edge on the left of each tine
const FORK = [
  ".ab.ab.",
  ".ab.ab.",
  ".ab.ab.",
  ".ab.ab.",
  ".ab.ab.",
  ".ab.ab.",
  ".abbab.",
  "..aab..",
  "...a...",
  "...a...",
  "...a...",
  "...b...",
  "..aab..",
  "..abb..",
];
export function TuningFork({ cell = 2, colour }: { cell?: number; colour: string }) {
  return <PixelSprite rows={FORK} cell={cell} palette={{ a: mix(colour, PAPER, 0.35), b: colour }} />;
}

// C-351: the seven chakras' signs, five by five -- the root's square, the sacral's crescent, the solar plexus's falling
// triangle, the heart's star, the throat's circle, the third eye, the crown -- and the virtue over its shadow: a light
// above the line, its shadow hollow below
export const CHAKRA_GLYPHS: Record<string, string[]> = {
  Root: ["#####", "#...#", "#.#.#", "#...#", "#####"],
  Sacral: ["..##.", ".#...", "#....", ".#...", "..##."],
  "Solar Plexus": ["#####", "#...#", ".#.#.", ".#.#.", "..#.."],
  Heart: ["..#..", "#####", ".#.#.", "#####", "..#.."],
  Throat: [".###.", "#...#", "#.#.#", "#...#", ".###."],
  "Third Eye": [".....", ".###.", "#.#.#", ".###.", "....."],
  Crown: ["#.#.#", "#.#.#", "#####", "#####", "....."],
};
export const CHAKRA_ORDER = ["Root", "Sacral", "Solar Plexus", "Heart", "Throat", "Third Eye", "Crown"];
const VIRTUE_OVER_SHADOW = ["..L..", ".LLL.", "..L..", "#####", ".S.S.", "..S..", "....."];

/**
 * The singing bowl, as rows: a rim seen from a little above (its mouth dark inside), the body narrowing to its foot, a
 * band round its shoulder of the seven chakras' signs, and the virtue-over-shadow sign on its belly. Keys: r rim light,
 * R rim, m the mouth (M its depth), b body, h its highlight, s its shade, p a pattern, P the lit pattern (the day's own chakra), L the
 * virtue, S the shadow, f the foot, c the cushion.
 */
export function bowlRows(lit: string[], w = 46): string[] {
  const rows: string[] = [];
  const cx = (w - 1) / 2, rx = w / 2 - 1;
  const put = (row: string[], x: number, ch: string) => { if (x >= 0 && x < w) row[x] = ch; };
  // the rim: an ellipse 7 rows deep -- its far lip a light line, the mouth dark inside, the near lip thick and lit
  const RIM = 7;
  for (let y = 0; y < RIM; y++) {
    const row = Array(w).fill(".");
    const dy = ((y - (RIM - 1) / 2) / ((RIM - 1) / 2)) * 0.8;        // flattened, so its ends are lips and not points
    const half = rx * Math.sqrt(Math.max(0, 1 - dy * dy));
    const inner = (rx - 2.5) * Math.sqrt(Math.max(0, 1 - ((y - (RIM - 1) / 2 + 0.8) / ((RIM - 1) / 2 - 0.4)) ** 2));
    for (let x = 0; x < w; x++) {
      const d = Math.abs(x - cx);
      if (d > half + 0.5) continue;
      put(row, x, y >= RIM - 2 ? "R" : d < inner && y > 0 ? (d < inner * 0.55 && y < RIM - 3 ? "M" : "m") : "r");
    }
    rows.push(row.join(""));
  }
  // the body: from the rim's width down to the foot's, rounded
  const BODY = 16;
  for (let y = 0; y < BODY; y++) {
    const row = Array(w).fill(".");
    const t = y / (BODY - 1);
    const half = rx * Math.sqrt(Math.max(0, 1 - t * t * 0.78));
    for (let x = 0; x < w; x++) {
      const d = x - cx;
      if (Math.abs(d) <= half) put(row, x, d < -half + 3 && y < BODY - 3 ? "h" : d > half - 4 ? "s" : "b");
    }
    rows.push(row.join(""));
  }
  // the band of signs on the shoulder (rows 2..6 of the body), the day's own lit
  const band = CHAKRA_ORDER.length, glyphW = 5, gap = 1, bw = band * (glyphW + gap) - gap, x0 = Math.round(cx - bw / 2);
  CHAKRA_ORDER.forEach((name, i) => CHAKRA_GLYPHS[name].forEach((g, gy) => {
    const r = rows[RIM + 2 + gy].split("");
    [...g].forEach((ch, gx) => { const x = x0 + i * (glyphW + gap) + gx; if (ch === "#" && r[x] !== ".") r[x] = lit.includes(name) ? "P" : "p"; });
    rows[RIM + 2 + gy] = r.join("");
  }));
  // the virtue over its shadow, on the belly
  VIRTUE_OVER_SHADOW.forEach((g, gy) => {
    const r = rows[RIM + 8 + gy].split("");
    [...g].forEach((ch, gx) => { const x = Math.round(cx - 2) + gx; if (ch !== ".") r[x] = ch === "#" ? "p" : ch; });
    rows[RIM + 8 + gy] = r.join("");
  });
  // the foot and the cushion it sits on
  const foot = Array(w).fill("."); for (let x = Math.round(cx - 7); x <= Math.round(cx + 7); x++) foot[x] = "f";
  rows.push(foot.join(""));
  for (let y = 0; y < 3; y++) {
    const row = Array(w).fill("."), half = 12 + y * 2 - (y === 2 ? 3 : 0);
    for (let x = Math.round(cx - half); x <= Math.round(cx + half); x++) row[x] = "c";
    rows.push(row.join(""));
  }
  return rows;
}

/** The bowl's colours: one palette from one colour, or one per column blending left to right through several (a month
 *  that leans on two days) -- in steps of four columns, as a sprite would be shaded */
export function bowlPalettes(colours: string[], dark: boolean, w = 46): Record<string, string> | Record<string, string>[] {
  if (colours.length < 2) return bowlPalette(colours[0], dark);
  return Array.from({ length: w }, (_, x) => {
    const t = Math.round((x / (w - 1)) * (w / 4)) / (w / 4);
    return bowlPalette(mix(colours[0], colours[1], t), dark);
  });
}

export function bowlPalette(colour: string, dark: boolean) {
  const lift = dark ? 0.12 : 0;
  return {
    r: mix(colour, PAPER, 0.55), R: mix(colour, PAPER, 0.3), m: mix(colour, NIGHT, 0.62), M: mix(colour, NIGHT, 0.78),
    b: mix(colour, PAPER, lift), h: mix(colour, PAPER, 0.4), s: mix(colour, NIGHT, 0.3),
    p: mix(colour, PAPER, 0.13 + lift), P: mix(colour, PAPER, 0.5), L: mix(colour, PAPER, 0.75), S: mix(colour, NIGHT, 0.45),
    f: mix(colour, NIGHT, 0.5), c: mix("#7a2e3a", NIGHT, dark ? 0.35 : 0.1),
  };
}
