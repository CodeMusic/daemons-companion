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

  it("is tired by the real hour", () => {
    expect(life([], new Date(2026, 9, 4, 21, 0)).tired).toBe("drowsy");
    expect(life([], new Date(2026, 9, 4, 23, 30)).word).toBe("asleep");
    expect(life([], new Date(2026, 9, 4, 23, 30)).cue).toBeNull();          // never woken to eat
  });
});
