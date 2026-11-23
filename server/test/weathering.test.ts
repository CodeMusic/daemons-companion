// C-357 (4): SLOW WRITES -- a goal's steps weather a mark in, a layer a day however many steps that day, seven to a mark.
import { describe, expect, it } from "vitest";
import { Store } from "../src/shared/db.js";
import { LAYERS, RUN, WAITING_LINE, weatheringOf } from "../src/weathering.js";

// C-430: a step is ticked through PRAXIS, at the time its clock says -- a store on a clock the test turns
function clocked() {
  let t = new Date(2026, 9, 1).getTime();
  const store = new Store(":memory:", { now: () => t });
  return { store, tick: (id: number, at: Date) => { t = at.getTime(); store.completeStep(id); } };
}

describe("C-357 (4): SLOW WRITES, the goal's mark", () => {
  it("counts the days a step was ticked, not the steps, and keeps today's count for the line", () => {
    const { store, tick } = clocked();
    const g = store.addGoal("Clean the house", { subitems: [{ title: "", steps: Array.from({ length: 12 }, (_, i) => `step ${i}`) }] });
    const ids = g.subitems[0].steps.map((s) => s.id);
    expect(weatheringOf(store, g.id, new Date(2026, 10, 12, 20))).toEqual({ days: 0, layers: 0, of: LAYERS, today: 0, waiting: 0, line: null });
    for (const id of ids.slice(0, 10)) tick(id, new Date(2026, 10, 12, 9));        // ten in one day
    expect(weatheringOf(store, g.id, new Date(2026, 10, 12, 20))).toMatchObject({ days: 1, layers: 1, today: 10 });
    tick(ids[10], new Date(2026, 10, 13, 9)); tick(ids[11], new Date(2026, 10, 15, 9));
    expect(weatheringOf(store, g.id, new Date(2026, 10, 15, 20))).toMatchObject({ days: 3, layers: 3, today: 1 });
  });
  it("weathers through at seven days and keeps counting", () => {
    const { store, tick } = clocked();
    const g = store.addGoal("Learn the flute", { subitems: [{ title: "", steps: Array.from({ length: 9 }, (_, i) => `day ${i}`) }] });
    g.subitems[0].steps.forEach((s, i) => tick(s.id, new Date(2026, 10, 1 + i, 9)));
    expect(weatheringOf(store, g.id, new Date(2026, 10, 20))).toMatchObject({ days: 9, layers: LAYERS, today: 0 });
  });
});

// C-357, SAME DRIVE: six days in a row weather in; the seventh and on wait, and settle on a day the goal is let be.
describe("C-357, SAME DRIVE: a layer settles only on a day it is let be", () => {
  const worked = (n: number, from = 1) => {
    const { store, tick } = clocked();
    const g = store.addGoal("Every day", { subitems: [{ title: "", steps: Array.from({ length: n }, (_, i) => `day ${i}`) }] });
    g.subitems[0].steps.forEach((s, i) => tick(s.id, new Date(2026, 10, from + i, 9)));
    return { store, goal: g.id };
  };
  it("six days in a row weather in, and nothing waits", () => {
    const { store, goal } = worked(RUN);
    expect(weatheringOf(store, goal, new Date(2026, 10, RUN, 20))).toMatchObject({ days: RUN, waiting: 0, line: null });
  });
  it("the seventh and eighth in a row wait while the run goes on, with the line", () => {
    const { store, goal } = worked(8);
    expect(weatheringOf(store, goal, new Date(2026, 10, 8, 20))).toMatchObject({ days: RUN, layers: RUN, waiting: 2, line: WAITING_LINE });
  });
  it("they settle on the first day it is let be, today included", () => {
    const { store, goal } = worked(8);
    expect(weatheringOf(store, goal, new Date(2026, 10, 9, 8))).toMatchObject({ days: 8, layers: LAYERS, waiting: 0, line: null });
  });
  it("a day off in the middle settles what waited, and the next run starts again at one", () => {
    const { store, tick } = clocked();
    const days = [1, 2, 3, 4, 5, 6, 7, 9, 10];                     // Nov 8 let be
    const g = store.addGoal("Every day", { subitems: [{ title: "", steps: days.map((d) => `day ${d}`) }] });
    g.subitems[0].steps.forEach((s, i) => tick(s.id, new Date(2026, 10, days[i], 9)));
    expect(weatheringOf(store, g.id, new Date(2026, 10, 10, 20))).toMatchObject({ days: 9, waiting: 0, line: null });
  });
});
