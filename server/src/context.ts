// C-158 (the user, 2026-10-18): the world the companion's devices live in, and the CASINO's luck in it. "we have
// weather, time of day, holidays, seasons (w/ edition mods: north vs south hemisphere seasons).... we could fetch real
// weather/seasons/time-of-day/holidays via the server to devices... this would affect the casino (maybe visually, maybe
// odds) and this information should adjust which daemons you see on the spindles". Devices and the phone follow the REAL
// world (the user's choice): the clock here, the holidays and seasons by the save's edition, and the weather of a city
// set on the site (weather.ts fetches it; kept here as "weather.now"). The game's casino follows the game's world (T-422).
// Nothing here may import Node: a phone hosting alone runs it too.
import speciesJson from "../data/species.json" with { type: "json" };
import casinoArt from "../data/casino_art.json" with { type: "json" };
import type { Store } from "./store.js";
import type { Edition, Season } from "./seasons.js";
import type { Holiday } from "./holidays.js";
import { RETURN_AT } from "./slots.js";

const SPECIES = speciesJson as unknown as Record<string, { name: string; national?: number;
  native?: { seasons?: string[] | null; hours?: string[] | null } | null }>;

// the game's own watches (engineGba src/daemons_time.c, WatchFromHour), so a device and the game agree what hour it is
export type Watch = "DAWN" | "DAY" | "DUSK" | "NIGHT";
export function watchOf(date: Date): Watch {
  const h = date.getHours();
  return h >= 5 && h < 7 ? "DAWN" : h >= 7 && h < 18 ? "DAY" : h >= 18 && h < 20 ? "DUSK" : "NIGHT";
}

// the weather, as weather.ts keeps it: its kind (WMO's codes, gathered), the temperature, the city, and when
export type Sky = "clear" | "cloudy" | "fog" | "rain" | "snow" | "storm";
export interface Weather { kind: Sky; code: number; tempC: number; city: string; at: string }
export function skyOf(code: number): Sky {
  if (code === 0 || code === 1) return "clear";
  if (code === 2 || code === 3) return "cloudy";
  if (code === 45 || code === 48) return "fog";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if (code >= 95) return "storm";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  return "cloudy";
}
// the weather kept, if it is fresh enough to tell (three hours)
export function weatherNow(store: Store, now = new Date()): Weather | null {
  try {
    const w = JSON.parse(store.getSetting("weather.now") ?? "null") as Weather | null;
    return w && now.getTime() - Date.parse(w.at) < 3 * 3600000 ? w : null;
  } catch { return null; }
}

export interface Reason { source: string; effect: number; why: string }   // effect: the luck it adds, -1..+1
// The day's luck at the CASINO, and every part of it in words. Small steps, a little either way -- a holiday's the most:
// St Patrick's is luck itself. Every word DRAFT.
export function casinoContext(edition: Edition, date: Date, season: Season, holiday: Holiday | null, weather: Weather | null) {
  const reasons: Reason[] = [];
  if (holiday && !holiday.quiet) {
    if (/St Patrick/i.test(holiday.name)) reasons.push({ source: "holiday", effect: 1, why: `${holiday.name}: the luck of the day` });
    else reasons.push({ source: "holiday", effect: 0.3, why: `${holiday.name}: a festive table` });
  } else if (holiday?.quiet) reasons.push({ source: "holiday", effect: 0, why: `${holiday.name}: a quiet day, the table left as it is` });
  if (weather) {
    const w: Record<Sky, [number, string]> = {
      clear: [0.2, "clear skies"], cloudy: [0, "a grey sky"], fog: [-0.1, "fog: hard to see the reels"],
      rain: [-0.2, "rain on the windows"], snow: [0.2, "snow outside: a warm table"], storm: [-0.4, "a storm: the house leans in"] };
    const [effect, why] = w[weather.kind];
    reasons.push({ source: "weather", effect, why: `${why} in ${weather.city}` });
  }
  const watch = watchOf(date);
  const t: Record<Watch, [number, string]> = { DAWN: [0.1, "dawn: an early bird"], DAY: [0, "the day"], DUSK: [0.1, "dusk: the golden hour"],
                                              NIGHT: [-0.2, "late at night: the house keeps its edge"] };
  reasons.push({ source: "time", effect: t[watch][0], why: t[watch][1] });
  const s: Record<Season, [number, string]> = { spring: [0.1, "spring: things growing"], summer: [0.1, "summer: long days"],
                                               autumn: [0, "autumn"], winter: [-0.1, "winter: the nights draw in"] };
  reasons.push({ source: "season", effect: s[season][0], why: `${s[season][1]} (${edition}'s year)` });
  const luck = Math.max(-1, Math.min(1, reasons.reduce((n, r) => n + r.effect, 0)));
  return { luck: Math.round(luck * 100) / 100, rtp: Math.round(RETURN_AT(luck) * 1000) / 1000, watch, reasons };
}

// The daemons on the reels besides the one carried: only ones the save has SEEN (the user: "only daemons on the
// spindles that you have seen in the game, so as u play you see new ones in the casino"), those at home in this season
// or this hour first, then the party's, then the rest -- and among equals a choice that turns each hour.
export function reelSpecies(seen: number[], carried: number | null, party: number[], season: Season, watch: Watch, date: Date, n = 3): number[] {
  const hour = Math.floor(date.getTime() / 3600000);
  const score = (sp: number) => {
    const nat = SPECIES[String(sp)]?.native;
    let s = 0;
    if (nat?.seasons?.includes(season.toUpperCase())) s += 4;
    if (nat?.hours?.includes(watch)) s += 4;
    if (party.includes(sp)) s += 2;
    return s + (((sp * 2654435761 + hour * 40503) >>> 0) % 1000) / 1000;   // the hour's turn among equals
  };
  return seen.filter((sp) => sp !== carried && SPECIES[String(sp)]).sort((a, b) => score(b) - score(a)).slice(0, n);
}

// What THE CASINO is dressed for, decided once for every screen (the phone session, 2026-10-18: the boards' casino.cpp
// lookNow, colourA, colourB and hat() had been copied to the phone and the Tab5): the holiday's look, else the weather's
// when it is weather to notice (a clear night, its stars), else the season's own; the holiday's two colours, else the
// season's (casino_art.json's, which casino_art.py ports from casino.cpp); the holiday's hat, never on a quiet day or one
// turned upside down. Colours as "#rrggbb", as the holidays have them; "none" for no hat.
export interface Dress { look: string; colours: [string, string]; hat: string }
const SEASON_COLOURS = casinoArt.season as Record<Season, [string, string]>;
export function casinoDress(season: Season, holiday: Holiday | null, weather: Weather | null, watch: Watch): Dress {
  const dressed = !!holiday?.name && !holiday.quiet, sky = weather?.kind;
  const look = dressed && holiday!.look !== "none" ? holiday!.look
    : sky === "rain" || sky === "storm" || sky === "fog" || sky === "snow" ? sky
    : sky === "clear" && watch === "NIGHT" ? "stars"
    : season === "winter" ? "snow" : season === "spring" ? "petals" : season === "summer" ? "sun" : "leaves";
  const [a, b] = SEASON_COLOURS[season] ?? SEASON_COLOURS.autumn;
  return { look, colours: [(dressed && holiday!.colours[0]) || a, (dressed && holiday!.colours[1]) || b],
           hat: dressed && !holiday!.flip && holiday!.hat ? holiday!.hat : "none" };
}
