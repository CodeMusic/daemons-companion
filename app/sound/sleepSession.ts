// C-334 (the user, 2026-11-11: "generitive sleep sounds" -- fading as you both drift to sleep; by multiple choice:
// thirty minutes, fading over the last ten): one night's sleep sounds -- the daemon's piece looped, held for twenty
// minutes, then faded to nothing over ten and stopped -- and, when DRIFT DOWN is on and headphones are in, the binaural
// layer under it (sound/binaural.ts), drifting alpha, theta, delta. One session at a time, kept as long as the app runs:
// leaving the page does not stop it, and it plays on with the screen locked (the lock screen shows it, as a book does).
import { AppState } from "react-native";
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";
import Night from "../modules/daemons-night";
import { binauralStage, carrierOf, driftOf, stageAt, type Stage } from "./binaural";

export const SESSION_S = 30 * 60, FADE_S = 10 * 60;
const DRIFT_LEVEL = 0.22;                    // under the music, never over it
const MODE = { playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: "doNotMix" } as const;

export type SleepState = { playing: boolean; id: string | null; startedAt: number; drift: boolean; stage: string | null;
                           driftHeld: string | null };   // why DRIFT DOWN is quiet, if it is (no headphones), DRAFT
let state: SleepState = { playing: false, id: null, startedAt: 0, drift: false, stage: null, driftHeld: null };
const heard = new Set<(s: SleepState) => void>();
const tell = (patch: Partial<SleepState>) => { state = { ...state, ...patch }; heard.forEach((f) => f(state)); };
export const sleepState = () => state;
export const onSleep = (f: (s: SleepState) => void) => { heard.add(f); return () => { heard.delete(f); }; };

let music: AudioPlayer | null = null, drift: AudioPlayer | null = null, tick: ReturnType<typeof setInterval> | null = null;
let carrier = 0, stageUri = "", stages: Stage[] = driftOf();   // C-386: the night's beats, placed by the day it began

// headphones now: true, false, or null where this build cannot tell (then the listener's word is taken)
export const headphones = (): boolean | null => { try { return Night?.headphones ? Night.headphones() : null; } catch { return null; } };

// the volume a moment in the session has: whole for twenty minutes, then down to nothing over ten
export const levelAt = (s: number) => (s < SESSION_S - FADE_S ? 1 : Math.max(0, (SESSION_S - s) / FADE_S));

function step() {
  if (!state.playing || !music) return;
  const s = (Date.now() - state.startedAt) / 1000;
  if (s >= SESSION_S) { stopSleep(); return; }
  const v = levelAt(s);
  music.volume = v;
  if (state.drift) {
    const ears = headphones();
    if (ears === false) { if (drift?.playing) drift.pause(); if (!state.driftHeld) tell({ driftHeld: "Quiet until headphones are in." }); }   // DRAFT
    else {
      const st = stageAt(s, stages), uri = binauralStage(carrier, st.beat);
      drift ??= createAudioPlayer(null);
      if (uri !== stageUri) { drift.replace({ uri }); drift.loop = true; stageUri = uri; }
      drift.volume = DRIFT_LEVEL * v;
      if (!drift.playing) drift.play();
      if (state.stage !== st.word || state.driftHeld) tell({ stage: st.word, driftHeld: null });
    }
  }
}

export async function playSleep(o: { id: string; uri: string; title: string; keyscale: string; drift: boolean }) {
  await setAudioModeAsync(MODE);
  music ??= createAudioPlayer(null);
  music.replace({ uri: o.uri });
  music.loop = true;
  music.volume = 1;
  music.setActiveForLockScreen(true, { title: o.title, artist: "DAEMONS", albumTitle: "Sleep sounds, DRAFT" });   // DRAFT
  music.play();
  carrier = carrierOf(o.keyscale); stageUri = ""; stages = driftOf(new Date());
  tell({ playing: true, id: o.id, startedAt: Date.now(), drift: o.drift, stage: null, driftHeld: null });
  if (tick) clearInterval(tick);
  tick = setInterval(step, 5000);
  step();
}

// C-358: the spectrum the player draws when its cover is tapped -- the music's own samples, while anyone listens; where a
// build cannot sample (the site), null, and the player draws the beat instead
const sampled = new Set<(frames: number[]) => void>();
let sampleSub: { remove: () => void } | null = null;
export function onSpectrum(f: (frames: number[]) => void): () => void {
  sampled.add(f);
  if (music && !sampleSub) {
    try {
      music.setAudioSamplingEnabled(true);
      sampleSub = music.addListener("audioSampleUpdate", (d) => { const fr = d.channels[0]?.frames; if (fr) sampled.forEach((g) => g(fr)); });
    } catch { sampleSub = null; }
  }
  return () => {
    sampled.delete(f);
    if (!sampled.size && sampleSub) { sampleSub.remove(); sampleSub = null; try { music?.setAudioSamplingEnabled(false); } catch { /* none */ } }
  };
}
export const canSample = () => !!music && typeof (music as { setAudioSamplingEnabled?: unknown }).setAudioSamplingEnabled === "function";

export function setDrift(on: boolean) {
  tell({ drift: on, driftHeld: null, stage: on ? state.stage : null });
  if (!on && drift) { drift.pause(); stageUri = ""; }
  step();
}

export function stopSleep() {
  if (tick) { clearInterval(tick); tick = null; }
  music?.pause(); drift?.pause(); stageUri = "";
  try { music?.clearLockScreenControls(); } catch { /* none set */ }
  tell({ playing: false, id: null, stage: null, driftHeld: null });
}

// a timer may have slept with the app: catch up as it comes back
AppState.addEventListener("change", (s) => { if (s === "active") step(); else if (state.playing) setAudioModeAsync(MODE).catch(() => {}); });
