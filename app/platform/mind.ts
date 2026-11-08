// C-280 (2): THIS PHONE's own mind -- Apple's on-device model, its hearing and its voice (app/modules/daemons-mind), one
// of the minds THE MIND routes across (mesh.ts, C-307). Nothing here sends anything anywhere. What is said aloud goes
// through sayable() first.
import Mind from "../modules/daemons-mind";
import { api, ON_PHONE } from "./net";
import { sayable } from "../../server/src/ai/say";

export const mindHere = () => ON_PHONE && !!Mind;

// whether it can think (iOS 26, Apple Intelligence on), asked once a minute at most -- it can change in Settings
let known: { at: number; can: { mind: boolean; why?: string } } | null = null;
export async function canThink(): Promise<{ mind: boolean; why?: string }> {
  if (!Mind) return { mind: false, why: "this build has no mind of its own" };   // DRAFT
  if (known && Date.now() - known.at < 60_000) return known.can;
  let can: { mind: boolean; why?: string };
  try { can = await Mind.available(); } catch (e) { can = { mind: false, why: (e as Error).message }; }
  known = { at: Date.now(), can };
  return can;
}
export const canHear = () => mindHere();   // SFSpeechRecognizer: every iPhone and iPad this app runs on

// who it is, as a model is given it: the hub's (the short one: the on-device window is small), else enough to be itself
export async function selfText(name: string, length: "short" | "day" = "short"): Promise<string> {
  try { return (await api<{ text: string }>(`/api/self?length=${length}`)).text; }
  catch { return `You are ${name}, a DAEMON who lives with your trainer. Answer as yourself, warmly, in one or two short sentences.`; }   // DRAFT
}

export async function hearHere(recording: string): Promise<string> {
  if (!Mind) throw new Error("this build has no mind of its own");   // DRAFT
  return (await Mind.hear(recording)).trim();
}
export async function thinkHere(system: string, history: { said: string; answer: string }[], said: string): Promise<string> {
  if (!Mind) throw new Error("this build has no mind of its own");   // DRAFT
  return (await Mind.think(system, history, said)).trim();
}
export function sayHere(text: string) { Mind?.say(sayable(text)); }
