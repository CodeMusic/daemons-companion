// C-290: this file runs on the phone too (C-111) -- the app imports it, directly or through another file -- so keep it free of Node-only APIs (node:*, fs).
// C-120 (the user, 2026-10-12): the hosted daemon's feelings -- carried over from the AI harness's feelings.js
// (gpt-play-pokemon-firered-daemons, branch context-content), in the shape it ended in and the user chose again:
//
//   GLAD        sanguine      0..100
//   MAD         choleric      0..100
//   SAD         melancholic   0..100   (there is no feeling on the far side of un-sad, so these three never go below 0)
//   CALM        phlegmatic  -100..100  the one axis that is truly +/0/-: calm one way, AFRAID the other
//   RESTLESS    a drive, not a humour, 0..100: what time with nothing in it builds up
//
// DERIVED, NEVER REPORTED, as life.ts is: read from what has happened (the interactions kept since C-13) and the clock.
// Nothing is stored that runs down on its own, and a phone hosting alone (C-111) works them out the same way.
//
// EACH EVENT FADES ON ITS OWN CLOCK. An event pushes its axes, and its push is half gone in HALF_LIFE (the user: three
// hours). The pushes are kept apart rather than summed and forgotten, so the daemon always knows WHAT it is answering --
// the event behind a feeling is the one whose push is largest now: near in time, and strong in kind. That is the link the
// user asked for between a response and its event "through their causal relational temporal distance"; the harness
// had the fading but threw the causes away each turn.
//
// NEVER NAMED. The words are for the code. On a screen a feeling only shows -- in an expression (C-119), never a label
// (the game's craft rule: "never say the thesis"; the harness's prompt: "shows in what you notice, not in a label").
import type { Interaction } from "../damagotchi/life.js";
import { MEALS } from "../damagotchi/life.js";

export const AXES = ["glad", "mad", "sad", "calm", "restless"] as const;
export type Axis = (typeof AXES)[number];
export type Push = Partial<Record<Axis, number>>;
export type Cause = { kind: string; at: string; axis: Axis; now: number };
export type Feelings = Record<Axis, number> & { strongest: Cause | null };

export const HALF_LIFE_MS = 3 * 3600000;
const LOOK_BACK_MS = 24 * 3600000;                 // after a day a push is under half a percent of itself
const MIN = (a: Axis) => (a === "calm" ? -100 : 0);

// What each kind of time together pushes -- DRAFT, small on purpose (PLAN 7: no effect is large, nothing compounds)
export const PUSHES: Record<string, Push> = {
  feed: { glad: 12 },
  water: { glad: 10 },
  train: { glad: 8 },
  step: { glad: 15 },                              // a step of your goal, finished together
  walk: { glad: 15 },                              // the day's walking goal reached (C-48)
  routine: { glad: 5 },                            // a radio routine run on a board
  met: { glad: 10 },                               // another companion's daemon, nearby (C-15)
  sleep: { calm: 20 },                             // put to bed (C-114)
  // derived below, from the clock and the log
  "missed-meal": { sad: 12 },                      // a meal time passed with nothing eaten
  woken: { mad: 10, calm: -8 },                    // tended while it slept: it wakes, a little cross and startled
  "alone-at-night": { calm: -15, sad: 6 },         // still up at eleven, never put to bed
};
const TOGETHER = ["feed", "water", "train", "step", "walk", "routine", "met", "sleep", "tick"];

// RESTLESS is not pushed by events but built by empty time: nothing for two hours while it is awake, then a little more
// each hour, up to a full day's worth; anything done together takes it back to nothing at once.
const RESTLESS_AFTER_H = 2, RESTLESS_PER_H = 12;

const day = (d: Date, h: number) => { const x = new Date(d); x.setHours(h, 0, 0, 0); return x; };

// The events the clock adds to the log: missed meals, being woken, a night alone
// Each event's moment, read once: the four weeks of spirits ask the same rows again for each of their days (spirits.ts)
const MOMENT = new WeakMap<Interaction, number>();
const momentOf = (e: Interaction) => { let t = MOMENT.get(e); if (t === undefined) { t = Date.parse(e.at); MOMENT.set(e, t); } return t; };

export function derived(events: Interaction[], now = new Date()): Interaction[] {
  return [...clockDerived(events, now), ...wokenOf(events)];
}

// the clock's own: a meal time passed with nothing eaten, and eleven at night never put to bed -- the last day's
export function clockDerived(events: Interaction[], now = new Date()): Interaction[] {
  const at = momentOf;
  const out: Interaction[] = [];
  const since = now.getTime() - LOOK_BACK_MS;
  const first = events.reduce((m, e) => Math.min(m, at(e)), Infinity);       // "anything before": only the earliest matters
  for (let back = 1; back >= 0; back--) {
    const d = new Date(now); d.setDate(d.getDate() - back);
    for (const [from, to] of MEALS) {
      const end = day(d, to);
      if (end.getTime() > now.getTime() || end.getTime() < since) continue;
      const ate = events.some((e) => (e.kind === "feed" || e.kind === "step") && at(e) >= day(d, from).getTime() && at(e) < end.getTime());
      if (!ate && first < end.getTime()) out.push({ at: end.toISOString(), kind: "missed-meal" });
    }
    const eleven = day(d, 23);
    if (eleven.getTime() <= now.getTime() && eleven.getTime() >= since) {
      const bedded = events.some((e) => e.kind === "sleep" && at(e) >= day(d, 20).getTime() && at(e) <= eleven.getTime());
      if (!bedded && first < eleven.getTime()) out.push({ at: eleven.toISOString(), kind: "alone-at-night" });
    }
  }
  return out;
}

// tended while asleep: a care after a sleep, before the morning (or within a nap), with no care between them. Every care
// in the log is asked, so each sleep and each care is found by halving (it was every care against every other: 6 s on
// the hub's one core for four weeks, 2026-11-14)
const CARE = ["feed", "water", "train"];
export function wokenOf(events: Interaction[]): Interaction[] {
  const at = momentOf, out: Interaction[] = [];
  const sleeps = events.filter((e) => e.kind === "sleep").map(at).sort((a, b) => a - b);
  const cares = events.filter((e) => CARE.includes(e.kind)).map(at).sort((a, b) => a - b);
  const lastBelow = (xs: number[], t: number) => {                         // the greatest x < t, or undefined
    let lo = 0, hi = xs.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (xs[m] < t) lo = m + 1; else hi = m; }
    return lo ? xs[lo - 1] : undefined;
  };
  for (const e of events) {
    if (!CARE.includes(e.kind)) continue;
    const t = at(e), last = lastBelow(sleeps, t);
    if (last === undefined) continue;
    const slept = new Date(last), h = slept.getHours();
    const until = h >= 20 || h < 6 ? (() => { const u = new Date(slept); if (h >= 6) u.setDate(u.getDate() + 1); u.setHours(6, 0, 0, 0); return u.getTime(); })()
                                   : last + 90 * 60000;
    const before = lastBelow(cares, t), wokenBefore = before !== undefined && before > last;
    if (t < until && !wokenBefore) out.push({ at: e.at, kind: "woken" });
  }
  return out;
}

export function feelings(events: Interaction[], now = new Date()): Feelings {
  const t = now.getTime();
  const all = [...events, ...derived(events, now)].filter((e) => { const a = Date.parse(e.at); return a <= t && a >= t - LOOK_BACK_MS; });
  const sum: Record<Axis, number> = { glad: 0, mad: 0, sad: 0, calm: 0, restless: 0 };
  let strongest: Cause | null = null;
  for (const e of all) {
    const push = PUSHES[e.kind];
    if (!push) continue;
    const left = 0.5 ** ((t - Date.parse(e.at)) / HALF_LIFE_MS);
    for (const [axis, n] of Object.entries(push) as [Axis, number][]) {
      const now = n * left;
      sum[axis] += now;
      if (!strongest || Math.abs(now) > Math.abs(strongest.now)) strongest = { kind: e.kind, at: e.at, axis, now: Math.round(now * 10) / 10 };
    }
  }
  const lastTogether = Math.max(-Infinity, ...events.filter((e) => TOGETHER.includes(e.kind)).map((e) => Date.parse(e.at)));
  const idleH = Number.isFinite(lastTogether) ? (t - lastTogether) / 3600000 : 0;
  sum.restless = Math.max(0, (idleH - RESTLESS_AFTER_H) * RESTLESS_PER_H);
  const out = Object.fromEntries(AXES.map((a) => [a, Math.round(Math.max(MIN(a), Math.min(100, sum[a])) * 10) / 10])) as Record<Axis, number>;
  return { ...out, strongest };
}
