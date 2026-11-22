// C-290: this file runs on the phone too (C-111) -- the app imports it, directly or through another file -- so keep it free of Node-only APIs (node:*, fs).
// C-298 (the user, 2026-11-05: "One of the new sections will allow you to make a journal.. You can add new entries to the
// journal and even give it a title and at certain points in the journal, you can tap a button to turn everything you've
// written into a single one page summary which can be exported from the app and later printed"; by multiple choice:
// several journals, each titled; a summary covers the entries since the last one -- a CHAPTER; written by the talk AI,
// the Tiiny preferred, on its thinking path, with a note to check back later).
//
// The journals, their entries and their chapters live in the companion's own database (since C-432, as PRAXIS spaces), never the save. SUMMARIZE closes a
// chapter at once (state "writing") and the page is written after, by whoever writes: the hub hands it to the
// background thinker (api.ts, house.write); a phone hosting alone, or a hub with no thinker, lays the entries out plainly
// (plainPage), so the button always ends in a page. A "writing" chapter older than STALE_MIN is shown as failed, to be
// tried again. Every word the companion says here is DRAFT.
// C-356: a journal has a KIND -- STANDARD, or DREAM, whose chapters are the dreams told; and any entry or chapter can READ
// THE SIGNS (signs.ts): the symbols in it read through the four books, by the house's quick thinker, or from the lexicon.
import type { Store } from "./store.js";
import { Praxis, type Form, type Item } from "@daemons/praxis";
import { plainSigns, readSigns, returningSigns, signsAsk, SIGNS_ASK, symbolsIn, type Kind, type Reading, type Returning, type Source } from "./signs.js";
import { cleanFeeling, feltOf } from "./processes.js";   // C-357, PROCESSES
import { dayVirtue, ensureSpace, midnight } from "./practice.js";

export const LIMITS = { journal: 40, title: 60, body: 8000 };
export const STALE_MIN = 30;

export type JournalRow = { id: number; title: string; kind: Kind; created: string; entries: number; last: string | null; waiting: number };
export type Entry = { id: number; title: string; body: string; at: string; edited: string | null;
                      feeling?: string | null; felt?: string | null };   // C-357, PROCESSES: the word kept, and how it is shown now
export type Chapter = { id: number; n: number; from: number; to: number; count: number; at: string; first: string; last: string;
                        state: "writing" | "done" | "failed"; title: string; body: string; by: string; error: string | null };
// C-356: a reading of the signs in one entry or one chapter
export type SignsView = { id: number; entry: number | null; chapter: number | null; at: string; state: "writing" | "done" | "failed";
                          reading: Reading | null; by: string; error: string | null };
export type JournalView = { id: number; title: string; kind: Kind; created: string; entries: Entry[]; chapters: Chapter[]; signs: SignsView[];
                            returning: Returning[];
                            waiting: number; limits: typeof LIMITS };
export const KINDS: Kind[] = ["standard", "dream"];
const kindOf = (k: unknown): Kind => (k === "dream" ? "dream" : "standard");
// What writes a page: a system prompt and the words, and at most so many tokens -- null if nobody can (api.ts' house.write)
export type Writer = (system: string, user: string, maxTokens: number) => Promise<string | null>;

// ---- C-432 (PRAXIS 5): the journals on PRAXIS --------------------------------------------------------------------------
// Each journal is a SPACE of the JOURNAL form, or of the DREAM JOURNAL form for a dream journal; its entries (an ENTRY, or
// a DREAM), its chapters and its readings of the signs are ITEMS there, each chapter and reading linked MADE FROM what it
// covers. A space of JOURNALS holds one item per journal, numbered as the journal always was (JOURNAL-3), naming its
// space -- so a journal, an entry, a chapter and a reading keep the numbers every route and every board knew them by,
// unique across journals; a new one takes the next. ARETE (PROJECTS.md 6): an entry 2 and a dream written 2, each once a
// day, and the day's virtue if it is the day's first finish. The four tables are read in once, each row at its own time,
// and left as they were.
const TEXT = { type: "text" as const }, LONG = { type: "long" as const }, NUM = { type: "number" as const };
const OPEN = { name: "open", phase: "open" as const }, WRITTEN = { name: "written", phase: "done" as const };
const WORK = [{ name: "writing", phase: "doing" as const }, { name: "done", phase: "done" as const }, { name: "failed", phase: "aside" as const }];
const entryFields = { body: LONG, at: TEXT, edited: TEXT, feeling: TEXT };
const chapterKind = { title: "Chapter", prefix: "CHAPTER", states: WORK, fields: { from: NUM, to: NUM, at: TEXT, body: LONG, by: TEXT, error: TEXT, written: TEXT } };
const readingKind = { title: "Reading", prefix: "READING", states: WORK, fields: { entry: NUM, chapter: NUM, at: TEXT, reading: LONG, by: TEXT, error: TEXT } };
export const JOURNAL: Form = { name: "journal", version: 1,
  kinds: { entry: { title: "Entry", prefix: "ENTRY", states: [OPEN, WRITTEN], fields: entryFields }, chapter: chapterKind, reading: readingKind },
  views: [{ name: "feed" }, { name: "calendar" }], rules: [{ kind: "entry", arete: 2, cap: 2, daemon: [] }] };
export const DREAM_JOURNAL: Form = { name: "dream-journal", version: 1,
  kinds: { dream: { title: "Dream", prefix: "ENTRY", states: [OPEN, WRITTEN], fields: entryFields }, chapter: chapterKind, reading: readingKind },
  views: [{ name: "feed" }], rules: [{ kind: "dream", arete: 2, cap: 2, daemon: [] }] };
export const JOURNALS: Form = { name: "journals", version: 1,
  kinds: { journal: { title: "Journal", prefix: "JOURNAL", states: [OPEN, { name: "gone", phase: "aside" }],
                      fields: { space: TEXT, sort: TEXT, created: TEXT } } } };   // sort: standard or dream ("kind" is the engine's)
const entryKind = (k: Kind) => (k === "dream" ? "dream" : "entry");
const formOf = (k: Kind) => (k === "dream" ? DREAM_JOURNAL : JOURNAL);

type J = { id: number; item: Item; space: string; kind: Kind; title: string; created: string };
const INDEX = new WeakMap<Store, string>();
const pxOf = (store: Store) => { indexOf(store); return store.life.px; };   // the index (and the read-in) first, then the clock
function indexOf(store: Store): string {
  const had = INDEX.get(store);
  if (had) return had;
  const px = store.life.px, index = ensureSpace(px, JOURNALS, { title: "Journals", prefix: "JOURNALS" });
  INDEX.set(store, index);
  bringIn(store, index);
  return index;
}
function journals(store: Store): J[] {
  const index = indexOf(store), px = store.life.px;
  return px.items(index, { kind: "journal", phase: "open", archived: false }).map((it) => ({ id: it.number as number, item: it,
    space: String(it.fields.space), kind: kindOf(it.fields.sort), title: it.title, created: String(it.fields.created ?? "") }));
}
const journalNo = (store: Store, id: number) => journals(store).find((j) => j.id === id) ?? null;
const entriesOf = (px: Praxis, j: J) => px.items(j.space, { kind: entryKind(j.kind), archived: false }).sort((a, b) => (a.number as number) - (b.number as number));
const kidsOf = (px: Praxis, j: J, kind: "chapter" | "reading") => px.items(j.space, { kind, archived: false }).sort((a, b) => (a.number as number) - (b.number as number));
// one of a kind by its number, in whichever journal it is
function findNo(store: Store, kind: "entry" | "chapter" | "reading", n: number): { j: J; it: Item } | null {
  const px = pxOf(store);
  for (const j of journals(store)) {
    const it = px.numbered(j.space, n, kind === "entry" ? entryKind(j.kind) : kind);
    if (it && !it.archived) return { j, it };
  }
  return null;
}
// the next number of a kind, across every journal (they are unique across them, as the tables' ids were)
function nextNo(store: Store, kind: "journal" | "entry" | "chapter" | "reading"): number {
  const px = store.life.px;
  if (kind === "journal") return 1 + Math.max(0, ...px.items(indexOf(store), { kind: "journal" }).map((it) => it.number as number));
  let most = 0;
  for (const it of px.items(indexOf(store), { kind: "journal" })) {
    const space = String(it.fields.space), k = kind === "entry" ? entryKind(kindOf(it.fields.sort)) : kind;
    if (px.space(space)) for (const x of px.items(space, { kind: k })) most = Math.max(most, x.number as number);
  }
  return most + 1;
}
const str = (v: unknown) => (v == null ? "" : String(v));
const num = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0));

// an entry made written, paid its rule under the day's cap (the day `at` falls in), and the day's virtue (live entries only)
function payEntry(px: Praxis, j: J, id: string, at: number, live: boolean) {
  const kind = entryKind(j.kind);
  const paid = px.ledger(undefined, { since: midnight(at) }).filter((e) => e.op === "award" && !e.back && e.kind === kind && e.key.startsWith("finish:")).reduce((n, e) => n + e.points, 0);
  px.state(id, "written", { pay: Math.max(0, Math.min(2, 2 - paid)), reason: "finish" });
  if (live) dayVirtue(px, id, new Date(at));
}

// the four old tables, read in once: each journal, entry, chapter and reading at its own time, keeping its number
function bringIn(store: Store, index: string) {
  const db = store.db;
  const has = (t: string) => !!db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(t);
  if (!has("journals")) return;
  const rows = (sql: string) => db.prepare(sql).all() as Record<string, any>[];
  const cols = (t: string) => (db.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).map((c) => c.name);
  const px0 = store.life.px;
  const held = new Set(px0.items(index, { kind: "journal" }).map((it) => it.number));
  const js = rows(`SELECT * FROM journals ORDER BY id`).filter((r) => !held.has(r.id));
  if (!js.length) return;
  const es = has("journal_entries") ? rows("SELECT * FROM journal_entries ORDER BY id") : [];
  const cs = has("journal_chapters") ? rows("SELECT * FROM journal_chapters ORDER BY id") : [];
  const ss = has("journal_signs") ? rows("SELECT * FROM journal_signs ORDER BY id") : [];
  const kindCol = cols("journals").includes("kind");
  let at = store.now();
  const px = new Praxis(db, { now: () => at });
  const when = (iso: unknown) => Math.min(store.now(), Date.parse(String(iso ?? "")) || store.now());
  px.transaction(() => {
    for (const r of js) {
      const kind = kindOf(kindCol ? r.kind : "standard");
      at = when(r.created);
      const space = px.makeSpace({ title: String(r.title || "Journal"), prefix: kind === "dream" ? "DREAMS" : "JOURNAL", form: formOf(kind), reach: "home", parent: index });
      px.make(index, "journal", { title: String(r.title || "Journal"), space, sort: kind, created: String(r.created) }, { number: r.id });
      const j: J = { id: r.id, item: null as unknown as Item, space, kind, title: r.title, created: r.created };
      const byNo = new Map<number, string>(), chNo = new Map<number, string>();
      for (const e of es.filter((x) => x.journal === r.id)) {
        at = when(e.at);
        const id = px.make(space, entryKind(kind), { title: String(e.title || "-").slice(0, 400), body: str(e.body), at: str(e.at), edited: str(e.edited), feeling: str(e.feeling) }, { number: e.id });
        payEntry(px, j, id, at, false);
        byNo.set(e.id, id);
      }
      for (const c of cs.filter((x) => x.journal === r.id)) {
        at = when(c.at);
        const id = px.make(space, "chapter", { title: String(c.title || "-").slice(0, 400), from: num(c.from_entry), to: num(c.to_entry), at: str(c.at),
                                               body: str(c.body), by: str(c.by), error: str(c.error), written: c.title ? "1" : "" }, { number: c.id });
        if (c.state !== "writing") px.state(id, c.state === "done" ? "done" : "failed");
        for (const [n, e] of byNo) if (n >= c.from_entry && n <= c.to_entry) px.link(id, "made-from", e);
        chNo.set(c.id, id);
      }
      for (const s of ss.filter((x) => x.journal === r.id)) {
        at = when(s.at);
        const id = px.make(space, "reading", { title: "signs", entry: s.entry ?? 0, chapter: s.chapter ?? 0, at: str(s.at), reading: str(s.reading), by: str(s.by), error: str(s.error) }, { number: s.id });
        if (s.state !== "writing") px.state(id, s.state === "done" ? "done" : "failed");
        const from = s.entry != null ? byNo.get(s.entry) : chNo.get(s.chapter);
        if (from) px.link(id, "made-from", from);
      }
    }
  });
  store.life.reclock();                       // the store's clock past what was read in
}

const clean = (s: unknown, most: number) => String(s ?? "").replace(/\r\n/g, "\n").trim().slice(0, most);

// C-455: the entries the player wrote in a span, in their own journals and their dream journals (MENTIONS' numbers)
export function entriesBetween(store: Store, from: Date, to: Date): { standard: number; dream: number } {
  const px = pxOf(store), out = { standard: 0, dream: 0 };
  for (const j of journals(store)) for (const e of entriesOf(px, j)) {
    const t = Date.parse(str(e.fields.at));
    if (t >= from.getTime() && t < to.getTime()) out[j.kind]++;
  }
  return out;
}

// ---- the journals ---------------------------------------------------------------------------------------------------
export function journalsOf(store: Store): JournalRow[] {
  const px = pxOf(store);
  return journals(store).map((j) => {
    const es = entriesOf(px, j), last = es.reduce<string | null>((m, e) => (!m || str(e.fields.at) > m ? str(e.fields.at) : m), null);
    return { id: j.id, title: j.title, kind: j.kind, created: j.created, entries: es.length, last, waiting: waitingOf(store, j) };
  }).sort((a, b) => (b.last ?? b.created).localeCompare(a.last ?? a.created));
}

export function newJournal(store: Store, title: unknown, now = new Date(), kind?: unknown): JournalView | string {
  const t = clean(title, LIMITS.journal);
  if (!t) return `a journal needs a title, at most ${LIMITS.journal} letters`;
  const index = indexOf(store), px = store.life.px, k = kindOf(kind), n = nextNo(store, "journal");
  px.transaction(() => {
    const space = px.makeSpace({ title: t, prefix: k === "dream" ? "DREAMS" : "JOURNAL", form: formOf(k), reach: "home", parent: index });
    px.make(index, "journal", { title: t, space, sort: k, created: now.toISOString() }, { number: n });
  });
  return journalOf(store, n, now)!;
}

export function renameJournal(store: Store, id: number, title: unknown, now = new Date()): JournalView | string {
  const t = clean(title, LIMITS.journal);
  if (!t) return `a journal needs a title, at most ${LIMITS.journal} letters`;
  const j = journalNo(store, id);
  if (!j) return "no such journal";
  const px = store.life.px;
  px.transaction(() => { px.set(j.item.id, "title", t); px.setSpace(j.space, "title", t); });
  return journalOf(store, id, now)!;
}

// a journal let go: its space archived and its place in JOURNALS set aside -- the log keeps every word
export function removeJournal(store: Store, id: number) {
  const j = journalNo(store, id);
  if (!j) return false;
  const px = store.life.px;
  px.transaction(() => { px.state(j.item.id, "gone"); px.archive(j.space); });
  return true;
}

// the entries after the last chapter closed -- what SUMMARIZE would take
function lastTo(px: Praxis, j: J) { return Math.max(0, ...kidsOf(px, j, "chapter").map((c) => num(c.fields.to))); }
function waitingOf(store: Store, j: J) { const px = store.life.px, after = lastTo(px, j); return entriesOf(px, j).filter((e) => (e.number as number) > after).length; }

export function journalOf(store: Store, id: number, now = new Date()): JournalView | null {
  const j = journalNo(store, id);
  if (!j) return null;
  const px = store.life.px;
  const all = entriesOf(px, j);
  const entries = all.slice().reverse().map((e) => {
    const at = str(e.fields.at), feeling = str(e.fields.feeling) || null;
    return { id: e.number as number, title: e.title === "-" ? "" : e.title, body: str(e.fields.body), at, edited: str(e.fields.edited) || null,
             feeling, felt: feltOf(feeling, at, now) };   // C-357, PROCESSES
  });
  const chapters = kidsOf(px, j, "chapter").map((c, i) => chapterView(all, c, i + 1, now)).reverse();
  const signs = kidsOf(px, j, "reading").reverse().map((s) => signsView(s, now));
  const day = (at: string) => at.slice(0, 10);
  const sourceOf = (v: SignsView): Source | null => {     // the entries each reading covered
    if (v.entry != null) { const e = entries.find((x) => x.id === v.entry); return e ? { from: e.id, to: e.id, when: day(e.at) } : null; }
    const c = chapters.find((x) => x.id === v.chapter);
    return c ? { from: c.from, to: c.to, when: day(c.last) } : null;
  };
  const returning = returningSigns(signs.filter((v) => v.state === "done").map((v) => ({ reading: v.reading, source: sourceOf(v) })));
  return { id: j.id, title: j.title, kind: j.kind, created: j.created, entries, chapters, signs, returning, waiting: waitingOf(store, j), limits: LIMITS };
}

function chapterView(entries: Item[], c: Item, n: number, now: Date): Chapter {
  const from = num(c.fields.from), to = num(c.fields.to), at = str(c.fields.at);
  const span = entries.filter((e) => (e.number as number) >= from && (e.number as number) <= to).map((e) => str(e.fields.at)).sort();
  const state = (c.state ?? "writing") as Chapter["state"];
  const stale = state === "writing" && now.getTime() - new Date(at).getTime() > STALE_MIN * 60_000;
  return { id: c.number as number, n, from, to, count: span.length, at, first: span[0] ?? at, last: span.at(-1) ?? at,
           state: stale ? "failed" : state, title: c.fields.written ? c.title : "", body: str(c.fields.body), by: str(c.fields.by),
           error: stale ? "It took too long. Try again." : str(c.fields.error) || null };   // DRAFT
}

// ---- entries --------------------------------------------------------------------------------------------------------
// a new entry, or (with id) one rewritten; an entry already summarized can still be mended -- its chapter keeps its page
export function keepEntry(store: Store, b: any, now = new Date()): JournalView | string {
  const journal = Number(b?.journal), j = journalNo(store, journal);
  if (!j) return "no such journal";
  const title = clean(b?.title, LIMITS.title), body = clean(b?.body, LIMITS.body);
  const feeling = cleanFeeling(b?.feeling);                   // C-357, PROCESSES: one word, or none (the app offers it with the book held)
  if (!body && !title) return "an entry needs some words";
  const px = store.life.px;
  if (b?.id != null) {
    const it = px.numbered(j.space, Number(b.id), entryKind(j.kind));
    if (!it || it.archived) return "no such entry";
    const keepsFeeling = !(b && typeof b === "object" && "feeling" in b);   // an edit that did not offer it leaves it as it was
    px.transaction(() => {
      px.set(it.id, "title", title || "-"); px.set(it.id, "body", body); px.set(it.id, "edited", now.toISOString());
      if (!keepsFeeling) px.set(it.id, "feeling", feeling ?? "");
    });
  } else {
    const n = nextNo(store, "entry");
    px.transaction(() => {
      const id = px.make(j.space, entryKind(j.kind), { title: title || "-", body, at: now.toISOString(), edited: "", feeling: feeling ?? "" }, { number: n });
      payEntry(px, j, id, now.getTime(), true);
    });
  }
  return journalOf(store, journal, now)!;
}

// an entry taken out: archived (the log keeps it), its own reading with it, its ARETE given back
export function removeEntry(store: Store, journal: number, id: number, now = new Date()): JournalView | string {
  const j = journalNo(store, journal);
  if (!j) return "no such entry";
  const px = store.life.px, it = px.numbered(j.space, id, entryKind(j.kind));
  if (!it || it.archived) return "no such entry";
  px.transaction(() => {
    if (it.phase === "done") px.state(it.id, "open");
    for (const e of px.ledger(j.space).filter((x) => x.item === it.id && !x.back && x.key.startsWith("virtue:"))) px.takeBack(it.id, "award", e.key);
    px.archive(it.id);
    for (const s of kidsOf(px, j, "reading")) if (num(s.fields.entry) === id) px.archive(s.id);
  });
  return journalOf(store, journal, now)!;
}

// ---- chapters: SUMMARIZE --------------------------------------------------------------------------------------------
// Closes a chapter of the entries since the last one, "writing"; null with nothing new. Its page is written after
// (writeChapter); a chapter that failed is begun again by again().
export function summarize(store: Store, journal: number, now = new Date()): { journal: JournalView; chapter: number; signing?: number } | string {
  const j = journalNo(store, journal);
  if (!j) return "no such journal";
  const px = store.life.px, after = lastTo(px, j), fresh = entriesOf(px, j).filter((e) => (e.number as number) > after);
  if (!fresh.length) return "nothing new since the last summary";   // DRAFT
  const n = nextNo(store, "chapter");
  px.transaction(() => {
    const id = px.make(j.space, "chapter", { title: "-", from: fresh[0].number as number, to: fresh.at(-1)!.number as number, at: now.toISOString(),
                                             body: "", by: "", error: "", written: "" }, { number: n });
    for (const e of fresh) px.link(id, "made-from", e.id);
  });
  if (j.kind === "dream") {                                              // C-356: a dream chapter has its signs read too, after its page
    const signing = openSigns(store, j, null, n, now);
    return { journal: journalOf(store, journal, now)!, chapter: n, signing };
  }
  return { journal: journalOf(store, journal, now)!, chapter: n };
}

export function again(store: Store, chapter: number, now = new Date()): { journal: JournalView; chapter: number } | string {
  const c = findNo(store, "chapter", chapter);
  if (!c) return "no such summary";
  const px = store.life.px;
  px.transaction(() => { px.state(c.it.id, "writing"); px.set(c.it.id, "at", now.toISOString()); px.set(c.it.id, "error", ""); });
  return { journal: journalOf(store, c.j.id, now)!, chapter };
}

// the entries a chapter covers, oldest first, and its journal's title
export function chapterWords(store: Store, chapter: number) {
  const c = findNo(store, "chapter", chapter);
  if (!c) return null;
  const px = store.life.px, from = num(c.it.fields.from), to = num(c.it.fields.to);
  const n = kidsOf(px, c.j, "chapter").filter((x) => (x.number as number) <= chapter).length;
  const entries = entriesOf(px, c.j).filter((e) => (e.number as number) >= from && (e.number as number) <= to)
    .map((e) => ({ title: e.title === "-" ? "" : e.title, body: str(e.fields.body), at: str(e.fields.at) }));
  return { journal: c.j.title, kind: c.j.kind, n, entries };
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
  const c = findNo(store, "chapter", chapter);
  if (!c) return;
  const px = store.life.px;
  px.transaction(() => {
    px.set(c.it.id, "title", page.title.slice(0, 400) || "-"); px.set(c.it.id, "written", "1"); px.set(c.it.id, "body", page.body);
    px.set(c.it.id, "by", by); px.set(c.it.id, "error", ""); px.state(c.it.id, "done");
  });
}
export function failChapter(store: Store, chapter: number, error: string) {
  const c = findNo(store, "chapter", chapter);
  if (!c) return;
  const px = store.life.px;
  px.transaction(() => { px.set(c.it.id, "error", error); px.state(c.it.id, "failed"); });
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
function signsView(s: Item, now: Date): SignsView {
  const at = str(s.fields.at), state = (s.state ?? "writing") as SignsView["state"];
  const stale = state === "writing" && now.getTime() - new Date(at).getTime() > STALE_MIN * 60_000;
  let reading: Reading | null = null;
  try { reading = s.fields.reading ? JSON.parse(str(s.fields.reading)) : null; } catch { /* none */ }
  return { id: s.number as number, entry: num(s.fields.entry) || null, chapter: num(s.fields.chapter) || null, at, state: stale ? "failed" : state,
           reading, by: str(s.fields.by), error: stale ? "It took too long. Try again." : str(s.fields.error) || null };   // DRAFT
}

// One reading per entry or chapter: asked again, the old one is begun again
function openSigns(store: Store, j: J, entry: number | null, chapter: number | null, now: Date) {
  const px = store.life.px;
  const had = kidsOf(px, j, "reading").find((s) => (entry != null ? num(s.fields.entry) === entry : num(s.fields.chapter) === chapter));
  if (had) {
    px.transaction(() => { px.state(had.id, "writing"); px.set(had.id, "at", now.toISOString()); px.set(had.id, "error", ""); });
    return had.number as number;
  }
  const n = nextNo(store, "reading");
  px.transaction(() => {
    const id = px.make(j.space, "reading", { title: "signs", entry: entry ?? 0, chapter: chapter ?? 0, at: now.toISOString(), reading: "", by: "", error: "" }, { number: n });
    const from = entry != null ? px.numbered(j.space, entry, entryKind(j.kind)) : px.numbered(j.space, chapter!, "chapter");
    if (from) px.link(id, "made-from", from.id);
  });
  return n;
}

// READ THE SIGNS on one entry ({entry}) or a chapter ({chapter}); the reading is written after (writeSigns)
export function askSigns(store: Store, b: any, now = new Date()): { journal: JournalView; signing: number } | string {
  const journal = Number(b?.journal), j = journalNo(store, journal);
  if (!j) return "no such journal";
  const px = store.life.px;
  if (b?.entry != null) {
    const e = px.numbered(j.space, Number(b.entry), entryKind(j.kind));
    if (!e || e.archived) return "no such entry";
    return { signing: openSigns(store, j, Number(b.entry), null, now), journal: journalOf(store, journal, now)! };
  }
  if (b?.chapter != null) {
    const c = px.numbered(j.space, Number(b.chapter), "chapter");
    if (!c || c.archived) return "no such summary";
    return { signing: openSigns(store, j, null, Number(b.chapter), now), journal: journalOf(store, journal, now)! };
  }
  return "read the signs of an {entry} or a {chapter}";
}

// The words a reading covers, and the journal's kind
export function signsWords(store: Store, id: number): { kind: Kind; text: string } | null {
  const s = findNo(store, "reading", id);
  if (!s) return null;
  const px = store.life.px, all = entriesOf(px, s.j), e = num(s.it.fields.entry), c = num(s.it.fields.chapter);
  const ch = c ? px.numbered(s.j.space, c, "chapter") : null;
  const es = (e ? all.filter((x) => x.number === e)
                : ch ? all.filter((x) => (x.number as number) >= num(ch.fields.from) && (x.number as number) <= num(ch.fields.to)) : [])
    .map((x) => ({ title: x.title === "-" ? "" : x.title, body: str(x.fields.body), at: str(x.fields.at) }));
  if (!es.length) return null;
  return { kind: s.j.kind, text: asWords(es) };
}

function finishSigns(store: Store, id: number, reading: Reading, by: string) {
  const s = findNo(store, "reading", id);
  if (!s) return;
  const px = store.life.px;
  px.transaction(() => { px.set(s.it.id, "reading", JSON.stringify(reading)); px.set(s.it.id, "by", by); px.set(s.it.id, "error", ""); px.state(s.it.id, "done"); });
}
function failSigns(store: Store, id: number, error: string) {
  const s = findNo(store, "reading", id);
  if (!s) return;
  const px = store.life.px;
  px.transaction(() => { px.set(s.it.id, "error", error); px.state(s.it.id, "failed"); });
}

// A reading written: by the writer if there is one, else from the lexicon. Never throws; it ends done or failed.
// A mind that answers but gives nothing usable falls to the lexicon too, so a reading always ends in something.
export async function writeSigns(store: Store, id: number, write: Writer | null) {
  const w = signsWords(store, id);
  if (!w) { failSigns(store, id, "Its words are gone."); return; }   // DRAFT
  const found = symbolsIn(w.text), plain = plainSigns(found);
  if (!write) {
    if (plain.signs.length) return void finishSigns(store, id, plain, "lexicon");
    failSigns(store, id, "No sign the books know is in these words, and no mind is here to look deeper.");   // DRAFT
    return;
  }
  try {
    const r = readSigns(await write(SIGNS_ASK[w.kind], signsAsk(w.kind, w.text, found), 900), undefined, w.text);
    if (r) return void finishSigns(store, id, r, "thinker");
    if (plain.signs.length) return void finishSigns(store, id, plain, "lexicon");
    throw new Error("No mind could read them this time.");   // DRAFT
  } catch (e) {
    if (plain.signs.length) return void finishSigns(store, id, plain, "lexicon");
    failSigns(store, id, (e as Error).message || "It could not be read.");   // DRAFT
  }
}
