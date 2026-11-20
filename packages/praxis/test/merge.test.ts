import { describe, expect, it } from "vitest";
import { sync, type PxEvent } from "../src/index.js";
import { ENGINES, LIFE, replica, Wall } from "./helpers.js";

// PROJECTS.md 4.6, case by case: two places changed the same thing without seeing each other.
describe.each(ENGINES)("merging on %s", (_, make) => {
  /** a phone and a hub that share a space, then go their own ways */
  const pair = async (o: { hubSkew?: number; keeper?: "phone" | "hub" } = {}) => {
    const wall = new Wall();
    const phone = replica(make, "phone", wall);
    const hub = replica(make, "hub", wall, o.hubSkew ?? 0);
    const life = phone.makeSpace({ title: "Life", prefix: "LIFE", form: LIFE, reach: "home", keeper: o.keeper ?? "phone" });
    await sync(phone, hub);
    return { wall, phone, hub, life };
  };
  const same = (a: { tables(): unknown }, b: { tables(): unknown }) => expect(a.tables()).toEqual(b.tables());

  it("a field: the later write wins on both, and the other stays in its history", async () => {
    const { wall, phone, hub, life } = await pair();
    const g = phone.make(life, "goal", { title: "Run" });
    await sync(phone, hub);
    phone.set(g, "title", "Run a 5k");
    wall.tick(5);
    hub.set(g, "title", "Run a 10k");
    await sync(phone, hub);
    expect(phone.item(g)!.title).toBe("Run a 10k");
    expect(phone.writes(g, "title").map((w) => [w.value, w.won])).toEqual([["Run", false], ["Run a 5k", false], ["Run a 10k", true]]);
    same(phone, hub);
  });

  it("a change made after seeing another wins over it, even from a clock an hour behind", async () => {
    const { phone, hub, life } = await pair({ hubSkew: -3_600_000 });
    const g = phone.make(life, "goal", { title: "Read" });
    await sync(phone, hub);
    hub.set(g, "title", "Read every night");              // its wall clock says an hour ago; it saw "Read"
    await sync(phone, hub);
    expect(phone.item(g)!.title).toBe("Read every night");
    same(phone, hub);
  });

  it("a long body: the later wins and the other is set aside beside it, on both -- never lost", async () => {
    const { wall, phone, hub, life } = await pair();
    const p = phone.make(life, "page", { title: "Plan", body: "v1" });
    await sync(phone, hub);
    phone.set(p, "body", "v1, edited on the phone");
    wall.tick(3);
    hub.set(p, "body", "v1, edited on the hub");
    await sync(phone, hub);
    for (const r of [phone, hub]) {
      expect(r.item(p)!.fields.body).toBe("v1, edited on the hub");
      expect(r.versions(p, "body").map((v) => v.text)).toEqual(["v1, edited on the phone"]);
    }
    // writing over the body now does not bring the set-aside version back, nor lose it
    wall.tick(); phone.set(p, "body", "merged by hand");
    await sync(phone, hub);
    expect(hub.versions(p, "body").map((v) => v.text)).toEqual(["v1, edited on the phone"]);
    same(phone, hub);
  });

  it("links: an add and a remove that never saw each other keep the add", async () => {
    const { phone, hub, life } = await pair();
    const a = phone.make(life, "step", { title: "A" });
    const l = phone.link(a, "tag", "garden");
    await sync(phone, hub);
    phone.unlink(l);                                      // the phone takes the tag away
    const again = hub.link(a, "tag", "garden");           // the hub, not knowing, tags it again
    await sync(phone, hub);
    expect(phone.links(a).map((x) => x.id)).toEqual([again]);
    same(phone, hub);
  });

  it("ARETE: two phones that finish one step offline make one award, paid once", async () => {
    const { phone, hub, life } = await pair();
    const s = phone.make(life, "step", { title: "Walk" });
    await sync(phone, hub);
    phone.state(s, "done");
    hub.state(s, "done");
    expect([phone.arete(), hub.arete()]).toEqual([1, 1]);
    await sync(phone, hub);
    expect([phone.arete(), hub.arete()]).toEqual([1, 1]);
    expect(phone.ledger()).toHaveLength(1);
    same(phone, hub);
  });

  it("ARETE: finished, undone and finished again on one, finished once on the other -- paid once", async () => {
    const { phone, hub, life } = await pair();
    const s = phone.make(life, "step", { title: "Stretch" });
    await sync(phone, hub);
    phone.state(s, "done"); phone.state(s, "open"); phone.state(s, "done");
    hub.state(s, "done");
    await sync(phone, hub);
    expect([phone.arete(), hub.arete()]).toEqual([1, 1]);
    same(phone, hub);
  });

  it("handles: numbered by the keeper, provisional until then, and never renumbered", async () => {
    const { phone, hub, life } = await pair({ keeper: "hub" });
    const a = phone.make(life, "step", { title: "made on the phone" });
    expect(phone.item(a)!.handle).toMatch(/^LIFE-~[0-9a-f]{4}$/);
    const b = hub.make(life, "step", { title: "made on the hub" });
    expect(hub.item(b)!.handle).toBe("LIFE-1");
    await sync(phone, hub);
    expect(phone.item(a)!.handle).toBe("LIFE-2");
    expect(phone.item(b)!.handle).toBe("LIFE-1");
    const c = phone.make(life, "step", { title: "another" });
    await sync(hub, phone);
    await sync(phone, hub);
    expect([a, b, c].map((i) => hub.item(i)!.number)).toEqual([2, 1, 3]);
    same(phone, hub);
  });

  it("a keeper hands its space on: the new keeper numbers from where the last stopped", async () => {
    const { phone, hub, life } = await pair({ keeper: "phone" });
    phone.make(life, "step", { title: "one" });
    phone.setSpace(life, "keeper", "hub");                // the phone that hosted alone joins a hub
    const two = phone.make(life, "step", { title: "two" });
    await sync(phone, hub);
    expect(hub.item(two)!.handle).toBe("LIFE-2");
    same(phone, hub);
  });

  it("a proposal accepted on two replicas is one change", async () => {
    const { phone, hub, life } = await pair();
    const g = phone.make(life, "goal", { title: "G" });
    const p = phone.propose(g, { op: "link", value: { type: "tag", to: "spring" } }, { actor: "agent.reason" });
    await sync(phone, hub);
    phone.accept(p);
    hub.accept(p);
    await sync(phone, hub);
    expect(phone.links(g).map((l) => l.to)).toEqual(["spring"]);
    expect(phone.proposal(p)!.status).toBe("accepted");
    same(phone, hub);
  });

  it("an accept that arrives before its proposal is taken when the proposal comes", async () => {
    const { phone, hub, life } = await pair();
    const g = phone.make(life, "goal", { title: "G" });
    const p = phone.propose(g, { op: "set", field: "title", value: "Better" }, { actor: "agent.reason" });
    phone.accept(p);
    const all = phone.missing(hub.have());
    const accept = all.find((e) => e.op === "accept")!;
    hub.receive([accept]);                                // out of order, as a hand-carried file might be
    expect(hub.item(g)).toBeNull();
    hub.receive(all.filter((e) => e !== accept));
    expect(hub.item(g)!.title).toBe("Better");
    same(phone, hub);
  });

  it("two moves that make a loop: the later is set aside, the same on both", async () => {
    const { wall, phone, hub, life } = await pair();
    const a = phone.make(life, "goal", { title: "A" });
    const b = phone.make(life, "goal", { title: "B" });
    await sync(phone, hub);
    phone.move(a, b);
    wall.tick(2);
    hub.move(b, a);
    await sync(phone, hub);
    const shape = (r: typeof phone) => r.tree(life).map((n) => [n.item.title, n.children.map((c) => c.item.title)]);
    // the hub's move (B under A) came later, so it is the one set aside: B stays at the top, A under it as the phone put it
    expect(shape(phone)).toEqual([["B", ["A"]]]);
    expect(shape(hub)).toEqual(shape(phone));
    expect(phone.writes(b, "parent").map((w) => w.value)).toEqual([null, a]);   // the move is kept, not lost
    same(phone, hub);
  });

  it("never sends a space whose reach is THIS PHONE, until it is told otherwise", async () => {
    const wall = new Wall();
    const phone = replica(make, "phone", wall), hub = replica(make, "hub", wall);
    const diary = phone.makeSpace({ title: "Diary", form: LIFE });                   // reach: phone
    phone.make(diary, "page", { title: "today" });
    await sync(phone, hub);
    expect(hub.spaces()).toEqual([]);
    phone.setSpace(diary, "reach", "home");
    await sync(phone, hub);
    expect(hub.items(diary).map((i) => i.title)).toEqual(["today"]);
  });

  it("refuses a malformed event, knows one it has, and exchanges in small batches without a gap", async () => {
    const { phone, hub, life } = await pair();
    for (let i = 0; i < 20; i++) phone.make(life, "step", { title: `step ${i}` });
    const some = phone.missing(hub.have());
    const bad = { ...some[0], hlc: "yesterday" } as PxEvent;
    expect(hub.receive([bad, { ...some[1], op: "explode" } as unknown as PxEvent])).toEqual({ applied: 0, known: 0, rejected: 2 });
    const r = await sync(phone, hub, { batch: 3 });
    expect(r.toB).toBe(some.length);
    expect(hub.receive(some)).toEqual({ applied: 0, known: some.length, rejected: 0 });
    expect(hub.have()).toEqual(phone.have());
    same(phone, hub);
  });
});
