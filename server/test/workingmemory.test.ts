// C-469: WORKING MEMORY -- the companion's daemon holds the goal's step, what moved it and a talk's open thread; the
// night folds it into the day's material and lets it go
import { describe, expect, it } from "vitest";
import { SPAN } from "@daemons/praxis";
import { Store } from "../src/shared/db.js";
import { dayMaterial } from "../src/psyche/memory.js";
import { noticedOf, spaceKey, stepOf, threadOf } from "../src/workingmemory.js";

const DAEMON = 0xdeadbeef;

describe("C-469: the daemon's working memory", () => {
  it("finds an open thread in what was said, and nothing in what closes none", () => {
    expect(threadOf("I'll call my sister tomorrow")).toEqual({ about: "talk:i'll call my sister tomorrow", words: 'you said: "I\'ll call my sister tomorrow"' });
    expect(threadOf("remind me to water the seedlings")?.about).toBe("talk:remind me to water the seedlings");
    expect(threadOf("what a lovely day")).toBeNull();
    expect(threadOf("ok")).toBeNull();
    expect(threadOf("I need to " + "x".repeat(300))!.words.length).toBeLessThan(160);
  });

  it("holds the goal's next step, rewritten as it moves on and let go once there is no goal", () => {
    const s = new Store(":memory:"), mind = s.workingMemory(DAEMON);
    expect(mind.held()).toEqual([]);
    expect(s.getSetting(spaceKey(DAEMON))).toBeNull();                       // no space until something is held
    const g = s.addGoal("Plant a garden", { subitems: [{ title: "Start", steps: ["Buy soil", "Dig the bed"] }] });
    mind.fromDay({ goal: s.currentGoal(), cause: null });
    expect(mind.held().map((h) => h.words)).toEqual(['the next step toward "Plant a garden": Buy soil']);
    const id = mind.held()[0].id;
    mind.fromDay({ goal: s.currentGoal(), cause: null });                   // the same words: left as they were
    expect(s.life.px.writes(id, "rehearsed").length).toBe(1);
    s.completeStep(g.subitems[0].steps[0].id);
    mind.fromDay({ goal: s.currentGoal(), cause: { said: "it ate", name: "GLAD" } });
    expect(mind.held().map((h) => h.about).sort()).toEqual(["goal", "noticed"]);
    expect(mind.held().find((h) => h.about === "goal")).toMatchObject({ id, words: 'the next step toward "Plant a garden": Dig the bed' });
    mind.fromDay({ goal: null, cause: { said: "it ate", name: "GLAD" } });
    expect(mind.held().map((h) => h.about)).toEqual(["noticed"]);
    expect(stepOf(null)).toBeNull();
    expect(noticedOf(null)).toBeNull();
  });

  it("holds about seven, each daemon its own, and the night lets go only what it was given", () => {
    const s = new Store(":memory:"), mind = s.workingMemory(DAEMON);
    for (let i = 0; i < SPAN + 2; i++) mind.fromTalk(`I will do thing number ${i} tomorrow`);
    expect(mind.held().length).toBe(SPAN);
    expect(s.workingMemory(7).held()).toEqual([]);                           // another daemon, another mind
    const given = mind.held();
    const material = dayMaterial(s, new Date(0), new Date(), { held: given.map((h) => h.words) });
    expect(material).toContain('What you had in mind: you said: "I will do thing number 8 tomorrow"');
    mind.fromTalk("I'm going to rest after this");                          // held while the night wrote
    expect(mind.clear(given.map((h) => h.id))).toBe(SPAN - 1);              // one of them was let go by the new one
    expect(mind.held().map((h) => h.words)).toEqual(['you said: "I\'m going to rest after this"']);
    expect(mind.clear()).toBe(1);
  });
});
