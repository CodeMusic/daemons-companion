// C-290: this file runs on the phone too (C-111) -- the app imports it, directly or through another file -- so keep it free of Node-only APIs (node:*, fs).
// C-266 (the user, 2026-11-01: "enhance how the appearance reflects its care ... a new group for care, such as a var for
// weight (where 0 here means balance weight)"): how it has been looked after, over days rather than today, and how that
// shows on it. DERIVED, NEVER STORED, as life.ts and feelings.ts are: read from the last two weeks of what was done
// together and the clock. Nothing runs down on its own, so tending it puts it right again by itself, a day at a time.
//
//   rest           0..100, 100 rested -- the nights it was put to bed. A night without shadows its eyes; three in a
//                  row and they are bloodshot. The last night counts most; each before it a little less.
//   hunger         0..100, 0 fed -- meal times that ended with nothing eaten, the recent ones most. It makes it sad and
//                  costs companionship, and day after day of it, it grows thinner.
//   thirst         0..100, 0 watered -- the same for drinks: sad, and less companionable. It does not change its shape.
//   weight         -100..100, 0 its balance. Each whole day eaten well and not trained it grows a little heavier; each
//                  meal missed a little thinner; every day it settles back toward its balance -- so it is bounded by
//                  its own sum (a fortnight of never training stays near +55) and clamped as well.
//   companionship  0..100 -- how near it feels to you: hunger, thirst, short nights and empty days away from it.
//
// What it changes, every host alike (ONE DEFINITION, EVERY HOST, expressions.ts): `pose.girth`, the body wider or
// narrower about its middle (0.88 at its thinnest, 1.18 at its heaviest), and patches under and beside its eyes -- the
// shadows and the bloodshot -- painted like its eyes are, so a host with no rule of its own draws them. Mood (life.ts)
// and SAD (feelings) take hunger and thirst too. The numbers are DRAFT.
//
// No node: imports (a phone hosting alone works it out too).
import type { Interaction } from "./life.js";
import { shade as tint, type Drawn, type Face, type Patch, type Shade } from "./expressions.js";
import type { Feelings } from "./feelings.js";

export type Worn = { shadows: boolean; bloodshot: boolean };
export type Care = { rest: number; hunger: number; thirst: number; weight: number; companionship: number; worn: Worn;
                     before: number };   // the hunger and thirst of the days before today: what mood has not already counted

const MEALS: [number, number][] = [[6, 10], [11, 14], [17, 21]];   // life.ts's, by value (life.ts imports this file)
const DAYS = 14, DAY = 86400000;
const PER_MEAL = 14, PER_DRINK = 12, FADE = 0.55;                 // a missed meal today 14, yesterday's 8, ...
const PER_NIGHT = 35, NIGHT_FADE = 0.6, UP_LATE = 10;             // one short night: rest 65; three in a row: 31
const HEAVIER = 8, THINNER = 6, SETTLE = 0.85;                    // a day's push, and how much of yesterday's weight stays
export const SHADOWS_BELOW = 70, BLOODSHOT_BELOW = 40;
const EATS = ["feed", "step"];                                   // C-44: a step finished feeds it
const TRAINS = ["train", "routine", "step", "tick", "walk"];      // as life.ts's trained

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(n)));
const startOf = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); };
const hourOf = (dayStart: number, h: number) => { const x = new Date(dayStart); x.setHours(h, 0, 0, 0); return x.getTime(); };

export function care(events: Interaction[], now = new Date(), quietDays = 0): Care {
  const at = (e: Interaction) => Date.parse(e.at), t = now.getTime();
  const seen = events.filter((e) => at(e) <= t);
  const none: Care = { rest: 100, hunger: 0, thirst: 0, weight: 0, companionship: 100, worn: { shadows: false, bloodshot: false }, before: 0 };
  if (!seen.length) return none;                                  // a daemon just come out has nothing to be missing
  const first = Math.min(...seen.map(at));
  const within = (kinds: string[], from: number, to: number) => seen.filter((e) => kinds.includes(e.kind) && at(e) >= from && at(e) < to).length;

  // Day by day, from today back: the meal times that ended since it was with you, and what was eaten and drunk in them
  let hunger = 0, thirst = 0, before = 0;
  const days: { missedMeals: number; ate: number; trained: boolean; whole: boolean }[] = [];
  const today = startOf(now);
  for (let k = 0; k < DAYS; k++) {
    const d0 = hourOf(today - k * DAY + DAY / 2, 0), d1 = hourOf(d0 + DAY + DAY / 2, 0);   // midday steps: DST-safe
    if (d1 <= first) break;
    const lo = Math.max(d0, first), hi = Math.min(d1, t);
    const ended = MEALS.filter(([, to]) => { const end = hourOf(d0, to); return end > lo && end <= hi; }).length;
    const ate = Math.min(3, within(EATS, d0, d1)), drank = Math.min(3, within(["water"], d0, d1));
    const missedMeals = Math.max(0, ended - ate), missedDrinks = Math.max(0, ended - drank);
    const h = missedMeals * PER_MEAL * FADE ** k, w = missedDrinks * PER_DRINK * FADE ** k;
    hunger += h; thirst += w; if (k > 0) before += h + w;
    days.push({ missedMeals, ate, trained: within(TRAINS, d0, d1) > 0, whole: d1 <= t && d0 >= hourOf(first, 0) });
  }

  // Weight: the whole days, oldest first -- heavier for a day eaten well with no training, thinner for each meal
  // missed, and every day settling back toward its balance
  let weight = 0;
  for (const d of [...days].reverse()) {
    if (!d.whole) continue;
    weight = weight * SETTLE + (!d.trained && d.ate >= 2 ? HEAVIER : 0) - d.missedMeals * THINNER;
  }

  // Rest: the nights that have ended (6pm to 6am) since it was with you by 11pm -- put to bed, or not
  let debt = 0;
  for (let j = 0; j < DAYS; j++) {
    const eve = hourOf(today - (j + 1) * DAY + DAY / 2, 18), late = hourOf(eve, 23), morning = hourOf(eve + DAY, 6);
    if (morning > t) continue;
    if (first > late) break;
    if (!within(["sleep"], eve, morning)) debt += PER_NIGHT * NIGHT_FADE ** j;
  }
  const tonight = hourOf(now.getHours() < 6 ? today - DAY / 2 : today, 18);   // up past 11 tonight, never put down
  if ((now.getHours() >= 23 || now.getHours() < 6) && first < tonight && !within(["sleep"], tonight, t + 1)) debt += UP_LATE;
  const rest = 100 - clamp(debt, 0, 100);

  hunger = clamp(hunger, 0, 100); thirst = clamp(thirst, 0, 100);
  const companionship = clamp(100 - 0.3 * hunger - 0.3 * thirst - 0.15 * (100 - rest) - 8 * quietDays, 0, 100);
  return { rest, hunger, thirst, weight: clamp(weight, -100, 100), companionship,
           worn: { shadows: rest < SHADOWS_BELOW, bloodshot: rest < BLOODSHOT_BELOW }, before: clamp(before, 0, 200) };
}

// How much the care takes from its mood (life.ts) and gives to SAD (feelings): hungry and thirsty for days is sad. Mood
// counts today's missed meals itself (PLAN 7: a little each), so it takes only the days before -- the never-pester rule
export const moodCost = (c: Care) => Math.round(c.before / 10);
export function withCare(f: Feelings, c: Care | null | undefined): Feelings {
  if (!c) return f;
  const sad = Math.round((c.hunger + c.thirst) / 2);         // two days unfed, past the threshold SAD shows at
  if (sad <= f.sad) return f;
  const kind = c.hunger >= c.thirst ? "hungry" : "thirsty";
  const strongest = !f.strongest || sad > Math.abs(f.strongest.now) ? { kind, at: new Date().toISOString(), axis: "sad" as const, now: sad } : f.strongest;
  return { ...f, sad, strongest };
}

// Its body about its middle: 0.88 at its thinnest, 1.18 at its heaviest
export const girthOf = (weight: number) => +(1 + (weight > 0 ? 0.18 : 0.12) * Math.max(-100, Math.min(100, weight)) / 100).toFixed(3);

// The shadows: a row under each eye, a little wider than it, in the colour around the eyes darkened toward a bruise.
// The bloodshot: a red pixel either side of each eye, and the lower edge of an eye big enough to have one -- not while
// its eyes are closed. Painted after the eyes' own patches, so they show over them.
export function carePatch(face: Face, worn: Worn, s: Shade, eyesClosed = false): Patch[] {
  if (!face.fillRgb || (!worn.shadows && !worn.bloodshot)) return [];
  const out: Patch[] = [];
  const mixTo = (a: number[], b: number[], m: number) => a.map((x, i) => Math.round(x * (1 - m) + b[i] * m));
  const shadow = tint(mixTo(face.fillRgb, [60, 30, 80], worn.bloodshot ? 0.75 : 0.6), s), red = tint([215, 55, 65], s), deep = tint([160, 35, 45], s);
  for (const [x, y, w, h] of face.eyes) {
    if (worn.shadows && y + h < 64) {   // a second, fainter row under an eye big enough to carry it
      const lx = Math.max(0, x - 1), lw = Math.min(64, x + w + 1) - lx;
      out.push({ x: lx, y: y + h, w: lw, h: 1, rgb: shadow });
      if (h >= 4 && w >= 4 && y + h + 1 < 64) out.push({ x: x + 1, y: y + h + 1, w: w - 2, h: 1, rgb: tint(mixTo(face.fillRgb, [60, 30, 80], 0.35), s) });
    }
    if (worn.bloodshot && !eyesClosed) {
      const mid = y + Math.floor(h / 2);
      if (x > 0) out.push({ x: x - 1, y: mid, w: 1, h: 1, rgb: red });
      if (x + w < 64) out.push({ x: x + w, y: mid, w: 1, h: 1, rgb: red });
      if (h >= 3) out.push({ x, y: y + h - 1, w, h: 1, rgb: deep });
    }
  }
  return out;
}

// The expression showing, as it has been cared for: its girth, and the shadows and the bloodshot over its eyes
export function careworn(e: Drawn, c: Care | null | undefined, face: Face | null): Drawn {
  if (!c) return e;
  const girth = girthOf(c.weight);
  const patch = face ? [...e.patch, ...carePatch(face, c.worn, e.shade, e.eyes === "closed")] : e.patch;
  return { ...e, pose: { ...e.pose, girth }, patch, worn: c.worn };
}
