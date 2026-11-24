// C-290: this file runs on the phone too (C-111) -- the app imports it, directly or through another file -- so keep it free of Node-only APIs (node:*, fs).
// BRAIN: cortex.prefrontal (plan) -- work given a time: prospective memory
// C-319 later (the user, 2026-11-10: "maybe even to visualize not just present task but past (or future if we ever add
// it)"; built 2026-11-11 on "Yes, build later"): THE MIND's LATER -- work given a time. A plan says what the hub does and
// when (each week on a day and hour, or each day at an hour, the hub's own clock); the hub runs it when it falls due and
// opens a task for it then; until then the plan's next time is shown in LATER as a "scheduled" task, never kept in the
// ledger. A plan can be switched off, or run now. Every word DRAFT.
import type { Task, TaskKind } from "./tasks.js";

export type Every = "day" | "week" | "month" | "quarter" | "year";
export type Plan = {
  id: string; kind: TaskKind; title: string; said: string;      // said: what it does, for its row in LATER
  every: Every; day?: number; date?: number; hour: number; minute: number;   // day: 0 = Sunday (week plans); date: of the month
  times?: number;                                             // C-455: n times in each week, month, quarter or year, spread evenly
  gate?: true;                                                // C-455: never run -- it says only which days a thing happens on
  on: boolean; last?: string;                                 // last: when it last ran
};
// C-455 (the user, 2026-11-21: "every scheduled job ... gets a cadence: daily, weekly, monthly, or n times a week, month or
// year"): a plan's cadence, as kept -- every and times; the hour, the weekday and the date stay the plan's own
export type Cadence = { every: Every; times?: number };
export const EVERY: Every[] = ["day", "week", "month", "quarter", "year"];
const MOST: Record<Every, number> = { day: 1, week: 7, month: 28, quarter: 90, year: 365 };
export function cadenceOk(c: { every?: unknown; times?: unknown }): Cadence | null {
  if (typeof c.every !== "string" || !EVERY.includes(c.every as Every)) return null;
  const every = c.every as Every;
  if (c.times === undefined || c.times === null) return { every };
  const t = Number(c.times);
  if (!Number.isInteger(t) || t < 1 || t > MOST[every]) return null;
  return t === 1 ? { every } : { every, times: t };
}
// the cadence in words, for LATER and the settings -- DRAFT
const PER: Record<Every, string> = { day: "a day", week: "a week", month: "a month", quarter: "every three months", year: "a year" };
const ONCE: Record<Every, string> = { day: "every day", week: "every week", month: "every month", quarter: "every three months", year: "every year" };
export const cadenceSaid = (p: Pick<Plan, "every" | "times">) =>
  (p.times ?? 1) > 1 ? `${p.times} times ${PER[p.every]}` : ONCE[p.every];
const KEY = "mind.plans";
type Get = (k: string) => string | null;
type Set_ = (k: string, v: string | null) => void;

// The plans the hub has -- DRAFT. Only what the hub can do on its own, with nobody asking.
export const PLANS: Plan[] = [
  { id: "whatsnew.week", kind: "whatsnew", title: "this week's WHAT'S NEW",
    said: "The builds of the week told as one span, on Sunday evening -- only when there were new builds.",
    every: "week", day: 0, hour: 19, minute: 0, on: true },
  // C-455 (the user, 2026-11-21, by multiple choice): MENTIONS FROM YOUR DAEMON -- a letter in its own voice about the
  // span just gone, the numbers under it, arriving on TODAY and kept in its book on the LIBRARY's shelf (mentions.ts)
  { id: "mentions.day", kind: "mentions", title: "DAILY MENTIONS",
    said: "Your daemon's letter about the day: what you did together, the steps and the ARETE, the journal and the dreams.",
    every: "day", hour: 21, minute: 0, on: true },
  { id: "mentions.month", kind: "mentions", title: "THE MONTH'S MENTIONS",
    said: "Your daemon's letter about the month gone, on its first morning.", every: "month", date: 1, hour: 9, minute: 0, on: true },
  { id: "mentions.season", kind: "mentions", title: "THE SEASON'S MENTIONS",
    said: "Your daemon's letter about the three months gone.", every: "quarter", hour: 9, minute: 30, on: true },
  { id: "mentions.year", kind: "mentions", title: "THE YEAR'S MENTIONS",
    said: "Your daemon's letter about the year gone, on New Year's morning.", every: "year", hour: 10, minute: 0, on: true },
  // C-455: the nights a dream is told (by the thinker, in the dreamer's voice) -- every night slept is still kept and
  // written; this only picks which are told. A gate: never run, only asked (fallsOn) of the morning the night ended.
  { id: "dreams.told", kind: "dream", title: "DREAMS TOLD",
    said: "The nights a dream is told in its dreamer's voice. Every night slept is still written down.",
    every: "day", hour: 6, minute: 0, on: true, gate: true },
];

// the plans with what was kept of each (on, last); a plan dropped from PLANS is forgotten
type Kept = { on?: boolean; last?: string; every?: Every; times?: number };
export function plans(get: Get): Plan[] {
  let kept: Record<string, Kept> = {};
  try { const k = JSON.parse(get(KEY) ?? "{}"); if (k && typeof k === "object" && !Array.isArray(k)) kept = k; } catch { /* the defaults */ }
  return PLANS.map((p) => {
    const k = kept[p.id], c = k?.every ? cadenceOk(k) : null;   // a cadence kept badly is the plan's own again
    const { times: _t, ...own } = p;
    return { ...(c ? own : p), ...(c ? { every: c.every, ...(c.times ? { times: c.times } : {}) } : {}),
             ...(typeof k?.on === "boolean" ? { on: k.on } : {}), ...(typeof k?.last === "string" ? { last: k.last } : {}) };
  });
}
// C-455: a cadence given is checked (cadenceOk) by the caller; `cadence: null` returns the plan to its own
export function keepPlan(get: Get, set: Set_, id: string, patch: { on?: boolean; last?: string; cadence?: Cadence | null }): Plan | null {
  if (!PLANS.some((p) => p.id === id)) return null;
  let kept: Record<string, Kept> = {};
  try { const k = JSON.parse(get(KEY) ?? "{}"); if (k && typeof k === "object" && !Array.isArray(k)) kept = k; } catch { /* fresh */ }
  const { cadence, ...rest } = patch;
  const was = { ...kept[id] };
  if (cadence !== undefined) { delete was.every; delete was.times; }
  kept[id] = { ...was, ...rest, ...(cadence ? { every: cadence.every, ...(cadence.times ? { times: cadence.times } : {}) } : {}) };
  set(KEY, JSON.stringify(kept));
  return plans(get).find((p) => p.id === id) ?? null;
}

// C-455: a plan's times fall in periods -- a day, a week from Sunday, a month, a quarter from January, April, July and
// October, a year from January -- each holding its `times` (one if none), spread evenly from the period's first day; one
// time a week falls on the plan's weekday, one a month on its date (the last day of a short month, if the date is past it)
const DAY = 86400e3;
function periodOf(p: Plan, t: Date): Date {
  const d = new Date(t.getFullYear(), t.getMonth(), t.getDate());
  if (p.every === "week") d.setDate(d.getDate() - d.getDay());
  if (p.every === "month" || p.every === "quarter" || p.every === "year") d.setDate(1);
  if (p.every === "quarter") d.setMonth(d.getMonth() - (d.getMonth() % 3));
  if (p.every === "year") d.setMonth(0);
  return d;
}
function shift(p: Plan, start: Date, by: number): Date {
  const d = new Date(start);
  if (p.every === "day") d.setDate(d.getDate() + by);
  else if (p.every === "week") d.setDate(d.getDate() + 7 * by);
  else d.setMonth(d.getMonth() + by * (p.every === "month" ? 1 : p.every === "quarter" ? 3 : 12));
  return d;
}
function slotsIn(p: Plan, start: Date): Date[] {
  const len = Math.round((shift(p, start, 1).getTime() - start.getTime()) / DAY);
  const n = p.every === "day" ? 1 : Math.max(1, Math.min(p.times ?? 1, len));
  const offsets = n === 1
    ? [p.every === "week" ? (p.day ?? 0) : p.every === "month" ? Math.min(len, Math.max(1, p.date ?? 1)) - 1 : 0]
    : Array.from({ length: n }, (_, k) => Math.floor((k * len) / n));
  return offsets.map((o) => { const d = new Date(start); d.setDate(d.getDate() + o); d.setHours(p.hour, p.minute, 0, 0); return d; });
}
// the plan's time on or before `t` (its last due), and after `t` (its next)
export function lastDue(p: Plan, now: Date): Date {
  const here = periodOf(p, now);
  const all = [...slotsIn(p, shift(p, here, -1)), ...slotsIn(p, here)].filter((d) => d <= now);
  return all[all.length - 1];
}
export function nextDue(p: Plan, now: Date): Date {
  const here = periodOf(p, now);
  return [...slotsIn(p, here), ...slotsIn(p, shift(p, here, 1))].find((d) => d > now)!;
}
// C-455: whether one of the plan's times falls on the calendar day of `t` -- a gate's question (a dream told that night?)
export function fallsOn(p: Plan, t: Date): boolean {
  if (!p.on) return false;
  const same = (d: Date) => d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
  return slotsIn(p, periodOf(p, t)).some(same);
}
// due now: on, and not run since its last time came -- a plan first seen is not run for a time that passed before it
// existed (its last is set to now instead, by the caller)
export const isDue = (p: Plan, now: Date) => p.on && !p.gate && !!p.last && Date.parse(p.last) < lastDue(p, now).getTime();

// The plan's next time, as a task for LATER
export function planTask(p: Plan, now: Date, mind?: string): Task {
  const due = nextDue(p, now).toISOString();
  return { id: `plan-${p.id}`, kind: p.kind, title: p.title, user: "the house", device: "the hub", ...(mind ? { mind } : {}),
           state: "scheduled", at: due, due, plan: p.id, source: "schedule" };
}

// What a week's span is: the builds dated in the seven days before `now`, oldest and newest -- null when none
export function weekSpan(builds: { build: number; date: string }[], now: Date): { from: number; to: number } | null {
  const since = now.getTime() - 7 * 86400e3;
  const week = builds.filter((b) => { const t = Date.parse(b.date); return Number.isFinite(t) && t > since && t <= now.getTime(); }).map((b) => b.build);
  return week.length ? { from: Math.min(...week), to: Math.max(...week) } : null;
}
