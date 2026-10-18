// C-149: the holiday a date keeps in an edition -- DAEMONS T-416's table by its real names (data/holidays.json), with
// how a board dresses for it. CONTENT keeps the COMMON and the NORTHERN ones, CONTEXT the COMMON and the SOUTHERN; on a
// day with two, the edition's own shows (T-416's open Q2, its first answer). A QUIET day is named and left undressed.
import holidaysJson from "../data/holidays.json" with { type: "json" };
import seasonsJson from "../data/seasons.json" with { type: "json" };
import type { Edition, Season } from "./seasons.js";

type Rule = { kind: "fixed"; month: number; day: number } | { kind: "nth_weekday"; month: number; n: number; weekday: number }
          | { kind: "easter"; offset: number } | { kind: "table"; dates: Record<string, string> }
          | { kind: "season_start"; season: Season };
interface Row { name: string; edition: "both" | Edition; rule: Rule; days: number; quiet?: boolean; look?: string;
                colours?: string[]; hat?: string; flip?: boolean; steps_off?: string }
export interface Holiday { name: string; quiet: boolean; look: string; colours: string[]; hat: string; flip: boolean }

const ROWS = (holidaysJson as unknown as { holidays: Row[] }).holidays;
const ORDER = seasonsJson.order as Season[];
const STARTS = seasonsJson.north_starts as Record<Season, { month: number; day: number }>;
const HEMISPHERE = seasonsJson.edition_hemisphere as Record<Edition, "north" | "south">;

const dayNumber = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d) / 86400000;

// Easter Sunday, the Gregorian computus (the anonymous algorithm): its month and day
export function easter(y: number): { month: number; day: number } {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  return { month: Math.floor((h + l - 7 * m + 114) / 31), day: ((h + l - 7 * m + 114) % 31) + 1 };
}

// the day number a rule starts on in year y, or null where the rule names no day that year (a table it runs past)
function start(rule: Rule, y: number, edition: Edition): number | null {
  switch (rule.kind) {
    case "fixed": return dayNumber(y, rule.month, rule.day);
    case "nth_weekday": {
      const first = new Date(Date.UTC(y, rule.month - 1, 1)).getUTCDay();
      return dayNumber(y, rule.month, 1 + ((rule.weekday - first + 7) % 7) + 7 * (rule.n - 1));
    }
    case "easter": { const e = easter(y); return dayNumber(y, e.month, e.day) + rule.offset; }
    case "table": {
      const md = rule.dates[String(y)];
      return md ? dayNumber(y, Number(md.slice(0, 2)), Number(md.slice(3, 5))) : null;
    }
    case "season_start": {   // the southern year is the northern one two seasons on: its season starts on that one's day
      const north = HEMISPHERE[edition] === "south" ? ORDER[(ORDER.indexOf(rule.season) + 2) % 4] : rule.season;
      return dayNumber(y, STARTS[north].month, STARTS[north].day);
    }
  }
}

export function holiday(edition: Edition, date: Date): Holiday | null {
  const y = date.getFullYear(), today = dayNumber(y, date.getMonth() + 1, date.getDate());   // the LOCAL date
  const covers = (r: Row) => {
    const s = start(r.rule, y, edition);
    return s !== null && today >= s && today < s + r.days;
  };
  const mine = ROWS.filter((r) => (r.edition === "both" || r.edition === edition) && covers(r));
  // T-416 (the user, 2026-10-18): a holiday that steps off another is not on that one's day -- the day is the other's,
  // and this one goes on around it inside its own span (in CONTEXT, Science Week off Youth Day, so both are seen)
  const on = mine.filter((r) => !r.steps_off || !mine.some((o) => o.name === r.steps_off));
  const r = on.find((x) => x.edition === edition) ?? on[0];
  if (!r) return null;
  return { name: r.name, quiet: !!r.quiet, look: r.quiet ? "none" : r.look ?? "none", colours: r.quiet ? [] : r.colours ?? [],
           hat: r.quiet ? "none" : r.hat ?? "none", flip: !!r.flip };
}
