// C-430: GOALS on PRAXIS -- the old tables read in once, at their own times, losing nothing; the same shapes from the
// Store; ARETE paid once per finish under a daily cap; THRIVE's week the same across the move.
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { Store, type Db } from "../src/store.js";
import { LIFE, RULES } from "../src/goals.js";
import { thriveOf } from "../src/thrive.js";
import { dayMaterial } from "../src/memory.js";

const at = (d: number, h = 9, m = 0) => new Date(2026, 10, d, h, m).toISOString();
const rule = (kind: string) => RULES.find((r) => r.kind === kind)!;

/** a database as the old store left it: two goals, one set aside, milestones and loose steps, some done */
function oldTables() {
  const db = new DatabaseSync(":memory:") as unknown as Db;
  new Store(db);                                                  // the tables, as the Store has always made them
  const run = (sql: string, ...a: unknown[]) => db.prepare(sql).run(...a);
  run("INSERT INTO goals (id, title, created, done) VALUES (3, 'Paint the fence', ?, ?)", at(1), `set aside ${at(2, 10)}`);
  run("INSERT INTO goals (id, title, created) VALUES (5, 'Clean the house', ?)", at(2, 11));
  run("INSERT INTO subitems (id, goal, title, position) VALUES (4, 3, '', 0)");
  run("INSERT INTO steps (id, subitem, text, position) VALUES (6, 4, 'Buy paint', 0)");
  run("INSERT INTO subitems (id, goal, title, position, done) VALUES (7, 5, 'BATHROOM', 0, ?)", at(3, 15));
  run("INSERT INTO subitems (id, goal, title, position) VALUES (8, 5, '', 1)");
  run("INSERT INTO steps (id, subitem, text, position, done) VALUES (11, 7, 'Mop the floor', 1, ?)", at(3, 15));
  run("INSERT INTO steps (id, subitem, text, position, done) VALUES (10, 7, 'Scrub the toilet', 0, ?)", at(3, 14));
  run("INSERT INTO steps (id, subitem, text, position) VALUES (12, 8, ?, 0)", "x".repeat(450));
  run("INSERT INTO steps (id, subitem, text, position) VALUES (13, 8, '   ', 1)");
  return db;
}

describe("C-430: the old tables, read in once", () => {
  it("keeps every number, word, order and state, and the times things were done", () => {
    const db = oldTables();
    const store = new Store(db, { now: () => Date.parse(at(20)) });
    expect(store.goals()).toEqual([
      { id: 3, title: "Paint the fence", done: true, subitems: [{ id: 4, title: "", done: false, steps: [{ id: 6, text: "Buy paint", done: false }] }] },
      { id: 5, title: "Clean the house", done: false, subitems: [
        { id: 7, title: "BATHROOM", done: true, steps: [{ id: 10, text: "Scrub the toilet", done: true }, { id: 11, text: "Mop the floor", done: true }] },
        { id: 8, title: "", done: false, steps: [{ id: 12, text: "x".repeat(450), done: false }, { id: 13, text: "   ", done: false }] }] },
    ]);
    expect(store.currentGoal()!.id).toBe(5);                       // the one set aside reads as done, as it did
    expect(store.nextStep()).toMatchObject({ goal: "Clean the house", subitem: "", step: { id: 12 }, milestone: null });
    expect(store.stepTimes(5).sort()).toEqual([new Date(at(3, 14)).toISOString(), new Date(at(3, 15)).toISOString()]);
    // the handles are the old numbers, each kind on its own
    const px = store.life.px, life = store.life.life;
    expect([px.numbered(life, 5, "goal")!.handle, px.numbered(life, 7, "milestone")!.handle, px.numbered(life, 11, "step")!.handle])
      .toEqual(["LIFE-5", "MILESTONE-7", "STEP-11"]);
    expect(px.space(life)).toMatchObject({ title: "Life", prefix: "LIFE", reach: "home", form: { name: LIFE.name } });
    // and made when they were: the goal at its making, the step's finish when it was ticked
    expect(px.numbered(life, 5, "goal")!.made).toBe(new Date(at(2, 11)).toISOString());
    // the old rows are left as they were
    expect((db.prepare("SELECT COUNT(*) AS n FROM steps").get() as { n: number }).n).toBe(5);
  });

  it("pays each old finish its ARETE, once, under that day's cap", () => {
    const store = new Store(oldTables(), { now: () => Date.parse(at(20)) });
    const awards = store.life.px.ledger(store.life.life).map((e) => [e.kind, e.points, e.reason]);
    expect(awards).toEqual([["step", 1, "finish"], ["step", 1, "finish"], ["milestone", 5, "finish"]]);
    expect(store.life.arete(new Date(at(20))).held).toBe(7);
  });

  it("runs once: a second start reads nothing again, and a row an older server added later is read then", () => {
    const db = oldTables();
    const first = new Store(db, { now: () => Date.parse(at(20)) });
    const events = () => (db.prepare("SELECT COUNT(*) AS n FROM px_events").get() as { n: number }).n;
    first.goals();
    const n = events();
    new Store(db, { now: () => Date.parse(at(21)) }).goals();
    expect(events()).toBe(n);
    db.prepare("INSERT INTO steps (id, subitem, text, position) VALUES (14, 8, 'Dust the shelves', 2)").run();   // an older server, rolled back to
    const later = new Store(db, { now: () => Date.parse(at(22)) });
    expect(later.goal(5)!.subitems[1].steps.map((s) => s.id)).toEqual([12, 13, 14]);
    expect(later.goals()).toHaveLength(2);
    // and the next step made goes on from the highest number
    expect(later.addStep(5, "Wash the windows")).toBe(15);
  });

  it("an old finish undone gives its ARETE back, and finishing again pays once", () => {
    const store = new Store(oldTables(), { now: () => Date.parse(at(20)) });
    expect(store.undoStep(11)).toBe(true);
    expect(store.goal(5)!.subitems[0]).toMatchObject({ done: false });
    expect(store.life.arete().held).toBe(1);                       // the step's and the milestone's taken back
    const r = store.completeStep(11);
    expect(r).toEqual({ ok: true, fresh: true, milestone: "BATHROOM", goal: null });
    expect(store.life.arete().held).toBe(7);
  });

  it("an empty companion makes its LIFE space, and the memory reads what the old tables held", () => {
    const store = new Store(new DatabaseSync(":memory:") as unknown as Db);
    expect(store.goals()).toEqual([]);
    expect(store.life.px.spaces()).toHaveLength(1);
    const old = new Store(oldTables());
    expect(dayMaterial(old, new Date(at(3, 5, 30)), new Date(at(4, 5, 30)))).toContain('"Scrub the toilet" (for Clean the house); "Mop the floor" (for Clean the house)');
  });
});

describe("C-430: ARETE for finishing", () => {
  const fresh = (start = at(10)) => {
    let t = Date.parse(start);
    const store = new Store(new DatabaseSync(":memory:") as unknown as Db, { now: () => t });
    return { store, set: (iso: string) => { t = Date.parse(iso); } };
  };

  it("pays a step, a milestone and a goal by their rules, once per finish", () => {
    const { store } = fresh();
    const g = store.addGoal("Tidy", { subitems: [{ title: "DESK", steps: ["Clear it"] }, { title: "", steps: ["Bin the boxes"] }] });
    store.completeStep(g.subitems[0].steps[0].id);
    expect(store.life.arete().held).toBe(rule("step").arete + rule("milestone").arete);
    expect(store.completeStep(g.subitems[0].steps[0].id)).toMatchObject({ fresh: false });   // done again: nothing more
    expect(store.completeStep(g.subitems[1].steps[0].id)).toMatchObject({ fresh: true, goal: "Tidy" });
    expect(store.life.arete().held).toBe(2 * rule("step").arete + rule("milestone").arete + rule("goal").arete);
    expect(store.goal(g.id)!.done).toBe(true);
  });

  it("caps what a kind earns in a day, keeps the finishes past it at nothing, and pays again the next day", () => {
    const { store, set } = fresh();
    const steps = Array.from({ length: rule("step").cap + 3 }, (_, i) => `step ${i}`);
    const g = store.addGoal("Many", { subitems: [{ title: "", steps }, { title: "", steps: ["tomorrow"] }] });
    for (const s of g.subitems[0].steps) store.completeStep(s.id);
    const today = store.life.px.ledger(store.life.life).filter((e) => e.kind === "step");
    expect(today).toHaveLength(steps.length);                      // every finish kept
    expect(today.reduce((n, e) => n + e.points, 0)).toBe(rule("step").cap);
    expect(store.life.arete(new Date(at(10, 23))).today).toBe(rule("step").cap);
    set(at(11));
    store.completeStep(g.subitems[1].steps[0].id);
    expect(store.life.arete(new Date(at(11, 12))).today).toBe(rule("step").arete + rule("goal").arete);
  });

  it("is never taken for a day missed", () => {
    const { store, set } = fresh();
    const g = store.addGoal("One", { subitems: [{ title: "", steps: ["it"] }] });
    store.completeStep(g.subitems[0].steps[0].id);
    const held = store.life.arete().held;
    set(at(28));
    expect(store.life.arete(new Date(at(28))).held).toBe(held);
  });
});

describe("C-430: THRIVE's week, across the move", () => {
  it("counts the log's goals before the move and the ledger's after, never one twice", () => {
    let t = Date.parse(at(10));
    const store = new Store(new DatabaseSync(":memory:") as unknown as Db, { now: () => t });
    store.logInteraction("goal", "1", new Date(at(9)));          // finished before the move (the old store logged it)
    store.logInteraction("step", "site 1", new Date(at(9)));
    expect(thriveOf(store, new Date(at(10))).stars).toBe(1);       // the move happens here, at the first look
    const g = store.addGoal("After", { subitems: [{ title: "", steps: ["it"] }] });
    t = Date.parse(at(10, 12));
    store.completeStep(g.subitems[0].steps[0].id);
    store.logInteraction("step", `site ${g.subitems[0].steps[0].id}`, new Date(at(10, 12)));   // as doStep logs it
    store.logInteraction("goal", String(g.subitems[0].steps[0].id), new Date(at(10, 12)));
    expect(thriveOf(store, new Date(at(10, 13)))).toMatchObject({ stars: 2, level: 50 + 2 * 8 + 2 });
    expect(thriveOf(store, new Date(at(17, 10))).stars).toBe(1);   // a week on, the old one has fallen out
  });
});

describe("C-430: TODAY's rule", () => {
  it("is the LIFE form's, one open goal", () => {
    const store = new Store(new DatabaseSync(":memory:") as unknown as Db);
    expect(LIFE.views).toEqual([{ name: "today", goals: 1 }]);
    expect(store.life.roomToday()).toBe(true);
    const g = store.addGoal("First");
    expect(store.life.roomToday()).toBe(false);
    store.setAside(g.id);
    expect(store.life.roomToday()).toBe(true);
    expect(store.goal(g.id)!.done).toBe(true);
    expect(store.life.px.numbered(store.life.life, g.id, "goal")!.state).toBe("aside");
  });
});
