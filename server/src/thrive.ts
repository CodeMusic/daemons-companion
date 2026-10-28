// C-207 (the user, 2026-10-28: "as u sleep better or as your meet city goals it reflects in the way your daemon appears
// ... subtly"; by multiple choice, all four ways): the carried daemon looks how the week has gone. The last seven days --
// the nights a watch told (C-200: VIVID counts two, QUIET one, BROKEN takes one away) and the goals finished together
// (C-183) and their steps -- make a level, 0 to 100, 50 an ordinary week; nothing is kept, so a good week fades by itself
// as its days fall out of the seven. What it changes, every host alike (ONE DEFINITION, EVERY HOST, expressions.ts):
//
//   a glow       a soft halo in the day's colour behind it, from nothing at 55 to its brightest at 100 (`glow`)
//   its colours  a shade richer above 50, paler below -- the expression's own shade, nudged (at most 8%)
//   its look     rested after a good night (a little higher, a little livelier), drowsy until noon after a broken one
//   small marks  a star for each goal finished this week (five at most), a moon the morning after a vivid night
//
// No node: imports (a phone hosting alone works it out too).
import type { Store } from "./store.js";
import { dreamsOf } from "./dreams.js";
import type { Drawn } from "./expressions.js";

export type Thrive = { level: number; glow: number; stars: number; moon: boolean; rested: boolean; broken: boolean };
const WEEK = 7 * 24 * 3600000, MORNING = 18 * 3600000;

export function thriveOf(store: Store, now = new Date()): Thrive {
  const since = new Date(now.getTime() - WEEK);
  const nights = dreamsOf(store).filter((d) => new Date(d.to) >= since);
  const nightScore = nights.reduce((s, d) => s + (d.quality === "vivid" ? 2 : d.quality === "quiet" ? 1 : -1), 0);
  const goals = store.kindSince("goal", since).length, steps = store.kindSince("step", since).length;
  const level = Math.max(0, Math.min(100, Math.round(50 + nightScore * 4 + goals * 8 + Math.min(steps, 20))));
  const last = nights[0] && now.getTime() - new Date(nights[0].to).getTime() < MORNING ? nights[0] : null;
  return { level, glow: Math.max(0, Math.round((level - 55) / 45 * 100)), stars: Math.min(goals, 5),
           moon: last?.quality === "vivid", rested: !!last && last.quality !== "broken", broken: last?.quality === "broken" };
}

// the expression showing, as the week has gone: its colours nudged, and a rested daemon a little higher and livelier
export function thrived(e: Drawn, t: Thrive): Drawn {
  const s = (t.level - 50) / 50;                           // -1 .. 1
  const shade = { ...e.shade, sat: +(e.shade.sat * (1 + 0.08 * s)).toFixed(3), val: +(e.shade.val * (1 + 0.04 * s)).toFixed(3) };
  const pose = t.rested && !e.pose.still ? { ...e.pose, dy: e.pose.dy - 1, bob: +(e.pose.bob * 1.2).toFixed(2) } : e.pose;
  return { ...e, shade, pose };
}
// drowsy until noon after a broken night -- unless it is asleep or already drowsy anyway
export const drowsyFrom = (t: Thrive, hour: number) => t.broken && hour < 12;
