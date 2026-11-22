// C-433 (PRAXIS 6): LEARNING -- the TUTOR's syllabus read leniently and proposed (modules, lessons, cards nested), accepted
// whole or one at a time (a card taking its lesson and module with it), declined; lessons finished; cards reviewed.
import { describe, expect, it } from "vitest";
import { Store } from "../src/db.js";
import { addTo, decide, dueCards, learningView, lessonDone, lessonOf, newCourse, proposeSyllabus, readSyllabus, review } from "../src/learning.js";
import { DAY_VIRTUE } from "../src/practice.js";

const day = (d: number, h = 12) => new Date(2026, 10, d, h);
function fresh(at = day(18).getTime()) {
  let t = at;
  return { store: new Store(":memory:", { now: () => t }), set: (d: Date) => { t = d.getTime(); } };
}
const ANSWER = `Here is your course!
**MODULE 1: Sounds**
- LESSON: Vowels
CARD: How many vowels are there? | Five
CARD: a broken card with no answer
LESSON: Consonants
CARD: Is "ñ" a consonant? | Yes
MODULE: Greetings
LESSON - Hello
CARD: "Hello" | "Hola"`;

describe("C-433: LEARNING", () => {
  it("reads the TUTOR's answer leniently: modules, lessons, cards with their answers", () => {
    const s = readSyllabus(ANSWER);
    expect(s.map((m) => [m.title, m.lessons.map((l) => [l.title, l.cards.length])])).toEqual([["Sounds", [["Vowels", 1], ["Consonants", 1]]], ["Greetings", [["Hello", 1]]]]);
    expect(s[1].lessons[0].cards[0]).toEqual({ front: "\"Hello\"", back: "\"Hola\"" });
    expect(readSyllabus("I cannot help with that.")).toEqual([]);
  });
  it("proposes the syllabus under a course; accepting all makes it, nested; nothing is made before", () => {
    const { store } = fresh();
    const c = newCourse(store, "Spanish");
    if (typeof c === "string") throw new Error(c);
    expect(proposeSyllabus(store, c.id, readSyllabus(ANSWER))).toBe(8);
    let v = learningView(store).courses[0];
    expect(v).toMatchObject({ title: "Spanish", tutor: "proposed", modules: [] });
    expect(v.proposals.map((p) => p.kind)).toEqual(["module", "lesson", "card", "lesson", "card", "module", "lesson", "card"]);
    decide(store, { course: c.id });
    v = learningView(store).courses[0];
    expect(v.proposals).toEqual([]);
    expect(v.modules.map((m) => [m.title, m.kids.map((l) => [l.title, l.kids.map((k) => [k.title, k.back])])])).toEqual([
      ["Sounds", [["Vowels", [["How many vowels are there?", "Five"]]], ["Consonants", [["Is \"ñ\" a consonant?", "Yes"]]]]],
      ["Greetings", [["Hello", [["\"Hello\"", "\"Hola\""]]]]]]);
    expect(v.cards).toBe(3);
    expect(v.due).toBe(3);
  });
  it("one card accepted takes its lesson and module with it, edited as it is taken; one declined is never made", () => {
    const { store } = fresh();
    const c = newCourse(store, "Spanish") as { id: string };
    proposeSyllabus(store, c.id, readSyllabus(ANSWER));
    const ps = learningView(store).courses[0].proposals;
    const card = ps.find((p) => p.kind === "card" && p.title.startsWith("How many"))!;
    decide(store, { id: card.id, title: "Vowels in Spanish?", back: "a, e, i, o, u" });
    const v = learningView(store).courses[0];
    expect(v.modules.map((m) => m.title)).toEqual(["Sounds"]);
    expect(v.modules[0].kids.map((l) => [l.title, l.kids.map((k) => [k.title, k.back])])).toEqual([["Vowels", [["Vowels in Spanish?", "a, e, i, o, u"]]]]);
    const greet = v.proposals.find((p) => p.title === "Greetings")!;
    decide(store, { id: greet.id, accept: false });
    expect(learningView(store).courses[0].proposals.find((p) => p.title === "Greetings")).toBeUndefined();
  });
  it("a lesson finished pays 3 and the day's virtue; cards are reviewed on a spaced schedule, 1 each", () => {
    const { store, set } = fresh(day(18, 9).getTime());
    const c = newCourse(store, "Knots") as { id: string };
    addTo(store, { kind: "module", parent: c.id, title: "Basics" });
    const mod = learningView(store).courses[0].modules[0];
    addTo(store, { kind: "lesson", parent: mod.id, title: "The reef knot" });
    const les = learningView(store).courses[0].modules[0].kids[0];
    addTo(store, { kind: "card", parent: les.id, title: "Right over left, then?", back: "Left over right" });
    expect(addTo(store, { kind: "card", parent: mod.id, title: "x" })).toMatch(/under a lesson/);
    lessonDone(store, les.id, true, day(18, 9));
    expect(lessonOf(store, les.id)).toMatchObject({ done: true, module: "Basics", course: "Knots", cards: [{ front: "Right over left, then?" }] });
    const card = dueCards(store)[0];
    expect(review(store, card.id, "good", day(18, 10))).toEqual({ due: "2026-11-19", interval: 1 });
    expect(dueCards(store)).toEqual([]);
    expect(store.life.arete(day(18, 20)).today).toBe(3 + 1 + DAY_VIRTUE);
    set(day(19, 9));
    expect(dueCards(store)).toHaveLength(1);
    expect(review(store, card.id, "good", day(19, 9))).toEqual({ due: "2026-11-22", interval: 3 });
    expect(review(store, card.id, "again", day(19, 10))).toEqual({ due: "2026-11-19", interval: 0 });
  });
});
