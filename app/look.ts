// The look: LIGHT, DARK or AUTO, and the day's palette (C-144, C-90; C-157: out of App.tsx).
import * as SecureStore from "expo-secure-store";
import { Appearance } from "react-native";
import { useThemeName } from "tamagui";
import { KEEP,ON_PHONE } from "./net";
 // C-90: which palette the day wears -- the site's (the default) or the rainbow week -- from the companion's settings,
// so the site, the phone and every device agree. Changing it redraws the whole app.
export let PALETTE: "checkpoint" | "rainbow" = "checkpoint";

export const paletteHeard = new Set<() => void>();

export function setPalette(p: unknown) {
  const next = p === "rainbow" ? "rainbow" : "checkpoint";
  if (next !== PALETTE) { PALETTE = next; paletteHeard.forEach((f) => f()); }
}

// C-144 (the user, 2026-10-16): LIGHT, DARK or AUTO -- AUTO, the default, as the phone or the computer is set. Unlike the
// palette it is not the companion's: each keeps its own (the phone in its secure storage, the site in this browser),
// since each is looked at in its own light.
export type Look = "auto" | "light" | "dark";

export let LOOK: Look = "auto";

export const lookHeard = new Set<() => void>();

export const asLook = (v: unknown): Look => (v === "light" || v === "dark" ? v : "auto");

export async function loadLook() {
  try { LOOK = asLook(ON_PHONE ? await SecureStore.getItemAsync("look", KEEP) : globalThis.localStorage?.getItem("daemons-look")); }
  catch { /* AUTO */ }
  wearLook();
}

export function setLook(l: Look) {
  LOOK = l; wearLook(); lookHeard.forEach((f) => f());
  try {
    if (ON_PHONE) SecureStore.setItemAsync("look", l, KEEP).catch(() => {});
    else globalThis.localStorage?.setItem("daemons-look", l);
  } catch { /* kept for this visit only */ }
}

// The phone's own pieces -- the keyboard, the share sheet, the status bar -- wear it too
export function wearLook() { if (ON_PHONE) Appearance.setColorScheme(LOOK === "auto" ? "unspecified" : LOOK); }

export const useDark = () => useThemeName().startsWith("dark");
