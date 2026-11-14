// C-362: a song played once through (not a night's loop) -- one at a time, on with the screen locked, its samples for
// the spectrum as the sleep session's are. Every word DRAFT.
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";

export type SongState = { playing: boolean; id: string | null; at: number; length: number };
let state: SongState = { playing: false, id: null, at: 0, length: 0 };
const heard = new Set<(s: SongState) => void>();
const tell = (p: Partial<SongState>) => { state = { ...state, ...p }; heard.forEach((f) => f(state)); };
export const songState = () => state;
export const onSong = (f: (s: SongState) => void) => { heard.add(f); return () => { heard.delete(f); }; };

let player: AudioPlayer | null = null, sub: { remove: () => void } | null = null, tick: ReturnType<typeof setInterval> | null = null;

export async function playSong(o: { id: string; uri: string; title: string }) {
  await setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: "doNotMix" });
  player ??= createAudioPlayer(null);
  player.replace({ uri: o.uri });
  player.loop = false;
  try { player.setActiveForLockScreen(true, { title: o.title, artist: "DAEMONS", albumTitle: "Songs, DRAFT" }); } catch { /* the site */ }   // DRAFT
  player.play();
  tell({ playing: true, id: o.id, at: 0, length: 0 });
  if (tick) clearInterval(tick);
  tick = setInterval(() => {
    if (!player) return;
    const at = player.currentTime ?? 0, length = player.duration ?? 0;
    if (length > 0 && at >= length - 0.25 && !player.playing) { stopSong(); return; }
    tell({ at, length });
  }, 500);
}
export function stopSong() {
  if (tick) { clearInterval(tick); tick = null; }
  player?.pause();
  try { player?.clearLockScreenControls(); } catch { /* none */ }
  tell({ playing: false, id: null });
}

const sampled = new Set<(frames: number[]) => void>();
export function onSongSpectrum(f: (frames: number[]) => void): () => void {
  sampled.add(f);
  if (player && !sub) {
    try {
      player.setAudioSamplingEnabled(true);
      sub = player.addListener("audioSampleUpdate", (d) => { const fr = d.channels[0]?.frames; if (fr) sampled.forEach((g) => g(fr)); });
    } catch { sub = null; }
  }
  return () => {
    sampled.delete(f);
    if (!sampled.size && sub) { sub.remove(); sub = null; try { player?.setAudioSamplingEnabled(false); } catch { /* none */ } }
  };
}
export const canSampleSong = () => !!player && typeof (player as { setAudioSamplingEnabled?: unknown }).setAudioSamplingEnabled === "function";
