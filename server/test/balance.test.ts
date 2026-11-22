// C-432 (PRAXIS 5): TENDING on PRAXIS, THE DAY'S VIRTUE (+2 ARETE on the day's first finish, once a day) and THE WEEK'S
// BALANCE (a virtue lived when something was done on its own day; its shadow untended when the day passed with nothing).
import { describe, expect, it } from "vitest";
import { Store } from "../src/db.js";
import { tend, tendedOf, TENDING } from "../src/lifemanagement/tending.js";
import { weekBalance } from "../src/lifemanagement/balance.js";
import { DAY_VIRTUE, spaceOf } from "../src/lifemanagement/practice.js";
import { keepEntry, newJournal } from "../src/lifemanagement/journal.js";

const day = (d: number, h = 12) => new Date(2026, 10, d, h);      // November 2026: the 15th a Sunday
const at = (d: number, h = 12) => day(d, h).getTime();
function fresh(start = at(18)) {
  let t = start;
  const store = new Store(":memory:", { now: () => t });
  return { store, set: (ms: number) => { t = ms; } };
}

describe("C-432: TENDING on PRAXIS", () => {
  it("reads what subtle.tended held in once, each tending at its own time, paid its ARETE", () => {
    const { store } = fresh();
    store.setSetting("subtle.tended", JSON.stringify([
      { date: "2026-11-17", centre: "Sacral", at: day(17, 9).toISOString(), by: "you" },
      { date: "2026-11-16", centre: "Root", at: day(16, 8).toISOString(), by: "you" }]));
    expect(tendedOf(store).map((t) => t.date)).toEqual(["2026-11-17", "2026-11-16"]);
    expect(tendedOf(store)).toHaveLength(2);                       // read once: asking again adds nothing
    const space = spaceOf(store.life.px, TENDING)!;
    expect(store.life.px.arete(space)).toBe(2);                    // 1 each, the day's centre tended (PROJECTS.md 6)
    expect(store.getSetting("subtle.tended")).toContain("Sacral");  // the old setting left as it was
  });
  it("a touch pays 1 and the day's virtue once; a second touch is the same tending", () => {
    const { store } = fresh(at(18, 9));
    tend(store, day(18, 9));
    expect(store.life.arete(day(18, 20)).today).toBe(1 + DAY_VIRTUE);
    tend(store, day(18, 18));
    expect(store.life.arete(day(18, 20)).today).toBe(1 + DAY_VIRTUE);
  });
});

describe("C-432: THE DAY'S VIRTUE", () => {
  it("pays on the day's first finish only, again the next day, and an undone step gives it back", () => {
    const { store, set } = fresh(at(18, 9));
    const g = store.addGoal("Tidy", { subitems: [{ title: "", steps: ["one", "two", "three"] }] });
    const [a, b, c] = g.subitems[0].steps;
    store.completeStep(a.id);
    store.completeStep(b.id);
    const virtues = () => store.life.px.ledger(undefined).filter((e) => e.key.startsWith("virtue:") && !e.back);
    expect(virtues()).toHaveLength(1);
    expect(virtues()[0]).toMatchObject({ points: DAY_VIRTUE, key: "virtue:2026-11-18", reason: "Diligence over Sloth" });
    store.undoStep(a.id);
    expect(virtues()).toHaveLength(0);                             // taken back with the step that lived it
    set(at(19, 9));
    store.completeStep(c.id);
    expect(virtues().map((e) => e.key)).toEqual(["virtue:2026-11-19"]);
  });
});

describe("C-432: THE WEEK'S BALANCE", () => {
  it("lights each day something was done on, Sunday first, leaves the days passed with nothing untended, and the days ahead", () => {
    const { store, set } = fresh(at(16, 9));
    const g = store.addGoal("Tidy", { subitems: [{ title: "", steps: ["one", "two"] }] });
    store.completeStep(g.subitems[0].steps[0].id);                // Monday: a step
    set(at(17, 9)); tend(store, day(17, 9));                       // Tuesday: tended
    set(at(19, 9));                                                // Thursday: an entry
    const j = newJournal(store, "Mine", day(19, 9));
    if (typeof j === "string") throw new Error(j);
    expect(keepEntry(store, { journal: j.id, title: "today", body: "it rained" }, day(19, 10))).not.toBeTypeOf("string");
    const w = weekBalance(store, day(19, 15));
    expect(w.days.map((d) => d.day)).toEqual(["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]);
    expect(w.days.map((d) => d.lived)).toEqual([false, true, true, false, true, false, false]);
    expect(w.days[1]).toMatchObject({ virtue: "Temperance", acts: { goals: 1 } });
    expect(w.days[2].acts).toMatchObject({ tended: 1 });
    expect(w.days[4]).toMatchObject({ today: true, acts: { entries: 1 } });
    expect(w.days.filter((d) => d.ahead).map((d) => d.day)).toEqual(["Friday", "Saturday"]);
    expect(w.lived).toBe(3);
    expect(w.today).toMatchObject({ virtue: "Forgiveness", shadow: "Wrath" });
  });
});
