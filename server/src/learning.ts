// C-290: this file runs on the phone too (C-111) -- the app imports it, directly or through another file -- so keep it free of Node-only APIs (node:*, fs).
// C-433 (PRAXIS 6; the user, 2026-11-22, by multiple choice): LEARNING (docs/PROJECTS.md 7 and 8: Musai University's
// shape) -- a COURSE, its MODULES, their LESSONS and each lesson's review CARDS, items in the LEARNING space. THE TUTOR
// (the household's mind, the Tiiny first; api.ts runs it in the background) PROPOSES a course's syllabus -- modules,
// lessons and cards, as PRAXIS proposals nested under one another -- and the person accepts, edits or declines each; it
// writes a lesson's words when the lesson is first opened. With no mind (a phone alone), everything is added by hand.
// ARETE: a lesson finished 3 (nine a day pay), a card reviewed 1 (twenty a day), and the day's virtue on the day's first
// finish. Cards come back on a simple spaced schedule. Quizzes are a later slice. Every word the app shows is DRAFT.
import type { Store } from "./store.js";
import type { Form, Item, Proposal } from "@daemons/praxis";
import { dayVirtue, ensureSpace, localDate, midnight } from "./practice.js";

const TEXT = { type: "text" as const }, LONG = { type: "long" as const }, NUM = { type: "number" as const };
const OPEN = { name: "open", phase: "open" as const }, DONE = { name: "done", phase: "done" as const };
export const LEARNING: Form = {
  name: "learning", version: 2,   // 2: QUIZ (C-433)
  kinds: {
    course: { title: "Course", prefix: "COURSE", states: [OPEN, DONE], fields: { subject: TEXT, tutor: TEXT, error: TEXT } },
    module: { title: "Module", prefix: "MODULE", states: [OPEN, DONE] },
    lesson: { title: "Lesson", prefix: "LESSON", states: [OPEN, DONE], fields: { body: LONG, writing: TEXT } },
    card: { title: "Card", prefix: "CARD", states: [OPEN], fields: { back: LONG, interval: NUM, ease: NUM, reps: NUM } },   // its due date the engine's own `due`
    quiz: { title: "Quiz", prefix: "QUIZ", states: [OPEN, { name: "passed", phase: "done" }],
            fields: { questions: LONG, answers: LONG, marks: LONG, by: TEXT, tries: NUM } },
  },
  views: [{ name: "syllabus" }, { name: "review" }],
  rules: [{ kind: "lesson", arete: 3, cap: 9, daemon: [] }, { kind: "card", arete: 1, cap: 20, daemon: [] }, { kind: "quiz", arete: 5, cap: 15, daemon: [] }],
};
export const MOST = { subject: 80, title: 120, back: 600, body: 6000 };
const SPACES = new WeakMap<Store, string>();
export function learningSpace(store: Store): string {
  const had = SPACES.get(store);
  if (had) return had;
  const s = ensureSpace(store.life.px, LEARNING, { title: "Learning", prefix: "LEARN" });
  SPACES.set(store, s);
  return s;
}
const clean = (v: unknown, most: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, most);
const str = (v: unknown) => (v == null ? "" : String(v));

// ---- reading ------------------------------------------------------------------------------------------------------------
type Tree = { id: string; kind: string; title: string; done: boolean; back?: string; due?: string; hasBody?: boolean; writing?: boolean; kids: Tree[] };
function treeOf(store: Store, it: Item, all: Item[]): Tree {
  const kids = all.filter((x) => x.parent === it.id && !x.archived).sort((a, b) => a.position.localeCompare(b.position));
  const t: Tree = { id: it.id, kind: it.kind, title: it.title, done: it.phase === "done", kids: kids.map((k) => treeOf(store, k, all)) };
  if (it.kind === "card") { t.back = str(it.fields.back); t.due = str(it.due ?? ""); }
  if (it.kind === "lesson") { t.hasBody = !!str(it.fields.body); t.writing = !!it.fields.writing; }
  return t;
}
const today = (store: Store) => localDate(new Date(store.now()));
// the open proposals under a course, each with what it would be made under
function proposalsUnder(store: Store, course: Item, open: Proposal[]) {
  const px = store.life.px, made = new Map(open.map((p) => [p.item, p]));
  const value = (p: Proposal) => (p.value ?? {}) as { kind?: string; title?: string; parent?: string | null; back?: { text?: string } | string };
  const rootOf = (p: Proposal): string | null => {           // the course a proposal falls under, through proposed parents
    let parent = value(p).parent ?? null;
    for (let i = 0; i < 8 && parent; i++) {
      if (parent === course.id) return course.id;
      const up = made.get(parent);
      if (up) { parent = value(up).parent ?? null; continue; }
      parent = px.item(parent)?.parent ?? null;
    }
    return null;
  };
  return open.filter((p) => p.op === "make" && rootOf(p) === course.id).map((p) => {
    const v = value(p), back = typeof v.back === "string" ? v.back : v.back?.text ?? "";
    return { id: p.id, item: p.item, kind: v.kind ?? "", title: v.title ?? "", parent: v.parent ?? null, back };
  });
}
export function learningView(store: Store) {
  const s = learningSpace(store), px = store.life.px, all = px.items(s, { archived: false }), day = today(store);
  const open = px.proposals(s, "open");
  const courses = all.filter((it) => it.kind === "course").map((c) => {
    const tree = treeOf(store, c, all);
    const cards: Tree[] = [];
    const walk = (t: Tree) => { if (t.kind === "card") cards.push(t); t.kids.forEach(walk); };
    walk(tree);
    return { id: c.id, title: c.title, subject: str(c.fields.subject), tutor: str(c.fields.tutor), error: str(c.fields.error) || null,
             done: c.phase === "done", modules: tree.kids, due: cards.filter((k) => !k.due || k.due <= day).length, cards: cards.length,
             proposals: proposalsUnder(store, c, open) };
  });
  return { courses };
}
const itemIn = (store: Store, id: unknown, kind?: string) => {
  const s = learningSpace(store), it = store.life.px.item(String(id ?? ""));
  return it && !it.archived && it.home === s && (!kind || it.kind === kind) ? it : null;
};

// ---- a course, and what is added to it by hand -------------------------------------------------------------------------
export function newCourse(store: Store, subject: unknown): Item | string {
  const sub = clean(subject, MOST.subject);
  if (!sub) return "name what you would like to learn";                                         // DRAFT
  const px = store.life.px, id = px.make(learningSpace(store), "course", { title: sub, subject: sub, tutor: "", error: "" });
  return px.item(id)!;
}
const UNDER: Record<string, string> = { module: "course", lesson: "module", card: "lesson" };
export function addTo(store: Store, b: any) {
  const kind = String(b?.kind ?? ""), parent = itemIn(store, b?.parent, UNDER[kind]);
  if (!UNDER[kind]) return "a module, a lesson or a card";                                      // DRAFT
  if (!parent) return `a ${kind} goes under a ${UNDER[kind]}`;                                   // DRAFT
  const title = clean(b?.title, MOST.title);
  if (!title) return "it needs some words";                                                     // DRAFT
  const px = store.life.px;
  const fields: Record<string, unknown> & { title: string } = { title };
  if (kind === "card") Object.assign(fields, { back: clean(b?.back, MOST.back), due: today(store), interval: 0, ease: 250, reps: 0 });
  px.make(learningSpace(store), kind, fields, { parent: parent.id });
  return learningView(store);
}
export function rename(store: Store, b: any) {
  const it = itemIn(store, b?.id);
  if (!it) return "not found";
  const title = clean(b?.title, MOST.title), px = store.life.px;
  px.transaction(() => {
    if (title && title !== it.title) px.set(it.id, "title", title);
    if (it.kind === "card" && b?.back !== undefined) px.set(it.id, "back", clean(b.back, MOST.back));
  });
  return learningView(store);
}
export function removeFrom(store: Store, id: unknown) {
  const it = itemIn(store, id);
  if (!it) return "not found";
  store.life.px.archive(it.id);                                                                 // archived, the log keeps it
  return learningView(store);
}

// ---- the TUTOR's proposals: accepted (each, or a course's all at once), edited as they are accepted, or declined ---------
export function decide(store: Store, b: any) {
  const s = learningSpace(store), px = store.life.px, open = px.proposals(s, "open");
  const yes = b?.accept !== false;
  const course = b?.course ? itemIn(store, b.course, "course") : null;
  const parentOf = (p: Proposal) => ((p.value ?? {}) as { parent?: string }).parent ?? null;
  const byMade = new Map(open.map((p) => [p.item, p]));
  let chosen: { id: string; item: string; parent: string | null }[];
  if (course) chosen = learningView(store).courses.find((c) => c.id === course.id)?.proposals ?? [];
  else {
    // one proposal, and (accepting it) the proposals it goes under, so a card can be taken before its lesson is
    const one = open.find((p) => p.id === b?.id);
    chosen = [];
    for (let p = one, i = 0; p && i < 6; p = yes ? byMade.get(parentOf(p) ?? "") : undefined, i++) chosen.push({ id: p.id, item: p.item, parent: parentOf(p) });
  }
  if (!chosen.length) return "nothing to decide";                                               // DRAFT
  px.transaction(() => {
    // parents before children: a proposal is accepted only once what it goes under is there
    const byItem = new Map(chosen.map((c) => [c.item, c]));
    const depth = (c: { parent: string | null }): number => (c.parent && byItem.has(c.parent) ? 1 + depth(byItem.get(c.parent)!) : 0);
    for (const c of [...chosen].sort((x, y) => depth(x) - depth(y))) {
      if (!yes) { px.decline(c.id); continue; }
      const parent = c.parent ? px.item(c.parent) : null;
      if (c.parent && (!parent || parent.archived)) { px.decline(c.id); continue; }   // its parent was declined: so is it
      px.accept(c.id);
      const edited = !course && c.id === b?.id;                    // an edit is for the one asked about, not its parents
      if (edited && b?.title !== undefined) { const t = clean(b.title, MOST.title); if (t) px.set(c.item, "title", t); }
      if (edited && b?.back !== undefined && px.item(c.item)?.kind === "card") px.set(c.item, "back", clean(b.back, MOST.back));
      const it = px.item(c.item);
      if (it?.kind === "card" && !it.due) { px.set(it.id, "due", today(store)); px.set(it.id, "interval", 0); px.set(it.id, "ease", 250); px.set(it.id, "reps", 0); }
    }
  });
  return learningView(store);
}

// ---- lessons -----------------------------------------------------------------------------------------------------------
export function lessonOf(store: Store, id: unknown) {
  const it = itemIn(store, id, "lesson");
  if (!it) return null;
  const px = store.life.px, mod = it.parent ? px.item(it.parent) : null, course = mod?.parent ? px.item(mod.parent) : null;
  const cards = px.items(it.space, { parent: it.id, kind: "card", archived: false }).map((c) => ({ id: c.id, front: c.title, back: str(c.fields.back) }));
  const since = Date.parse(str(it.fields.writing)), writing = Number.isFinite(since) && store.now() - since < 10 * 60_000;   // a write a restart lost is not waited on
  return { id: it.id, title: it.title, body: str(it.fields.body), writing, done: it.phase === "done",
           module: mod?.title ?? "", course: course?.title ?? "", subject: str(course?.fields.subject), cards };
}
// a lesson finished: 3 ARETE (nine a day pay) and the day's virtue; open again takes them back
export function lessonDone(store: Store, id: unknown, done: boolean, now = new Date(store.now())) {
  const it = itemIn(store, id, "lesson");
  if (!it) return "no such lesson";                                                             // DRAFT
  const px = store.life.px;
  px.transaction(() => {
    if (done && it.phase !== "done") {
      const paid = px.ledger(it.space, { since: midnight(now.getTime()) }).filter((e) => e.op === "award" && !e.back && e.kind === "lesson" && e.key.startsWith("finish:")).reduce((n, e) => n + e.points, 0);
      px.state(it.id, "done", { pay: Math.max(0, Math.min(3, 9 - paid)), reason: "finish" });
      dayVirtue(px, it.id, now);
    } else if (!done && it.phase === "done") {
      px.state(it.id, "open");
      for (const e of px.ledger(it.space).filter((x) => x.item === it.id && !x.back && x.key.startsWith("virtue:"))) px.takeBack(it.id, "award", e.key);
    }
  });
  return lessonOf(store, id);
}
export function lessonWriting(store: Store, id: string, on: boolean) {
  const it = itemIn(store, id, "lesson");
  if (it) store.life.px.set(it.id, "writing", on ? new Date(store.now()).toISOString() : "");
}
export function lessonWritten(store: Store, id: string, body: string) {
  const it = itemIn(store, id, "lesson");
  if (!it) return;
  const px = store.life.px;
  px.transaction(() => { px.set(it.id, "body", body.trim().slice(0, MOST.body)); px.set(it.id, "writing", ""); });
}

// ---- review: the cards due, and a card answered (again, good, easy) on a simple spaced schedule -------------------------
export function dueCards(store: Store, course?: unknown) {
  const s = learningSpace(store), px = store.life.px, day = today(store);
  const c = course ? itemIn(store, course, "course") : null;
  const under = (it: Item) => { if (!c) return true; let p = it.parent; for (let i = 0; i < 4 && p; i++) { if (p === c.id) return true; p = px.item(p)?.parent ?? null; } return false; };
  return px.items(s, { kind: "card", archived: false }).filter((k) => (!k.due || k.due <= day) && under(k))
    .map((k) => ({ id: k.id, front: k.title, back: str(k.fields.back) }));
}
export function review(store: Store, id: unknown, grade: unknown, now = new Date(store.now())) {
  const it = itemIn(store, id, "card");
  if (!it) return "no such card";                                                               // DRAFT
  const g = grade === "again" || grade === "easy" ? grade : "good";
  const px = store.life.px, f = it.fields;
  let interval = Number(f.interval ?? 0), ease = Number(f.ease ?? 250), reps = Number(f.reps ?? 0);
  if (g === "again") { reps = 0; interval = 0; ease = Math.max(130, ease - 20); }
  else {
    interval = reps === 0 ? 1 : reps === 1 ? 3 : Math.max(interval + 1, Math.round((interval * ease) / 100));
    if (g === "easy") { interval = Math.round(interval * 1.3) + 1; ease += 15; }
    reps++;
  }
  const due = new Date(now.getFullYear(), now.getMonth(), now.getDate() + interval);
  px.transaction(() => {
    px.set(it.id, "interval", interval); px.set(it.id, "ease", ease); px.set(it.id, "reps", reps); px.set(it.id, "due", localDate(due));
    const paid = px.ledger(it.space, { since: midnight(now.getTime()) }).filter((e) => e.op === "award" && !e.back && e.kind === "card" && e.key.startsWith("review:")).reduce((n, e) => n + e.points, 0);
    px.award(it.id, `review:${localDate(now)}:${reps}:${interval}:${now.getTime()}`, paid < 20 ? 1 : 0, { reason: "review" });
    dayVirtue(px, it.id, now);
  });
  return { due: localDate(due), interval };
}

// ---- THE TUTOR's words: what it is asked, and what it answered read leniently (a small model's lines may wander) ---------
export const SYLLABUS_ASK = "You are a patient tutor. Plan a short course on the subject given. Answer ONLY in these lines, nothing " +
  "else:\nMODULE: <a module's title>\nLESSON: <a lesson's title>\nCARD: <a question> | <its short answer>\n" +
  "Give 3 to 5 modules; under each, 2 to 4 lessons; under each lesson, 2 to 4 cards. Plain words, no numbering.";
export const LESSON_ASK = "You are a patient tutor. Write one short lesson (150 to 250 words) in plain prose for a beginner: what it " +
  "is, why it matters, one example. No headings, no lists, no preamble.";
export type Syllabus = { title: string; lessons: { title: string; cards: { front: string; back: string }[] }[] }[];
export function readSyllabus(text: string): Syllabus {
  const out: Syllabus = [];
  for (const raw of text.split("\n")) {
    const l = raw.replace(/^[\s*#\-\d.)]+/, "").trim(), m = /^(MODULE|LESSON|CARD)\s*\d*\s*[:\-]\s*(.+)$/i.exec(l);
    if (!m) continue;
    const kind = m[1].toUpperCase(), v = m[2].replace(/\*\*/g, "").trim();
    if (kind === "MODULE") out.push({ title: v.slice(0, MOST.title), lessons: [] });
    else if (kind === "LESSON") { if (!out.length) out.push({ title: "Part one", lessons: [] }); out.at(-1)!.lessons.push({ title: v.slice(0, MOST.title), cards: [] }); }
    else {
      const mod = out.at(-1), les = mod?.lessons.at(-1);
      if (!les) continue;
      const [front, ...rest] = v.split("|");
      if (front.trim() && rest.join("|").trim()) les.cards.push({ front: front.trim().slice(0, MOST.title), back: rest.join("|").trim().slice(0, MOST.back) });
    }
  }
  return out.filter((m) => m.lessons.length).slice(0, 8);
}
// the syllabus proposed under a course: modules, lessons and cards, each a proposal under the one before
export function proposeSyllabus(store: Store, course: string, s: Syllabus, actor = "tutor") {
  const c = itemIn(store, course, "course");
  if (!c) return 0;
  const px = store.life.px, space = learningSpace(store), day = today(store);
  let n = 0;
  px.transaction(() => {
    for (const m of s) {
      const pm = px.proposeMake(space, "module", { title: m.title }, { parent: c.id, actor }); n++;
      for (const l of m.lessons) {
        const pl = px.proposeMake(space, "lesson", { title: l.title }, { parent: pm.item, actor }); n++;
        for (const k of l.cards) { px.proposeMake(space, "card", { title: k.front, back: k.back, due: day, interval: 0, ease: 250, reps: 0 }, { parent: pl.item, actor }); n++; }
      }
    }
    px.set(c.id, "tutor", n ? "proposed" : "nothing"); px.set(c.id, "error", "");
  });
  return n;
}
export function tutorState(store: Store, course: string, state: "asking" | "failed" | "none", error = "") {
  const c = itemIn(store, course, "course");
  if (!c) return;
  const px = store.life.px;
  px.transaction(() => { px.set(c.id, "tutor", state); px.set(c.id, "error", error.slice(0, 200)); });
}

// ---- QUIZZES: a lesson's cards asked as questions; marked by THE TUTOR (api.ts) when the household's mind is here, by
// a plain match of the words otherwise. Passed at two thirds right: 5 ARETE (fifteen a day pay), once, and the day's virtue.
export type Question = { q: string; answer: string };
export type Mark = { right: boolean; note: string };
const words = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length > 1);
// right when most of the answer's own words are in what was given (or the whole short answer is)
export function plainMark(q: Question, given: string): Mark {
  const want = words(q.answer), got = new Set(words(given));
  const hit = want.filter((w) => got.has(w)).length;
  const right = !!want.length && (hit / want.length >= 0.6 || (want.length <= 2 && hit >= 1));
  return { right, note: right ? "" : q.answer };
}
export function quizOf(store: Store, lesson: unknown) {
  const l = itemIn(store, lesson, "lesson");
  if (!l) return "no such lesson";                                                              // DRAFT
  const px = store.life.px, cards = px.items(l.space, { parent: l.id, kind: "card", archived: false });
  if (!cards.length) return "this lesson has no cards to ask yet";                              // DRAFT
  const had = px.items(l.space, { parent: l.id, kind: "quiz", archived: false })[0];
  const questions: Question[] = cards.slice(0, 5).map((c) => ({ q: c.title, answer: str(c.fields.back) }));
  if (!had) px.make(l.space, "quiz", { title: `${l.title}: a quiz`.slice(0, 400), questions: JSON.stringify(questions), answers: "", marks: "", by: "", tries: 0 }, { parent: l.id });
  else px.set(had.id, "questions", JSON.stringify(questions));                                  // the cards as they are now
  return quizView(store, l.id);
}
export function quizView(store: Store, lesson: string) {
  const px = store.life.px, l = itemIn(store, lesson, "lesson"), q = l ? px.items(l.space, { parent: l.id, kind: "quiz", archived: false })[0] : null;
  if (!q) return null;
  const parse = <T,>(v: unknown, d: T): T => { try { return (JSON.parse(str(v)) as T) ?? d; } catch { return d; } };
  const questions = parse<Question[]>(q.fields.questions, []);
  return { id: q.id, lesson, passed: q.phase === "done", tries: Number(q.fields.tries ?? 0), by: str(q.fields.by),
           questions: questions.map((x) => x.q), answers: parse<string[]>(q.fields.answers, []), marks: parse<Mark[]>(q.fields.marks, []) };
}
export function quizQuestions(store: Store, quiz: unknown): Question[] | null {
  const q = itemIn(store, quiz, "quiz");
  if (!q) return null;
  try { return JSON.parse(str(q.fields.questions)) as Question[]; } catch { return []; }
}
// the answers kept and marked (marks by the TUTOR or by plainMark); passed at two thirds right, paid once
export function markQuiz(store: Store, quiz: unknown, answers: unknown, marks: Mark[] | null, by: string, now = new Date(store.now())) {
  const q = itemIn(store, quiz, "quiz"), qs = quizQuestions(store, quiz);
  if (!q || !qs) return "no such quiz";                                                         // DRAFT
  const given = (Array.isArray(answers) ? answers : []).map((a) => String(a ?? "").slice(0, 300));
  const m = qs.map((x, i) => marks?.[i] ?? plainMark(x, given[i] ?? ""));
  const right = m.filter((x) => x.right).length, pass = right >= Math.ceil((qs.length * 2) / 3);
  const px = store.life.px;
  px.transaction(() => {
    px.set(q.id, "answers", JSON.stringify(given)); px.set(q.id, "marks", JSON.stringify(m)); px.set(q.id, "by", by);
    px.set(q.id, "tries", Number(q.fields.tries ?? 0) + 1);
    if (pass && q.phase !== "done") {
      const paid = px.ledger(q.space, { since: midnight(now.getTime()) }).filter((e) => e.op === "award" && !e.back && e.kind === "quiz" && e.key.startsWith("finish:")).reduce((n, e) => n + e.points, 0);
      px.state(q.id, "passed", { pay: Math.max(0, Math.min(5, 15 - paid)), reason: "finish" });
      dayVirtue(px, q.id, now);
    }
  });
  return { ...quizView(store, q.parent!)!, right, of: qs.length, pass };
}
export const MARK_ASK = "You mark a learner's short answers kindly. For each numbered item, answer on its own line exactly " +
  "\"<n>: RIGHT\" or \"<n>: WRONG - <the right answer in a few words>\". Meaning matters, not spelling or wording.";
export function markAsk(qs: Question[], given: string[]) {
  return qs.map((x, i) => `${i + 1}. Question: ${x.q}\n   Expected: ${x.answer}\n   Given: ${given[i] ?? ""}`).join("\n");
}
export function readMarks(text: string, n: number): Mark[] | null {
  const out: (Mark | null)[] = Array.from({ length: n }, () => null);
  for (const line of text.split("\n")) {
    const m = /^\D*(\d+)\s*[:.)-]\s*(RIGHT|WRONG|CORRECT|INCORRECT)\b\s*[-:]?\s*(.*)$/i.exec(line.trim());
    if (!m) continue;
    const i = Number(m[1]) - 1, ok = /^(RIGHT|CORRECT)$/i.test(m[2]);
    if (i >= 0 && i < n) out[i] = { right: ok, note: ok ? "" : m[3].trim().slice(0, 200) };
  }
  return out.every((x) => x) ? (out as Mark[]) : null;
}
