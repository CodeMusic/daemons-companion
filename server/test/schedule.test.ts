// C-319 later: THE MIND's plans (LATER), hand-offs between minds, and the hedge made visible
import { describe, expect, it } from "vitest";
import { isDue, keepPlan, lastDue, nextDue, PLANS, planTask, plans, weekSpan } from "../src/ai/schedule.js";
import { Tasks, traceTask } from "../src/ai/tasks.js";

const mem = () => { const m = new Map<string, string>(); return { get: (k: string) => m.get(k) ?? null, set: (k: string, v: string | null) => { if (v === null) m.delete(k); else m.set(k, v); } }; };
const week = PLANS.find((p) => p.id === "whatsnew.week")!;

describe("plans", () => {
  it("finds a weekly plan's last and next time on the hub's clock", () => {
    const wed = new Date(2026, 10, 11, 9, 0);                       // a Wednesday morning
    expect(lastDue(week, wed)).toEqual(new Date(2026, 10, 8, 19, 0));   // the Sunday before, at seven
    expect(nextDue(week, wed)).toEqual(new Date(2026, 10, 15, 19, 0));
    const sun = new Date(2026, 10, 15, 19, 0);                      // exactly on time: due now
    expect(lastDue(week, sun)).toEqual(sun);
  });
  it("runs once per time, never for a time before it was first seen, and not when off", () => {
    const now = new Date(2026, 10, 15, 19, 1);
    expect(isDue({ ...week }, now)).toBe(false);                    // never seen: the caller starts it from now
    expect(isDue({ ...week, last: new Date(2026, 10, 12).toISOString() }, now)).toBe(true);
    expect(isDue({ ...week, last: new Date(2026, 10, 15, 19, 0, 30).toISOString() }, now)).toBe(false);
    expect(isDue({ ...week, on: false, last: new Date(2026, 10, 12).toISOString() }, now)).toBe(false);
  });
  it("keeps on/off and last, and shows the next time as a scheduled task", () => {
    const s = mem();
    keepPlan(s.get, s.set, "whatsnew.week", { on: false });
    expect(plans(s.get)[0].on).toBe(false);
    expect(keepPlan(s.get, s.set, "nothing", { on: true })).toBeNull();
    const t = planTask(week, new Date(2026, 10, 11, 9, 0), "the Tiiny");
    expect(t).toMatchObject({ state: "scheduled", source: "schedule", plan: "whatsnew.week", mind: "the Tiiny", due: new Date(2026, 10, 15, 19, 0).toISOString() });
  });
  it("takes the week's builds as a span, or none", () => {
    const now = new Date("2026-11-15T19:00:00Z");
    const builds = [{ build: 968, date: "2026-11-11" }, { build: 964, date: "2026-11-10" }, { build: 950, date: "2026-11-06" }];
    expect(weekSpan(builds, now)).toEqual({ from: 964, to: 968 });
    expect(weekSpan(builds, new Date("2026-12-01T00:00:00Z"))).toBeNull();
  });
});

describe("hand-offs and trees", () => {
  it("keeps each mind a write went to, and why it moved on", () => {
    const s = mem(), tasks = new Tasks(s.get, s.set);
    const t = tasks.open({ kind: "journal", title: "a page", state: "thinking" });
    tasks.hop(t.id, "the Tiiny"); tasks.fell(t.id, "the Tiiny answered 503"); tasks.hop(t.id, "OPENROUTER");
    expect(tasks.find(t.id)).toMatchObject({ mind: "OPENROUTER", hops: [{ mind: "the Tiiny", error: "the Tiiny answered 503" }, { mind: "OPENROUTER" }] });
    const c = tasks.open({ kind: "dream", title: "the left telling", parent: t.id });
    expect(tasks.find(c.id)?.parent).toBe(t.id);
  });
  it("shows the phone's hedge as a hand-off", () => {
    const t = traceTask({ at: "2026-11-11T12:00:05Z", kind: "talk", ring: "home", from: "phone", thought: "here", covered: true,
                          failed: ["the Tiiny"], ms: { think: 5000 } });
    expect(t.hops).toEqual([{ mind: "the Tiiny", at: "2026-11-11T12:00:00.000Z", error: "too slow; covered" }, { mind: "here", at: "2026-11-11T12:00:00.000Z" }]);
  });
});
