// C-212 (the user, 2026-10-28: "hit a button during meetings so it records them, and transcribes them -- then uses the
// llm (either the module or n8n) to turn them into meeting summary notes ... a (grouped by day) list of my meetings, see
// the summary, take-aways, action-items, and full transcript if needed ... also ... a metaphorical 'dream like story'
// based on the daemon on your device ... based on what the daemon experience but it would reflect what happened in the
// meeting"): a meeting, from the watch's RECORD to its write-up. The watch sends the recording in parts (half a minute
// each, as it goes or later from its card); each part is heard as it arrives and its words kept in order; when the
// meeting ends the words are written up -- a SUMMARY, its TAKE-AWAYS and its ACTION ITEMS -- and then THE DAY-DREAM: the
// meeting as the carried daemon dreamt it, in its own world, nothing of the real one named. Long meetings are written up
// in two steps (each stretch to notes, the notes to the write-up), so a model with a short window manages them. The
// words to the models are the companion's own, never shown; what comes back is the user's. No node: imports (the
// audio itself is kept on disk by api.ts, never here). Every word shown is DRAFT.
import type { Store } from "./store.js";

export type MeetingState = "recording" | "hearing" | "writing" | "done" | "failed";
export type Meeting = {
  id: number; device: string; startedAt: string; endedAt: string | null; title: string;
  parts: (string | null)[];                                  // each part's words, in order (null: not heard yet)
  state: MeetingState; error?: string;
  summary: string; takeaways: string[]; actions: string[]; daydream: string;
  daemon: string;                                            // who dreamt it (its nickname)
  audio: boolean;                                            // its recording is still kept
};
const KEEP = 200;
export function meetingsOf(store: Store): Meeting[] {
  try { const l = JSON.parse(store.getSetting("meetings") ?? "[]"); return Array.isArray(l) ? l : []; } catch { return []; }
}
function keep(store: Store, list: Meeting[]) { store.setSetting("meetings", JSON.stringify(list.slice(0, KEEP))); }
export const meetingOf = (store: Store, id: number) => meetingsOf(store).find((m) => m.id === id) ?? null;
function update(store: Store, id: number, f: (m: Meeting) => void): Meeting | null {
  const list = meetingsOf(store), m = list.find((x) => x.id === id);
  if (!m) return null;
  f(m); keep(store, list);
  return m;
}

export function startMeeting(store: Store, device: string, daemon: string, now = new Date()): Meeting {
  const list = meetingsOf(store);
  const m: Meeting = { id: (list[0]?.id ?? 0) + 1, device, startedAt: now.toISOString(), endedAt: null,
    title: `MEETING ${now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,   // DRAFT, until the write-up names it
    parts: [], state: "recording", summary: "", takeaways: [], actions: [], daydream: "", daemon, audio: true };
  keep(store, [m, ...list]);
  return m;
}
// a part heard: its words in its place (parts can arrive out of order, from the card after the meeting)
export function partHeard(store: Store, id: number, n: number, words: string) {
  return update(store, id, (m) => { while (m.parts.length <= n) m.parts.push(null); m.parts[n] = words.trim(); });
}
export function endMeeting(store: Store, id: number, parts: number, now = new Date()) {
  return update(store, id, (m) => { m.endedAt = now.toISOString(); while (m.parts.length < parts) m.parts.push(null); m.state = "hearing"; });
}
export const transcriptOf = (m: Meeting) => m.parts.filter((p): p is string => !!p).join(" ").replace(/\s+/g, " ").trim();
export const allHeard = (m: Meeting) => m.endedAt !== null && m.parts.every((p) => p !== null);
export function setState(store: Store, id: number, state: MeetingState, error?: string) {
  return update(store, id, (m) => { m.state = state; if (error) m.error = error; else delete m.error; });
}
export function audioGone(store: Store, id: number) { return update(store, id, (m) => { m.audio = false; }); }
export function forgetMeeting(store: Store, id: number) { keep(store, meetingsOf(store).filter((m) => m.id !== id)); }

// ---- the write-up -----------------------------------------------------------------------------------------------------
export type Writer = (system: string, user: string, maxTokens: number) => Promise<string>;
const STRETCH = 2400;                                        // characters of transcript a short window takes at once
export function stretches(text: string, size = STRETCH): string[] {
  const out: string[] = []; let cur = "";
  for (const s of text.match(/[^.!?]+[.!?]*\s*/g) ?? [text]) {
    if ((cur + s).length > size && cur) { out.push(cur.trim()); cur = ""; }
    cur += s;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
const NOTES = "You take notes on part of a meeting's transcript. Write 3 to 6 short bullet points of what was said, " +
  "decided and asked for. Plain words, no preamble.";
const WRITEUP = "You write up a meeting from its notes. Answer in exactly this form, nothing before or after:\n" +
  "TITLE: a few words naming what the meeting was about\nSUMMARY: two or three sentences\n" +
  "TAKE-AWAYS:\n- one per line\nACTION ITEMS:\n- who does what, one per line (none: - none)";
export type WriteUp = { title: string; summary: string; takeaways: string[]; actions: string[] };
// the model's answer read back -- leniently: a small model's sections may come in another case or order
export function readWriteUp(text: string): WriteUp {
  const sec = (name: string) => {
    const m = text.match(new RegExp(`${name}\\s*:?\\s*([\\s\\S]*?)(?=\\n\\s*(?:TITLE|SUMMARY|TAKE-?AWAYS|ACTION ITEMS)\\s*:|$)`, "i"));
    return m ? m[1].trim() : "";
  };
  const items = (s: string) => s.split("\n").map((l) => l.replace(/^\s*[-*•\d.)]+\s*/, "").trim())
    .filter((l) => l && !/^none\.?$/i.test(l));
  return { title: sec("TITLE").split("\n")[0].slice(0, 60), summary: sec("SUMMARY").replace(/\s+/g, " "),
           takeaways: items(sec("TAKE-?AWAYS")), actions: items(sec("ACTION ITEMS")) };
}
export function dreamAskOf(daemon: { nickname: string; name?: string; types?: string }, summary: string): string {
  return `You are ${daemon.nickname}${daemon.name ? `, a ${daemon.name}` : ""}${daemon.types ? `, a ${daemon.types} daemon` : ""}. ` +
    "While the user was in a meeting you drifted into a day-dream about it. Tell that day-dream in four or five sentences: " +
    "a strange, gentle story in your own world of daemons, its places and weather, where what happened in the meeting " +
    "happens as metaphor. Never name a real person, company or product; never explain the metaphor. Here is what the meeting was: " +
    summary;
}
// the whole write-up: notes from each stretch (when it is long), the write-up from them, then the day-dream
export async function writeUp(store: Store, id: number, write: Writer, daemon: { nickname: string; name?: string; types?: string }) {
  const m = meetingOf(store, id);
  if (!m) return null;
  setState(store, id, "writing");
  try {
    const words = transcriptOf(m);
    if (!words) { update(store, id, (x) => { x.summary = "Nothing was heard."; x.state = "done"; }); return meetingOf(store, id); }   // DRAFT
    const parts = stretches(words);
    const notes = parts.length > 1 ? (await Promise.all(parts.map((p) => write(NOTES, p, 200)))).join("\n") : words;
    const w = readWriteUp(await write(WRITEUP, notes.slice(0, 4000), 400));
    const dream = (await write(dreamAskOf(daemon, w.summary || notes.slice(0, 600)), "Tell it now.", 220)).trim();
    return update(store, id, (x) => {
      x.title = w.title || x.title; x.summary = w.summary || notes.slice(0, 400);
      x.takeaways = w.takeaways; x.actions = w.actions; x.daydream = dream; x.state = "done";
    });
  } catch (e) { setState(store, id, "failed", (e as Error).message); return meetingOf(store, id); }
}
// what the watch is shown: the summary and the day-dream (the rest is the app's)
export const meetingForWatch = (m: Meeting) => ({ id: m.id, title: m.title, state: m.state, summary: m.summary,
  actions: m.actions.slice(0, 5), daydream: m.daydream });
