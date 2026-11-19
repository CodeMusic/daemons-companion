// C-290: this file runs on the phone too (C-111) -- the app imports it, directly or through another file -- so keep it free of Node-only APIs (node:*, fs).
// C-418 (DAEMONS T-594, vision 9.36; the user, 2026-11-18): A DAEMON'S OWN SONG -- how much of it a daemon knows, and
// what a TRAIN teaches it. MIND: the song's notes and when each is learned are DAEMONS' (tools/gensongs.py, exported as
// data/songs.json); this file only reads a daemon's experience into them. The sound is the app's (app/sound/ownSong.ts).
//
// - A daemon's SONG is its line's PARTS, one a form, oldest first. The parts before its own it knows perfectly; its own
//   it learns between two levels -- the level its form begins at and the level it evolves at (or matures, a final form)
//   -- by its EXPERIENCE between them, so a battle in the game and a TRAIN here teach it alike.
// - Each note of a part is learned at its own share of the way. Before that it is STATIC (the user, by multiple choice:
//   "static closing on the note" -- and then, in their words, "a lot of agreeing potential notes are the static and
//   gradually the noise is removed until just the daemon's song note is revealed"): a cloud of CANDIDATE notes in the
//   key, the furthest leaving first, over the last WINDOW of the way.
// - A TRAIN sings the part it is learning (the user's pick) and teaches it: about two weeks of three TRAINs a day takes a
//   part from nothing to perfect (the user's pick); a TRAIN past the day's three still sings, and teaches nothing. A part
//   that is perfect learns no more here -- it is time to take it home and SING (C-418: it evolves in the game, unless it
//   is AT HOME here too, evolve.ts).
// Every word DRAFT.
import songsJson from "../data/songs.json" with { type: "json" };
import { expFor } from "./save/growth.js";

export type SongNote = [number, number, number];          // MIDI note, beats, the share of its part it is learned at
export interface SongPart {
  name: string; stage: number; type: string; key: string; tonic: number; minor: boolean; bpm: number;
  from: number; to: number; notes: SongNote[]; bass: [number, number][];
}
interface Songs {
  window: number; static: { candidates: number[]; floor: number }; colours: Record<string, string[]>; binary: string;
  keys: Record<string, { tonic: number; minor: boolean; name: string; why: string }>;
  parts: Record<string, SongPart>; songs: Record<string, string[]>;
}
export const SONGS = songsJson as unknown as Songs;

export const TRAINS_A_DAY = 3, TRAIN_DAYS = 14;           // the user's pick: about two weeks, three TRAINs a day

/** A species' song: its line's parts, oldest first (none for a species with no song). */
export const songOf = (species: number | string): SongPart[] =>
  (SONGS.songs[String(species)] ?? []).map((f) => SONGS.parts[f]).filter(Boolean);

const clamp = (x: number) => Math.max(0, Math.min(1, x));
/** How much of a part a daemon of this growth curve with this much experience knows: 0 nothing, 1 perfect. */
export function shareOf(part: SongPart, exp: number, growth: number): number {
  const a = expFor(growth, part.from), b = expFor(growth, part.to);
  return b > a ? clamp((exp - a) / (b - a)) : exp >= b ? 1 : 0;
}
/** Every part's share: the earlier parts perfect, its own as its experience says. */
export const learnedOf = (species: number, exp: number, growth: number): number[] =>
  songOf(species).map((p, i, all) => (i < all.length - 1 ? 1 : shareOf(p, exp, growth)));

/** One note as it is sung at a share: learned (sure 1), or static -- its candidates, nearest the note first. */
export interface Heard { midi: number; beats: number; at: number; sure: number; candidates: number[] }
export function heardAt(part: SongPart, share: number): Heard[] {
  const scale = part.minor ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11];
  const inKey = (m: number) => scale.includes((((m - part.tonic) % 12) + 12) % 12);
  // k steps along the key from a note (a note off the key, CORRUPT's bent one, steps from the key note below it)
  const step = (m: number, k: number) => {
    let n = m;
    while (!inKey(n)) n--;
    for (let i = 0; i < Math.abs(k); i++) { n += Math.sign(k); while (!inKey(n)) n += Math.sign(k); }
    return n;
  };
  const w = SONGS.window, cands = SONGS.static.candidates;
  return part.notes.map(([midi, beats, at]) => {
    if (share >= at) return { midi, beats, at, sure: 1, candidates: [midi] };
    const near = clamp((share - (at - w)) / w);
    const keep = Math.round(cands.length * (1 - near));     // the furthest candidates leave first
    return { midi, beats, at, sure: near, candidates: [midi, ...cands.slice(0, keep).map((k) => step(midi, k))] };
  });
}

/** What a part has to be taught by TRAIN: its experience from beginning to perfect, over two weeks of three a day. */
export function trainGain(part: SongPart, growth: number): number {
  return Math.max(1, Math.ceil((expFor(growth, part.to) - expFor(growth, part.from)) / (TRAINS_A_DAY * TRAIN_DAYS)));
}

/**
 * One TRAIN's lesson: the experience it gives (none past the day's three, none once the part is perfect, never past
 * perfect), and each note it moved -- the error carried back, a group of binary for each (the user: "groups of 1's and
 * 0's will return back into the daemon, which each group represents an adjustment to the played song's notes"). A
 * note's group is its place in the part and how far it moved, eight bits.
 */
export interface Adjusted { note: number; from: number; to: number; bits: string }
export interface Lesson { part: SongPart | null; stage: number; before: number; after: number; gain: number; counted: boolean;
                          adjusted: Adjusted[]; perfect: boolean; ready: boolean }
export function lesson(species: number, exp: number, growth: number, trainsToday: number, evolves: boolean): Lesson {
  const song = songOf(species), part = song[song.length - 1] ?? null;
  if (!part) return { part: null, stage: 0, before: 0, after: 0, gain: 0, counted: false, adjusted: [], perfect: false, ready: false };
  const before = shareOf(part, exp, growth);
  const counted = trainsToday < TRAINS_A_DAY && before < 1;
  const cap = expFor(growth, part.to);
  const gain = counted ? Math.max(0, Math.min(trainGain(part, growth), cap - exp)) : 0;
  const after = shareOf(part, exp + gain, growth);
  const was = heardAt(part, before), now = heardAt(part, after);
  const adjusted = now.flatMap((n, i) => (n.sure > was[i].sure ? [{
    note: i, from: was[i].sure, to: n.sure,
    bits: (i & 15).toString(2).padStart(4, "0") + " " + Math.min(15, Math.round((n.sure - was[i].sure) * 15) || 1).toString(2).padStart(4, "0"),
  }] : []));
  return { part, stage: song.length, before, after, gain, counted, adjusted, perfect: after >= 1, ready: after >= 1 && evolves };
}

/** A note's colours as SYNESTHESIA draws it: one for a white key, the two either side for a black key. */
export const noteColours = (midi: number): string[] => SONGS.colours[String(((midi % 12) + 12) % 12)] ?? ["#888888"];
export const BINARY = () => SONGS.binary;
