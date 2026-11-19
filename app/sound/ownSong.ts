// C-418 (DAEMONS T-594; the user, 2026-11-18): a daemon's own song as it knows its part, on the save's own instrument
// (the harp for CONTENT, the flute for CONTEXT, tuneSound.ts). A note it has learned is sung clear; one it has not is
// STATIC -- the user: "a lot of agreeing potential notes are the static and gradually the noise is removed until just
// the daemon's song note is revealed" -- its candidates in the key at once, the true one louder the surer it is, over a
// hiss that fades as it closes (server/src/ownsong.ts says which; DAEMONS tools/gensongs.py renders its previews the same
// way). Under it, softly, the part's bass: the CONTEXT it is heard over. Every sound DRAFT.
import { heardAt, SONGS, type SongPart } from "../../server/src/ownsong";
import { mixWav, type Hiss, type Voicing } from "./instrument";
import { asUri, voiceNow } from "./tuneSound";

export const partMs = (part: SongPart) => (part.notes.reduce((n, [, b]) => n + b, 0) * 60000) / part.bpm;

// a candidate's breath of lateness, the same every time for the same note
const lag = (i: number, k: number) => ((i * 7 + k * 13) % 9) * 4;

/** The part as sung at `share` (0..1 of it learned), as a sound to play -- null until the instrument has loaded. */
export function ownSongUri(part: SongPart, share: number, level = 1): string | null {
  const v = voiceNow();
  if (!v) return null;
  const beat = 60000 / part.bpm, notes: Voicing[] = [], hiss: Hiss[] = [];
  let t = 0;
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
  t = 0;
  for (const [midi, beats] of part.bass) {                // the context: quiet until the tune is known
    notes.push({ midi, at: t, ms: beats * beat * 0.9, vel: 0.22 + 0.25 * share });
    t += beats * beat;
  }
  const bytes = mixWav(notes, hiss, v.pcm, v.ins, level);
  return asUri(bytes, `ownsong-${v.name}-${part.name}-${Math.round(share * 1000)}-${Math.round(level * 100)}`);
}
