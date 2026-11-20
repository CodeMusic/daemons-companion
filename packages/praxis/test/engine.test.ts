import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { Praxis, type Db } from "../src/index.js";
import { ENGINES, LIFE, replica, Wall } from "./helpers.js";

describe.each(ENGINES)("the engine on %s", (_, make) => {
  const fresh = () => {
    const wall = new Wall();
    const px = replica(make, "phone", wall);
    const life = px.makeSpace({ title: "My life", prefix: "LIFE", form: LIFE, reach: "home" });
    return { wall, px, life };
  };

  it("makes a space from a form, its kinds and states folded into tables", () => {
    const { px, life } = fresh();
    const s = px.space(life)!;
    expect(s).toMatchObject({ title: "My life", prefix: "LIFE", keeper: "phone", reach: "home", archived: false, maker: "me" });
    expect(s.form?.name).toBe("life-test");
    expect(px.spaces().map((x) => x.id)).toEqual([life]);
    expect(() => px.makeSpace({ title: "Bad", form: { name: "x", version: 1, kinds: {} } })).toThrow(/kinds/);
    expect(px.space(px.makeSpace({ title: "Spanish lessons", form: LIFE }))!.prefix).toBe("SPAN");
    expect(px.space(px.makeSpace({ title: "Quiet", form: LIFE }))!.reach).toBe("phone");   // the most private, unless said
  });

  it("makes items: their kind's first state and points, a handle from the keeper, a short title for devices", () => {
    const { px, life } = fresh();
    const g = px.make(life, "goal", { title: "Plant a garden that feeds the house through the winter months", notes: "start small" });
    const s1 = px.make(life, "step", { title: "Buy soil" }, { parent: g });
    const s2 = px.make(life, "step", { title: "Dig the bed", minutes: 90 }, { parent: g });
    const goal = px.item(g)!;
    expect(goal).toMatchObject({ kind: "goal", state: "open", phase: "open", points: 20, handle: "LIFE-1", number: 1, parent: null });
    expect(goal.short).toHaveLength(40);
    expect(goal.fields).toEqual({ notes: "start small" });
    expect(px.item(s2)).toMatchObject({ handle: "LIFE-3", points: 1, fields: { minutes: 90 } });
    expect(px.items(life, { parent: g }).map((i) => i.id)).toEqual([s1, s2]);
    expect(px.numbered(life, 2)!.id).toBe(s1);
    expect(px.tree(life)).toHaveLength(1);
    expect(px.tree(life)[0].children.map((n) => n.item.title)).toEqual(["Buy soil", "Dig the bed"]);
  });

  it("checks what it is given against the form", () => {
    const { px, life } = fresh();
    const g = px.make(life, "goal", { title: "A goal" });
    expect(() => px.make(life, "recipe", { title: "Soup" })).toThrow(/no kind/);
    expect(() => px.set(g, "minutes", 3)).toThrow(/no such field/);
    expect(() => px.set(g, "size", "huge")).toThrow(/small, large/);
    expect(() => px.set(g, "short", "x".repeat(41))).toThrow(/40/);
    expect(() => px.set(g, "state", "done")).toThrow(/own call/);
    expect(() => px.state(g, "finished")).toThrow(/no state/);
    expect(() => px.move(g, g)).toThrow(/under itself/);
    px.set(g, "size", "small");
    px.set(g, "points", 30);
    expect(px.item(g)).toMatchObject({ points: 30, fields: { size: "small" } });
    px.set(g, "points", null);                            // emptied: the kind's again
    expect(px.item(g)!.points).toBe(20);
  });

  it("pays ARETE once per finish: undo takes it back, doing it again pays once", () => {
    const { px, life } = fresh();
    const s = px.make(life, "step", { title: "Water the seedlings" });
    px.state(s, "doing");
    expect(px.arete()).toBe(0);
    px.state(s, "done");
    expect(px.arete()).toBe(1);
    px.state(s, "done");                                  // done again, from done: nothing more
    expect(px.arete()).toBe(1);
    px.state(s, "open");                                  // undone
    expect(px.arete()).toBe(0);
    px.state(s, "done");
    expect(px.arete()).toBe(1);
    expect(px.ledger().map((e) => [e.key, e.back])).toEqual([["finish:1", true], ["finish:2", false]]);
    // a rule's award, under its own key: once, however often the rule runs
    expect(px.award(s, "virtue:2026-11-19", 2, { reason: "diligence" })).not.toBeNull();
    expect(px.award(s, "virtue:2026-11-19", 2)).toBeNull();
    expect(px.arete(life)).toBe(3);
  });

  it("spends ARETE it holds, never more, and can refund a spend", () => {
    const { px, life } = fresh();
    px.state(px.make(life, "goal", { title: "Finish the course" }), "done");
    expect(() => px.spend(life, 25)).toThrow(/more than is held/);
    const key = px.spend(life, 15, { reason: "an episode" });
    expect(px.arete()).toBe(5);
    px.takeBack(life, "spend", key);
    expect(px.arete()).toBe(20);
  });

  it("keeps every write to a field, the winner marked; a long body's sequential edits set nothing aside", () => {
    const { wall, px, life } = fresh();
    const p = px.make(life, "page", { title: "Notes", body: "first" });
    wall.tick(); px.set(p, "body", "second");
    wall.tick(); px.set(p, "body", "third");
    expect(px.item(p)!.fields.body).toBe("third");
    expect(px.writes(p, "body").map((w) => [w.value, w.won])).toEqual([["first", false], ["second", false], ["third", true]]);
    expect(px.versions(p, "body")).toEqual([]);
    expect(px.log(p).map((e) => e.op)).toEqual(["make", "set", "set", "set"]);   // make, the handle, two edits
  });

  it("links and unlinks by event id; tags and a checklist ride on links", () => {
    const { px, life } = fresh();
    const a = px.make(life, "step", { title: "A" }), b = px.make(life, "step", { title: "B" });
    const l = px.link(a, "blocks", b);
    px.link(a, "tag", "garden");
    expect(px.links(a).map((x) => x.type)).toEqual(["blocks", "tag"]);
    expect(px.linksTo(b).map((x) => x.item)).toEqual([a]);
    px.unlink(l);
    expect(px.links(a, "blocks")).toEqual([]);
    const line = px.check(a, "gloves");
    px.check(a, "seeds");
    px.tick(line);
    expect(px.checklist(a)).toEqual([{ id: line, text: "gloves", done: true }, expect.objectContaining({ text: "seeds", done: false })]);
    expect(() => px.link(a, "follows", "no-such-item")).toThrow();
  });

  it("keeps notes and effort", () => {
    const { px, life } = fresh();
    const s = px.make(life, "step", { title: "Practise" });
    px.note(s, "harder than it looked");
    px.effort(s, 1800, { note: "scales" });
    px.effort(s, 600);
    expect(px.notes(s).map((n) => n.text)).toEqual(["harder than it looked"]);
    expect(px.efforts(s).reduce((t, e) => t + e.seconds, 0)).toBe(2400);
  });

  it("moves items among their siblings and under others", () => {
    const { px, life } = fresh();
    const g = px.make(life, "goal", { title: "G" });
    const [a, b, c] = ["a", "b", "c"].map((t) => px.make(life, "step", { title: t }, { parent: g }));
    px.move(c, g, { after: null });                       // to the front
    expect(px.items(life, { parent: g }).map((i) => i.title)).toEqual(["c", "a", "b"]);
    px.move(c, g, { after: a });
    expect(px.items(life, { parent: g }).map((i) => i.title)).toEqual(["a", "c", "b"]);
    px.move(b, null);
    expect(px.tree(life).map((n) => n.item.title)).toEqual(["G", "b"]);
    expect(() => px.move(g, a)).toThrow(/under itself/);
  });

  it("an AI's proposal counts only once accepted", () => {
    const { px, life } = fresh();
    const g = px.make(life, "goal", { title: "Learn to bake bread" });
    const made = px.proposeMake(life, "step", { title: "Feed the starter" }, { parent: g, actor: "agent.reason" });
    const pts = px.propose(g, { op: "set", field: "points", value: 40 }, { actor: "agent.reason" });
    const bad = px.propose(g, { op: "set", field: "title", value: "Bake" }, { actor: "agent.instinct" });
    expect(px.item(made.item)).toBeNull();
    expect(px.item(g)!.points).toBe(20);
    expect(px.proposals(life, "open")).toHaveLength(3);
    px.accept(made.proposal);
    px.accept(pts);
    px.decline(bad);
    expect(px.item(made.item)).toMatchObject({ title: "Feed the starter", parent: g, maker: "agent.reason", handle: "LIFE-2" });
    expect(px.item(g)).toMatchObject({ points: 40, title: "Learn to bake bread" });
    expect(px.proposals(life).map((p) => p.status)).toEqual(["accepted", "accepted", "declined"]);
    // a proposal that a step is done pays when it is accepted, as the step's own finish would
    const done = px.propose(made.item, { op: "state", value: "done" }, { actor: "agent.reason" });
    expect(px.arete()).toBe(0);
    px.accept(done);
    expect(px.arete()).toBe(1);
  });

  it("archives items and spaces, and brings them back", () => {
    const { px, life } = fresh();
    const s = px.make(life, "step", { title: "S" });
    px.archive(s);
    expect(px.items(life, { archived: false })).toEqual([]);
    px.archive(s, false);
    expect(px.item(s)!.archived).toBe(false);
    px.archive(life);
    expect(px.space(life)!.archived).toBe(true);
  });

  it("takes a newer form, and every item is read against it", () => {
    const { px, life } = fresh();
    const s = px.make(life, "step", { title: "S" });
    px.adopt(life, { ...LIFE, version: 2, kinds: { ...LIFE.kinds, step: { ...LIFE.kinds.step, points: 3 } } });
    expect(px.space(life)!.form!.version).toBe(2);
    expect(px.item(s)!.points).toBe(3);
  });

  it("rolls a failed change back whole", () => {
    const { px, life } = fresh();
    const before = px.tables();
    expect(() => px.transaction(() => { px.make(life, "step", { title: "half" }); throw new Error("no"); })).toThrow("no");
    expect(px.tables()).toEqual(before);
  });

  it("folds the same tables again from the log", () => {
    const { px, life } = fresh();
    const g = px.make(life, "goal", { title: "G", notes: "n" });
    const s = px.make(life, "step", { title: "S" }, { parent: g });
    px.state(s, "done"); px.link(s, "tag", "t"); px.note(g, "hello");
    px.accept(px.propose(g, { op: "set", field: "title", value: "Goal" }, { actor: "agent" }));
    const before = px.tables();
    px.rebuild();
    expect(px.tables()).toEqual(before);
  });
});

describe("a database kept on disk", () => {
  it("keeps its replica id and its clock across openings", () => {
    const file = new DatabaseSync(":memory:") as unknown as Db;
    const wall = new Wall();
    const a = new Praxis(file, { now: () => wall.t });
    const life = a.makeSpace({ title: "Life", form: LIFE });
    const last = a.log(life)[0].hlc;
    wall.t -= 60_000;                                     // the clock went back while it was closed
    const again = new Praxis(file, { now: () => wall.t });
    expect(again.replica).toBe(a.replica);
    const s = again.make(life, "step", { title: "after" });
    expect(again.log(s)[0].hlc > last).toBe(true);
    expect(() => new Praxis(file, { replica: "someone-else" })).toThrow(/this database is replica/);
  });
});
