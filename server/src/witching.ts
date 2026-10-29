// C-236 (the user, 2026-10-29: "at the witching hour if you happen to wake up at that time and check the Damons ...
// something very unique ... and maybe a routine or skill they have that they do not otherwise have it only shows up
// during that time"; by multiple choice): from 3:00 to 4:00 in the morning, on the device's own clock, the carried
// daemon wears a thin purple shimmer -- the book's purple, faint, flickering, as if the seam were thin -- and casts no
// shadow; and it has a routine of its own, named for its first type, that shows only in the hour. One set of names with
// the game's (DAEMONS T-480): twelve letters at most, a move's width. The watches keep the same table (intuition.cpp).
// Every word DRAFT. No node: imports (the app reads it too).
export const WITCHING = { from: 3, to: 4 };                         // the hour, on the device's clock

export const WITCHING_NAMES: Record<string, string> = {             // DRAFT
  VECTOR: "NIGHT COURSE", ENTROPY: "EMBER HOUR", GROWTH: "DARK ROOTS", CONTENT: "BLANK PAGE", LOGIC: "LAST PROOF",
  SWARM: "QUIET HIVE", CORRUPT: "BITROT MOON", SIGNAL: "DEAD AIR", STRATUM: "UNDERLAYER", FLOW: "UNDERTOW",
  CONTEXT: "THIN SEAM", LATENT: "WHAT SLEEPS", LEGACY: "OLD GHOSTS", HARDENED: "NIGHT WATCH", FROZEN: "BLACK ICE",
  OPAQUE: "VEIL", EMERGENT: "BEFORE DAWN", ORACLE: "SECOND SIGHT",
};
// its tune: a slow fall from the day's note, then a half step that does not belong, then lower (semitones, ms; 127 a rest)
export const WITCHING_TUNE: [number, number][] = [[0, 600], [-3, 600], [-7, 600], [-12, 700], [-11, 900], [127, 250], [-15, 1300]];

export const witchingNow = (d = new Date()) => d.getHours() >= WITCHING.from && d.getHours() < WITCHING.to;
// named for its first type ("FLOW / CONTEXT", or ["FLOW", "CONTEXT"])
export function witchingRoutine(types: string | string[]): string {
  const first = (Array.isArray(types) ? types[0] ?? "" : types.split(/[\s/,]+/)[0] ?? "").toUpperCase();
  return WITCHING_NAMES[first] ?? WITCHING_NAMES.CONTEXT;
}
export const witchingLine = (name: string, routine: string) => `${name} did ${routine}. It does not, by day.`;   // DRAFT
