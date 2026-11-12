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
// C-356: a journal has a KIND -- STANDARD, or DREAM, whose chapters are the dreams told; and any entry or chapter can READ
// THE SIGNS (signs.ts): the symbols in it read through the four books, by the house's quick thinker, or from the lexicon.
import type { Store } from "./store.js";
import { plainSigns, readSigns, signsAsk, SIGNS_ASK, symbolsIn, type Kind, type Reading } from "./signs.js";

export const LIMITS = { journal: 40, title: 60, body: 8000 };
export const STALE_MIN = 30;

export type JournalRow = { id: number; title: string; kind: Kind; created: string; entries: number; last: string | null; waiting: number };
export type Entry = { id: number; title: string; body: string; at: string; edited: string | null };
export type Chapter = { id: number; n: number; from: number; to: number; count: number; at: string; first: string; last: string;
                        state: "writing" | "done" | "failed"; title: string; body: string; by: string; error: string | null };
// C-356: a reading of the signs in one entry or one chapter
export type SignsView = { id: number; entry: number | null; chapter: number | null; at: string; state: "writing" | "done" | "failed";
                          reading: Reading | null; by: string; error: string | null };
export type JournalView = { id: number; title: string; kind: Kind; created: string; entries: Entry[]; chapters: Chapter[]; signs: SignsView[];
                            waiting: number; limits: typeof LIMITS };
export const KINDS: Kind[] = ["standard", "dream"];
const kindOf = (k: unknown): Kind => (k === "dream" ? "dream" : "standard");
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
      title TEXT NOT NULL DEFAULT '', body TEXT NOT NULL DEFAULT '', by TEXT NOT NULL DEFAULT '', error TEXT);
    CREATE TABLE IF NOT EXISTS journal_signs (id INTEGER PRIMARY KEY, journal INTEGER NOT NULL REFERENCES journals(id),
      entry INTEGER, chapter INTEGER, at TEXT NOT NULL, state TEXT NOT NULL, reading TEXT, by TEXT NOT NULL DEFAULT '', error TEXT);`);
  const cols = (store.db.prepare("PRAGMA table_info(journals)").all() as { name: string }[]).map((c) => c.name);   // C-356
  if (!cols.includes("kind")) store.db.exec("ALTER TABLE journals ADD COLUMN kind TEXT NOT NULL DEFAULT 'standard'");
  ready.add(store);
}

const clean = (s: unknown, most: number) => String(s ?? "").replace(/\r\n/g, "\n").trim().slice(0, most);

// ---- the journals ---------------------------------------------------------------------------------------------------
export function journalsOf(store: Store): JournalRow[] {
  tables(store);
  return (store.db.prepare(`SELECT j.id, j.title, j.kind, j.created, COUNT(e.id) AS entries, MAX(e.at) AS last FROM journals j
                            LEFT JOIN journal_entries e ON e.journal = j.id GROUP BY j.id ORDER BY COALESCE(MAX(e.at), j.created) DESC`).all() as any[])
    .map((r) => ({ id: r.id, title: r.title, kind: kindOf(r.kind), created: r.created, entries: Number(r.entries), last: r.last ?? null, waiting: waitingOf(store, r.id) }));
}

export function newJournal(store: Store, title: unknown, now = new Date(), kind?: unknown): JournalView | string {
  tables(store);
  const t = clean(title, LIMITS.journal);
  if (!t) return `a journal needs a title, at most ${LIMITS.journal} letters`;
  const id = Number(store.db.prepare("INSERT INTO journals (title, kind, created) VALUES (?, ?, ?)").run(t, kindOf(kind), now.toISOString()).lastInsertRowid);
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
  store.db.prepare("DELETE FROM journal_signs WHERE journal = ?").run(id);
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
  const j = store.db.prepare("SELECT id, title, kind, created FROM journals WHERE id = ?").get(id) as any;
  if (!j) return null;
  const entries = (store.db.prepare("SELECT id, title, body, at, edited FROM journal_entries WHERE journal = ? ORDER BY id DESC").all(id) as any[])
    .map((e) => ({ id: e.id, title: e.title, body: e.body, at: e.at, edited: e.edited ?? null }));
  const rows = store.db.prepare("SELECT * FROM journal_chapters WHERE journal = ? ORDER BY id").all(id) as any[];
  const chapters = rows.map((c, i) => chapterView(store, c, i + 1, now)).reverse();
  const signs = (store.db.prepare("SELECT * FROM journal_signs WHERE journal = ? ORDER BY id DESC").all(id) as any[]).map((s) => signsView(s, now));
  return { id: j.id, title: j.title, kind: kindOf(j.kind), created: j.created, entries, chapters, signs, waiting: waitingOf(store, id), limits: LIMITS };
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
  store.db.prepare("DELETE FROM journal_signs WHERE entry = ? AND journal = ?").run(id, journal);
  return journalOf(store, journal, now)!;
}

// ---- chapters: SUMMARIZE --------------------------------------------------------------------------------------------
// Closes a chapter of the entries since the last one, "writing"; null with nothing new. Its page is written after
// (writeChapter); a chapter that failed is begun again by again().
export function summarize(store: Store, journal: number, now = new Date()): { journal: JournalView; chapter: number; signing?: number } | string {
  tables(store);
  const jr = store.db.prepare("SELECT id, kind FROM journals WHERE id = ?").get(journal) as any;
  if (!jr) return "no such journal";
  const after = lastTo(store, journal);
  const span = store.db.prepare("SELECT MIN(id) AS a, MAX(id) AS z FROM journal_entries WHERE journal = ? AND id > ?").get(journal, after) as any;
  if (span?.a == null) return "nothing new since the last summary";   // DRAFT
  const id = Number(store.db.prepare("INSERT INTO journal_chapters (journal, from_entry, to_entry, at, state) VALUES (?, ?, ?, ?, 'writing')")
    .run(journal, span.a, span.z, now.toISOString()).lastInsertRowid);
  if (kindOf(jr.kind) === "dream") {                                    // C-356: a dream chapter has its signs read too, after its page
    const signing = openSigns(store, journal, null, id, now);
    return { journal: journalOf(store, journal, now)!, chapter: id, signing };
  }
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
  const c = store.db.prepare("SELECT c.*, j.title AS jtitle, j.kind AS jkind FROM journal_chapters c JOIN journals j ON j.id = c.journal WHERE c.id = ?").get(chapter) as any;
  if (!c) return null;
  const n = Number((store.db.prepare("SELECT COUNT(*) AS n FROM journal_chapters WHERE journal = ? AND id <= ?").get(c.journal, chapter) as any).n);
  const entries = (store.db.prepare("SELECT title, body, at FROM journal_entries WHERE journal = ? AND id >= ? AND id <= ? ORDER BY id")
    .all(c.journal, c.from_entry, c.to_entry) as any[]) as { title: string; body: string; at: string }[];
  return { journal: c.jtitle as string, kind: kindOf(c.jkind), n, entries };
}

const dayOf = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
const asWords = (es: { title: string; body: string; at: string }[]) =>
  es.map((e) => `## ${dayOf(e.at)}${e.title ? ` -- ${e.title}` : ""}\n${e.body}`).join("\n\n");

export const PAGE_ASK = "You turn a person's journal into a single printed page: a short title, then a summary in the second person " +
  "(\"you\") of what they wrote -- what happened, what they felt and noticed, what changed, what they hoped for -- in their own spirit and " +
  "keeping their words where they matter. Plain prose in three to five short paragraphs, at most 350 words, then one line beginning " +
  "\"Carried forward:\" with what they seem to want to remember or do next. Never invent events; never diagnose or advise. " +
  "Answer exactly in this shape:\nTITLE: <a few words>\n\n<the page>";
// C-356: a dream journal's page is the dreams told, not interpreted -- the signs are read on their own
export const DREAM_PAGE_ASK = "You turn a person's dream journal into a single printed page: a short title, then the dreams retold in the " +
  "second person (\"you dreamt...\"), as dreams, keeping their images, colours, places and figures exact and in their order, and noting " +
  "what returns from one dream to the next. Plain prose in three to five short paragraphs, at most 350 words, then one line beginning " +
  "\"Carried forward:\" with the images that seem to ask to be remembered. Do not interpret the symbols here; never invent, diagnose or advise. " +
  "Answer exactly in this shape:\nTITLE: <a few words>\n\n<the page>";
const NOTES_ASK = "Write brief notes (at most 120 words) of what this part of a person's journal says: events, feelings, hopes, " +
  "with their dates. No advice.";

const STRETCH = 9000;
// The page for a chapter, by the writer (the background thinker); throws if nobody could write it
export async function writePage(words: { journal: string; kind?: Kind; n: number; entries: { title: string; body: string; at: string }[] }, write: Writer) {
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
  const t = await write(words.kind === "dream" ? DREAM_PAGE_ASK : PAGE_ASK, `The ${words.kind === "dream" ? "dream journal" : "journal"} is called "${words.journal}". Chapter ${words.n}, ${words.entries.length} ` +
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

// ---- C-356: READ THE SIGNS ------------------------------------------------------------------------------------------
function signsView(s: any, now: Date): SignsView {
  const stale = s.state === "writing" && now.getTime() - new Date(s.at).getTime() > STALE_MIN * 60_000;
  let reading: Reading | null = null;
  try { reading = s.reading ? JSON.parse(s.reading) : null; } catch { /* none */ }
  return { id: s.id, entry: s.entry ?? null, chapter: s.chapter ?? null, at: s.at, state: stale ? "failed" : s.state, reading, by: s.by,
           error: stale ? "It took too long. Try again." : s.error ?? null };   // DRAFT
}

// One reading per entry or chapter: asked again, the old one is begun again
function openSigns(store: Store, journal: number, entry: number | null, chapter: number | null, now: Date) {
  const had = store.db.prepare(`SELECT id FROM journal_signs WHERE journal = ? AND ${entry != null ? "entry = ?" : "chapter = ?"}`)
    .get(journal, entry ?? chapter) as any;
  if (had) {
    store.db.prepare("UPDATE journal_signs SET state = 'writing', at = ?, error = NULL WHERE id = ?").run(now.toISOString(), had.id);
    return Number(had.id);
  }
  return Number(store.db.prepare("INSERT INTO journal_signs (journal, entry, chapter, at, state) VALUES (?, ?, ?, ?, 'writing')")
    .run(journal, entry, chapter, now.toISOString()).lastInsertRowid);
}

// READ THE SIGNS on one entry ({entry}) or a chapter ({chapter}); the reading is written after (writeSigns)
export function askSigns(store: Store, b: any, now = new Date()): { journal: JournalView; signing: number } | string {
  tables(store);
  const journal = Number(b?.journal);
  if (!store.db.prepare("SELECT id FROM journals WHERE id = ?").get(journal)) return "no such journal";
  if (b?.entry != null) {
    if (!store.db.prepare("SELECT id FROM journal_entries WHERE id = ? AND journal = ?").get(Number(b.entry), journal)) return "no such entry";
    return { signing: openSigns(store, journal, Number(b.entry), null, now), journal: journalOf(store, journal, now)! };
  }
  if (b?.chapter != null) {
    if (!store.db.prepare("SELECT id FROM journal_chapters WHERE id = ? AND journal = ?").get(Number(b.chapter), journal)) return "no such summary";
    return { signing: openSigns(store, journal, null, Number(b.chapter), now), journal: journalOf(store, journal, now)! };
  }
  return "read the signs of an {entry} or a {chapter}";
}

// The words a reading covers, and the journal's kind
export function signsWords(store: Store, id: number): { kind: Kind; text: string } | null {
  tables(store);
  const s = store.db.prepare("SELECT s.*, j.kind AS jkind FROM journal_signs s JOIN journals j ON j.id = s.journal WHERE s.id = ?").get(id) as any;
  if (!s) return null;
  const es = (s.entry != null
    ? store.db.prepare("SELECT title, body, at FROM journal_entries WHERE id = ?").all(s.entry)
    : (() => { const c = store.db.prepare("SELECT * FROM journal_chapters WHERE id = ?").get(s.chapter) as any;
               return c ? store.db.prepare("SELECT title, body, at FROM journal_entries WHERE journal = ? AND id >= ? AND id <= ? ORDER BY id")
                            .all(c.journal, c.from_entry, c.to_entry) : []; })()) as { title: string; body: string; at: string }[];
  if (!es.length) return null;
  return { kind: kindOf(s.jkind), text: asWords(es) };
}

const finishSigns = (store: Store, id: number, reading: Reading, by: string) =>
  store.db.prepare("UPDATE journal_signs SET state = 'done', reading = ?, by = ?, error = NULL WHERE id = ?").run(JSON.stringify(reading), by, id);

// A reading written: by the writer if there is one, else from the lexicon. Never throws; it ends done or failed.
// A mind that answers but gives nothing usable falls to the lexicon too, so a reading always ends in something.
export async function writeSigns(store: Store, id: number, write: Writer | null) {
  const w = signsWords(store, id);
  if (!w) { store.db.prepare("UPDATE journal_signs SET state = 'failed', error = ? WHERE id = ?").run("Its words are gone.", id); return; }   // DRAFT
  const found = symbolsIn(w.text), plain = plainSigns(found);
  if (!write) {
    if (plain.signs.length) return void finishSigns(store, id, plain, "lexicon");
    store.db.prepare("UPDATE journal_signs SET state = 'failed', error = ? WHERE id = ?")
      .run("No sign the books know is in these words, and no mind is here to look deeper.", id);   // DRAFT
    return;
  }
  try {
    const r = readSigns(await write(SIGNS_ASK[w.kind], signsAsk(w.kind, w.text, found), 900), undefined, w.text);
    if (r) return void finishSigns(store, id, r, "thinker");
    if (plain.signs.length) return void finishSigns(store, id, plain, "lexicon");
    throw new Error("No mind could read them this time.");   // DRAFT
  } catch (e) {
    if (plain.signs.length) return void finishSigns(store, id, plain, "lexicon");
    store.db.prepare("UPDATE journal_signs SET state = 'failed', error = ? WHERE id = ?").run((e as Error).message || "It could not be read.", id);   // DRAFT
  }
}
