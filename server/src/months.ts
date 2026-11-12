// C-290: this file runs on the phone too (C-111) -- the app imports it, directly or through another file -- so keep it free of Node-only APIs (node:*, fs).
// C-352, C-355 (the user, 2026-11-12, by multiple choice): THE MONTHS. The week is the small cycle -- seven days, each a
// virtue over its shadow, a chakra, a note and a colour (data/week.json); a month is the tone the week is practised in.
//
// THE HUE: the week's seven hues around the year -- Jan red, Feb red into orange, Mar orange, ... Nov indigo, Dec violet --
// so each month LEANS on one weekday, or two where it blends, and holds their virtues, chakras and notes (its CHORD).
// THE TONE: the feeling of the holiday both editions keep that month (data/holidays.json, C-149) -- February's Love.
// THE SEASON: what the year is doing, which flips with the hemisphere: CONTENT keeps the north, CONTEXT the south (as
// seasons.ts), with a setting to say otherwise; the south's year is the north's six months on.
// Every word here DRAFT.
import week from "../data/week.json" with { type: "json" };
import { deviceDay, type Palette } from "./days.js";

export type Hemisphere = "north" | "south";

type MonthRow = { name: string; leans: string[]; tone: string; from: string };

// month 1..12 -> the weekdays it leans on (Sunday red ... Saturday violet), its tone and the holiday it is taken from
const MONTHS: MonthRow[] = [
  { name: "January", leans: ["Sunday"], tone: "Renewal", from: "New Year's Day" },
  { name: "February", leans: ["Sunday", "Monday"], tone: "Love", from: "Valentine's Day" },
  { name: "March", leans: ["Monday"], tone: "Belonging", from: "St Patrick's Day" },
  { name: "April", leans: ["Monday", "Tuesday"], tone: "Play", from: "April Fools' Day" },
  { name: "May", leans: ["Tuesday"], tone: "Nurture", from: "Mother's Day" },
  { name: "June", leans: ["Tuesday", "Wednesday"], tone: "Guidance", from: "Father's Day" },
  { name: "July", leans: ["Wednesday"], tone: "Friendship", from: "the Day of Friendship" },
  { name: "August", leans: ["Wednesday", "Thursday"], tone: "Curiosity", from: "Youth Day" },
  { name: "September", leans: ["Thursday"], tone: "Peace", from: "the Day of Peace" },
  { name: "October", leans: ["Thursday", "Friday"], tone: "Courage", from: "Halloween" },
  // the user, 2026-11-12: November's holiday said softly -- the days of remembering, not the word for the dead
  { name: "November", leans: ["Friday"], tone: "Remembrance", from: "the days of remembering" },
  { name: "December", leans: ["Saturday"], tone: "Generosity", from: "Christmas" },
];

// the north's year, January first; the south's is six months on
const NORTH_SEASON = ["resting", "stirring", "waking", "sprouting", "blooming", "growing",
                      "ripening", "gathering", "harvesting", "releasing", "settling", "dreaming"];

const DAYS = week.days as { day: string; virtue: string; shadow: string; chakra: string; note: string; colour: string; hue: string }[];

export const hemisphereOf = (edition: string, setting?: string | null): Hemisphere =>
  setting === "north" || setting === "south" ? setting : edition === "CONTEXT" ? "south" : "north";

/** The month's whole symbol: month is 1..12. */
export function monthOf(month: number, hemisphere: Hemisphere = "north", palette: Palette = "checkpoint") {
  const m = MONTHS[(month - 1 + 12) % 12];
  const days = m.leans.map((d) => DAYS.find((x) => x.day === d)!);
  const movement = NORTH_SEASON[(month - 1 + (hemisphere === "south" ? 6 : 0)) % 12];
  return {
    month, name: m.name, short: m.name.slice(0, 3).toUpperCase(), tone: m.tone, from: m.from, movement, hemisphere,
    colours: days.map((d) => deviceDay(d.day, palette).menu),          // one, or two where the month blends
    hues: days.map((d) => d.hue),
    leans: days.map((d) => ({ day: d.day, virtue: d.virtue, shadow: d.shadow, chakra: d.chakra, note: d.note })),
    chord: days.map((d) => d.note),
    practice: `${m.tone}, ${movement}. Hold ${days.map((d) => `${d.day}'s ${d.virtue} over ${d.shadow}`).join(" and ")} all month.`,
  };
}

export type Month = ReturnType<typeof monthOf>;
