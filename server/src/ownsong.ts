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
  summons?: Record<string, [number, (number | null)[]]>;  // C-419 (3): T-598's openings -- [its key wheel, pitch classes]
}
export const SONGS = songsJson as unknown as Songs;

export const TRAINS_A_DAY = 3, TRAIN_DAYS = 14;

// C-419 (3), DAEMONS T-598 (the user, 2026-11-18: "if you select to play your musical instrument in freestyle mode, if u
// select the right key and play a daemons song it should be recognized, I imagine it would summon that daemon -- but it
// shouldnt be a way to catch it ... he should read you a special quotation"): PLAY FREELY listens, as the game's PLAY
// does (src/daemon_song.c DaemonSong_Listen), for what was played to END with a daemon's OPENING -- the first notes of its
// own part, lengthened where two would be confused (DAEMONS tools/gensongs.py: songs.json's summons) -- octave-blind, on
// its key's wheel (a minor song on its relative major's). A note the wheel cannot play (null) is any note. Only a daemon
// the INDEX has seen comes; the openings are unique, so a match on one not yet seen is nothing. DRAFT, every note.
export type Summon = { species: number; name: string; wheel: number; notes: (number | null)[] };
export const SUMMON_MAX = 16;                             // the notes PLAY listens back over, as the game's ring
export function summonsFor(seen: Iterable<number>): Summon[] {
  const ok = new Set(seen), out: Summon[] = [];
  for (const [id, [wheel, notes]] of Object.entries(SONGS.summons ?? {}))
    if (ok.has(Number(id))) out.push({ species: Number(id), name: SONGS.parts[id]?.name ?? "", wheel, notes });
  return out;
}
/** The daemon whose opening ends what was played (MIDI notes, oldest first) on this key wheel (0 C .. 11 B), or null. */
export function summonHeard(wheel: number, played: number[], from: Summon[]): Summon | null {
  const ring = played.slice(-SUMMON_MAX).map((m) => ((m % 12) + 12) % 12);
  for (const s of from) {
    if (s.wheel !== wheel || s.notes.length > ring.length) continue;
    const tail = ring.slice(-s.notes.length);
    if (s.notes.every((n, i) => n === null || n === tail[i])) return s;
  }
  return null;
}           // the user's pick: about two weeks, three TRAINs a day

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

/**
 * C-479 (the user, 2026-11-22, of the watch: "the daemon tries to play its song but based on its exp it only gets some
 * notes right ... music notes come from him ... if some of it was wrong u would see the green binary back propagation
 * flow back into him"): a lesson as a board plays it -- each note as it was sung (a note not yet learned is one of its
 * static's candidates, so it may be wrong), how long, whether it was right, and the colour of the pitch sung; then the
 * groups carried back. Small enough for a watch over Bluetooth.
 */
export interface BoardSong { bpm: number; before: number; after: number; gain: number; counted: boolean; perfect: boolean;
                             ready: boolean; notes: [number, number, number, number][]; bits: string[] }
export function boardSong(l: Lesson, pick: () => number = Math.random): BoardSong | null {
  if (!l.part) return null;
  const msOf = (beats: number) => Math.round((beats * 60000) / Math.max(30, l.part!.bpm || 96));
  const notes = heardAt(l.part, l.before).map(({ midi, beats, sure, candidates }): [number, number, number, number] => {
    const sung = sure >= 1 ? midi : candidates[Math.floor(pick() * candidates.length)] ?? midi;
    return [sung, msOf(beats), sung === midi ? 1 : 0, parseInt((noteColours(sung)[0] ?? "#888888").slice(1), 16)];
  });
  const r2 = (x: number) => Math.round(x * 100) / 100;
  return { bpm: l.part.bpm, before: r2(l.before), after: r2(l.after), gain: l.gain, counted: l.counted, perfect: l.perfect,
           ready: l.ready, notes, bits: l.adjusted.map((a) => a.bits) };
}

/** A note's colours as SYNESTHESIA draws it: one for a white key, the two either side for a black key. */
export const noteColours = (midi: number): string[] => SONGS.colours[String(((midi % 12) + 12) % 12)] ?? ["#888888"];
export const BINARY = () => SONGS.binary;

// C-419 (DAEMONS T-600's staff; the user, 2026-11-18: "so the visual pattern can also teach you the key"): A PART ON A
// STAFF -- its clef, its type's key signature, and each note spelt in that key on its line or space. Notation, not sound:
// the app draws it (app/ui/staff.tsx), for the INDEX and the daemon's own page. Every word DRAFT.
const LETTERS = "CDEFGAB", NATURAL = [0, 2, 4, 5, 7, 9, 11];
const pc = (m: number) => ((m % 12) + 12) % 12;
/** A key's place on the circle of fifths, from its name: sharps plus, flats minus (F-sharp major 6, E-flat minor -6). */
export function fifthsOf(key: string): number {
  const m = key.match(/^([A-G])(-sharp|-flat)? (major|minor)$/);
  if (!m) return 0;
  const major: Record<string, number> = { C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, F: -1 };
  const minor: Record<string, number> = { A: 0, E: 1, B: 2, F: -4, C: -3, G: -2, D: -1 };
  return (m[3] === "major" ? major : minor)[m[1]] + (m[2] === "-sharp" ? 7 : m[2] === "-flat" ? -7 : 0);
}
export interface KeySignature { fifths: number; accidental: -1 | 0 | 1; letters: string[]; pcs: number[] }
/** A key's signature: its sharps (F C G D A E B) or flats (B E A D G C F) in the order they are written. */
export function keySignature(key: string): KeySignature {
  const fifths = fifthsOf(key), accidental = (Math.sign(fifths) || 0) as -1 | 0 | 1;
  const letters = (fifths > 0 ? "FCGDAEB" : "BEADGCF").slice(0, Math.abs(fifths)).split("");
  return { fifths, accidental, letters, pcs: letters.map((l) => pc(NATURAL[LETTERS.indexOf(l)] + accidental)) };
}
/**
 * A note spelt in a key: its letter and accidental as the key has it (E-sharp in F-sharp major, C-flat in E-flat minor),
 * a note off the key (CORRUPT's bent one) raised from below in a sharp key and lowered from above in a flat one. `step`
 * is its line or space, seven to an octave, middle C 28; `shown` is the accidental written beside it, null where the key
 * signature already says it.
 */
export interface Spelt { letter: string; accidental: -1 | 0 | 1; step: number; shown: -1 | 0 | 1 | null }
export function spell(midi: number, sig: KeySignature): Spelt {
  const inKey = (l: string) => (sig.letters.includes(l) ? sig.accidental : 0);
  let letter = LETTERS.split("").find((l) => pc(NATURAL[LETTERS.indexOf(l)] + inKey(l)) === pc(midi));
  let accidental: -1 | 0 | 1 = letter ? inKey(letter) : 0;
  if (!letter) {
    if (NATURAL.includes(pc(midi))) letter = LETTERS[NATURAL.indexOf(pc(midi))];       // the key altered it: a natural
    else { accidental = sig.accidental < 0 ? -1 : 1; letter = LETTERS[NATURAL.indexOf(pc(midi - accidental))]; }
  }
  const natural = midi - accidental;
  return { letter, accidental, step: (Math.floor(natural / 12) - 1) * 7 + LETTERS.indexOf(letter),
           shown: accidental === inKey(letter) ? null : accidental };
}

export type Clef = "treble" | "bass";
/** Each clef's bottom line as a step: E above middle C on the treble, G two octaves below on the bass. */
export const BOTTOM: Record<Clef, number> = { treble: 30, bass: 18 };
// where each sharp and flat of a signature is written, counted up from the treble's bottom line (the bass's are two lower)
const SIG_AT: Record<string, number[]> = { "1": [8, 5, 9, 6, 3, 7, 4], "-1": [4, 7, 3, 6, 2, 5, 1] };
export const signatureSteps = (sig: KeySignature, clef: Clef) =>
  (SIG_AT[String(sig.accidental)] ?? []).slice(0, sig.letters.length).map((r) => r - (clef === "bass" ? 2 : 0));
/** How many ledger lines a note a number of steps above its staff's bottom line stands on or beyond. */
export const ledgersAt = (r: number) => (r < 0 ? Math.floor(-r / 2) : r > 8 ? Math.floor((r - 8) / 2) : 0);

/** A part set on a staff: the clef with fewer ledger lines (the treble when even), each note spelt and placed. */
export interface Placed { midi: number; beats: number; at: number; bar: number; r: number; shown: -1 | 0 | 1 | null }
export interface Staffed { clef: Clef; sig: KeySignature; sigSteps: number[]; notes: Placed[] }
export const BEATS_A_BAR = 4;
export function staffOf(part: SongPart): Staffed {
  const sig = keySignature(part.key);
  const spelt = part.notes.map(([m]) => spell(m, sig));
  const cost = (c: Clef) => spelt.reduce((n, s) => n + ledgersAt(s.step - BOTTOM[c]), 0);
  const clef: Clef = cost("bass") < cost("treble") ? "bass" : "treble";
  let t = 0;
  const notes = part.notes.map(([midi, beats], i) => {
    const p = { midi, beats, at: t, bar: Math.floor(t / BEATS_A_BAR + 1e-9), r: spelt[i].step - BOTTOM[clef], shown: spelt[i].shown };
    t += beats;
    return p;
  });
  return { clef, sig, sigSteps: signatureSteps(sig, clef), notes };
}
