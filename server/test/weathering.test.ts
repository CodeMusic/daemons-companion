// C-357 (4): SLOW WRITES -- a goal's steps weather a mark in, a layer a day however many steps that day, seven to a mark.
import { describe, expect, it } from "vitest";
import { Store } from "../src/db.js";
import { LAYERS, weatheringOf } from "../src/weathering.js";

describe("C-357 (4): SLOW WRITES, the goal's mark", () => {
  it("counts the days a step was ticked, not the steps, and keeps today's count for the line", () => {
    const store = new Store(":memory:");
    const g = store.addGoal("Clean the house", { subitems: [{ title: "", steps: Array.from({ length: 12 }, (_, i) => `step ${i}`) }] });
    const ids = g.subitems[0].steps.map((s) => s.id);
    const tick = (id: number, at: Date) => store.db.prepare("UPDATE steps SET done = ? WHERE id = ?").run(at.toISOString(), id);
    expect(weatheringOf(store, g.id, new Date(2026, 10, 12, 20))).toEqual({ days: 0, layers: 0, of: LAYERS, today: 0 });
    for (const id of ids.slice(0, 10)) tick(id, new Date(2026, 10, 12, 9));        // ten in one day
    expect(weatheringOf(store, g.id, new Date(2026, 10, 12, 20))).toMatchObject({ days: 1, layers: 1, today: 10 });
    tick(ids[10], new Date(2026, 10, 13, 9)); tick(ids[11], new Date(2026, 10, 15, 9));
    expect(weatheringOf(store, g.id, new Date(2026, 10, 15, 20))).toMatchObject({ days: 3, layers: 3, today: 1 });
  });
  it("weathers through at seven days and keeps counting", () => {
    const store = new Store(":memory:");
    const g = store.addGoal("Learn the flute", { subitems: [{ title: "", steps: Array.from({ length: 9 }, (_, i) => `day ${i}`) }] });
    g.subitems[0].steps.forEach((s, i) => store.db.prepare("UPDATE steps SET done = ? WHERE id = ?").run(new Date(2026, 10, 1 + i, 9).toISOString(), s.id));
    expect(weatheringOf(store, g.id, new Date(2026, 10, 20))).toMatchObject({ days: 9, layers: LAYERS, today: 0 });
  });
});
