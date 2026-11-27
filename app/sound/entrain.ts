// C-591 (the user, 2026-11-26: "now you can turn on down drift even if no headphones (but ideally they also use
// headphones) the options that can use the downdrift info are the headphones, the pulsetto, or ... the Luma"): the
// conductor. While a drift plays (sound/sleepSession.ts, every five seconds) it reads the moment -- the drift's cue
// (psyche/entrain.ts), the beat, the night's fade -- and hands each device linked and allowed its part: THE PULSETTO a
// level, stepped once every ten seconds; THE NOVA both eyes' flash, which it eases toward. The headphones' part, the
// beat between the ears, stays in sleepSession.ts as it always was. SYNESTHESIA, felt (C-592) conducts through here too.
// Nothing here is a screen. Every word DRAFT.
import { NOVA, PULSETTO } from "../platform/entrainers";
import { outputs } from "../state/drift";
import { cueAt, lightTarget, stimStep, stimTarget, type Light } from "../../server/src/psyche/entrain";
import type { DriftFile } from "../../server/src/psyche/drift";

export type Conducting = { on: boolean; stim: { level: number; why: "fixed" | "drift" | "beat" } | null; light: Pick<Light, "hz" | "pattern" | "dark"> | null };
let now: Conducting = { on: false, stim: null, light: null };
const heard = new Set<(c: Conducting) => void>();
const tell = (c: Conducting) => { now = c; heard.forEach((f) => f(c)); };
export const conducting = () => now;
export const onConducting = (f: (c: Conducting) => void) => { heard.add(f); return () => { heard.delete(f); }; };

let file: DriftFile | null = null, on = false, stimAt = 0, stimNow: number | null = null;
let pulse = true, glow = true;                     // SYNESTHESIA's simulator may leave the PULSETTO or the NOVA out

/** A drift begins (or THE LONG FALL, `null`): nothing is sent until the first conduct(). */
export function begin(f: DriftFile | null, o: { pulsetto?: boolean; nova?: boolean } = {}) {
  file = f; on = true; stimNow = null; stimAt = 0; pulse = o.pulsetto ?? true; glow = o.nova ?? true;
  tell({ on: true, stim: null, light: null });
}

/** The moment: `s` seconds in, the beat now, the night's level (1 whole, falling to 0 as it fades). */
export function conduct(s: number, beat: number, fade: number) {
  if (!on) return;
  const o = outputs(), cue = cueAt(file, s);
  let stim: Conducting["stim"] = null, light: Conducting["light"] = null;
  if (PULSETTO && pulse && o.usePulsetto && PULSETTO.now.phase === "linked") {
    const t = stimTarget(cue, beat, o.stim, file?.pulsetto?.intensity ?? null, fade);
    if (stimNow === null || Date.now() - stimAt >= 10000) {
      const next = stimStep(stimNow, t.level);
      if (!PULSETTO.now.running) { if (next > 0) PULSETTO.begin(next).catch(() => {}); }
      else if (next !== stimNow) PULSETTO.level(next).catch(() => {});
      stimNow = next; stimAt = Date.now();
    }
    stim = { level: stimNow ?? t.level, why: t.why };
  } else if (PULSETTO?.now.running) { PULSETTO.end().catch(() => {}); stimNow = null; }
  const ceiling = Math.min(o.light.ceiling, o.lightOk);   // never past what the warning was read for
  if (NOVA && glow && o.useNova && ceiling > 0 && NOVA.now.phase === "linked") {
    const l = lightTarget(cue, beat, { ...o.light, ceiling }, file?.nova?.brightness ?? null, fade);
    if (!NOVA.now.running) NOVA.start(l.left, l.right); else NOVA.aim(l.left, l.right);
    light = { hz: l.hz, pattern: l.pattern, dark: l.dark };
  } else if (NOVA?.now.running) NOVA.stop().catch(() => {});
  tell({ on: true, stim, light });
}

/** The drift ends, or DRIFT DOWN is turned off: the PULSETTO's session ended, the NOVA dark. Safe to call at any time. */
export function end() {
  on = false; file = null; stimNow = null;
  PULSETTO?.end().catch(() => {});
  NOVA?.stop().catch(() => {});
  tell({ on: false, stim: null, light: null });
}
