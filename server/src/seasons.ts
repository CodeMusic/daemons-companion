// C-14: the season an edition keeps on a date -- the same rule as DAEMONS tools/seasons.py (vision 9.21), read from
// the exported data/seasons.json so the two can never disagree. CONTENT keeps the northern year, CONTEXT the southern.
import seasonsJson from "../data/seasons.json" with { type: "json" };

export type Edition = "CONTENT" | "CONTEXT";
export type Season = "winter" | "spring" | "summer" | "autumn";

const ORDER = seasonsJson.order as Season[];
const STARTS = seasonsJson.north_starts as Record<Season, { month: number; day: number }>;
const HEMISPHERE = seasonsJson.edition_hemisphere as Record<Edition, "north" | "south">;

const before = (m: number, d: number, s: { month: number; day: number }) => m < s.month || (m === s.month && d < s.day);

export function northSeason(month: number, day: number): Season {
  if (!before(month, day, STARTS.winter) || before(month, day, STARTS.spring)) return "winter";
  if (before(month, day, STARTS.summer)) return "spring";
  if (before(month, day, STARTS.autumn)) return "summer";
  return "autumn";
}

export function season(edition: Edition, date: Date): Season {
  const s = northSeason(date.getMonth() + 1, date.getDate());
  return HEMISPHERE[edition] === "south" ? ORDER[(ORDER.indexOf(s) + 2) % 4] : s;
}
