// C-591 (the user, 2026-11-26): DRIFT DOWN's outputs, as this phone keeps them -- which of the PULSETTO and the NOVA a
// drift may use, how strong the PULSETTO may be (AUTO or FIXED, inside a MIN..MAX), the NOVA's pattern, brightness and
// ceiling, and whether the light's warning has been read (for which ceiling). Kept on this device, as DEVELOPER MODE is
// (state/dev.ts); the site keeps it for the visit. Every word DRAFT.
import { useEffect, useState } from "react";
import { Platform } from "react-native";
import { Directory, File, Paths } from "expo-file-system";
import { LIGHT_DEFAULT, STIM_DEFAULT, type LightSetting, type StimSetting } from "../../server/src/psyche/entrain";

export type DriftOutputs = {
  usePulsetto: boolean; useNova: boolean;
  stim: StimSetting; light: LightSetting;
  lightOk: number;                 // the highest ceiling the player has read the warning for; 0, never
  pulsettoId: string | null; novaId: string | null;   // the last ones linked, to find again
};
const START: DriftOutputs = { usePulsetto: true, useNova: true, stim: STIM_DEFAULT, light: LIGHT_DEFAULT, lightOk: 0, pulsettoId: null, novaId: null };

let kept: DriftOutputs | null = null;
const heard = new Set<(d: DriftOutputs) => void>();
const file = () => new File(new Directory(Paths.document, "game"), "drift.json");

export function outputs(): DriftOutputs {
  if (kept) return kept;
  kept = START;
  if (Platform.OS === "web") return kept;
  try {
    const f = file();
    if (f.exists) {
      const j = JSON.parse(f.textSync()) as Partial<DriftOutputs>;
      kept = { ...START, ...j, stim: { ...STIM_DEFAULT, ...(j.stim ?? {}) }, light: { ...LIGHT_DEFAULT, ...(j.light ?? {}) } };
    }
  } catch { /* the defaults */ }
  return kept;
}

export function setOutputs(patch: Partial<DriftOutputs>) {
  const now = outputs();
  kept = { ...now, ...patch, stim: { ...now.stim, ...(patch.stim ?? {}) }, light: { ...now.light, ...(patch.light ?? {}) } };
  if (Platform.OS !== "web") try {
    const d = new Directory(Paths.document, "game");
    if (!d.exists) d.create();
    const f = file();
    if (!f.exists) f.create();
    f.write(JSON.stringify(kept));
  } catch { /* kept for this run only */ }
  heard.forEach((h) => h(kept!));
}

export const onOutputs = (f: (d: DriftOutputs) => void) => { heard.add(f); return () => { heard.delete(f); }; };
export function useOutputs(): DriftOutputs {
  const [d, setD] = useState(outputs());
  useEffect(() => onOutputs(setD), []);
  return d;
}
