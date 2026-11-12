// C-290: this file runs on the phone too (C-111) -- the app imports it, directly or through another file -- so keep it free of Node-only APIs (node:*, fs).
// C-357 (4), SLOW WRITES (the user's pick, 2026-11-12): THE SUBTLE LAYER's page -- "Fortune is a thousand small turns, all
// nudged the same way ... Its failure is that it cannot be seen one turn at a time" -- on the goal. Once the save holds the
// book, the goal's steps weather a mark in: a layer for each day a step was ticked, however many that day (ten in one day
// count as one: impatience is the page's other failure), seven layers to a mark weathered through. Only shown; it changes
// nothing a step gives the daemon. Every word DRAFT. No node: imports.
import type { Store } from "./store.js";

export const LAYERS = 7;                                             // a week of days, as the centres climb
const localDate = (d: Date) => [d.getFullYear(), d.getMonth() + 1, d.getDate()].map((n, i) => String(n).padStart(i ? 2 : 4, "0")).join("-");

export function weatheringOf(store: Store, goal: number, now = new Date()) {
  const dates = store.stepTimes(goal).map((t) => localDate(new Date(t)));
  const days = new Set(dates).size, today = dates.filter((d) => d === localDate(now)).length;
  return { days, layers: Math.min(days, LAYERS), of: LAYERS, today };
}
