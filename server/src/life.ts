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
//   tired         C-114 (the user, 2026-10-11): SLEEP is a care of its own. Put to bed in the evening or the night (from
//                 8pm) it sleeps until 6am; put down in the day, it naps an hour and a half; tended in between, it wakes.
//                 Not put to bed, it is drowsy from 8pm and stays so -- it waits for you, it never falls asleep alone.
//   rested        it slept last night (put to bed between 6pm and 6am); a night without costs a little, as a meal does
//
// The never-pester rule, in the numbers: no effect is large, nothing compounds past a floor, and the cue is one quiet
// line during a meal time, never repeated as anything louder.

export type Interaction = { at: string; kind: string; detail?: string | null };

export const MEALS: [number, number][] = [[6, 10], [11, 14], [17, 21]];
const TOGETHER = ["feed", "water", "train", "routine", "step", "tick", "met", "walk", "sleep"];   // met: nearby (C-15); walk: the day's walking goal (C-48)
const NIGHT_FROM = 20, MORNING = 6, BEDTIME = 21, NAP_MS = 90 * 60000;
const WAKES = ["feed", "water", "train", "routine", "step", "tick", "walk"];   // tending it wakes it; a meeting nearby does not
const MOOD_START = 70, PER_TOGETHER = 4, TOGETHER_MOST = 24, PER_MISSED_MEAL = 3, QUIET_STEP = 3, QUIET_MOST = 30;

const localDay = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

export type Life = {
  mood: number;                       // 0..100
  word: string;                       // how it is, in a word or two
  fed: { today: number; due: number };
  watered: { today: number; due: number };
  trained: boolean;
  tired: "awake" | "drowsy" | "asleep";
  rested: boolean;                    // C-114: it slept last night
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
  const trained = todays.some((e) => ["train", "routine", "step", "tick", "walk"].includes(e.kind));   // walking satisfies as training does

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
  // C-114: asleep only when put to bed -- until 6am at night, an hour and a half in the day -- and not tended since
  const at = (e: Interaction) => Date.parse(e.at);
  const lastSleep = events.filter((e) => e.kind === "sleep").reduce<Interaction | null>((a, e) => (!a || at(e) > at(a) ? e : a), null);
  const woken = lastSleep !== null && events.some((e) => WAKES.includes(e.kind) && at(e) > at(lastSleep));
  let asleep = false;
  if (lastSleep && !woken) {
    const slept = new Date(lastSleep.at), h = slept.getHours(), until = new Date(slept);
    if (h >= NIGHT_FROM || h < MORNING) { if (h >= MORNING) until.setDate(until.getDate() + 1); until.setHours(MORNING, 0, 0, 0); }
    else until.setTime(slept.getTime() + NAP_MS);
    asleep = now.getTime() < until.getTime();
  }
  // Rested: put to bed between 6pm and the morning that last began. A night without costs a little, as a meal does --
  // but only once it has had a night with you (a daemon just come out has nothing to be tired from).
  const lastMorning = new Date(now); lastMorning.setHours(MORNING, 0, 0, 0);
  if (now < lastMorning) lastMorning.setDate(lastMorning.getDate() - 1);
  const eve = new Date(lastMorning); eve.setDate(eve.getDate() - 1); eve.setHours(18, 0, 0, 0);
  const rested = events.some((e) => e.kind === "sleep" && at(e) >= eve.getTime() && at(e) < lastMorning.getTime());
  const restless = !rested && events.some((e) => at(e) < eve.getTime()) ? 1 : 0;

  const hungry = Math.max(0, due - fed), thirsty = Math.max(0, due - watered);   // meal times begun and not met
  const mood = Math.max(10, Math.min(100, Math.round(MOOD_START + Math.min(TOGETHER_MOST, together * PER_TOGETHER)
    - hungry * PER_MISSED_MEAL - thirsty * (PER_MISSED_MEAL - 1) - restless * PER_MISSED_MEAL - quiet)));

  const tired = asleep ? "asleep" : hour >= NIGHT_FROM || hour < MORNING ? "drowsy" : "awake";
  const inMeal = MEALS.findIndex(([from, to]) => hour >= from && hour < to);
  const cue = tired === "awake" && inMeal >= 0 && fed <= inMeal ? "It would eat, if you are eating."
            : tired === "drowsy" && (hour >= BEDTIME || hour < MORNING) ? "It would sleep, if you are sleeping." : null;   // C-114

  const word = tired === "asleep" ? "asleep" : tired === "drowsy" ? "sleepy"
    : mood >= 88 ? "happy" : mood >= 72 ? "content" : mood >= 55 ? "calm" : "a little low";
  return { mood, word, fed: { today: fed, due }, watered: { today: watered, due }, trained, tired, rested, quietDays, cue };
}
