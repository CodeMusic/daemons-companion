// C-160 (the user, 2026-10-18: "the sounds it plays should reflect the note of the day (as the key)... phone should have same
// sounds as game/device, all should be in sync"): any of the boards' tunes, from server/data/tunes.json (written from
// firmware/common/tunes.h by firmware/common/tunes.py -- never a copy of our own), on the day's note, on the square wave
// they play. A file in the cache on the phone; a data URI on the site.
import { Platform } from "react-native";
import { wav } from "./squareWave";

const TUNES: { tunes: Record<string, [number, number][]>; wakeBase: number } = require("../server/data/tunes.json");
const NAMES = "C D EF G A B";                            // tunes.h's dayRoot: Sunday C ... Saturday B, above middle C
export const dayRoot = (note?: string | null) => { const i = NAMES.indexOf(note || "C"); return 72 + (i < 0 ? 0 : i); };
export const WAKE_BASE = TUNES.wakeBase;
export const tuneNotes = (name: string) => TUNES.tunes[name] ?? null;

export function tuneSound(name: string, root: number, level = 1): string | null {
  const notes = TUNES.tunes[name];
  if (!notes) return null;
  const bytes = wav(notes, root, level);
  if (Platform.OS === "web") {
    let bin = ""; for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return `data:audio/wav;base64,${btoa(bin)}`;
  }
  const { File, Paths }: typeof import("expo-file-system") = require("expo-file-system");
  const f = new File(Paths.cache, `tune-${name}-${root}-${Math.round(level * 100)}.wav`);
  if (!f.exists) { f.create(); f.write(bytes); }
  return f.uri;
}
