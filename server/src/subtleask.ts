// C-229, C-230 (the user, 2026-10-28, by multiple choice): ASK THE SUBTLE LAYER -- the GUIDE's sibling, answering by
// instinct where the GUIDE answers by reason (DAEMONS vision 4.36, 4.38: the player's own INSTINCT and REASON; never the
// word LOGIC, a type's name). Asked anything, the book gives ONE LINE from its nearest page, then A QUESTION BACK that
// turns the asker to what they notice. TWO VOICES, its own entry ("one says a thing, the other asks what it means"),
// answers only in the asking voice, printed faint. Its part of the day is the CENTRE, the WORD and the NOTE (the GUIDE's
// is the virtue over its shadow): some of its questions are set in them, not every one. And once a day it asks a
// question of its own, the answer kept in a journal "with the day and the centre", as TRUE OR NOT tells a trainer to.
//
// The line is the book's own sentence, drawn from the page nearest the question -- no model needed, so it answers on a
// phone alone and with no hub; where the hub's module is, it may say the line in its own words instead (api.ts). The
// questions are written. Every word DRAFT. No node: imports (it runs on the phone, hosting alone).
import type { Subtle } from "./save/subtle.js";
import type { Store } from "./store.js";
import { guidePages } from "./guideask.js";

export type Day = { day: string; chakra: string; note: string; theme: string };
type Entry = { title: string; paragraphs: { text: string; voice: string }[] };

const COMMON = new Set(("the a an and or but of to in on at for with is are was were be been it its this that these those i you your " +
  "my me we our they them he she his her what why how when where who which do does did can could would should will " +
  "not no so if as by from about into than then there here have has had just").split(" "));
const wordsOf = (t: string) => (t.toLowerCase().match(/[a-z']+/g) ?? []).filter((w) => w.length > 2 && !COMMON.has(w));
// words too loose to answer by or ask about (2026-10-28: "I feel stuck lately" drew the foreword, and was asked about "lately")
const FILLER = new Set(("lately really always never maybe very still today tonight something anything everything nothing think thought " +
  "feel feeling felt like know want need keep kind sort thing things much more most some been being going getting make").split(" "));
const hash = (s: string) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0; return h; };
const fill = (t: string, d: Day) => t.replaceAll("{centre}", d.chakra).replaceAll("{note}", d.note).replaceAll("{word}", d.theme);
const entriesOf = (s: Subtle) => ((s.sections ?? []) as { entries: Entry[] }[]).flatMap((x) => x.entries);
const told = (e: Entry) => e.paragraphs.filter((p) => p.voice === "telling").map((p) => p.text.replace(/\s+/g, " ").trim());
// its sentences that say something -- a question of its own read as an answer asks the asker nothing (2026-10-28)
const sentences = (t: string) => t.match(/[^.!?]+[.!?]+["')]*/g)?.map((x) => x.trim()).filter((x) => x.length > 12 && !/\?["')]*$/.test(x)) ?? [];

// ---- the line: the book's own sentence, from the page nearest what was asked -------------------------------------------
export type Line = { title: string; line: string; page: string };
// the page nearest the question (its words shared, a title's twice), and the sentence on it nearest the question; with
// no page near it, a line drawn by the day -- the book still answers, as a read does, about something
export function subtleLine(s: Subtle, question: string, seed: string): Line | null {
  if (!s.held) return null;
  const entries = entriesOf(s).filter((e) => told(e).length && (e as { short?: string }).short !== "PROLOGUE");   // the foreword is the author's, not an answer
  if (!entries.length) return null;
  const q = new Set(wordsOf(question).filter((w) => !FILLER.has(w)));
  const score = (t: string) => wordsOf(t).filter((w) => q.has(w)).length;
  const ranked = entries.map((e) => ({ e, n: score(told(e).join(" ")) + 2 * score(e.title) })).sort((a, b) => b.n - a.n);
  const e = ranked[0].n > 0 ? ranked[0].e : entries[hash(seed) % entries.length];
  const all = told(e).flatMap(sentences);
  if (!all.length) return null;
  const best = Math.max(...all.map(score));
  const near = all.filter((x) => score(x) === best);
  const line = near[hash(seed + question) % near.length];
  return { title: e.title, line: line.length > 180 ? line.slice(0, 177).replace(/\s+\S*$/, "") + "..." : line,
           page: told(e).join(" ") };                         // whole: what the module is given is cut (subtlePages)
}

// ---- the question back, and the asking voice ----------------------------------------------------------------------------
const BACK = [                                                       // DRAFT -- {centre} {word} {note}: the day's own
  "What did you notice first, before you thought it through?",
  "Where in you does that sit? Today's centre is the {centre}.",
  "If it were quieter, what would be left?",
  "Is that a read, or a story you are telling? The calm only points.",
  "Hum {note} and ask it again. What changed?",
  "Today's word is {word}. Does it fit what you sense?",
  "What do you already know about this, that you have not said?",
];
export function questionBack(question: string, day: Day, seed: string): string {
  return fill(BACK[hash(seed + "|" + question) % BACK.length], day);
}
// TWO VOICES: "one says a thing, the other asks what it means" -- the asking voice only, a turn at a time; it takes up a
// word of what was said where it can (the longest of its own), else asks as the book's own asking voice does
const WITH_WORD = ["What does \"{w}\" mean, here?", "And under \"{w}\", what is there?", "Is \"{w}\" a read, or a story?",
                   "Where in you is \"{w}\"? Today's centre is the {centre}."];   // DRAFT
const PLAIN = ["What breaks it?", "Is watching enough?", "And if it were quieter?", "What would you notice, if you were not trying to?",
               "Then what is it, before it has a name?"];                           // DRAFT -- the first two the book's own
export function askingVoice(said: string, turn: number, day: Day): string {
  const w = wordsOf(said).filter((x) => x.length >= 4 && !FILLER.has(x)).sort((a, b) => b.length - a.length)[0];
  return w ? fill(WITH_WORD[turn % WITH_WORD.length], day).replace("{w}", w) : PLAIN[turn % PLAIN.length];
}

// ---- the daily question, and the journal ----------------------------------------------------------------------------------
const DAILY = [                                                     // DRAFT -- THE ROUTINE's moments, and the day's own
  "At waking, before anything else: what do you sense about today?",
  "Today's centre is the {centre}. What do you notice there, right now?",
  "Today's word is {word}. Where did you meet it today?",
  "The note is {note}. Hum it once. What comes with it?",
  "At rest: what did today ask of you that you did not answer?",
  "Before you steer anything today: what do you want, under what you want?",
  "What read came to you today, and did it land?",
];
export type Today = { date: string; question: string; centre: string; note: string; word: string;
                      card?: { n: number; side: string; keyword: string; shiny: boolean } };   // C-232: the day's card, kept beside the answer
export function todaysQuestion(date: string, day: Day): Today {
  return { date, question: fill(DAILY[hash(date) % DAILY.length], day), centre: day.chakra, note: day.note, word: day.theme };
}
export type Kept = Today & { answer: string; at: string };
const KEEP = 120;
export function journalOf(store: Store): Kept[] {
  try { const l = JSON.parse(store.getSetting("subtle.journal") ?? "[]"); return Array.isArray(l) ? l : []; } catch { return []; }
}
// one answer a day: answered again, the day's is replaced
export function keepAnswer(store: Store, t: Today, answer: string, now = new Date()): Kept | string {
  const a = answer.replace(/\s+/g, " ").trim().slice(0, 500);
  if (!a) return "an answer is a few words";
  const k: Kept = { ...t, answer: a, at: now.toISOString() };
  store.setSetting("subtle.journal", JSON.stringify([k, ...journalOf(store).filter((x) => x.date !== t.date)].slice(0, KEEP)));
  return k;
}

// ---- an answer, whole -- the routes (a phone alone: the book's own line) and api.ts (the module's, where it is) ----------
export type Answer = { mode: "ask" | "voices"; title: string | null; line: string; back: string; asking: string };
export function answerOf(s: Subtle, text: string, mode: "ask" | "voices", turn: number, day: Day, date: string): Answer {
  if (mode === "voices") return { mode, title: null, line: "", back: "", asking: askingVoice(text, turn, day) };
  const l = subtleLine(s, text, date);
  return { mode, title: l?.title ?? null, line: l?.line ?? "", back: questionBack(text, day, date), asking: "" };
}
// the module's words are kept only when they are the page's: most of what it says found there, and nothing about the book
// itself (2026-10-28, on the hub: "Di is a small demon from the book The Subtle Layer designed to teach" -- the 0.5B riffing
// on the book's name, nowhere in it). Otherwise the book's own sentence stands.
export function groundedIn(said: string, page: string): boolean {
  const p = new Set(wordsOf(page)), w = wordsOf(said).filter((x) => !FILLER.has(x));
  if (!w.length || /subtle layer|\bbook\b/i.test(said)) return false;
  return w.filter((x) => p.has(x)).length / w.length >= 0.6;
}
// the module's thinker is shared by the books (guideask.ts GUIDE_SETUP): THE SUBTLE LAYER's nearest page rides in the input
export const subtlePages = (s: Subtle) => (heard: string, chars = 170) => {
  const l = subtleLine(s, heard, "");
  return guidePages(l ? [{ title: l.title, text: l.page.slice(0, chars) }] : []);
};

// ---- the GUIDE's part of the day: the virtue said over its shadow, under some of its answers (DRAFT) --------------------
export function guideAside(question: string, cue: string, date: string): string | null {
  return cue && hash(date + "|" + question) % 3 === 0 ? `Today: ${cue}.` : null;
}
export const dayOf = (t: { day: { day: string; chakra: string; note: string; theme: string } }): Day =>
  ({ day: t.day.day, chakra: t.day.chakra, note: t.day.note, theme: t.day.theme });
