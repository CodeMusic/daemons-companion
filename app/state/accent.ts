// C-349 (the user, 2026-11-12): THE ACCENTS -- a place's palette from the game over the day's colour, unlocked as the save
// reaches it. IN STEP WITH THE GAME (the top choice and the default) wears where the save was last made; a place picked by
// hand wears that one; OFF wears the day's colour alone. The day's colour always keeps the daily signal (TODAY's day card,
// the calendar, the header's rule): "that daily signal is important". Like LIGHT and DARK (look.ts) each phone or browser
// keeps its own, since each is looked at on its own.
// C-355: the hemisphere a month's season turns by -- the edition's (CONTENT north, CONTEXT south), or set by hand.
import * as SecureStore from "expo-secure-store";
import { useEffect, useState } from "react";
import { KEEP, ON_PHONE, api } from "../platform/net";
import { useFresh } from "../platform/useApi";
import { ACCENT_PLACES, accentTheme, type AccentColours } from "../tamagui.config";

export type AccentMode = "sync" | "off" | { place: string };
export type HemisphereSetting = "edition" | "north" | "south";

export let ACCENT: AccentMode = "sync";
export let HEMISPHERE: HemisphereSetting = "edition";
export const accentHeard = new Set<() => void>();

const KEYS = { accent: ["accent", "daemons-accent"], hemisphere: ["hemisphere", "daemons-hemisphere"] } as const;

const asAccent = (v: string | null | undefined): AccentMode =>
  v === "off" ? "off" : v && v.startsWith("place:") && ACCENT_PLACES[v.slice(6)] ? { place: v.slice(6) } : "sync";
const accentText = (m: AccentMode) => (typeof m === "string" ? m : `place:${m.place}`);
const asHemisphere = (v: string | null | undefined): HemisphereSetting => (v === "north" || v === "south" ? v : "edition");

async function read(k: readonly [string, string]) {
  try { return ON_PHONE ? await SecureStore.getItemAsync(k[0], KEEP) : globalThis.localStorage?.getItem(k[1]) ?? null; }
  catch { return null; }
}
function write(k: readonly [string, string], v: string) {
  try {
    if (ON_PHONE) SecureStore.setItemAsync(k[0], v, KEEP).catch(() => {});
    else globalThis.localStorage?.setItem(k[1], v);
  } catch { /* kept for this visit only */ }
}

export async function loadAccent() {
  ACCENT = asAccent(await read(KEYS.accent));
  HEMISPHERE = asHemisphere(await read(KEYS.hemisphere));
  accentHeard.forEach((f) => f());
}

export function setAccent(m: AccentMode) { ACCENT = m; write(KEYS.accent, accentText(m)); accentHeard.forEach((f) => f()); }
export function setHemisphere(h: HemisphereSetting) { HEMISPHERE = h; write(KEYS.hemisphere, h); accentHeard.forEach((f) => f()); }

export const sameAccent = (a: AccentMode, b: AccentMode) => accentText(a) === accentText(b);

/** Redraws on any change to the accent or the hemisphere. */
export function useAccentSetting() {
  const [, bump] = useState(0);
  useEffect(() => { const f = () => bump((n) => n + 1); accentHeard.add(f); return () => { accentHeard.delete(f); }; }, []);
  return { mode: ACCENT, hemisphere: HEMISPHERE };
}

export type Unlocked = { here: string | null; unlocked: string[] };

/** The places this save has unlocked and where it was saved (server accents.ts); null before it answers or with no save. */
export function useUnlocked(): Unlocked | null {
  const [u, setU] = useState<Unlocked | null>(null);
  const fresh = useFresh();
  useEffect(() => { api<Unlocked>("/api/accents").then(setU).catch(() => {}); }, [fresh]);
  return u;
}

export type Worn = { place: string; colours: AccentColours; theme: string } | null;

/** The accent the app wears now: in step, where the save was made; by hand, the place picked if it is unlocked. */
export function wornAccent(mode: AccentMode, u: Unlocked | null): Worn {
  if (mode === "off" || !u) return null;
  const place = mode === "sync" ? u.here : u.unlocked.includes(mode.place) ? mode.place : null;
  const colours = place ? ACCENT_PLACES[place] : undefined;
  return place && colours ? { place, colours, theme: accentTheme(colours.main) } : null;
}
