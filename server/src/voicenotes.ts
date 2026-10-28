// C-199 (5) (the user, 2026-10-28, by multiple choice: "Voice notes -- hold to record a note to the card on the go; it
// syncs to the app later as a note (and can go into the NOTEBOOK or a goal)"): a note said to the watch. The recording
// comes whole (a minute at most) when the watch is home -- straight away, or later from its card -- and is heard on the
// hub's module; the words are the note. The app lists them, newest first; one can become a goal. No node: imports (the
// recording itself is kept on disk by api.ts while it is wanted). Every word shown is DRAFT.
import type { Store } from "./store.js";

export type VoiceNote = { id: number; at: string; device: string; text: string; state: "hearing" | "done" | "failed"; error?: string; audio: boolean };
const KEEP = 300;
export function voiceNotesOf(store: Store): VoiceNote[] {
  try { const l = JSON.parse(store.getSetting("voicenotes") ?? "[]"); return Array.isArray(l) ? l : []; } catch { return []; }
}
function keep(store: Store, list: VoiceNote[]) { store.setSetting("voicenotes", JSON.stringify(list.slice(0, KEEP))); }
// a note arrived: when it was said (the watch's own clock, when it had one -- a note kept on the card arrives later), heard after
export function newVoiceNote(store: Store, device: string, saidAt: Date | null, now = new Date()): VoiceNote {
  const list = voiceNotesOf(store);
  const at = saidAt && saidAt.getTime() > Date.UTC(2026, 0) && saidAt.getTime() <= now.getTime() + 60000 ? saidAt : now;
  const n: VoiceNote = { id: Math.max(0, ...list.map((x) => x.id)) + 1, at: at.toISOString(), device, text: "", state: "hearing", audio: true };
  keep(store, [n, ...list].sort((a, b) => b.at.localeCompare(a.at)));
  return n;
}
export function noteHeard(store: Store, id: number, text: string | null, error?: string) {
  const list = voiceNotesOf(store), n = list.find((x) => x.id === id);
  if (!n) return null;
  if (text === null) { n.state = "failed"; n.error = error ?? "Not heard."; }                  // DRAFT
  else { n.text = text.trim() || "(nothing was heard)"; n.state = "done"; delete n.error; }    // DRAFT
  keep(store, list);
  return n;
}
export function forgetVoiceNote(store: Store, id: number) { keep(store, voiceNotesOf(store).filter((x) => x.id !== id)); }
