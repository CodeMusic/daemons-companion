// C-601 (C-596; the user, 2026-11-27): THE HOARD as this device keeps it -- who a new file is shared with unless it is
// said otherwise (only you, or the household), and its WHEN: whether this device takes part at any time, only on
// Wi-Fi, only while plugged in, or only with both. Kept on this device, as DRIFT DOWN's outputs are (state/drift.ts): a
// file on the phone, the browser's storage on the site. What WHEN lets through is platform/hoard.ts's to say (it reads
// the battery and the network); this only keeps the choice. Every word DRAFT.
import { useEffect, useState } from "react";
import { Platform } from "react-native";
import { Directory, File, Paths } from "expo-file-system";

export type HoardWhen = "any" | "wifi" | "plugged" | "both";
export type HoardShare = "me" | "household";
export type HoardKept = { share: HoardShare; when: HoardWhen };
const START: HoardKept = { share: "me", when: "any" };

export const WHEN_SAID: Record<HoardWhen, string> = { any: "ANY TIME", wifi: "ONLY ON WI-FI", plugged: "ONLY PLUGGED IN", both: "WI-FI AND PLUGGED IN" };
const here = Platform.OS === "web" ? "this browser" : "this phone";
export const WHEN_ABOUT: Record<HoardWhen, string> = {
  any: `A file goes to THE HOARD as soon as you put it in, however ${here} is connected.`,
  wifi: "A file waits until the hub is reached on the home network, so it never costs mobile data.",
  plugged: `A file waits until ${here} is plugged in, so a long one never costs the battery.`,
  both: `A file waits until ${here} is plugged in and on the home network.`,
};
export const SHARE_SAID: Record<HoardShare, string> = { me: "ONLY YOU", household: "THE HOUSEHOLD" };
export const wantsWifi = (w: HoardWhen) => w === "wifi" || w === "both";
export const wantsPlugged = (w: HoardWhen) => w === "plugged" || w === "both";

let kept: HoardKept | null = null;
const heard = new Set<(k: HoardKept) => void>();
const KEY = "daemons.hoard";
const file = () => new File(new Directory(Paths.document, "hoard"), "kept.json");
const sound = (j: Partial<HoardKept> | null): HoardKept => ({
  share: j?.share === "household" ? "household" : "me",
  when: j?.when && j.when in WHEN_SAID ? j.when : "any",
});

export function hoardKept(): HoardKept {
  if (kept) return kept;
  kept = START;
  try {
    if (Platform.OS === "web") kept = sound(JSON.parse(globalThis.localStorage?.getItem(KEY) ?? "null"));
    else if (file().exists) kept = sound(JSON.parse(file().textSync()));
  } catch { /* the defaults */ }
  return kept;
}

export function setHoardKept(patch: Partial<HoardKept>) {
  kept = sound({ ...hoardKept(), ...patch });
  try {
    if (Platform.OS === "web") globalThis.localStorage?.setItem(KEY, JSON.stringify(kept));
    else {
      const d = new Directory(Paths.document, "hoard");
      if (!d.exists) d.create();
      const f = file();
      if (!f.exists) f.create();
      f.write(JSON.stringify(kept));
    }
  } catch { /* kept for this run only */ }
  heard.forEach((h) => h(kept!));
}

export const onHoardKept = (f: (k: HoardKept) => void) => { heard.add(f); return () => { heard.delete(f); }; };
export function useHoardKept(): HoardKept {
  const [k, setK] = useState(hoardKept());
  useEffect(() => onHoardKept(setK), []);
  return k;
}
