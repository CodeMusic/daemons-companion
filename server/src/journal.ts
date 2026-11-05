// C-290: this file runs on the phone too (C-111) -- the app imports it, directly or through another file -- so keep it free of Node-only APIs (node:*, fs).
// C-298 (the user, 2026-11-05: "One of the new sections will allow you to make a journal.. You can add new entries to the
// journal and even give it a title and at certain points in the journal, you can tap a button to turn everything you've
// written into a single one page summary which can be exported from the app and later printed"; by multiple choice:
// several journals, each titled; a summary covers the entries since the last one -- a CHAPTER; written by the talk AI,
// the Tiiny preferred, on its thinking path, with a note to check back later).
//
// The journals, their entries and their chapters live in the companion's own database, never the save. SUMMARIZE closes a
// chapter at once (state "writing") and the page is written after, by whoever writes: the hub hands it to the
// background thinker (api.ts, house.write); a phone hosting alone, or a hub with no thinker, lays the entries out plainly
// (plainPage), so the button always ends in a page. A "writing" chapter older than STALE_MIN is shown as failed, to be
// tried again. Every word the companion says here is DRAFT.
import type { Store } from "./store.js";

export const LIMITS = { journal: 40, title: 60, body: 8000 };
export const STALE_MIN = 30;

export type JournalRow = { id: number; title: string; created: string; entries: number; last: string | null; waiting: number };
export type Entry = { id: number; title: string; body: string; at: string; edited: string | null };
export type Chapter = { id: number; n: number; from: number; to: number; count: number; at: string; first: string; last: string;
                        state: "writing" | "done" | "failed"; title: string; body: string; by: string; error: string | null };
export type JournalView = { id: number; title: string; created: string; entries: Entry[]; chapters: Chapter[]; waiting: number; limits: typeof LIMITS };
// What writes a page: a system prompt and the words, and at most so many tokens -- null if nobody can (api.ts' house.write)
export type Writer = (system: string, user: string, maxTokens: number) => Promise<string | null>;

const ready = new WeakSet<Store>();
function tables(store: Store) {
  if (ready.has(store)) return;
  store.db.exec(`
    CREATE TABLE IF NOT EXISTS journals (id INTEGER PRIMARY KEY, title TEXT NOT NULL, created TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS journal_entries (id INTEGER PRIMARY KEY, journal INTEGER NOT NULL REFERENCES journals(id),
      title TEXT NOT NULL, body TEXT NOT NULL, at TEXT NOT NULL, edited TEXT);
    CREATE TABLE IF NOT EXISTS journal_chapters (id INTEGER PRIMARY KEY, journal INTEGER NOT NULL REFERENCES journals(id),
      from_entry INTEGER NOT NULL, to_entry INTEGER NOT NULL, at TEXT NOT NULL, state TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '', body TEXT NOT NULL DEFAULT '', by TEXT NOT NULL DEFAULT '', error TEXT);`);
  ready.add(store);
}

const clean = (s: unknown, most: number) => String(s ?? "").replace(/\r\n/g, "\n").trim().slice(0, most);

// ---- the journals ---------------------------------------------------------------------------------------------------
export function journalsOf(store: Store): JournalRow[] {
  tables(store);
  return (store.db.prepare(`SELECT j.id, j.title, j.created, COUNT(e.id) AS entries, MAX(e.at) AS last FROM journals j
                            LEFT JOIN journal_entries e ON e.journal = j.id GROUP BY j.id ORDER BY COALESCE(MAX(e.at), j.created) DESC`).all() as any[])
    .map((r) => ({ id: r.id, title: r.title, created: r.created, entries: Number(r.entries), last: r.last ?? null, waiting: waitingOf(store, r.id) }));
}

export function newJournal(store: Store, title: unknown, now = new Date()): JournalView | string {
  tables(store);
  const t = clean(title, LIMITS.journal);
  if (!t) return `a journal needs a title, at most ${LIMITS.journal} letters`;
  const id = Number(store.db.prepare("INSERT INTO journals (title, created) VALUES (?, ?)").run(t, now.toISOString()).lastInsertRowid);
  return journalOf(store, id, now)!;
}

export function renameJournal(store: Store, id: number, title: unknown, now = new Date()): JournalView | string {
  tables(store);
  const t = clean(title, LIMITS.journal);
  if (!t) return `a journal needs a title, at most ${LIMITS.journal} letters`;
  if (!Number(store.db.prepare("UPDATE journals SET title = ? WHERE id = ?").run(t, id).changes)) return "no such journal";
  return journalOf(store, id, now)!;
}

export function removeJournal(store: Store, id: number) {
  tables(store);
  store.db.prepare("DELETE FROM journal_chapters WHERE journal = ?").run(id);
  store.db.prepare("DELETE FROM journal_entries WHERE journal = ?").run(id);
  return Number(store.db.prepare("DELETE FROM journals WHERE id = ?").run(id).changes) > 0;
}

// the entries after the last chapter closed -- what SUMMARIZE would take
function waitingOf(store: Store, journal: number) {
  const after = lastTo(store, journal);
  return Number((store.db.prepare("SELECT COUNT(*) AS n FROM journal_entries WHERE journal = ? AND id > ?").get(journal, after) as any).n);
}
const lastTo = (store: Store, journal: number) =>
  Number((store.db.prepare("SELECT MAX(to_entry) AS t FROM journal_chapters WHERE journal = ?").get(journal) as any)?.t ?? 0);

export function journalOf(store: Store, id: number, now = new Date()): JournalView | null {
  tables(store);
  const j = store.db.prepare("SELECT id, title, created FROM journals WHERE id = ?").get(id) as any;
  if (!j) return null;
  const entries = (store.db.prepare("SELECT id, title, body, at, edited FROM journal_entries WHERE journal = ? ORDER BY id DESC").all(id) as any[])
    .map((e) => ({ id: e.id, title: e.title, body: e.body, at: e.at, edited: e.edited ?? null }));
  const rows = store.db.prepare("SELECT * FROM journal_chapters WHERE journal = ? ORDER BY id").all(id) as any[];
  const chapters = rows.map((c, i) => chapterView(store, c, i + 1, now)).reverse();
  return { id: j.id, title: j.title, created: j.created, entries, chapters, waiting: waitingOf(store, id), limits: LIMITS };
}

function chapterView(store: Store, c: any, n: number, now: Date): Chapter {
  const span = store.db.prepare("SELECT COUNT(*) AS count, MIN(at) AS first, MAX(at) AS last FROM journal_entries WHERE journal = ? AND id >= ? AND id <= ?")
    .get(c.journal, c.from_entry, c.to_entry) as any;
  const stale = c.state === "writing" && now.getTime() - new Date(c.at).getTime() > STALE_MIN * 60_000;
  return { id: c.id, n, from: c.from_entry, to: c.to_entry, count: Number(span?.count ?? 0), at: c.at, first: span?.first ?? c.at, last: span?.last ?? c.at,
           state: stale ? "failed" : c.state, title: c.title, body: c.body, by: c.by,
           error: stale ? "It took too long. Try again." : c.error ?? null };   // DRAFT
}

// ---- entries --------------------------------------------------------------------------------------------------------
// a new entry, or (with id) one rewritten; an entry already summarized can still be mended -- its chapter keeps its page
export function keepEntry(store: Store, b: any, now = new Date()): JournalView | string {
  tables(store);
  const journal = Number(b?.journal);
  if (!store.db.prepare("SELECT id FROM journals WHERE id = ?").get(journal)) return "no such journal";
  const title = clean(b?.title, LIMITS.title), body = clean(b?.body, LIMITS.body);
  if (!body && !title) return "an entry needs some words";
  if (b?.id != null) {
    const ch = store.db.prepare("UPDATE journal_entries SET title = ?, body = ?, edited = ? WHERE id = ? AND journal = ?")
      .run(title, body, now.toISOString(), Number(b.id), journal).changes;
    if (!Number(ch)) return "no such entry";
  } else store.db.prepare("INSERT INTO journal_entries (journal, title, body, at) VALUES (?, ?, ?, ?)").run(journal, title, body, now.toISOString());
  return journalOf(store, journal, now)!;
}

export function removeEntry(store: Store, journal: number, id: number, now = new Date()): JournalView | string {
  tables(store);
  if (!Number(store.db.prepare("DELETE FROM journal_entries WHERE id = ? AND journal = ?").run(id, journal).changes)) return "no such entry";
  return journalOf(store, journal, now)!;
}

// ---- chapters: SUMMARIZE --------------------------------------------------------------------------------------------
// Closes a chapter of the entries since the last one, "writing"; null with nothing new. Its page is written after
// (writeChapter); a chapter that failed is begun again by again().
export function summarize(store: Store, journal: number, now = new Date()): { journal: JournalView; chapter: number } | string {
  tables(store);
  if (!store.db.prepare("SELECT id FROM journals WHERE id = ?").get(journal)) return "no such journal";
  const after = lastTo(store, journal);
  const span = store.db.prepare("SELECT MIN(id) AS a, MAX(id) AS z FROM journal_entries WHERE journal = ? AND id > ?").get(journal, after) as any;
  if (span?.a == null) return "nothing new since the last summary";   // DRAFT
  const id = Number(store.db.prepare("INSERT INTO journal_chapters (journal, from_entry, to_entry, at, state) VALUES (?, ?, ?, ?, 'writing')")
    .run(journal, span.a, span.z, now.toISOString()).lastInsertRowid);
  return { journal: journalOf(store, journal, now)!, chapter: id };
}

export function again(store: Store, chapter: number, now = new Date()): { journal: JournalView; chapter: number } | string {
  tables(store);
  const c = store.db.prepare("SELECT journal FROM journal_chapters WHERE id = ?").get(chapter) as any;
  if (!c) return "no such summary";
  store.db.prepare("UPDATE journal_chapters SET state = 'writing', at = ?, error = NULL WHERE id = ?").run(now.toISOString(), chapter);
  return { journal: journalOf(store, c.journal, now)!, chapter };
}

// the entries a chapter covers, oldest first, and its journal's title
export function chapterWords(store: Store, chapter: number) {
  tables(store);
  const c = store.db.prepare("SELECT c.*, j.title AS jtitle FROM journal_chapters c JOIN journals j ON j.id = c.journal WHERE c.id = ?").get(chapter) as any;
  if (!c) return null;
  const n = Number((store.db.prepare("SELECT COUNT(*) AS n FROM journal_chapters WHERE journal = ? AND id <= ?").get(c.journal, chapter) as any).n);
  const entries = (store.db.prepare("SELECT title, body, at FROM journal_entries WHERE journal = ? AND id >= ? AND id <= ? ORDER BY id")
    .all(c.journal, c.from_entry, c.to_entry) as any[]) as { title: string; body: string; at: string }[];
  return { journal: c.jtitle as string, n, entries };
}

const dayOf = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
const asWords = (es: { title: string; body: string; at: string }[]) =>
  es.map((e) => `## ${dayOf(e.at)}${e.title ? ` -- ${e.title}` : ""}\n${e.body}`).join("\n\n");

export const PAGE_ASK = "You turn a person's journal into a single printed page: a short title, then a summary in the second person " +
  "(\"you\") of what they wrote -- what happened, what they felt and noticed, what changed, what they hoped for -- in their own spirit and " +
  "keeping their words where they matter. Plain prose in three to five short paragraphs, at most 350 words, then one line beginning " +
  "\"Carried forward:\" with what they seem to want to remember or do next. Never invent events; never diagnose or advise. " +
  "Answer exactly in this shape:\nTITLE: <a few words>\n\n<the page>";
const NOTES_ASK = "Write brief notes (at most 120 words) of what this part of a person's journal says: events, feelings, hopes, " +
  "with their dates. No advice.";

const STRETCH = 9000;
// The page for a chapter, by the writer (the background thinker); throws if nobody could write it
export async function writePage(words: { journal: string; n: number; entries: { title: string; body: string; at: string }[] }, write: Writer) {
  const all = asWords(words.entries);
  let input = all;
  if (all.length > STRETCH) {                                        // too long for one ask: notes on each stretch first
    const parts: string[] = []; let cur = "";
    for (const e of words.entries) { const w = asWords([e]); if (cur && cur.length + w.length > STRETCH) { parts.push(cur); cur = ""; } cur += (cur ? "\n\n" : "") + w.slice(0, STRETCH); }
    if (cur) parts.push(cur);
    const notes: string[] = [];
    for (const p of parts) { const t = await write(NOTES_ASK, p, 220); if (t === null) throw new Error("No thinker is answering."); notes.push(t.trim()); }   // DRAFT
    input = notes.join("\n\n");
  }
  const t = await write(PAGE_ASK, `The journal is called "${words.journal}". Chapter ${words.n}, ${words.entries.length} ` +
                                  `entr${words.entries.length === 1 ? "y" : "ies"}.\n\n${input}`, 700);
  if (t === null || !t.trim()) throw new Error("No thinker is answering.");   // DRAFT
  return readPage(t, words);
}

export function readPage(t: string, words: { journal: string; n: number }) {
  const m = t.trim().match(/^\s*\**\s*TITLE\s*:\s*\**\s*(.+?)\**\s*\n([\s\S]*)$/i);
  const title = clean(m ? m[1].replace(/[*#"]/g, "") : `${words.journal}, chapter ${words.n}`, 80);
  const body = (m ? m[2] : t).replace(/^#+\s*/gm, "").replace(/\*\*(.+?)\*\*/g, "$1").trim();
  return { title, body };
}

// The page with nobody to write it: each entry's title and its first lines, as written (DRAFT)
export function plainPage(words: { journal: string; n: number; entries: { title: string; body: string; at: string }[] }) {
  const room = Math.max(120, Math.floor(2200 / Math.max(1, words.entries.length)));
  const body = words.entries.map((e) => {
    const b = e.body.replace(/\s+/g, " ").trim(), cut = b.length > room ? `${b.slice(0, b.lastIndexOf(" ", room) > 40 ? b.lastIndexOf(" ", room) : room)}…` : b;
    return `${dayOf(e.at)}${e.title ? ` -- ${e.title}` : ""}\n${cut}`;
  }).join("\n\n");
  return { title: `${words.journal}, chapter ${words.n}`, body };
}

export function finishChapter(store: Store, chapter: number, page: { title: string; body: string }, by: string) {
  tables(store);
  store.db.prepare("UPDATE journal_chapters SET state = 'done', title = ?, body = ?, by = ?, error = NULL WHERE id = ?").run(page.title, page.body, by, chapter);
}
export function failChapter(store: Store, chapter: number, error: string) {
  tables(store);
  store.db.prepare("UPDATE journal_chapters SET state = 'failed', error = ? WHERE id = ?").run(error, chapter);
}

// A chapter written: by the writer if there is one, else plainly. Never throws; the chapter ends done or failed.
export async function writeChapter(store: Store, chapter: number, write: Writer | null) {
  const words = chapterWords(store, chapter);
  if (!words) return;
  if (!write) return finishChapter(store, chapter, plainPage(words), "plain");
  try { const p = await writePage(words, async (s, u, most) => write(s, u, most)); finishChapter(store, chapter, p, "thinker"); }
  catch (e) { failChapter(store, chapter, (e as Error).message || "It could not be written."); }   // DRAFT
}
