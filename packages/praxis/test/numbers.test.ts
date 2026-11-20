// C-430: what GOALS needed of the engine -- kinds numbered on their own, a number chosen for an item brought in from
// elsewhere, a finish paid what a rule says (kept even at nothing), the ledger read from a time with each entry's kind,
// and items read by kind, phase and parent in the database.
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { checkForm, Praxis, type Db, type Form } from "../src/index.js";
import { ENGINES, replica, Wall } from "./helpers.js";

const STATES = [{ name: "open", phase: "open" }, { name: "done", phase: "done" }] as const;
const GOALS: Form = {
  name: "goals-test",
  version: 1,
  kinds: {
    goal: { title: "Goal", states: [...STATES, { name: "aside", phase: "aside" }] },
    milestone: { title: "Milestone", prefix: "MILESTONE", states: [...STATES] },
    loose: { title: "Loose steps", prefix: "MILESTONE", states: [...STATES] },
    step: { title: "Step", prefix: "STEP", points: 1, states: [...STATES] },
  },
};

describe.each(ENGINES)("C-430's numbers and pay on %s", (_, make) => {
  const fresh = () => {
    const wall = new Wall();
    const px = replica(make, "hub", wall);
    return { wall, px, life: px.makeSpace({ title: "Life", prefix: "LIFE", form: GOALS, reach: "home" }) };
  };

  it("numbers a kind with a prefix on its own, and kinds that share a prefix share its numbers", () => {
    const { px, life } = fresh();
    const g = px.make(life, "goal", { title: "Clean the house" });
    const m = px.make(life, "milestone", { title: "BATHROOM" }, { parent: g });
    const l = px.make(life, "loose", { title: "loose" }, { parent: g });
    const s = px.make(life, "step", { title: "Mop" }, { parent: m });
    const g2 = px.make(life, "goal", { title: "Learn the flute" });
    expect([g, m, l, s, g2].map((id) => px.item(id)!.handle)).toEqual(["LIFE-1", "MILESTONE-1", "MILESTONE-2", "STEP-1", "LIFE-2"]);
    expect(px.numbered(life, 1)!.id).toBe(g);                       // the space's own numbers
    expect(px.numbered(life, 1, "goal")!.id).toBe(g);
    expect(px.numbered(life, 2, "milestone")!.id).toBe(l);          // the milestone's numbers are the loose kind's too
    expect(px.numbered(life, 1, "step")!.id).toBe(s);
    expect(px.numbered(life, 3, "step")).toBeNull();
    expect(checkForm({ ...GOALS, kinds: { step: { title: "Step", prefix: "step", states: [...STATES] } } })[0]).toMatch(/prefix/);
  });

  it("keeps a number chosen by the keeper, goes on from the highest, and refuses one already given", () => {
    const { px, life } = fresh();
    const g = px.make(life, "goal", { title: "Clean the house" }, { number: 7 });
    const s = px.make(life, "step", { title: "Mop" }, { parent: g, number: 17 });
    expect(px.item(g)!.handle).toBe("LIFE-7");
    expect(px.item(s)!.handle).toBe("STEP-17");
    expect(px.item(px.make(life, "step", { title: "Scrub" }, { parent: g }))!.handle).toBe("STEP-18");
    expect(px.item(px.make(life, "goal", { title: "Next" }))!.handle).toBe("LIFE-8");
    expect(() => px.make(life, "step", { title: "Again" }, { number: 17 })).toThrow(/STEP-17 is given/);
    expect(() => px.make(life, "step", { title: "Nought" }, { number: 0 })).toThrow(/whole number/);
    expect(px.items(life, { kind: "step" })).toHaveLength(2);       // a refused make leaves nothing behind
  });

  it("lets only the keeper choose a number", () => {
    const wall = new Wall();
    const hub = replica(make, "hub", wall), phone = replica(make, "phone", wall);
    const life = hub.makeSpace({ title: "Life", prefix: "LIFE", form: GOALS, reach: "home" });
    phone.receive(hub.missing({}));
    expect(() => phone.make(life, "goal", { title: "Mine" }, { number: 3 })).toThrow(/keeper/);
  });

  it("pays a finish what it is told, keeps a finish paid nothing, and takes either back on undo", () => {
    const { px, life } = fresh();
    const a = px.make(life, "step", { title: "Mop" }), b = px.make(life, "step", { title: "Scrub" });
    px.state(a, "done", { pay: 3, reason: "a rule" });
    px.state(b, "done", { pay: 0 });                                // past the day's cap: a finish all the same
    expect(px.arete(life)).toBe(3);
    expect(px.ledger(life).map((e) => [e.points, e.reason, e.kind, e.key])).toEqual([[3, "a rule", "step", "finish:1"], [0, "finish", "step", "finish:1"]]);
    px.state(a, "open");
    expect(px.arete(life)).toBe(0);
    px.state(a, "done");                                            // no pay given: the item's own points, as before
    expect(px.ledger(life).filter((e) => !e.back).map((e) => [e.key, e.points])).toEqual([["finish:1", 0], ["finish:2", 1]]);
    expect(() => px.state(a, "open", { pay: -1 })).toThrow(/whole number/);
    const g = px.make(life, "goal", { title: "Aside" });
    px.state(g, "aside", { pay: 5 });                               // not a finish: nothing paid
    expect(px.ledger(life).filter((e) => e.item === g)).toEqual([]);
  });

  it("reads the ledger from a time, and items by kind, phase and parent", () => {
    const { wall, px, life } = fresh();
    const g = px.make(life, "goal", { title: "Goal" });
    const s1 = px.make(life, "step", { title: "One" }, { parent: g }), s2 = px.make(life, "step", { title: "Two" }, { parent: g });
    px.state(s1, "done");
    wall.tick(60_000);
    const later = wall.t;
    px.state(s2, "done");
    expect(px.ledger(life, { since: later }).map((e) => e.item)).toEqual([s2]);
    expect(px.ledger(undefined, { since: later - 60_000 })).toHaveLength(2);
    expect(px.items(life, { parent: g, phase: "done" }).map((i) => i.id)).toEqual([s1, s2]);
    expect(px.items(life, { parent: null }).map((i) => i.id)).toEqual([g]);
    expect(px.items(life, { kind: "step", archived: false })).toHaveLength(2);
    px.archive(s1);
    expect(px.items(life, { kind: "step", archived: false }).map((i) => i.id)).toEqual([s2]);
  });
});

describe("a database from before kinds had prefixes", () => {
  it("is given the column, and its kinds folded again", () => {
    const db = new DatabaseSync(":memory:") as unknown as Db;
    const px = new Praxis(db, { replica: "hub" });
    const life = px.makeSpace({ title: "Life", prefix: "LIFE", form: GOALS });
    const s = px.make(life, "step", { title: "Mop" });
    // as C-429 made it: no prefix column at all
    db.exec("CREATE TABLE old_kinds AS SELECT space, kind, title, points, virtue FROM px_kinds; DROP TABLE px_kinds; " +
      "ALTER TABLE old_kinds RENAME TO px_kinds");
    const again = new Praxis(db, { replica: "hub" });
    expect(again.item(s)!.handle).toBe("STEP-1");
    expect(again.numbered(life, 1, "step")!.id).toBe(s);
  });
});
