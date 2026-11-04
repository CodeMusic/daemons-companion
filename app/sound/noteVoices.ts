// C-294 (DAEMONS T-426; the user, 2026-11-04: "please ensure the instruments work properly on the iphone -- a note will
// make it appear at times but I do not hear it sometimes, it makes it hard to play songs"): PLAY's notes, each on a player
// kept READY at its start. On iOS expo-audio's play() does not rewind and its seekTo is asynchronous, so the old
// `seekTo(0); play()` raced on a note that had rung to its end: play could start at the end and stop at once, the rewind
// landing after it -- the note's dot rose and nothing sounded. And one player a pitch meant a note played twice quickly
// was re-seeked while it still sounded. So each pitch has a few players; one that finishes or is let go is rewound then
// and there, and a note is played on one already waiting at its start. Only when none is waiting is the oldest stopped,
// rewound, and played once its rewind is done.
import type { AudioPlayer } from "expo-audio";

// ready: waiting at its start; sounding: played and not yet finished or let go (kept here rather than read from the player,
// whose `playing` can still say false a moment after play())
type Voice = { pl: AudioPlayer; ready: boolean; sounding: boolean; at: number; fade: ReturnType<typeof setInterval> | null; off: () => void };

export interface NoteVoices {
  play(midi: number, damp?: boolean): void;   // a note now; `damp`: what this pitch still rings stops first (a string plucked again)
  release(midi: number, ms?: number): void;   // a held note let go: faded out over `ms`, then rewound
  keep(midis: number[]): void;                // the pitches to have ready (the key and octave in use); the rest are let go
  remove(): void;
}

export function noteVoices(make: (midi: number) => AudioPlayer, perPitch = 3, ready = 2): NoteVoices {
  const all = new Map<number, Voice[]>();
  const rewind = (v: Voice) => {
    v.ready = false;
    v.pl.seekTo(0).then(() => { if (!v.fade && !v.sounding) v.ready = true; }, () => { if (!v.sounding) v.ready = true; });
  };
  const voice = (m: number): Voice => {
    const v: Voice = { pl: make(m), ready: true, sounding: false, at: 0, fade: null, off: () => {} };
    const sub = v.pl.addListener("playbackStatusUpdate", (s) => { if (s.didJustFinish) { v.sounding = false; rewind(v); } });
    v.off = () => sub.remove();
    return v;
  };
  const of = (m: number) => {
    let vs = all.get(m);
    if (!vs) { vs = []; all.set(m, vs); }
    return vs;
  };
  const still = (v: Voice) => { if (v.fade) { clearInterval(v.fade); v.fade = null; } v.pl.volume = 1; };
  const fadeOut = (v: Voice, ms: number) => {
    if (v.fade) return;
    const steps = Math.max(1, Math.round(ms / 30));
    let k = steps;
    v.fade = setInterval(() => {
      k--;
      if (k > 0) { v.pl.volume = k / steps; return; }
      clearInterval(v.fade!); v.fade = null;
      v.pl.pause(); v.pl.volume = 1; v.sounding = false;
      rewind(v);
    }, 30);
  };
  const sound = (v: Voice) => { still(v); v.ready = false; v.sounding = true; v.at = Date.now(); };
  const drop = (vs: Voice[]) => { for (const v of vs) { still(v); v.off(); v.pl.remove(); } };
  return {
    play(m, damp = false) {
      const vs = of(m);
      if (damp) for (const v of vs) if (v.sounding && !v.fade) fadeOut(v, 40);
      let v = vs.find((x) => x.ready);
      if (!v && vs.length < perPitch) { v = voice(m); vs.push(v); }
      if (v) { sound(v); v.pl.play(); return; }
      const old = vs.reduce((a, b) => (a.at <= b.at ? a : b));   // none waiting: the oldest, rewound first
      sound(old);
      old.pl.pause();
      old.pl.seekTo(0).then(() => { if (old.sounding) old.pl.play(); }, () => {});
    },
    release(m, ms = 120) {
      const sounding = (all.get(m) ?? []).filter((v) => v.sounding && !v.fade);
      if (sounding.length) fadeOut(sounding.reduce((a, b) => (a.at >= b.at ? a : b)), ms);   // the one sounded last
    },
    keep(midis) {
      for (const [m, vs] of all) if (!midis.includes(m)) { drop(vs); all.delete(m); }
      for (const m of midis) { const vs = of(m); while (vs.length < ready) vs.push(voice(m)); }
    },
    remove() { for (const vs of all.values()) drop(vs); all.clear(); },
  };
}
