// C-319: who this phone is to THE MIND AT WORK, and which device -- for the tasks it asks for, the talks it reports, and
// the MINE filter. The player's name is the trainer's (/api/self) until it is set; kept on this device (place.ts).
import { Platform } from "react-native";
import { api, ON_PHONE } from "../platform/net";
import { placeOf, setPlace } from "./place";

export const me = () => placeOf<string>("mind.me", "");
export const setMe = (name: string) => setPlace("mind.me", name.trim().slice(0, 40) || null);
export const deviceName = () => (!ON_PHONE ? "the site" : Platform.OS === "ios" && (Platform as { isPad?: boolean }).isPad ? "iPad" : "iPhone");
export async function whoAmI(): Promise<string> {
  if (me()) return me();
  try { const t = (await api<{ trainer?: string }>("/api/self?length=short")).trainer?.trim(); if (t) { setMe(t); return t; } } catch { /* below */ }
  return "a player";                                                                    // DRAFT
}
