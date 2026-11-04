// C-290: this file runs on the phone too (C-111) -- the app imports it, directly or through another file -- so keep it free of Node-only APIs (node:*, fs).
// C-262: the T-Glass -- one screen in front of one eye, and the app's GLASSES section that chooses it. The glasses show
// one thing at a time (`show`): HOME (the time, the daemon, the next step), a NOTE, the DAEMON, or DARK. The app's
// selection is never its own: a note is selected while, and only while, the glasses show it -- so it stays selected
// when the app is left, and goes the moment anything else is sent. A care is a MOMENT over whatever is shown (its
// reaction for a few seconds), not a screen of its own, so a note shown stays shown (DRAFT: the user may turn it).
// Nothing here imports Node: it runs on a phone that hosts on its own too (routes.ts).
import type { Store } from "./store.js";

export type GlassShow = "home" | "note" | "daemon" | "dark";
export interface Note { id: number; text: string; updated: string }
export interface Moment { kind: string; line: string; until: number }
export interface GlassState { show: GlassShow; note: number | null; moment: Moment | null; rev: number }

export const TITLE_MAX = 24;              // the list's title: the first line, cut here
export const NOTE_MAX = 2000;             // a note's text, at most
export const BODY_MAX = 900;              // what goes to the glasses of it (the STATE line stays small)
export const MOMENT_MS = 8000;            // a care's reaction, shown this long
const SHOWS: GlassShow[] = ["home", "note", "daemon", "dark"];
const NOTES = "glass.notes", STATE = "glass.state";

// the title is the first line that has words, cut to TITLE_MAX -- renaming a note is editing that line
export function titleOf(text: string): string {
  const first = text.split("\n").map((l) => l.trim()).find((l) => l.length > 0) ?? "";
  return first.length > TITLE_MAX ? first.slice(0, TITLE_MAX - 1).trimEnd() + "…" : first || "UNTITLED";
}
// the body is everything after the title's line
export function bodyOf(text: string): string {
  const lines = text.split("\n");
  const at = lines.findIndex((l) => l.trim().length > 0);
  return at < 0 ? "" : lines.slice(at + 1).join("\n").trim();
}

function read<T>(store: Store, key: string, fallback: T): T {
  try { return JSON.parse(store.getSetting(key) ?? "null") ?? fallback; } catch { return fallback; }
}

export function notes(store: Store): Note[] { return read<Note[]>(store, NOTES, []); }

export function glassState(store: Store, now = Date.now()): GlassState {
  const s = read<GlassState>(store, STATE, { show: "home", note: null, moment: null, rev: 0 });
  if (s.moment && s.moment.until <= now) s.moment = null;
  if (s.show === "note" && !notes(store).some((n) => n.id === s.note)) { s.show = "home"; s.note = null; }   // its note was removed
  return s;
}
function keep(store: Store, s: GlassState) { s.rev++; store.setSetting(STATE, JSON.stringify(s)); }

// a note written or rewritten: no id is a new one. Empty text is refused (remove it instead).
export function saveNote(store: Store, b: { id?: unknown; text?: unknown }, now = new Date()): Note | string {
  const text = typeof b.text === "string" ? b.text.replace(/\r\n?/g, "\n").slice(0, NOTE_MAX) : "";
  if (!text.trim()) return "a note needs words";
  const list = notes(store);
  const id = Number(b.id);
  if (b.id !== undefined && b.id !== null) {
    const n = list.find((x) => x.id === id);
    if (!n) return "no such note";
    n.text = text; n.updated = now.toISOString();
    store.setSetting(NOTES, JSON.stringify(list));
    const s = glassState(store);
    if (s.show === "note" && s.note === id) keep(store, s);   // the glasses show it: they take the new words
    return n;
  }
  const n: Note = { id: list.reduce((m, x) => Math.max(m, x.id), 0) + 1, text, updated: now.toISOString() };
  list.unshift(n);
  store.setSetting(NOTES, JSON.stringify(list));
  return n;
}

export function removeNote(store: Store, id: number): boolean {
  const list = notes(store), left = list.filter((n) => n.id !== id);
  if (left.length === list.length) return false;
  store.setSetting(NOTES, JSON.stringify(left));
  const s = glassState(store);
  if (s.note === id) { s.show = "home"; s.note = null; keep(store, s); }
  return true;
}

// what the glasses show, chosen by the app (or by the glasses themselves: a hold goes HOME, two taps DARK)
export function show(store: Store, b: { show?: unknown; note?: unknown }): GlassState | string {
  const what = String(b.show ?? "") as GlassShow;
  if (!SHOWS.includes(what)) return "show is home, note, daemon or dark";
  const s = glassState(store);
  if (what === "note") {
    const id = Number(b.note);
    if (!notes(store).some((n) => n.id === id)) return "no such note";
    s.note = id;
  } else s.note = null;
  s.show = what; s.moment = null;
  keep(store, s);
  return s;
}

// a care's reaction, laid over what is shown
export function moment(store: Store, kind: string, line: string, now = Date.now()): GlassState {
  const s = glassState(store, now);
  s.moment = { kind, line, until: now + MOMENT_MS };
  keep(store, s);
  return s;
}

// GET /api/glass: everything the app's GLASSES section draws
export function glassView(store: Store, now = Date.now()) {
  return { ...glassState(store, now), notes: notes(store).map((n) => ({ ...n, title: titleOf(n.text) })), momentMs: MOMENT_MS };
}

// what a T-Glass reads from its state (core.ts's deviceState): small, and already chosen
export function glassForDevice(store: Store, now = Date.now()) {
  const s = glassState(store, now);
  const n = s.show === "note" ? notes(store).find((x) => x.id === s.note) : undefined;
  return {
    show: s.show, rev: s.rev,
    ...(n ? { title: titleOf(n.text), body: bodyOf(n.text).slice(0, BODY_MAX) } : {}),
    ...(s.moment ? { moment: { kind: s.moment.kind, line: s.moment.line, left: Math.ceil((s.moment.until - now) / 1000) } } : {}),
  };
}

export const isGlass = (deviceId: string) => deviceId.startsWith("t-glass");
