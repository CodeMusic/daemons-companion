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
import type { Store } from "../shared/store.js";
import { Praxis, type Form, type Item } from "@daemons/praxis";
import { ensureSpace, dayVirtue } from "./practice.js";

export type MeetingState = "recording" | "hearing" | "writing" | "done" | "failed";
export type Meeting = {
  id: number; device: string; startedAt: string; endedAt: string | null; title: string;
  parts: (string | null)[];                                  // each part's words, in order (null: not heard yet)
  state: MeetingState; error?: string;
  summary: string; takeaways: string[]; actions: string[]; daydream: string;
  daemon: string;                                            // who dreamt it (its nickname)
  audio: boolean;                                            // its recording is still kept
  from?: "watch" | "phone" | "memo";                         // C-316: recorded on the watch (unset), on the phone, or a voice memo given
  actionItems?: { id: number; text: string; done: boolean }[];   // C-432: each action an item, finished when done
};
// C-432 (PRAXIS 5): every meeting is an item in the MEETINGS space, numbered as its id always was (MEETING-3), its state
// its progress (recording, hearing, writing, then done -- or failed, set aside), and each of its ACTION ITEMS an item of
// its own under it, finished when it is done (1 ARETE; PROJECTS.md 8: "actions done"). What the `meetings` setting held is
// read in once, each meeting at its own time, and left as it was. Every call below keeps the shape it always had.
const LONG = { type: "long" as const }, TEXT = { type: "text" as const };
export const MEETINGS: Form = {
  name: "meetings", version: 1,
  kinds: {
    meeting: { title: "Meeting", prefix: "MEETING",
      states: [{ name: "recording", phase: "doing" }, { name: "hearing", phase: "doing" }, { name: "writing", phase: "doing" },
               { name: "done", phase: "done" }, { name: "failed", phase: "aside" }],
      fields: { device: TEXT, startedAt: TEXT, endedAt: TEXT, parts: LONG, error: TEXT, summary: LONG, takeaways: LONG,
                daydream: LONG, daemon: TEXT, audio: TEXT, from: TEXT } },
    action: { title: "Action item", prefix: "ACTION", states: [{ name: "open", phase: "open" }, { name: "done", phase: "done" }] },
  },
  views: [{ name: "feed" }],
  rules: [{ kind: "action", arete: 1, cap: 10, daemon: [] }],
};
const SPACES = new WeakMap<Store, string>();
const json = <T,>(v: unknown, d: T): T => { try { const x = JSON.parse(String(v ?? "")); return x ?? d; } catch { return d; } };
function fieldsOf(m: Meeting): Record<string, unknown> {
  return { device: m.device, startedAt: m.startedAt, endedAt: m.endedAt ?? "", parts: JSON.stringify(m.parts), error: m.error ?? "",
           summary: m.summary, takeaways: JSON.stringify(m.takeaways), daydream: m.daydream, daemon: m.daemon,
           audio: m.audio ? "1" : "0", from: m.from ?? "" };
}
function meetingsSpace(store: Store): string {
  const had = SPACES.get(store);
  if (had) return had;
  const px = store.life.px, space = ensureSpace(px, MEETINGS, { title: "Meetings", prefix: "MEET" });
  const held = new Set(px.items(space, { kind: "meeting" }).map((it) => it.number));
  const old = json<Meeting[]>(store.getSetting("meetings"), []).filter((m) => m && Number.isInteger(m.id) && !held.has(m.id));
  if (old.length) {
    let at = store.now();
    const then = new Praxis(store.db, { now: () => at });
    then.transaction(() => {
      for (const m of old.sort((x, y) => x.id - y.id)) {
        at = Math.min(store.now(), Date.parse(m.endedAt ?? m.startedAt) || store.now());
        const id = then.make(space, "meeting", { title: m.title || "MEETING", ...fieldsOf(m) }, { number: m.id });
        then.state(id, m.state);
        for (const a of m.actions ?? []) then.make(space, "action", { title: String(a).slice(0, 400) || "-" }, { parent: id });
      }
    });
    store.life.reclock();                       // the store's clock past what was read in
  }
  SPACES.set(store, space);
  return space;
}
function asMeeting(px: Praxis, it: Item): Meeting {
  const f = it.fields, kids = px.items(it.space, { parent: it.id, kind: "action", archived: false });
  const m: Meeting = { id: it.number as number, device: String(f.device ?? ""), startedAt: String(f.startedAt ?? ""),
    endedAt: f.endedAt ? String(f.endedAt) : null, title: it.title, parts: json<(string | null)[]>(f.parts, []),
    state: it.state as MeetingState, summary: String(f.summary ?? ""), takeaways: json<string[]>(f.takeaways, []),
    actions: kids.map((k) => k.title), daydream: String(f.daydream ?? ""), daemon: String(f.daemon ?? ""), audio: f.audio !== "0" };
  if (f.error) m.error = String(f.error);
  if (f.from) m.from = f.from as Meeting["from"];
  m.actionItems = kids.map((k) => ({ id: k.number as number, text: k.title, done: k.phase === "done" }));
  return m;
}
export function meetingsOf(store: Store): Meeting[] {
  const space = meetingsSpace(store), px = store.life.px;
  return px.items(space, { kind: "meeting", archived: false }).map((it) => asMeeting(px, it)).sort((a, b) => b.id - a.id);
}
const itemOf = (store: Store, id: number) => { const space = meetingsSpace(store), it = store.life.px.numbered(space, id, "meeting"); return it && !it.archived ? it : null; };
// a meeting changed by `f`, and what changed written back as events: its fields, its title, its state, its action items
function keepChanged(store: Store, it: Item, was: Meeting, now: Meeting) {
  const px = store.life.px, a = fieldsOf(was), b = fieldsOf(now);
  for (const k of Object.keys(b)) if (a[k] !== b[k]) px.set(it.id, k, b[k]);
  if (now.title !== was.title && now.title.trim()) px.set(it.id, "title", now.title.slice(0, 400));
  if (now.state !== was.state) px.state(it.id, now.state);
  if (JSON.stringify(now.actions) !== JSON.stringify(was.actions)) {
    for (const k of px.items(it.space, { parent: it.id, kind: "action", archived: false })) px.archive(k.id);
    for (const t of now.actions) px.make(it.space, "action", { title: String(t).slice(0, 400) || "-" }, { parent: it.id });
  }
}
export const meetingOf = (store: Store, id: number) => { const it = itemOf(store, id); return it ? asMeeting(store.life.px, it) : null; };
function update(store: Store, id: number, f: (m: Meeting) => void): Meeting | null {
  const it = itemOf(store, id);
  if (!it) return null;
  const px = store.life.px, was = asMeeting(px, it), m: Meeting = JSON.parse(JSON.stringify(was));
  f(m);
  px.transaction(() => keepChanged(store, it, was, m));
  return meetingOf(store, id);
}
// C-432: an action item done (or not), by its number -- 1 ARETE, and the day's virtue if it is the day's first finish
export function actionDone(store: Store, meeting: number, action: number, done: boolean, now = new Date()): Meeting | null {
  const m = itemOf(store, meeting);
  if (!m) return null;
  const px = store.life.px, a = px.numbered(m.space, action, "action");
  if (!a || a.archived || a.parent !== m.id) return null;
  px.transaction(() => {
    if (done && a.phase !== "done") {
      const paid = px.ledger(m.space, { since: new Date(now).setHours(0, 0, 0, 0) }).filter((e) => e.op === "award" && !e.back && e.kind === "action" && e.key.startsWith("finish:")).reduce((n, e) => n + e.points, 0);
      px.state(a.id, "done", { pay: Math.max(0, Math.min(1, 10 - paid)), reason: "finish" });
      dayVirtue(px, a.id, now);
    } else if (!done && a.phase === "done") {
      px.state(a.id, "open");
      for (const e of px.ledger(m.space).filter((x) => x.item === a.id && !x.back && x.key.startsWith("virtue:"))) px.takeBack(a.id, "award", e.key);
    }
  });
  return meetingOf(store, meeting);
}

export function startMeeting(store: Store, device: string, daemon: string, now = new Date(),
                             from?: "phone" | "memo", title?: string): Meeting {
  const m: Meeting = { id: 0, device, startedAt: now.toISOString(), endedAt: null,
    title: title?.trim().slice(0, 60) || `MEETING ${now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,   // DRAFT, until the write-up names it
    parts: [], state: "recording", summary: "", takeaways: [], actions: [], daydream: "", daemon, audio: true, ...(from ? { from } : {}) };
  const space = meetingsSpace(store), px = store.life.px, id = px.make(space, "meeting", { title: m.title, ...fieldsOf(m) });
  return asMeeting(px, px.item(id)!);
}
// a part heard: its words in its place (parts can arrive out of order, from the card after the meeting)
export function partHeard(store: Store, id: number, n: number, words: string) {
  return update(store, id, (m) => { while (m.parts.length <= n) m.parts.push(null); m.parts[n] = words.trim(); });
}
// `lost`: parts the watch could neither send nor keep (no card, no network) -- heard as nothing, so the rest is written up
export function endMeeting(store: Store, id: number, parts: number, now = new Date(), lost: number[] = []) {
  return update(store, id, (m) => {
    m.endedAt = now.toISOString(); while (m.parts.length < parts) m.parts.push(null);
    for (const n of lost) if (Number.isInteger(n) && n >= 0 && n < m.parts.length && m.parts[n] === null) m.parts[n] = "";
    m.state = "hearing";
  });
}
// C-316: a whole recording (the phone's, or a voice memo), as raw 16-bit mono PCM, cut into the watch's half-minute parts
// -- so it goes down the same road: each part heard in turn, then written up. At most `most` parts (four hours).
export function partsOfPcm(pcm: Uint8Array, rate = 16000, seconds = 30, most = 480): Uint8Array[] {
  const size = rate * 2 * seconds, out: Uint8Array[] = [];
  for (let at = 0; at < pcm.length && out.length < most; at += size) out.push(pcm.subarray(at, Math.min(at + size, pcm.length)));
  return out.filter((p, i) => i === 0 || p.length >= rate * 2 / 2);   // a last scrap under half a second is dropped
}
export const transcriptOf = (m: Meeting) => m.parts.filter((p): p is string => !!p).join(" ").replace(/\s+/g, " ").trim();
export const allHeard = (m: Meeting) => m.endedAt !== null && m.parts.every((p) => p !== null);
export function setState(store: Store, id: number, state: MeetingState, error?: string) {
  return update(store, id, (m) => { m.state = state; if (error) m.error = error; else delete m.error; });
}
// C-316: a voice memo knows when it ended (its file's date), not when it began -- set once its length is known
export function beganAt(store: Store, id: number, at: Date) { return update(store, id, (m) => { m.startedAt = at.toISOString(); }); }
export function audioGone(store: Store, id: number) { return update(store, id, (m) => { m.audio = false; }); }
export function forgetMeeting(store: Store, id: number) { const it = itemOf(store, id); if (it) store.life.px.archive(it.id); }   // archived, the log keeps it

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
