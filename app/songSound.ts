import { Platform } from "react-native";
import { wav } from "./squareWave";
// C-156: a SONGBOOK song played -- its notes as the game plays them when it is HEARD (C4 middle C), each held for its
// frames (60 a second; 15, and 40 for the last, until DAEMONS exports a song's own), on the same square wave. On the
// phone a file in the cache; on the site a data URI, as the web has no files.
const LETTER: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const midiOf = (n: string) => {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(n);
  return m ? 12 * (Number(m[3]) + 1) + LETTER[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0) : null;
};
export function songSound(name: string, notes: string[], frames?: number[] | null): string {
  const tune: [number, number][] = notes.map((n, i) => [midiOf(n) ?? 60, Math.round(((frames?.[i] ?? (i === notes.length - 1 ? 40 : 15)) * 1000) / 60)]);
  const bytes = wav(tune, 0);
  if (Platform.OS === "web") {                        // the site
    let bin = ""; for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return `data:audio/wav;base64,${btoa(bin)}`;
  }
  const { File, Paths }: typeof import("expo-file-system") = require("expo-file-system");
  const f = new File(Paths.cache, `song-${name.replace(/[^A-Za-z0-9]/g, "_")}-${tune.length}.wav`);
  if (!f.exists) { f.create(); f.write(bytes); }
  return f.uri;
}
