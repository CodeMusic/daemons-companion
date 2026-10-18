// A bench check the user turns on in SETTINGS (2026-10-18: "I will test the preview on my phone"): PLAY and THE SUBTLE
// LAYER shown as if the game had given them, for checking a screen before the game's own DEBUG menu reaches it. Read
// only -- the companion is asked with ?preview=1 and the save is never touched. Kept on the phone (its secure storage) or
// in this browser; on the site the page's own ?preview= (1, harp, flute) still works too.
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { KEEP, ON_PHONE } from "./net";

export let PREVIEW_ON = false;
const URL_PREVIEW = Platform.OS === "web" ? /[?&]preview=(1|harp|flute)\b/.exec(globalThis.location?.search ?? "")?.[1] ?? null : null;

export async function loadPreview() {
  try { PREVIEW_ON = (ON_PHONE ? await SecureStore.getItemAsync("preview", KEEP) : globalThis.localStorage?.getItem("daemons-preview")) === "on"; }
  catch { /* off */ }
}
export function setPreview(on: boolean) {
  PREVIEW_ON = on;
  try {
    if (ON_PHONE) SecureStore.setItemAsync("preview", on ? "on" : "off", KEEP).catch(() => {});
    else globalThis.localStorage?.setItem("daemons-preview", on ? "on" : "off");
  } catch { /* kept for this visit only */ }
}
// the query to ask with: the page's own (on the site), else ?preview=1 while the switch is on
export const previewQuery = () => (URL_PREVIEW ? `?preview=${URL_PREVIEW}` : PREVIEW_ON ? "?preview=1" : "");
