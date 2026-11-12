// C-253: memory made at night -- yesterday, the month folded, the moments kept
import { describe, expect, it } from "vitest";
import { Store } from "../src/db.js";
import { consolidate, dayMaterial, keepMoments, memoryDue, readKept, readYesterday, KEPT_MOST, MONTH_ASK, YESTERDAY_ASK } from "../src/memory.js";
import { selfOf } from "../src/self.js";

describe("C-253: memory made at night", () => {
  it("is due once a day, for the day that ended at this morning's wake", () => {
    const now = new Date(2026, 10, 12, 9, 0);
    const due = memoryDue(null, now)!;
    expect(due.day).toBe("2026-11-11");
    expect(due.to.toString()).toBe(new Date(2026, 10, 12, 5, 30).toString());
    expect(due.from.toString()).toBe(new Date(2026, 10, 11, 5, 30).toString());
    expect(memoryDue("2026-11-11", now)).toBeNull();
    expect(memoryDue("2026-11-11", new Date(2026, 10, 13, 5, 0))).toBeNull();      // before the next wake
    expect(memoryDue("2026-11-11", new Date(2026, 10, 13, 6, 0))!.day).toBe("2026-11-12");
  });
  it("gathers what the day left behind: the cares counted, the steps done, what was painted, the dream", () => {
    const s = new Store(":memory:");
    const from = new Date(2026, 10, 11, 5, 30), to = new Date(2026, 10, 12, 5, 30);
    s.logInteraction("feed", null, new Date(2026, 10, 11, 8, 0));
    s.logInteraction("feed", null, new Date(2026, 10, 11, 18, 0));
    s.logInteraction("walk", null, new Date(2026, 10, 11, 12, 0));
    s.logInteraction("feed", null, new Date(2026, 10, 12, 8, 0));                     // after the wake: tomorrow's
    s.db.prepare("INSERT INTO goals (id, title, created) VALUES (1, 'Finish the shed', ?)").run(from.toISOString());
    s.db.prepare("INSERT INTO subitems (id, goal, title, position) VALUES (1, 1, 'Walls', 0)").run();
    s.db.prepare("INSERT INTO steps (subitem, text, position, done) VALUES (1, 'buy screws', 0, ?)").run(new Date(2026, 10, 11, 15, 0).toISOString());
    const m = dayMaterial(s, from, to, { feelings: "very GLAD", dream: "I dreamt of a shed made of light.", paintings: ["Rain on Tin"], dayName: "Wednesday" });
    expect(m).toContain("2 meals, a walk");
    expect(m).toContain('"buy screws" (for Finish the shed)');
    expect(m).toContain('"Rain on Tin"');
    expect(m).toContain("a shed made of light");
    expect(m).toContain("Wednesday");
    expect(dayMaterial(new Store(":memory:"), from, to)).toContain("a quiet day");
  });
  it("reads yesterday and its moments, and keeps each moment once, newest first", () => {
    const y = readYesterday("<think>x</think>YESTERDAY: You walked twice and bought the screws.\nKEEP: the first screw bought\nKEEP: a walk in the rain\nKEEP: a third");
    expect(y).toEqual({ yesterday: "You walked twice and bought the screws.", keep: ["the first screw bought", "a walk in the rain"] });
    expect(readYesterday("  ")).toBeNull();
    const kept = keepMoments(["2026-11-10: a walk in the rain"], ["a walk in the rain", "the first screw"], "2026-11-11");
    expect(kept).toEqual(["2026-11-11: the first screw", "2026-11-10: a walk in the rain"]);
    expect(keepMoments(Array.from({ length: 50 }, (_, i) => `x${i}`), ["new"], "d")).toHaveLength(KEPT_MOST);
    expect(readKept("not json")).toEqual([]);
  });
  it("writes yesterday, then folds it into the month; a mind that will not answer leaves the day waiting", async () => {
    const asked: string[] = [];
    const m = await consolidate("Together you had: a walk.", { month: "Earlier: quiet days.", kept: [] }, "2026-11-11", async (system, user) => {
      asked.push(system);
      if (system === MONTH_ASK) { expect(user).toContain("Earlier: quiet days."); expect(user).toContain("You walked."); return "This month: quiet days, then a walk."; }
      return "YESTERDAY: You walked.\nKEEP: the first walk";
    }, "SPARK");
    expect(asked).toEqual([YESTERDAY_ASK, MONTH_ASK]);
    expect(m).toEqual({ yesterday: "You walked.", month: "This month: quiet days, then a walk.", kept: ["2026-11-11: the first walk"] });
    await expect(consolidate("x", { month: null, kept: [] }, "d", async () => null)).rejects.toThrow();
  });
  it("the self carries yesterday, the month and the shelf", () => {
    const t = selfOf({ nickname: "SPARK", yesterday: "You walked.", month: "Quiet days.", kept: ["2026-11-11: the first walk"] }, "full", "Speak.");
    expect(t).toContain("Yesterday: You walked.");
    expect(t).toContain("Over the last month: Quiet days.");
    expect(t).toContain("Moments you keep: 2026-11-11: the first walk");
  });
});
