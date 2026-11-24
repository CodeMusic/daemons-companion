// HALFTONE's two tones, as the game wears them (DAEMONS engineGba src/fieldmap.c sToneEmerald, sToneSapphire; vision
// 4.40): EMERALD SEPIA, the night half's, the tablet's green where sepia's brown would be, and SAPPHIRE SEPIA, the dawn
// half's, like a cyanotype. Each is a ramp of 32 colours, one for each brightness, and a colour in a tone is the ramp's
// colour at its brightness (DaemonsHalftoneLum: 0.3 R + 0.59 G + 0.1133 B, in eighths of 256) -- the same map the game
// lays over its palettes. C-304 (DAEMONS T-529): THE UNITY BOOK's lens reads each page in its half's tone.
import type { ReactNode } from "react";
import { View } from "react-native";

export type Tone = "emerald" | "sapphire" | null;
type C5 = [number, number, number];
const RAMP: Record<Exclude<Tone, null>, C5[]> = {
  emerald: [
    [0, 0, 0], [1, 1, 1], [1, 3, 1], [2, 4, 2], [1, 6, 2], [2, 7, 3], [3, 8, 4], [2, 10, 5],
    [3, 11, 6], [4, 12, 7], [5, 13, 8], [5, 15, 8], [5, 16, 10], [6, 17, 11], [7, 18, 12], [8, 19, 13],
    [9, 20, 14], [10, 21, 15], [11, 22, 16], [12, 23, 17], [13, 24, 18], [15, 25, 19], [17, 25, 20], [18, 26, 21],
    [19, 27, 22], [21, 28, 23], [22, 29, 24], [24, 29, 25], [25, 30, 27], [27, 31, 28], [29, 31, 29], [31, 31, 31],
  ],
  sapphire: [
    [0, 0, 1], [1, 1, 3], [1, 2, 5], [2, 3, 6], [1, 5, 8], [2, 6, 10], [2, 7, 12], [3, 8, 13],
    [3, 9, 16], [4, 10, 17], [5, 11, 18], [6, 12, 19], [7, 13, 20], [8, 14, 21], [7, 16, 22], [8, 17, 24],
    [9, 18, 25], [10, 19, 26], [11, 20, 26], [14, 20, 27], [15, 21, 28], [16, 22, 29], [17, 23, 30], [19, 24, 29],
    [20, 25, 30], [21, 26, 31], [23, 27, 30], [24, 28, 30], [25, 29, 31], [27, 30, 31], [28, 31, 31], [31, 31, 31],
  ],
};
const hex8 = (v: number) => ((v << 3) | (v >> 2)).toString(16).padStart(2, "0");
const of = ([r, g, b]: C5) => `#${hex8(r)}${hex8(g)}${hex8(b)}`.toUpperCase();
export const lum5 = (hex: string) => {
  const n = parseInt(hex.replace("#", "").slice(0, 6), 16);
  return (((n >> 16) & 255) >> 3) * 76 + (((n >> 8) & 255) >> 3) * 151 + ((n & 255) >> 3) * 29 >> 8;
};
// a colour in a tone; the brightest step is held one short of white, so a page in a tone shows it
export function toneHex(hex: string, tone: Tone): string {
  if (!tone || !/^#[0-9a-f]{6}/i.test(hex)) return hex;
  return of(RAMP[tone][Math.min(30, lum5(hex))]);
}
export function tonePalette<P extends Record<string, string>>(P: P, tone: Tone): P {
  return tone ? Object.fromEntries(Object.entries(P).map(([k, v]) => [k, toneHex(v, tone)])) as P : P;
}
// the tone's own colour, at the middle of its ramp
export const toneMid = (tone: Exclude<Tone, null>) => of(RAMP[tone][16]);

// a picture in a tone: the tone's colour laid over it in the "color" blend, which keeps the picture's brightness and
// gives it the tone's hue -- a gradient map on the GPU, as near as a view can come to the game's palette map
export function Toned({ tone, children }: { tone: Tone; children: ReactNode }) {
  if (!tone) return <>{children}</>;
  return (
    <View style={{ isolation: "isolate", position: "relative" }}>
      {children}
      <View pointerEvents="none" style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0, backgroundColor: toneMid(tone), mixBlendMode: "color" }} />
    </View>
  );
}
