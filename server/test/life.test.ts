import { describe, expect, it } from "vitest";
import { life, type Interaction } from "../src/life.js";

const at = (d: number, h: number, kind: string): Interaction => ({ at: new Date(2026, 9, d, h, 0).toISOString(), kind });
const noon = (d: number) => new Date(2026, 9, d, 12, 30);

describe("the daemon's life (C-13, PLAN 7)", () => {
  it("is calm on an ordinary day, and asks for nothing louder than one line at a meal time", () => {
    const l = life([at(4, 9, "feed")], noon(4));
    expect(["calm", "content"]).toContain(l.word);              // never low for an ordinary morning
    expect(l.fed).toEqual({ today: 1, due: 2 });
    expect(l.cue).toBe("It would eat, if you are eating.");    // lunch has begun and it has eaten once
  });

  it("is happier for things done together, and calmer -- the reward, not a penalty avoided", () => {
    const quiet = life([], noon(4)).mood;
    const tended = life([at(4, 8, "feed"), at(4, 8, "water"), at(4, 11, "feed"), at(4, 11, "water"), at(4, 12, "train")], noon(4));
    expect(tended.mood).toBeGreaterThan(quiet);
    expect(tended.trained).toBe(true);
    expect(tended.cue).toBeNull();
  });

  it("counts a radio routine and a finished step as time together", () => {
    expect(life([at(4, 10, "routine")], noon(4)).trained).toBe(true);
    expect(life([at(4, 10, "step")], noon(4)).mood).toBeGreaterThan(life([], noon(4)).mood);
  });

  it("is fed by the steps you finish -- your goals nourish it (C-44)", () => {
    const l = life([at(4, 9, "step"), at(4, 11, "step")], noon(4));
    expect(l.fed).toEqual({ today: 2, due: 2 });
    expect(l.cue).toBeNull();                                   // fed for lunch already: no cue
  });

  it("costs only a little for a missed meal", () => {
    const missed = life([at(4, 7, "water")], new Date(2026, 9, 4, 20, 0));   // three meal times, none eaten
    expect(life([at(4, 7, "water")], new Date(2026, 9, 4, 9, 0)).mood - missed.mood).toBeLessThanOrEqual(10);
  });

  it("is a little less happy for each quiet day, each a little more -- and back at once with any interaction", () => {
    const last = [at(1, 12, "feed")];
    const one = life(last, noon(3)).mood, two = life(last, noon(4)).mood, three = life(last, noon(5)).mood;
    expect([one > two, two > three]).toEqual([true, true]);
    expect(two - three).toBeGreaterThan(one - two);              // each day costs more than the one before
    expect(life(last, noon(30)).mood).toBeGreaterThanOrEqual(10); // and never past a floor
    expect(life([...last, at(5, 12, "feed")], noon(5)).quietDays).toBe(0);   // one feed today and it is over
  });

  // C-114 (the user, 2026-10-11): SLEEP is a care of its own -- it waits to be put to bed
  const atm = (d: number, h: number, m: number, kind: string): Interaction => ({ at: new Date(2026, 9, d, h, m).toISOString(), kind });
  it("is drowsy from 8pm and stays so until it is put to bed -- it never falls asleep alone", () => {
    expect(life([], new Date(2026, 9, 4, 21, 0)).tired).toBe("drowsy");
    expect(life([], new Date(2026, 9, 4, 23, 30)).word).toBe("sleepy");
    expect(life([], new Date(2026, 9, 4, 23, 30)).cue).toBe("It would sleep, if you are sleeping.");   // one quiet line
    expect(life([], new Date(2026, 9, 4, 20, 30)).cue).toBeNull();                                      // not before bedtime
  });

  it("put to bed at night, sleeps until six -- no cue, never woken to eat", () => {
    const bed = [atm(4, 22, 15, "sleep")];
    const night = life(bed, new Date(2026, 9, 5, 2, 0));
    expect([night.tired, night.word, night.cue]).toEqual(["asleep", "asleep", null]);
    expect(life(bed, new Date(2026, 9, 5, 7, 0)).tired).toBe("awake");                              // up with the morning
  });

  it("naps an hour and a half in the day, and wakes when it is tended", () => {
    const nap = [atm(4, 13, 0, "sleep")];
    expect(life(nap, new Date(2026, 9, 4, 14, 0)).tired).toBe("asleep");
    expect(life(nap, new Date(2026, 9, 4, 14, 45)).tired).toBe("awake");
    expect(life([...nap, atm(4, 13, 20, "feed")], new Date(2026, 9, 4, 13, 40)).tired).toBe("awake");   // woken to eat
  });

  it("is rested after a night's sleep, and a night without costs only a little", () => {
    const days = [at(3, 12, "feed")];
    const slept = life([...days, atm(3, 22, 0, "sleep"), at(4, 8, "feed")], new Date(2026, 9, 4, 9, 0));
    const not = life([...days, at(4, 8, "feed")], new Date(2026, 9, 4, 9, 0));
    expect([slept.rested, not.rested]).toEqual([true, false]);
    expect(slept.mood - not.mood).toBeGreaterThan(0);
    expect(slept.mood - not.mood).toBeLessThanOrEqual(10);
  });

  it("is not counted unrested before its first night with you", () => {
    const nine = new Date(2026, 9, 4, 9, 0);
    const newcomer = life([at(4, 8, "feed")], nine);                        // nothing before last evening
    const known = life([atm(3, 17, 0, "met"), at(4, 8, "feed")], nine);     // with you yesterday afternoon, no bed
    expect(newcomer.mood - known.mood).toBe(3);                             // one missed night: PER_MISSED_MEAL, no more
  });
});
