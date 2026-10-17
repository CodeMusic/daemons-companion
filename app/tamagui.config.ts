// C-20: the app's Tamagui config. The paper is one palette; each weekday is a child theme whose twelve steps are mixed
// from that day's colour -- the CHECKPOINT's trim, from the week DAEMONS exports (server/data/week.json, never typed
// twice). <Theme name="sunday"> then gives $color1 (a faint tint) through $color9 (the day's colour itself) to $color12
// (its darkest), so the whole app wears the day, as the device does.
// C-144: every theme comes light and dark -- the paper or the night -- and App.tsx picks one (LIGHT, DARK or AUTO).
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
const NIGHT: RGB = [17, 19, 23];                    // C-144: what the dark themes are mixed towards, below the ink
// How far each step sits from the day's colour: towards the paper for 1-8, towards the ink for 10-12; 9 is the colour.
const LIGHT_STEPS = [0.95, 0.9, 0.82, 0.74, 0.64, 0.52, 0.38, 0.2, 0, 0.14, 0.4, 0.66];
// C-144: dark, towards the night for 1-8 and the paper for 10-12. $color1 (the cards) sits a little above $color2 (the
// page), so a card is lifted off the night as it is off the paper; the words were set by contrast on all fourteen days
// -- $color10 at least 4.7:1 on both, $color11 8:1, $color12 12:1 (lighter than the light themes ask of them).
const DARK_STEPS = [0.86, 0.91, 0.8, 0.72, 0.62, 0.5, 0.36, 0.2, 0, 0.38, 0.62, 0.86];

function scale(name: string, colour: string, dark: boolean) {
  const c = hex(colour);
  const out: Record<string, string> = {};
  (dark ? DARK_STEPS : LIGHT_STEPS).forEach((t, i) => {
    const toward = i < 8 ? (dark ? NIGHT : PAPER) : (dark ? PAPER : INK);
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
// C-144: the night, the same five things -- the cards a little above the page, as in the day themes' dark steps.
const darkPalette = ["#1c1f24", "#16181c", "#22252b", "#2a2e35", "#33373f", "#3e434c", "#4f545e", "#6a6f79",
                     "#8a8f98", "#a9adb4", "#c9cbce", "#f1efe8"];

const themes = createV5Theme({ lightPalette, darkPalette, childrenThemes: childrenThemes as any });

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
