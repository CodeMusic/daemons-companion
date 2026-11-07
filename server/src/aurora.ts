// C-290: this file runs on the phone too (C-111) -- the app imports it -- so keep it free of Node-only APIs (node:*, fs).
// C-305 (DAEMONS T-528, vision 4.40; the user, 2026-11-07, by multiple choice): THE AURORA. Once THE UNITY BOOK is mended
// the light hangs over the game's DAEMON TOWER every night, and away from it shows on some nights -- about one in three,
// picked from the date, so the game and the companion agree. The companion's half of part 1 is those same nights: on one,
// with the book mended, the den's night sky breathes the edition's line. Its rule is the game's to the bit (engineGba
// src/daemons_aurora.c Aurora_NightNumber and Aurora_IsLightNight, src/daemons_time.c DayNumber and ReadClock): every
// product is under 2^32, so these numbers give the cartridge's answer. The conjugate light (both lines after a trade) is
// part 2's. Every word DRAFT.

// the lines, as the GBA shows them: oxygen's red (630.0 nm) in CONTENT, its green (557.7 nm) in CONTEXT -- RGB(30, 7, 9)
// and RGB(10, 30, 15) in the game's five bits, widened as the GBA widens them
export type AuroraEdition = "CONTENT" | "CONTEXT";
export const AURORA_LINE: Record<AuroraEdition, string> = { CONTENT: "#F7394A", CONTEXT: "#52F77B" };
// how strongly each band of a sky takes the line, top band first (out of 255): red strongest at the top, green in the
// second -- the heights the two lines hang at (daemons_aurora.c sBand)
export const AURORA_BANDS: Record<AuroraEdition, number[]> = { CONTENT: [255, 160, 64, 16, 0, 0], CONTEXT: [96, 255, 160, 48, 16, 0] };
// a band's weight out of 256 as the breath goes (0..1, the creator's hour's sixteen-second breath, witching.ts goldBreathOf)
export function auroraWeight(band: number, breath: number): number {
  const b = Math.round(Math.max(0, Math.min(1, breath)) * 255);
  return Math.floor(((72 + Math.floor((b * 96) / 255)) * band) / 255);
}

// the cartridge's day number: days since 2000-01-01 (a Saturday, day 0), as a u16
export function dayNumber(year: number, month: number, day: number): number {
  const before = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  const y = (year - 2000) & 0xFFFF;
  let days = y * 365 + Math.floor((y + 3) / 4) + before[(month - 1) % 12] + day - 1;
  if (month > 2 && y % 4 === 0) days++;
  return days & 0xFFFF;
}
// the night a moment belongs to: before noon it is the evening before's (minute of the day < 720), a u16
export const nightNumber = (day: number, minute: number) => (minute < 12 * 60 ? day - 1 : day) & 0xFFFF;
// on this device's clock
export const nightOfClock = (d: Date) => nightNumber(dayNumber(d.getFullYear(), d.getMonth() + 1, d.getDate()), d.getHours() * 60 + d.getMinutes());
// a game with no clock: an hour of play is a day (T-273), so a real minute is 24 of its minutes
export const nightOfPlay = (hours: number, minutes: number, seconds: number) =>
  nightNumber(hours & 0xFFFF, minutes * 24 + Math.floor((seconds * 24) / 60));

// one night in three: two rounds of a 16-bit multiplicative hash
export function isLightNight(n: number): boolean {
  let x = ((n & 0xFFFF) * 40503) % 65536;
  x ^= x >> 7;
  x = (x * 40503) % 65536;
  return (x >> 8) % 3 === 0;
}
export const lightNight = (d = new Date()) => isLightNight(nightOfClock(d));
// the game's night watch, 20:00 to 5:00 (daemons_time.c WatchFromHour; context.ts watchOf)
export const atNight = (d = new Date()) => d.getHours() >= 20 || d.getHours() < 5;
// the den's sky takes the line: the book mended, at night, on a night of light
export const auroraShows = (mended: boolean, d = new Date()) => mended && atNight(d) && lightNight(d);
