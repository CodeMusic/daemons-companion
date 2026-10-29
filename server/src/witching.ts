// C-236 (the user, 2026-10-29: "at the witching hour if you happen to wake up at that time and check the Damons ...
// something very unique ... and maybe a routine or skill they have that they do not otherwise have it only shows up
// during that time"; by multiple choice): from 3:00 to 4:00 in the morning, on the device's own clock, the carried
// daemon wears a thin purple shimmer -- the book's purple, faint, flickering, as if the seam were thin -- and casts no
// shadow; and it has a routine of its own, named for its first type, that shows only in the hour. One set of names with
// the game's (DAEMONS T-480): twelve letters at most, a move's width. The watches keep the same table (intuition.cpp).
// Every word DRAFT. No node: imports (the app reads it too).
import hermeticJson from "../data/hermetic.json" with { type: "json" };

export const WITCHING = { from: 3, to: 4 };                         // the hour, on the device's clock

export const WITCHING_NAMES: Record<string, string> = {             // DRAFT
  VECTOR: "NIGHT COURSE", ENTROPY: "EMBER HOUR", GROWTH: "DARK ROOTS", CONTENT: "BLANK PAGE", LOGIC: "LAST PROOF",
  SWARM: "QUIET HIVE", CORRUPT: "BITROT MOON", SIGNAL: "DEAD AIR", STRATUM: "UNDERLAYER", FLOW: "UNDERCURRENT",
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

// C-237 (the user, 2026-10-29): every pulse -- the app, the watches, the game (DAEMONS T-482) -- breathes red<->blue
// through purple: CONTENT's red and CONTEXT's blue made one, the middle THE SUBTLE LAYER's own purple. One breath is
// eight seconds and its phase is the clock's (ms since midnight on the device), so a phone, a watch and a GBA side by
// side breathe together. Emerald is the tablet's ink and never in the breath: inscriptions, the hour's pie, its count.
export const PULSE = { red: "#C8405A", purple: "#B0569E", blue: "#4F6BD8", breathMs: 8000 };
export const EMERALD = { hue: "#1F8F5F", lit: "#50C878", deep: "#0E402B" };
const rgbOf = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const hexOf = (c: number[]) => "#" + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("").toUpperCase();
// 0 red, 0.5 the book's purple, 1 blue -- a three-stop blend, so the middle is the purple and not a muddy mean
export function pulseOf(s: number, bright = 1): string {
  const [a, b, k] = s < 0.5 ? [PULSE.red, PULSE.purple, s * 2] : [PULSE.purple, PULSE.blue, (s - 0.5) * 2];
  const x = rgbOf(a), y = rgbOf(b);
  return hexOf(x.map((v, i) => (v + (y[i] - v) * k) * bright));
}
export const breathOf = (d = new Date()) => {
  const ms = ((d.getHours() * 60 + d.getMinutes()) * 60 + d.getSeconds()) * 1000 + d.getMilliseconds();
  return (1 - Math.cos((2 * Math.PI * ms) / PULSE.breathMs)) / 2;
};
export const pulseNow = (bright = 1, d = new Date()) => pulseOf(breathOf(d), bright);

// the hour's count: how much of it has gone (0..1, the pie, filled widdershins from twelve), the minutes left, the date
export const hourGone = (d = new Date()) => Math.min(1, Math.max(0, (d.getMinutes() * 60 + d.getSeconds()) / 3600));
export const minutesLeft = (d = new Date()) => Math.max(1, Math.ceil((3600 - (d.getMinutes() * 60 + d.getSeconds())) / 60));
const DOW = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"], MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
export const hourDate = (d = new Date()) => `${DOW[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}`;

// the day's line, turned under in the hour: {shadow} under {virtue}, in the folk craft's words (the user's choice,
// 2026-10-29). Sunday first, as data/week.json is. The watches keep the same table (intuition.cpp). DRAFT.
export const HOUR_LINES: { shadow: string; virtue: string }[] = [
  { shadow: "Thrall", virtue: "Circle" },          // lust under chastity
  { shadow: "Devouring", virtue: "Measure" },      // gluttony under temperance
  { shadow: "Binding", virtue: "Offering" },       // greed under charity
  { shadow: "Slumber", virtue: "Vigil" },          // sloth under diligence
  { shadow: "Hex", virtue: "Uncrossing" },         // wrath under forgiveness
  { shadow: "Evil Eye", virtue: "Blessing" },      // envy under kindness
  { shadow: "Glamour", virtue: "Grounding" },      // pride under humility
];
export const hourLine = (d = new Date()) => { const h = HOUR_LINES[d.getDay()]; return `${h.shadow} under ${h.virtue}`; };

// AS ABOVE SO BELOW -- a touch in the hour opens it in place of CARE: THE HERMETIC LAYER's own first saying (its ABOVE
// entry's inscriptions, data/hermetic.json, DAEMONS docs/hermetic-layer.md) between the maxim and the maxim turned. The
// watches keep the same lines (intuition.cpp; test/witching.test.ts holds them to these). DRAFT
const BOOK = (hermeticJson as unknown as { sections: { entries: { short: string; paragraphs: { text: string; voice: string }[] }[] }[] }).sections;
const SAYING = BOOK.flatMap((s) => s.entries).find((e) => e.short === "ABOVE")?.paragraphs.filter((p) => p.voice === "inscription").map((p) => p.text) ?? [];
export const AS_ABOVE: string[] = ["AS ABOVE, SO BELOW.", ...SAYING, "AS BELOW, SO ABOVE."];
