// C-13: the daemon's life (PLAN 7, the base rules the user set on 2026-10-04). It is READ from what has happened --
// the interactions kept since C-13 began (feeding, watering, training, a routine run, a step finished) -- and the
// clock. Nothing is stored that runs down on its own, so nothing can nag: the daemon only ever says how it is.
//
//   fed, watered  three a day each (a step finished toward your goals feeds it too, C-44), against the meal times that have begun (breakfast 6-10, lunch 11-14, dinner 17-21);
//                 a meal time is the cue to eat, for you as much as for it
//   trained       TRAIN, a routine run, or a step finished, today
//   mood          content to start; a little happier with each thing done together today; a missed meal costs a little;
//                 each whole day with nothing at all costs a little more than the one before; and ANY interaction
//                 today takes that away at once -- quick to recover, as the user asked
//   tired         the real hour: drowsy from 8pm, asleep 10pm to 6am
//
// The never-pester rule, in the numbers: no effect is large, nothing compounds past a floor, and the cue is one quiet
// line during a meal time, never repeated as anything louder.

export type Interaction = { at: string; kind: string; detail?: string | null };

export const MEALS: [number, number][] = [[6, 10], [11, 14], [17, 21]];
const TOGETHER = ["feed", "water", "train", "routine", "step", "tick", "met"];   // "met": another companion, nearby (C-15)
const MOOD_START = 70, PER_TOGETHER = 4, TOGETHER_MOST = 24, PER_MISSED_MEAL = 3, QUIET_STEP = 3, QUIET_MOST = 30;

const localDay = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

export type Life = {
  mood: number;                       // 0..100
  word: string;                       // how it is, in a word or two
  fed: { today: number; due: number };
  watered: { today: number; due: number };
  trained: boolean;
  tired: "awake" | "drowsy" | "asleep";
  quietDays: number;                  // whole days with nothing at all, before today
  cue: string | null;                 // at most one quiet line, during a meal time
};

export function life(events: Interaction[], now = new Date()): Life {
  const today = localDay(now);
  const todays = events.filter((e) => localDay(new Date(e.at)) === today);
  const count = (kind: string) => todays.filter((e) => e.kind === kind).length;
  const hour = now.getHours() + now.getMinutes() / 60;
  const due = MEALS.filter(([from]) => hour >= from).length;           // meal times begun so far today
  // C-44 (the user, 2026-10-04): your goals nourish it -- a step finished counts as a meal
  const fed = Math.min(3, count("feed") + count("step")), watered = Math.min(3, count("water"));
  const together = todays.filter((e) => TOGETHER.includes(e.kind)).length;
  const trained = todays.some((e) => ["train", "routine", "step", "tick"].includes(e.kind));

  // Whole days with nothing at all, counted back from yesterday to the last interaction. Today's interaction (any)
  // means none count: recovery is immediate.
  let quietDays = 0;
  if (!todays.length && events.length) {
    const last = new Date(Math.max(...events.map((e) => Date.parse(e.at))));
    const d = new Date(now); d.setHours(0, 0, 0, 0);
    const lastDay = new Date(last); lastDay.setHours(0, 0, 0, 0);
    quietDays = Math.max(0, Math.round((d.getTime() - lastDay.getTime()) / 86400000) - 1);
  }
  // each quiet day a little more than the one before: 3, then 6, then 9 ... never past 30 in all
  const quiet = Math.min(QUIET_MOST, (QUIET_STEP * quietDays * (quietDays + 1)) / 2);
  const hungry = Math.max(0, due - fed), thirsty = Math.max(0, due - watered);   // meal times begun and not met
  const mood = Math.max(10, Math.min(100, Math.round(MOOD_START + Math.min(TOGETHER_MOST, together * PER_TOGETHER)
    - hungry * PER_MISSED_MEAL - thirsty * (PER_MISSED_MEAL - 1) - quiet)));

  const tired = hour >= 22 || hour < 6 ? "asleep" : hour >= 20 ? "drowsy" : "awake";
  const inMeal = MEALS.findIndex(([from, to]) => hour >= from && hour < to);
  const cue = tired === "awake" && inMeal >= 0 && fed <= inMeal ? "It would eat, if you are eating." : null;

  const word = tired === "asleep" ? "asleep" : tired === "drowsy" ? "sleepy"
    : mood >= 88 ? "happy" : mood >= 72 ? "content" : mood >= 55 ? "calm" : "a little low";
  return { mood, word, fed: { today: fed, due }, watered: { today: watered, due }, trained, tired, quietDays, cue };
}
