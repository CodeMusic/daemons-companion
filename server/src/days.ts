// C-37, C-38, C-90: the device's colours for the day. `menu` is what a screen wears: the site's palette -- the
// CHECKPOINT's trim the week DAEMONS exports -- by default, or the rainbow week (data/palettes.json) when the palette
// setting says so (the user, 2026-10-09: one palette everywhere, the site's by default, a toggle for the other).
// `led` is always the rainbow's pure hue: the ring of lights dims it to a third, and a CHECKPOINT red reads brown on an LED.
import week from "../data/week.json" with { type: "json" };
import palettes from "../data/palettes.json" with { type: "json" };

export type Palette = "checkpoint" | "rainbow";
export const PALETTES: Palette[] = ["checkpoint", "rainbow"];
const RAINBOW = palettes.rainbow as Record<string, { menu: string; led: string }>;

export function deviceDay(day: string, palette: Palette = "checkpoint") {
  const rainbow = RAINBOW[day] ?? { menu: "#5B6B8C", led: "#4060FF" };
  const site = week.days.find((d) => d.day === day)?.colour;
  return { menu: palette === "rainbow" || !site ? rainbow.menu : site, led: rainbow.led };
}
