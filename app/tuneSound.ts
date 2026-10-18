// C-160 (the user, 2026-10-18: "the sounds it plays should reflect the note of the day (as the key)... phone should have same
// sounds as game/device, all should be in sync"): any of the boards' tunes, from server/data/tunes.json (written from
// firmware/common/tunes.h by firmware/common/tunes.py -- never a copy of our own), on the day's note, on the square wave
// they play. A file in the cache on the phone; a data URI on the site.
import { Platform } from "react-native";
import { echoWav, sampledWav, wavPcm, type Instrument } from "./instrument";
import { wav } from "./squareWave";

const TUNES: { tunes: Record<string, [number, number][]>; wakeBase: number } = require("../server/data/tunes.json");
const NAMES = "C D EF G A B";                            // tunes.h's dayRoot: Sunday C ... Saturday B, above middle C
export const dayRoot = (note?: string | null) => { const i = NAMES.indexOf(note || "C"); return 72 + (i < 0 ? 0 : i); };
export const WAKE_BASE = TUNES.wakeBase;
export const tuneNotes = (name: string) => TUNES.tunes[name] ?? null;

// C-160 (the user, 2026-10-18: "a way to turn off the sound effects"): this player's own SOUND, set in PLACES (ITS
// SETTINGS) as every board's is -- off, or the boards' volume (0..100, 60 unless set) as a level here, full from 70
type Hearing = { sound?: boolean; volume?: number } | null | undefined;
let mine: Hearing = null;
export const hearSettings = (s: Hearing) => { if (s) mine = s; };
export const soundLevel = (s: Hearing = mine) => (s?.sound === false ? 0 : Math.min(1, (s?.volume ?? 60) / 70));

// T-425: the game's own instrument for the save's edition (instrument.ts), once its samples are loaded -- until then, and
// wherever they cannot be, the boards' square wave on the same notes
let voice: { name: string; pcm: Int16Array; ins: Instrument } | null = null;
export const playWith = (v: typeof voice) => { voice = v; };
// the instrument for a save's edition -- the harp for CONTENT, the flute for CONTEXT (server/data/sounds/, DAEMONS' own,
// bundled with the app, so it plays away and hosting alone too); asked again for another edition, it changes
const SOUNDS: Record<string, Instrument & { file: string; edition: string }> = require("../server/data/sounds/instruments.json");
const WAVS: Record<string, number> = { harp: require("../server/data/sounds/harp.wav"), flute: require("../server/data/sounds/flute.wav") };
let loading = "";
export async function voiceFor(edition: string | null | undefined) {
  const name = Object.keys(WAVS).find((n) => SOUNDS[n]?.edition === edition) ?? "harp";
  if (voice?.name === name || loading === name) return;
  loading = name;
  try {
    const { Asset }: typeof import("expo-asset") = require("expo-asset");
    const a = Asset.fromModule(WAVS[name]);
    await a.downloadAsync();
    const uri = a.localUri ?? a.uri;
    const bytes = Platform.OS === "web" ? new Uint8Array(await (await fetch(uri)).arrayBuffer())
      : new Uint8Array(await new (require("expo-file-system") as typeof import("expo-file-system")).File(uri).arrayBuffer());
    const pcm = wavPcm(bytes);
    if (pcm.length) playWith({ name, pcm, ins: SOUNDS[name] });
  } catch { /* the square wave, then */ }
  finally { loading = ""; }
}
export const voiceName = () => voice?.name ?? "square";
// any tune's bytes in the voice playing now (PLAY's songs too, songSound.ts)
export const tuneWav = (notes: [number, number][], root: number, level = 1) =>
  voice ? sampledWav(notes, root, voice.pcm, voice.ins, level) : wav(notes, root, level);

// T-426: any notes as a sound to play, named `id` (a file kept in the cache on the phone, a data URI on the site) -- one
// note of PLAY, or (echo) a learned song with its echo; in the voice playing now
export function soundOf(id: string, notes: [number, number][], root = 0, level = 1, echo = false): string {
  const bytes = echo && voice ? echoWav(notes, root, voice.pcm, voice.ins, level) : tuneWav(notes, root, level);
  return asUri(bytes, `${id}-${voiceName()}${echo ? "-echo" : ""}`);
}
function asUri(bytes: Uint8Array, name: string): string {
  if (Platform.OS === "web") {
    let bin = ""; for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return `data:audio/wav;base64,${btoa(bin)}`;
  }
  const { File, Paths }: typeof import("expo-file-system") = require("expo-file-system");
  const f = new File(Paths.cache, `${name.replace(/[^A-Za-z0-9_-]/g, "_")}.wav`);
  if (!f.exists) { f.create(); f.write(bytes); }
  return f.uri;
}

export function tuneSound(name: string, root: number, level = 1): string | null {
  const notes = TUNES.tunes[name];
  if (!notes) return null;
  const bytes = tuneWav(notes, root, level);
  if (Platform.OS === "web") {
    let bin = ""; for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return `data:audio/wav;base64,${btoa(bin)}`;
  }
  const { File, Paths }: typeof import("expo-file-system") = require("expo-file-system");
  const f = new File(Paths.cache, `tune-${voiceName()}-${name}-${root}-${Math.round(level * 100)}.wav`);
  if (!f.exists) { f.create(); f.write(bytes); }
  return f.uri;
}
