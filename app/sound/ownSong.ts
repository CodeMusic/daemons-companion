// C-418 (DAEMONS T-594; the user, 2026-11-18): a daemon's own song as it knows its part, on the save's own instrument
// (the harp for CONTENT, the flute for CONTEXT, tuneSound.ts). A note it has learned is sung clear; one it has not is
// STATIC -- the user: "a lot of agreeing potential notes are the static and gradually the noise is removed until just
// the daemon's song note is revealed" -- its candidates in the key at once, the true one louder the surer it is, over a
// hiss that fades as it closes (server/src/damagotchi/ownsong.ts says which; DAEMONS tools/gensongs.py renders its previews the same
// way). Under it, softly, the part's bass: the CONTEXT it is heard over. Every sound DRAFT.
import { heardAt, SONGS, type SongPart } from "../../server/src/damagotchi/ownsong";
import { mixWav, type Hiss, type Voicing } from "./instrument";
import { asUri, voiceNow } from "./tuneSound";

export const partMs = (part: SongPart) => (part.notes.reduce((n, [, b]) => n + b, 0) * 60000) / part.bpm;

// a candidate's breath of lateness, the same every time for the same note
const lag = (i: number, k: number) => ((i * 7 + k * 13) % 9) * 4;

// one part, as sung at `share`, laid into the notes and hiss from `t0` (ms)
function voicePart(part: SongPart, share: number, t0: number, notes: Voicing[], hiss: Hiss[]) {
  const beat = 60000 / part.bpm;
  let t = t0;
  heardAt(part, share).forEach((n, i) => {
    const ms = n.beats * beat * 0.95;
    if (n.sure >= 1) notes.push({ midi: n.midi, at: t, ms, vel: 0.8 });
    else {
      const w = 0.25 + 0.75 * n.sure, others = n.candidates.slice(1);
      notes.push({ midi: n.midi, at: t, ms, vel: 0.7 * w });
      others.forEach((c, k) => notes.push({ midi: c, at: t + lag(i, k), ms: Math.max(40, ms - lag(i, k)),
                                            vel: (0.7 * (1 - w) * 2.2) / Math.max(1, others.length) }));
      hiss.push({ at: t, ms, level: SONGS.static.floor * (1 - n.sure) ** 2 });
    }
    t += n.beats * beat;
  });
  t = t0;
  for (const [midi, beats] of part.bass) {                // the context: quiet until the tune is known
    notes.push({ midi, at: t, ms: beats * beat * 0.9, vel: 0.22 + 0.25 * share });
    t += beats * beat;
  }
}

/** The part as sung at `share` (0..1 of it learned), as a sound to play -- null until the instrument has loaded. */
export function ownSongUri(part: SongPart, share: number, level = 1): string | null {
  const v = voiceNow();
  if (!v) return null;
  const notes: Voicing[] = [], hiss: Hiss[] = [];
  voicePart(part, share, 0, notes, hiss);
  const bytes = mixWav(notes, hiss, v.pcm, v.ins, level);
  return asUri(bytes, `ownsong-${v.name}-${part.name}-${Math.round(share * 1000)}-${Math.round(level * 100)}`);
}

// C-419 (DAEMONS T-595: the INDEX's SONG): a whole SONG -- its line's parts, oldest first, each at its own share (the
// earlier parts whole), a breath between them, as the game's INDEX sings it
export const PART_GAP_MS = 700;
/** When each part of a song begins, and when each of its notes does (ms from the start), and how long it all is. */
export function songTimes(parts: SongPart[]): { starts: number[]; notes: number[][]; ms: number } {
  const starts: number[] = [], notes: number[][] = [];
  let t = 0;
  for (const p of parts) {
    const beat = 60000 / p.bpm;
    let u = t;
    starts.push(t);
    notes.push(p.notes.map(([, b]) => { const at = u; u += b * beat; return at; }));
    t += partMs(p) + PART_GAP_MS;
  }
  return { starts, notes, ms: Math.max(0, t - PART_GAP_MS) };
}
/** The song as a sound: each part at its share in `shares` (1, whole, where one is missing) -- null until the instrument has loaded. */
export function songUri(parts: SongPart[], shares: number[], level = 1): string | null {
  const v = voiceNow();
  if (!v || !parts.length) return null;
  const notes: Voicing[] = [], hiss: Hiss[] = [], { starts } = songTimes(parts);
  parts.forEach((p, i) => voicePart(p, shares[i] ?? 1, starts[i], notes, hiss));
  const bytes = mixWav(notes, hiss, v.pcm, v.ins, level);
  const id = parts.map((p, i) => `${p.name}${Math.round((shares[i] ?? 1) * 1000)}`).join("-");
  return asUri(bytes, `song-${v.name}-${id}-${Math.round(level * 100)}`);
}
