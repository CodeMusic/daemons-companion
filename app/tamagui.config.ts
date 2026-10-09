// C-20: the app's Tamagui config. The paper is one palette; each weekday is a child theme whose twelve steps are mixed
// from that day's colour -- the CHECKPOINT's trim, from the week DAEMONS exports (server/data/week.json, never typed
// twice). <Theme name="sunday"> then gives $color1 (a faint tint) through $color9 (the day's colour itself) to $color12
// (its darkest), so the whole app wears the day, as the device does.
import { defaultConfig } from "@tamagui/config/v5";
import { animations } from "@tamagui/config/v5-rn";
import { createSystemFont, createV5Theme } from "@tamagui/config/v5";
import { Platform } from "react-native";
import { createTamagui } from "tamagui";
import week from "../server/data/week.json";
import palettes from "../server/data/palettes.json";

type RGB = [number, number, number];
const hex = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;
const css = (c: RGB) => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
const mix = (a: RGB, b: RGB, t: number): RGB => a.map((v, i) => v + (b[i] - v) * t) as RGB;

const PAPER: RGB = [251, 250, 246];
const INK: RGB = [29, 32, 38];
// How far each step sits from the day's colour: towards the paper for 1-8, towards the ink for 10-12; 9 is the colour.
const LIGHT_STEPS = [0.95, 0.9, 0.82, 0.74, 0.64, 0.52, 0.38, 0.2, 0, 0.14, 0.4, 0.66];
const DARK_STEPS = [0.9, 0.84, 0.76, 0.68, 0.58, 0.46, 0.32, 0.16, 0, 0.2, 0.45, 0.75];

function scale(name: string, colour: string, dark: boolean) {
  const c = hex(colour);
  const out: Record<string, string> = {};
  (dark ? DARK_STEPS : LIGHT_STEPS).forEach((t, i) => {
    const toward = i < 8 ? (dark ? INK : PAPER) : (dark ? PAPER : INK);
    out[`${name}${i + 1}`] = css(mix(c, toward, t));
  });
  return out;
}

export const DAYS = week.days.map((d) => d.day.toLowerCase());
export const WEEK_COLOURS: Record<string, string> = Object.fromEntries(week.days.map((d) => [d.day.toLowerCase(), d.colour]));
// C-90: the rainbow week (the handhelds' old palette), a theme of its own for each day -- "sundayrainbow" ...
export const RAINBOW_COLOURS: Record<string, string> = Object.fromEntries(
  Object.entries(palettes.rainbow).map(([day, c]) => [day.toLowerCase(), (c as { menu: string }).menu]));
const childrenThemes = Object.fromEntries([
  ...week.days.map((d) => {
    const n = d.day.toLowerCase();
    return [n, { light: scale(n, d.colour, false), dark: scale(n, d.colour, true) }];
  }),
  ...Object.entries(RAINBOW_COLOURS).map(([n, c]) => [`${n}rainbow`, { light: scale(`${n}rainbow`, c, false), dark: scale(`${n}rainbow`, c, true) }]),
]);

// The paper, light to ink: the page, the cards, the rules between them, the quiet words, the words.
const lightPalette = ["#fbfaf6", "#f6f4ee", "#f3f1ea", "#ece9df", "#e3dfd2", "#dcd8cc", "#cfcabc", "#b3afa3",
                      "#8a8f98", "#6b7079", "#4a4e57", "#1d2026"];

const themes = createV5Theme({ lightPalette, childrenThemes: childrenThemes as any });

// The game's own voice in the app -- the eyebrows, the tabs, the buttons -- is set in a monospace face: $mono.
const mono = createSystemFont({
  font: { family: Platform.select({ web: "ui-monospace, Menlo, monospace", default: "Menlo" }) },
});

export const config = createTamagui({
  ...defaultConfig,
  animations,
  themes,
  fonts: { ...defaultConfig.fonts, mono },
  // Plain style names and values, so the code reads without Tamagui's shorthand table to hand.
  settings: { ...defaultConfig.settings, onlyAllowShorthands: false, allowedStyleValues: false },
});

export default config;
export type AppConfig = typeof config;
declare module "tamagui" {
  interface TamaguiCustomConfig extends AppConfig {}
}
