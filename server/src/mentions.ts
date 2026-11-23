// C-290: this file runs on the phone too (C-111) -- the app imports it, directly or through another file -- so keep it free of Node-only APIs (node:*, fs).
// C-455 (the user, 2026-11-21: "scheduled daemons write reviews of the player's stats -- daily, monthly, three-monthly,
// yearly -- as a task with a game name (their example: Mentions from your Daemon)"; by multiple choice: a letter in its
// own voice, the numbers under it; one name per span; on TODAY, then kept in a book on the LIBRARY's shelf):
// MENTIONS FROM YOUR DAEMON. When a span's plan falls due (ai/schedule.ts), what the span held is counted -- the cares and
// talks, the steps and goals finished, the ARETE earned, the journal and the dreams -- and the carried daemon writes the
// player a short letter about it, in its own voice, the numbers set under it. With no mind in the house the letter is
// written plainly from the numbers instead, so a span is never lost. Every one is kept for good (docs/REVIEWS.md).
// MIND: it is handed its writer (a Writer); it never calls a model itself. Every word DRAFT.
import type { Store } from "./shared/store.js";
import { DAY_WORDS } from "./memory.js";
import { dreamsOf } from "./dreams.js";
import { entriesBetween, type Writer } from "./lifemanagement/journal.js";

export type Span = "day" | "month" | "season" | "year";
export const SPANS: Span[] = ["day", "month", "season", "year"];
export const BOOK = "MENTIONS FROM YOUR DAEMON";   // DRAFT
// each span's name, its plan in ai/schedule.ts, how far back it reaches at most, and how its letter is sized -- DRAFT
export const SPAN: Record<Span, { title: string; plan: string; months: number; days: number; words: number }> = {
  day: { title: "DAILY MENTIONS", plan: "mentions.day", months: 0, days: 1, words: 110 },
  month: { title: "THE MONTH'S MENTIONS", plan: "mentions.month", months: 1, days: 0, words: 170 },
  season: { title: "THE SEASON'S MENTIONS", plan: "mentions.season", months: 3, days: 0, words: 220 },
  year: { title: "THE YEAR'S MENTIONS", plan: "mentions.year", months: 12, days: 0, words: 300 },
};
export const spanOfPlan = (plan: string): Span | null => SPANS.find((s) => SPAN[s].plan === plan) ?? null;

// The span a letter covers: from the last letter of its kind (when a cadence was changed it reaches only that far) to
// now, and never further back than the span's own length -- a daily letter switched on after a month covers one day
// -- a month, a season or a year runs midnight to midnight, so the month's letter on the 1st covers the month gone whole
export function windowOf(span: Span, now: Date, lastTo: string | null): { from: Date; to: Date } {
  const end = span === "day" ? new Date(now) : new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const floor = new Date(end);
  floor.setMonth(floor.getMonth() - SPAN[span].months);
  floor.setDate(floor.getDate() - SPAN[span].days);
  const last = lastTo ? Date.parse(lastTo) : NaN;
  const from = Number.isFinite(last) && last > floor.getTime() && last < end.getTime() ? new Date(last) : floor;
  return { from, to: end };
}
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const dayWords = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]}`;
// the span in words, for the page's head: "21 November", "October", "21 October to 21 November" -- DRAFT
export function spanSaid(from: Date, to: Date, span?: Span): string {
  const end = new Date(to.getTime() - 1);
  if (span === "day") return dayWords(to);                     // a day's letter is the day it was written
  if (from.getFullYear() === end.getFullYear() && from.getMonth() === end.getMonth() && from.getDate() === end.getDate()) return dayWords(end);
  const months = (to.getFullYear() - from.getFullYear()) * 12 + to.getMonth() - from.getMonth();
  if (from.getDate() === 1 && from.getHours() === 0 && to.getDate() === 1 && to.getHours() === 0 && months > 0) {
    if (months === 1) return `${MONTHS[from.getMonth()]} ${from.getFullYear()}`;
    if (months === 12 && from.getMonth() === 0) return `${from.getFullYear()}`;
  }
  return `${dayWords(from)}${from.getFullYear() !== end.getFullYear() ? ` ${from.getFullYear()}` : ""} to ${dayWords(end)} ${end.getFullYear()}`;
}

// ---- the numbers ----
export type Stats = {
  together: { said: string; n: number }[];   // the cares and the talks, counted by memory's words ("a meal", or "meals" for two or more)
  steps: number; goals: string[]; arete: number;
  entries: number; dreamsWritten: number;    // the player's own journal and dream journal
  nights: number; vivid: number; quiet: number; broken: number;   // the daemon's own nights
};
export function statsOf(store: Store, from: Date, to: Date): Stats {
  const seen = store.interactionsSince(from).filter((e) => Date.parse(e.at) < to.getTime());
  const together = DAY_WORDS.map(([kinds, one, many]) => { const n = seen.filter((e) => kinds.includes(e.kind)).length; return { said: n === 1 ? one : many, n }; }).filter((c) => c.n > 0);
  const { steps, goals } = store.goalsDoneBetween(from, to);
  const e = entriesBetween(store, from, to);
  const nights = dreamsOf(store).filter((d) => { const t = Date.parse(d.to); return t >= from.getTime() && t < to.getTime(); });
  return { together, steps: steps.length, goals: goals.map((g) => g.title), arete: store.areteBetween(from, to),
           entries: e.standard, dreamsWritten: e.dream, nights: nights.length,
           vivid: nights.filter((d) => d.quality === "vivid").length, quiet: nights.filter((d) => d.quality === "quiet").length,
           broken: nights.filter((d) => d.quality === "broken").length };
}
const many = (n: number, one: string, more: string) => `${n} ${n === 1 ? one : more}`;
export const togetherSaid = (c: { said: string; n: number }) => c.n === 1 ? c.said : `${c.n} ${c.said}`;
// the numbers as the lines under the letter -- DRAFT
export function statLines(s: Stats): string[] {
  return [
    s.steps || s.goals.length ? `${many(s.steps, "step", "steps")} done${s.goals.length ? `, ${many(s.goals.length, "goal", "goals")} finished` : ""}` : "",
    s.arete ? `${s.arete} ARETE earned` : "",
    s.together.length ? `together: ${s.together.map(togetherSaid).join(", ")}` : "",
    s.entries ? `${many(s.entries, "journal entry", "journal entries")} written` : "",
    s.dreamsWritten ? `${many(s.dreamsWritten, "dream", "dreams")} written down` : "",
    s.nights ? `${many(s.nights, "night", "nights")} slept${s.vivid ? `, ${s.vivid} vivid` : ""}${s.broken ? `, ${s.broken} broken` : ""}` : "",
  ].filter(Boolean);
}
export const quiet = (s: Stats) => statLines(s).length === 0;

// ---- the letter ----
// The ask: the daemon's persona of the day (persona.ts) as the system, and the span's numbers as the material
export const MENTIONS_ASK = "Write a short letter to the person you travel with, in your own voice, about the span of time " +
  "below and what the two of you did in it. Speak to them as 'you'. Notice what went well and say so warmly; mention what " +
  "was quiet without blame, never as a failing, and never ask for more. Use only what the numbers say -- do not invent " +
  "events. No title, no list, no sign-off line with your name: just the letter, in plain sentences.";
export function mentionsAsk(span: Span, stats: Stats, who: { nickname: string; persona?: string | null }, said: string): { system: string; user: string } {
  const system = [who.persona || `You are ${who.nickname}, a daemon who travels with the person you are writing to.`, MENTIONS_ASK,
                  `Keep it under ${SPAN[span].words} words.`].join("\n\n");
  const lines = statLines(stats);
  const user = `The span: ${SPAN[span].title.toLowerCase()}, ${said}.\n` +
    (lines.length ? `What it held:\n${lines.map((l) => `- ${l}`).join("\n")}` : "It was a quiet span: little was done together, and that is all right.") +
    (stats.goals.length ? `\nThe goals finished: ${stats.goals.map((g) => `"${g}"`).join(", ")}.` : "");
  return { system, user };
}
export function readLetter(t: string | null | undefined): string {
  // its thinking left out, and a heading it put on top of its own accord (a letter has none)
  return (t ?? "").replace(/<think>[\s\S]*?<\/think>/g, "").replace(/^\s*#+[^\n]*\n/, "").trim().slice(0, 4000);
}
// with no mind in the house: the letter written plainly from the numbers -- DRAFT
export function plainLetter(span: Span, stats: Stats, said: string): string {
  const when = span === "day" ? "Today" : span === "month" ? "This month" : span === "season" ? "These three months" : "This year";
  if (quiet(stats)) return `${when} (${said}) was a quiet one for us, and that is all right. I am here whenever you want to do something together.`;
  const bits: string[] = [];
  if (stats.goals.length) bits.push(`you finished ${stats.goals.length === 1 ? `"${stats.goals[0]}"` : `${stats.goals.length} goals`}`);
  if (stats.steps) bits.push(`you took ${many(stats.steps, "step", "steps")} toward what you want`);
  if (stats.together.length) bits.push(`we shared ${stats.together.slice(0, 3).map(togetherSaid).join(", ")}`);
  if (stats.entries || stats.dreamsWritten) bits.push("you wrote things down");
  if (stats.nights) bits.push(`I slept ${many(stats.nights, "night", "nights")} beside you`);
  return `${when} (${said}) ${bits.length > 1 ? `${bits.slice(0, -1).join(", ")} and ${bits[bits.length - 1]}` : bits[0]}. I noticed, and I was glad.`;
}

// ---- the book: every letter kept for good ----
export type Mention = { id: number; span: Span; title: string; from: string; to: string; said: string; at: string;
                        personality: number | null; species: number | null; nickname: string;
                        state: "writing" | "done" | "failed"; body: string; by: string; stats: Stats; read: boolean; error: string | null };
const ready = new WeakSet<Store>();
function table(store: Store) {
  if (ready.has(store)) return;
  store.db.exec(`CREATE TABLE IF NOT EXISTS mentions (id INTEGER PRIMARY KEY, span TEXT NOT NULL, from_at TEXT NOT NULL, to_at TEXT NOT NULL,
    at TEXT NOT NULL, personality INTEGER, species INTEGER, nickname TEXT NOT NULL DEFAULT '', state TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '', by TEXT NOT NULL DEFAULT '', stats TEXT NOT NULL DEFAULT '{}', read INTEGER NOT NULL DEFAULT 0, error TEXT)`);
  ready.add(store);
}
const rowOf = (r: any): Mention => {
  const span = (SPANS.includes(r.span) ? r.span : "day") as Span;
  let stats: Stats; try { stats = JSON.parse(r.stats); } catch { stats = statsEmpty(); }
  return { id: r.id, span, title: SPAN[span].title, from: r.from_at, to: r.to_at, said: spanSaid(new Date(r.from_at), new Date(r.to_at), span), at: r.at,
           personality: r.personality ?? null, species: r.species ?? null, nickname: r.nickname || "your daemon",
           state: r.state, body: r.body, by: r.by, stats, read: !!r.read, error: r.error ?? null };
};
const statsEmpty = (): Stats => ({ together: [], steps: 0, goals: [], arete: 0, entries: 0, dreamsWritten: 0, nights: 0, vivid: 0, quiet: 0, broken: 0 });
export function mentionsOf(store: Store, limit = 500): Mention[] {
  table(store);
  return (store.db.prepare("SELECT * FROM mentions ORDER BY to_at DESC, id DESC LIMIT ?").all(limit) as any[]).map(rowOf);
}
export function lastOf(store: Store, span: Span): Mention | null {
  table(store);
  const r = store.db.prepare("SELECT * FROM mentions WHERE span = ? AND state != 'failed' ORDER BY to_at DESC, id DESC LIMIT 1").get(span);
  return r ? rowOf(r) : null;
}
// a letter begun: kept at once with its plain words, so a mind that never answers still leaves a page
export function beginMention(store: Store, span: Span, from: Date, to: Date, stats: Stats,
                             who: { personality: number | null; species: number | null; nickname: string }, now = new Date()): Mention {
  table(store);
  const body = plainLetter(span, stats, spanSaid(from, to, span));
  const r = store.db.prepare("INSERT INTO mentions (span, from_at, to_at, at, personality, species, nickname, state, body, by, stats) " +
    "VALUES (?, ?, ?, ?, ?, ?, ?, 'writing', ?, 'words', ?)").run(span, from.toISOString(), to.toISOString(), now.toISOString(),
    who.personality, who.species, who.nickname, body, JSON.stringify(stats));
  return mentionOf(store, Number(r.lastInsertRowid))!;
}
export function mentionOf(store: Store, id: number): Mention | null {
  table(store);
  const r = store.db.prepare("SELECT * FROM mentions WHERE id = ?").get(id);
  return r ? rowOf(r) : null;
}
// the mind's letter, or the plain one kept (state done, by "words") when no words came
export function finishMention(store: Store, id: number, letter: string | null, by: string) {
  table(store);
  if (letter) store.db.prepare("UPDATE mentions SET state = 'done', body = ?, by = ?, error = NULL WHERE id = ?").run(letter, by, id);
  else store.db.prepare("UPDATE mentions SET state = 'done' WHERE id = ?").run(id);
}
export function markRead(store: Store, id: number): boolean {
  table(store);
  return store.db.prepare("UPDATE mentions SET read = 1 WHERE id = ?").run(id).changes > 0;
}
// TODAY's card: the newest letter not yet read, if it came in the last day and a half
export function newestUnread(store: Store, now = new Date()): Mention | null {
  return mentionsOf(store, 20).find((m) => !m.read && m.state !== "failed" && now.getTime() - Date.parse(m.at) < 36 * 3600_000) ?? null;
}

// The whole of it, for a mind given a Writer (a test, or api.ts with the house's)
export async function writeMention(store: Store, span: Span, now: Date, who: { personality: number | null; species: number | null; nickname: string; persona?: string | null },
                                   write: Writer | null, by: string): Promise<Mention> {
  const { from, to } = windowOf(span, now, lastOf(store, span)?.to ?? null);
  const stats = statsOf(store, from, to);
  const m = beginMention(store, span, from, to, stats, who, now);
  if (!write) { finishMention(store, m.id, null, "words"); return mentionOf(store, m.id)!; }
  const ask = mentionsAsk(span, stats, who, m.said);
  try {
    const letter = readLetter(await write(ask.system, ask.user, Math.round(SPAN[span].words * 3)));
    finishMention(store, m.id, letter || null, letter ? by : "words");
  } catch { finishMention(store, m.id, null, "words"); }
  return mentionOf(store, m.id)!;
}
