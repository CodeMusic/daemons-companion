// C-334 (the user, 2026-11-11: "generitive sleep sounds" -- fading as you both drift to sleep; by multiple choice:
// thirty minutes, fading over the last ten): one night's sleep sounds -- the daemon's piece looped, held for twenty
// minutes, then faded to nothing over ten and stopped -- and, when DRIFT DOWN is on and headphones are in, the binaural
// layer under it (sound/binaural.ts), drifting alpha, theta, delta. One session at a time, kept as long as the app runs:
// leaving the page does not stop it, and it plays on with the screen locked (the lock screen shows it, as a book does).
import { AppState } from "react-native";
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";
import Night from "../modules/daemons-night";
import { bedSound, binauralStage, carrierOf, driftOf, stageAt, stagesOfFile, type DriftFile, type Stage } from "./binaural";

export const SESSION_S = 30 * 60, FADE_S = 10 * 60;
const DRIFT_LEVEL = 0.22;                    // under the music, never over it
const BED_LEVEL = 0.6;                       // C-506: a drift's noise bed, at its own level times this
const MODE = { playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: "doNotMix" } as const;

export type SleepState = { playing: boolean; id: string | null; startedAt: number; drift: boolean; stage: string | null;
                           driftHeld: string | null;   // why DRIFT DOWN is quiet, if it is (no headphones), DRAFT
                           // C-555: for the spirals in its eyes -- the beat now, falling (-1) or rising (1), and the drift's kind
                           beat: number | null; trend: -1 | 1; kind: string };
let state: SleepState = { playing: false, id: null, startedAt: 0, drift: false, stage: null, driftHeld: null, beat: null, trend: -1, kind: "sleep" };
const heard = new Set<(s: SleepState) => void>();
const tell = (patch: Partial<SleepState>) => { state = { ...state, ...patch }; heard.forEach((f) => f(state)); };
export const sleepState = () => state;
export const onSleep = (f: (s: SleepState) => void) => { heard.add(f); return () => { heard.delete(f); }; };

let music: AudioPlayer | null = null, drift: AudioPlayer | null = null, bed: AudioPlayer | null = null, tick: ReturnType<typeof setInterval> | null = null;
let bedUri = "";
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
  { // C-555: the beat now and the way it is going (a minute on), for the spirals; a drift past its end has stopped falling
    const now = stageAt(s, stages), later = stageAt(s + 60, stages);
    const trend: -1 | 1 = later.beat > now.beat ? 1 : later.beat < now.beat ? -1 : state.trend;
    if (now.beat !== state.beat || trend !== state.trend) tell({ beat: now.beat, trend });
  }
  if (state.drift) {
    const ears = headphones();
    if (ears === false) { if (drift?.playing) drift.pause(); if (!state.driftHeld) tell({ driftHeld: "Quiet until headphones are in." }); }   // DRAFT
    else {
      const st = stageAt(s, stages), uri = binauralStage(st.carrier ?? carrier, st.beat);
      drift ??= createAudioPlayer(null);
      if (uri !== stageUri) { drift.replace({ uri }); drift.loop = true; stageUri = uri; }
      drift.volume = DRIFT_LEVEL * v;
      if (!drift.playing) drift.play();
      if (state.stage !== st.word || state.driftHeld) tell({ stage: st.word, driftHeld: null });
    }
    // C-506: the drift's noise bed, if it has one -- no headphones needed for it
    const b = stageAt(s, stages).bed;
    if (!b) { if (bed?.playing) bed.pause(); bedUri = ""; }
    else {
      const u = bedSound(b.type);
      bed ??= createAudioPlayer(null);
      if (u !== bedUri) { bed.replace({ uri: u }); bed.loop = true; bedUri = u; }
      bed.volume = BED_LEVEL * b.level * v;
      if (!bed.playing) bed.play();
    }
  } else if (bed?.playing) { bed.pause(); bedUri = ""; }
}

// C-506: `driftFile`, the drift chosen (REVERIE); none, THE LONG FALL as it always was
export async function playSleep(o: { id: string; uri: string; title: string; keyscale: string; drift: boolean; driftFile?: DriftFile | null }) {
  await setAudioModeAsync(MODE);
  music ??= createAudioPlayer(null);
  music.replace({ uri: o.uri });
  music.loop = true;
  music.volume = 1;
  music.setActiveForLockScreen(true, { title: o.title, artist: "DAEMONS", albumTitle: "Sleep sounds, DRAFT" });   // DRAFT
  music.play();
  carrier = carrierOf(o.keyscale); stageUri = ""; bedUri = "";
  stages = o.driftFile ? stagesOfFile(o.driftFile, carrier) : driftOf(new Date());
  if (!stages.length) stages = driftOf(new Date());
  tell({ playing: true, id: o.id, startedAt: Date.now(), drift: o.drift, stage: null, driftHeld: null, beat: null, trend: -1, kind: o.driftFile?.kind ?? "sleep" });
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
  if (!on && bed) { bed.pause(); bedUri = ""; }
  step();
}

export function stopSleep() {
  if (tick) { clearInterval(tick); tick = null; }
  music?.pause(); drift?.pause(); bed?.pause(); stageUri = ""; bedUri = "";
  try { music?.clearLockScreenControls(); } catch { /* none set */ }
  tell({ playing: false, id: null, stage: null, driftHeld: null, beat: null });
}

// a timer may have slept with the app: catch up as it comes back
AppState.addEventListener("change", (s) => { if (s === "active") step(); else if (state.playing) setAudioModeAsync(MODE).catch(() => {}); });
