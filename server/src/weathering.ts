// C-290: this file runs on the phone too (C-111) -- the app imports it, directly or through another file -- so keep it free of Node-only APIs (node:*, fs).
// C-357 (4), SLOW WRITES (the user's pick, 2026-11-12): THE SUBTLE LAYER's page -- "Fortune is a thousand small turns, all
// nudged the same way ... Its failure is that it cannot be seen one turn at a time" -- on the goal. Once the save holds the
// book, the goal's steps weather a mark in: a layer for each day a step was ticked, however many that day (ten in one day
// count as one: impatience is the page's other failure), seven layers to a mark weathered through. Only shown; it changes
// nothing a step gives the daemon. Every word DRAFT. No node: imports.
//
// C-357, SAME DRIVE (the user's pick, 2026-11-17, "A: a day let be", and six days): THE SUBTLE LAYER's page -- the mend is
// the same drive, reconnected; a virtue at the wrong size is its shadow. A goal worked every day with no day off stops
// weathering in: six days in a row weather in, and the seventh and every day after it in the same run WAIT. They settle
// on the first day the goal is let be -- a day with no step, today included once it has none -- and count from then. While
// any wait, the goal says so: WAITING_LINE.
import type { Store } from "./shared/store.js";

export const LAYERS = 7;                                             // a week of days, as the centres climb
export const RUN = 6;                                                // SAME DRIVE: six days in a row, then the rest wait
export const WAITING_LINE = "A layer settles only on a day it is let be.";   // DRAFT (the game's breaks it in two)
const localDate = (d: Date) => [d.getFullYear(), d.getMonth() + 1, d.getDate()].map((n, i) => String(n).padStart(i ? 2 : 4, "0")).join("-");
const dayNo = (s: string) => Math.round(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 86400000);

export function weatheringOf(store: Store, goal: number, now = new Date()) {
  const dates = store.stepTimes(goal).map((t) => localDate(new Date(t)));
  const todayIs = localDate(now), today = dates.filter((d) => d === todayIs).length;
  const worked = [...new Set(dates)].map(dayNo).sort((a, b) => a - b);
  let days = 0, waiting = 0, run = 0, last = NaN;
  for (const d of worked) {
    if (d !== last + 1) { days += waiting; waiting = 0; run = 0; }   // a day let be came between: what waited settles
    run++; last = d;
    if (run > RUN) waiting++; else days++;
  }
  if (waiting && dayNo(todayIs) > last) { days += waiting; waiting = 0; }   // the run's last day is behind it: today is let be
  return { days, layers: Math.min(days, LAYERS), of: LAYERS, today, waiting, line: waiting ? WAITING_LINE : null };
}
