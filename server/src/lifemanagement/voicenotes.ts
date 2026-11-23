// C-199 (5) (the user, 2026-10-28, by multiple choice: "Voice notes -- hold to record a note to the card on the go; it
// syncs to the app later as a note (and can go into the NOTEBOOK or a goal)"): a note said to the watch. The recording
// comes whole (a minute at most) when the watch is home -- straight away, or later from its card -- and is heard on the
// hub's module; the words are the note. The app lists them, newest first; one can become a goal. No node: imports (the
// recording itself is kept on disk by api.ts while it is wanted). Every word shown is DRAFT.
import type { Store } from "../shared/store.js";
import { Praxis, type Form, type Item } from "@daemons/praxis";
import { ensureSpace } from "./practice.js";

export type VoiceNote = { id: number; at: string; device: string; text: string; state: "hearing" | "done" | "failed"; error?: string; audio: boolean };

// C-432 (PRAXIS 5): every note is an item in the VOICE NOTES space, numbered as its id always was (NOTE-7), its state
// hearing, done or failed (set aside). What the `voicenotes` setting held is read in once, each note at its own time, and
// left as it was. The calls keep the shapes they had.
const TEXT = { type: "text" as const };
export const VOICE_NOTES: Form = {
  name: "voicenotes", version: 1,
  kinds: { note: { title: "Voice note", prefix: "NOTE",
                   states: [{ name: "hearing", phase: "doing" }, { name: "done", phase: "done" }, { name: "failed", phase: "aside" }],
                   fields: { at: TEXT, device: TEXT, text: { type: "long" }, error: TEXT, audio: TEXT } } },
  views: [{ name: "feed" }],
};
const SPACES = new WeakMap<Store, string>();
function notesSpace(store: Store): string {
  const had = SPACES.get(store);
  if (had) return had;
  const px = store.life.px, space = ensureSpace(px, VOICE_NOTES, { title: "Voice notes", prefix: "NOTES" });
  const held = new Set(px.items(space, { kind: "note" }).map((it) => it.number));
  let old: VoiceNote[] = [];
  try { const l = JSON.parse(store.getSetting("voicenotes") ?? "[]"); old = Array.isArray(l) ? l : []; } catch { /* none */ }
  old = old.filter((n) => n && Number.isInteger(n.id) && !held.has(n.id));
  if (old.length) {
    let at = store.now();
    const then = new Praxis(store.db, { now: () => at });
    then.transaction(() => {
      for (const n of old.sort((x, y) => x.id - y.id)) {
        at = Math.min(store.now(), Date.parse(n.at) || store.now());
        const id = then.make(space, "note", { title: titleOf(n.text), at: n.at, device: n.device, text: n.text, error: n.error ?? "",
                                              audio: n.audio ? "1" : "0" }, { number: n.id });
        if (n.state !== "hearing") then.state(id, n.state);
      }
    });
    store.life.reclock();                       // the store's clock past what was read in
  }
  SPACES.set(store, space);
  return space;
}
const titleOf = (text: string) => (text.trim() ? text.trim().slice(0, 80) : "a voice note");
const asNote = (it: Item): VoiceNote => {
  const f = it.fields, n: VoiceNote = { id: it.number as number, at: String(f.at ?? ""), device: String(f.device ?? ""),
    text: String(f.text ?? ""), state: it.state as VoiceNote["state"], audio: f.audio !== "0" };
  if (f.error) n.error = String(f.error);
  return n;
};
export function voiceNotesOf(store: Store): VoiceNote[] {
  const space = notesSpace(store);
  return store.life.px.items(space, { kind: "note", archived: false }).map(asNote).sort((a, b) => b.at.localeCompare(a.at));
}
const itemOf = (store: Store, id: number) => { const space = notesSpace(store), it = store.life.px.numbered(space, id, "note"); return it && !it.archived ? it : null; };
// a note arrived: when it was said (the watch's own clock, when it had one -- a note kept on the card arrives later), heard after
export function newVoiceNote(store: Store, device: string, saidAt: Date | null, now = new Date()): VoiceNote {
  const at = saidAt && saidAt.getTime() > Date.UTC(2026, 0) && saidAt.getTime() <= now.getTime() + 60000 ? saidAt : now;
  const space = notesSpace(store), px = store.life.px;
  const id = px.make(space, "note", { title: titleOf(""), at: at.toISOString(), device, text: "", error: "", audio: "1" });
  return asNote(px.item(id)!);
}
export function noteHeard(store: Store, id: number, text: string | null, error?: string) {
  const it = itemOf(store, id);
  if (!it) return null;
  const px = store.life.px;
  px.transaction(() => {
    if (text === null) { px.set(it.id, "error", error ?? "Not heard."); px.state(it.id, "failed"); }      // DRAFT
    else {
      const t = text.trim() || "(nothing was heard)";                                                       // DRAFT
      px.set(it.id, "text", t); px.set(it.id, "title", titleOf(t)); px.set(it.id, "error", ""); px.state(it.id, "done");
    }
  });
  return asNote(px.item(it.id)!);
}
export function forgetVoiceNote(store: Store, id: number) { const it = itemOf(store, id); if (it) store.life.px.archive(it.id); }   // archived, the log keeps it
