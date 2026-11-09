// C-309 (the user, 2026-11-09: "sometimes while in the library, the system refreshes and it brings me out of a
// book-section, and sometimes even out of the whole book ... ensure that the library's architecture is a stable
// structure"): where the reader is, kept outside the screens. A background sync draws the page again from nothing
// (App.tsx keys the page's ScrollView by `fresh`), and a screen's own useState went with it -- the book shut, the
// chapter lost. A place is kept here instead, by name ("library.book", "library.guide.at"), so a page drawn again
// opens where it was; and on this device (a file on the phone, the browser's storage on the site), so the app opened
// again does too. Tapping the open tab again forgets that tab's places (forgetPlaces), as it always went back to the
// shelf. Only the reader's place -- never anything the companion or the save holds.
import { useState } from "react";
import { Platform } from "react-native";
import { Directory, File, Paths } from "expo-file-system";

type Places = Record<string, unknown>;
let places: Places | null = null;
let writing: ReturnType<typeof setTimeout> | null = null;
const KEY = "daemons.places";
const file = () => new File(new Directory(Paths.document, "library"), "place.json");

function all(): Places {
  if (places) return places;
  places = {};
  try {
    if (Platform.OS === "web") places = JSON.parse(globalThis.localStorage?.getItem(KEY) ?? "{}") ?? {};
    else if (file().exists) places = JSON.parse(file().textSync()) ?? {};
  } catch { places = {}; }
  return places!;
}
function keep() {
  if (writing) clearTimeout(writing);
  writing = setTimeout(() => {                 // a page turned writes once, not once per tap
    writing = null;
    const text = JSON.stringify(all());
    try {
      if (Platform.OS === "web") { globalThis.localStorage?.setItem(KEY, text); return; }
      const d = new Directory(Paths.document, "library");
      if (!d.exists) d.create();
      const f = file();
      if (!f.exists) f.create();
      f.write(text);
    } catch { /* kept for this run only */ }
  }, 300);
}

export const placeOf = <T,>(key: string, start: T): T => (key in all() ? (all()[key] as T) : start);
export function setPlace<T>(key: string, v: T) {
  if (v === null || v === undefined) delete all()[key]; else all()[key] = v;
  keep();
}
// every place under a name ("library" forgets the open book and every page in every book)
export function forgetPlaces(prefix: string) {
  const p = all();
  let gone = false;
  for (const k of Object.keys(p)) if (k === prefix || k.startsWith(`${prefix}.`)) { delete p[k]; gone = true; }
  if (gone) keep();
}

// useState that outlives the screen: the same value when the page is drawn again, or the app opened again
export function usePlace<T>(key: string, start: T): [T, (v: T | ((was: T) => T)) => void] {
  const [v, setV] = useState<T>(() => placeOf(key, start));
  const set = (next: T | ((was: T) => T)) => setV((was) => {
    const now = typeof next === "function" ? (next as (w: T) => T)(was) : next;
    setPlace(key, now);
    return now;
  });
  return [v, set];
}

// C-309: how far down the page was scrolled, per tab, so a page drawn again by a sync comes back to the same line
const scrolled: Record<string, number> = {};
export const scrolledTo = (tab: string) => scrolled[tab] ?? 0;
export const keepScroll = (tab: string, y: number) => { scrolled[tab] = y; };
export const forgetScroll = (tab: string) => { delete scrolled[tab]; };
