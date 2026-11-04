// C-280: who answers a talk on this phone -- the hub (as always), or THIS PHONE (Apple's on-device model, heard and
// thought on the phone; app/modules/daemons-mind). The choice is kept on the phone, in its Keychain beside the key a
// phone endpoint will need (part 3). The daemon's self comes from the hub when it answers (GET /api/self, the short
// one: the on-device window is small), else a line of its own. What is said aloud goes through sayable() first.
import * as SecureStore from "expo-secure-store";
import Mind from "./modules/daemons-mind";
import { api, apiLater, ON_PHONE } from "./net";
import { sayable } from "../server/src/ai/say";
import type { Spoken } from "./types";

export type Thinker = "hub" | "phone";
const KEY = "mind.thinker";
const KEEP = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };

export const mindHere = () => ON_PHONE && !!Mind;
export async function thinker(): Promise<Thinker> {
  if (!mindHere()) return "hub";
  try { return (await SecureStore.getItemAsync(KEY)) === "phone" ? "phone" : "hub"; } catch { return "hub"; }
}
export async function setThinker(t: Thinker) { await SecureStore.setItemAsync(KEY, t, KEEP); }
export async function canThink(): Promise<{ mind: boolean; why?: string }> {
  if (!Mind) return { mind: false, why: "this build has no mind of its own" };   // DRAFT
  try { return await Mind.available(); } catch (e) { return { mind: false, why: (e as Error).message }; }
}

// who it is, as a model is given it: the hub's, else enough to be itself
async function selfText(name: string): Promise<string> {
  try { return (await api<{ text: string }>("/api/self?length=short")).text; }
  catch { return `You are ${name}, a DAEMON who lives with your trainer. Answer as yourself, warmly, in one or two short sentences.`; }   // DRAFT
}

const talked: { said: string; answer: string }[] = [];   // the talk so far, while the app is open

// One talk on this phone: heard, thought and answered here; the hub's voice says it if the hub answers, else the phone's
export async function talkHere(recording: string, name: string): Promise<Spoken & { voiced?: boolean }> {
  if (!Mind) throw new Error("this build has no mind of its own");   // DRAFT
  const heard = (await Mind.hear(recording)).trim();
  if (!heard) return { error: "Nothing was heard. Hold, speak, then let go." };   // DRAFT
  const answer = (await Mind.think(await selfText(name), talked.slice(-4), heard)).trim();
  talked.push({ said: heard, answer });
  try {
    const v = await apiLater<Spoken>("/api/ai/speak", { text: answer });   // the hub's voice (it respells as it reads)
    if (v.audioBase64) return { heard, answer, audioBase64: v.audioBase64 };
  } catch { /* the phone's own voice below */ }
  Mind.say(sayable(answer));
  return { heard, answer, voiced: true };
}
