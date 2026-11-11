// C-290: this file runs on the phone too (C-111) -- the app imports it, directly or through another file -- so keep it free of Node-only APIs (node:*, fs).
// C-319 later (the user, 2026-11-10: "maybe even to visualize not just present task but past (or future if we ever add
// it)"; built 2026-11-11 on "Yes, build later"): THE MIND's LATER -- work given a time. A plan says what the hub does and
// when (each week on a day and hour, or each day at an hour, the hub's own clock); the hub runs it when it falls due and
// opens a task for it then; until then the plan's next time is shown in LATER as a "scheduled" task, never kept in the
// ledger. A plan can be switched off, or run now. Every word DRAFT.
import type { Task } from "./tasks.js";

export type Plan = {
  id: string; kind: string; title: string; said: string;      // said: what it does, for its row in LATER
  every: "week" | "day"; day?: number; hour: number; minute: number;   // day: 0 = Sunday (week plans)
  on: boolean; last?: string;                                 // last: when it last ran
};
const KEY = "mind.plans";
type Get = (k: string) => string | null;
type Set_ = (k: string, v: string | null) => void;

// The plans the hub has -- DRAFT. Only what the hub can do on its own, with nobody asking.
export const PLANS: Plan[] = [
  { id: "whatsnew.week", kind: "whatsnew", title: "this week's WHAT'S NEW",
    said: "The builds of the week told as one span, on Sunday evening -- only when there were new builds.",
    every: "week", day: 0, hour: 19, minute: 0, on: true },
];

// the plans with what was kept of each (on, last); a plan dropped from PLANS is forgotten
export function plans(get: Get): Plan[] {
  let kept: Record<string, { on?: boolean; last?: string }> = {};
  try { const k = JSON.parse(get(KEY) ?? "{}"); if (k && typeof k === "object" && !Array.isArray(k)) kept = k; } catch { /* the defaults */ }
  return PLANS.map((p) => ({ ...p, ...(typeof kept[p.id]?.on === "boolean" ? { on: kept[p.id].on! } : {}),
                             ...(typeof kept[p.id]?.last === "string" ? { last: kept[p.id].last } : {}) }));
}
export function keepPlan(get: Get, set: Set_, id: string, patch: { on?: boolean; last?: string }): Plan | null {
  if (!PLANS.some((p) => p.id === id)) return null;
  let kept: Record<string, { on?: boolean; last?: string }> = {};
  try { const k = JSON.parse(get(KEY) ?? "{}"); if (k && typeof k === "object" && !Array.isArray(k)) kept = k; } catch { /* fresh */ }
  kept[id] = { ...kept[id], ...patch };
  set(KEY, JSON.stringify(kept));
  return plans(get).find((p) => p.id === id) ?? null;
}

// the plan's time on or before `t` (its last due), and after `t` (its next)
function dueOn(p: Plan, t: Date): Date {
  const d = new Date(t);
  d.setHours(p.hour, p.minute, 0, 0);
  if (p.every === "week") d.setDate(d.getDate() - ((d.getDay() - (p.day ?? 0) + 7) % 7));
  if (d > t) d.setDate(d.getDate() - (p.every === "week" ? 7 : 1));
  return d;
}
export const lastDue = (p: Plan, now: Date) => dueOn(p, now);
export function nextDue(p: Plan, now: Date): Date {
  const d = dueOn(p, now);
  d.setDate(d.getDate() + (p.every === "week" ? 7 : 1));
  return d;
}
// due now: on, and not run since its last time came -- a plan first seen is not run for a time that passed before it
// existed (its last is set to now instead, by the caller)
export const isDue = (p: Plan, now: Date) => p.on && !!p.last && Date.parse(p.last) < lastDue(p, now).getTime();

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
