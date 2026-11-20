import { describe, expect, it } from "vitest";
import { sync, type Praxis } from "../src/index.js";
import { ENGINES, LIFE, replica, seeded, Wall } from "./helpers.js";

// The fold's one promise: replicas that have seen the same events hold the same tables and the same ARETE, whatever
// order the events came in. Three replicas (their clocks skewed) change two spaces at random and exchange at random;
// at the end every one must match, and so must fresh replicas fed every event one at a time in shuffled orders.

type Rand = ReturnType<typeof seeded>;

function act(px: Praxis, r: Rand) {
  const space = r.pick(px.spaces()).id;
  const form = px.space(space)!.form!;
  const items = px.items(space);
  const any = () => r.pick(items).id;
  const statesOf = (id: string) => form.kinds[px.item(id)!.kind].states.map((s) => s.name);
  switch (r.int(19)) {
    case 0: case 1: case 2:
      px.make(space, r.pick(["goal", "milestone", "step", "page"]), { title: `t${r.int(1000)}` },
        { parent: items.length && r.next() < 0.7 ? any() : null });
      break;
    case 3: px.set(any(), "title", `title ${r.int(1000)}`); break;
    case 4: {
      const it = r.pick(items.filter((i) => i.kind === "page" || i.kind === "goal"));
      px.set(it.id, it.kind === "page" ? "body" : "notes", `text ${r.int(1000)}`);
      break;
    }
    case 5: px.move(any(), r.next() < 0.3 ? null : any(), r.next() < 0.5 ? {} : { after: null }); break;
    case 6: case 7: { const it = any(); px.state(it, r.pick(statesOf(it))); break; }
    case 8: px.link(any(), r.pick(["blocks", "relates"] as const), any()); break;
    case 9: {
      const ls = px.links(any());
      if (ls.length) px.unlink(r.pick(ls).id); else px.link(any(), "tag", r.pick(["a", "b"]));
      break;
    }
    case 10: {
      const it = any(), cl = px.checklist(it);
      if (cl.length && r.next() < 0.6) px.tick(r.pick(cl).id, r.next() < 0.7); else px.check(it, `line ${r.int(10)}`);
      break;
    }
    case 11: if (r.next() < 0.5) px.note(any(), `n${r.int(100)}`); else px.effort(any(), 60 * r.int(30)); break;
    case 12: {
      if (r.next() < 0.3) { px.proposeMake(space, "step", { title: `ai ${r.int(100)}` }, { parent: items.length ? any() : null, actor: "agent.reason" }); break; }
      const it = any();
      px.propose(it, r.pick([
        { op: "set", field: "title", value: `proposed ${r.int(100)}` },
        { op: "state", value: r.pick(statesOf(it)) },
        { op: "link", value: { type: "tag", to: "ai" } },
        { op: "award", field: `bonus:${r.int(3)}`, value: { points: 2 } },
      ] as const), { actor: r.pick(["agent.reason", "agent.instinct"]) });
      break;
    }
    case 13: case 14: {
      const open = px.proposals(space).filter((p) => p.status !== "accepted");
      if (open.length) { const p = r.pick(open).id; if (r.next() < 0.7) px.accept(p); else px.decline(p); }
      break;
    }
    case 15: {
      const held = px.arete();
      if (held > 0 && r.next() < 0.6) px.spend(space, 1 + r.int(held), { reason: "a reward" });
      else if (r.next() < 0.5) px.award(any(), `rule:${r.int(4)}`, 1 + r.int(3));
      else { const e = r.pick(px.ledger().filter((x) => !x.back)); px.takeBack(e.item, e.op, e.key); }
      break;
    }
    case 16: px.archive(any(), r.next() < 0.7); break;
    case 17: px.set(any(), "points", r.next() < 0.2 ? null : r.int(9)); break;
    case 18:
      if (r.next() < 0.5) px.adopt(space, { ...LIFE, version: 2 + r.int(50), kinds: { ...LIFE.kinds, step: { ...LIFE.kinds.step, points: r.int(4) } } });
      else px.setSpace(space, "title", `space ${r.int(100)}`);
      break;
  }
}

describe.each(ENGINES)("convergence on %s", (_, make) => {
  it.each([1, 2, 3, 4, 5, 6])("seed %i: three replicas, random changes, random exchanges -- the same tables and ARETE", async (seed) => {
    const r = seeded(seed * 7919);
    const wall = new Wall();
    const reps = [replica(make, "phone", wall), replica(make, "hub", wall, -120_000), replica(make, "seer", wall, 45_000)];
    const life = reps[0].makeSpace({ title: "Life", prefix: "LIFE", form: LIFE, reach: "home", keeper: "hub" });
    reps[0].makeSpace({ title: "Lab", prefix: "LAB", form: LIFE, reach: "shared", keeper: "phone" });
    reps[0].make(life, "goal", { title: "a first goal" });
    await sync(reps[0], reps[1]);
    await sync(reps[1], reps[2]);

    let made = 0, refused = 0;
    for (let step = 0; step < 400; step++) {
      wall.tick(r.int(3));                                // often no tick at all: the counter carries the order
      try { act(r.pick(reps), r); made++; } catch { refused++; }   // a change this replica cannot make now
      if (r.next() < 0.1) { const [a, b] = r.shuffle(reps); await sync(a, b); }
    }
    expect(made).toBeGreaterThan(250);

    for (let i = 0; i < 2; i++) for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) await sync(reps[a], reps[b]);
    const t0 = reps[0].tables();
    for (const x of reps.slice(1)) expect(x.tables()).toEqual(t0);
    expect(new Set(reps.map((x) => x.arete())).size).toBe(1);
    expect(t0.px_events.length).toBeGreaterThan(300);

    // a replica that hears every event one at a time, in any order, folds the same tables
    const events = reps[0].missing({});
    for (let k = 0; k < 3; k++) {
      const late = replica(make, `late${k}`, wall);
      for (const e of r.shuffle(events)) late.receive([e]);
      expect(late.tables()).toEqual(t0);
      expect(late.arete()).toBe(reps[0].arete());
    }
    // and the tables fold again from the log alone
    reps[1].rebuild();
    expect(reps[1].tables()).toEqual(t0);
  });
});
