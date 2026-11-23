// C-432 (PRAXIS 5): MEETINGS (each action an item), VOICE NOTES and THE SUBTLE QUESTION's answers on PRAXIS -- what their
// settings held read in once, keeping each one's number, and every call answering in the shape it always had.
import { describe, expect, it } from "vitest";
import { Store } from "../src/db.js";
import { actionDone, meetingOf, meetingsOf, startMeeting, MEETINGS } from "../src/lifemanagement/meetings.js";
import { newVoiceNote, noteHeard, voiceNotesOf, forgetVoiceNote } from "../src/lifemanagement/voicenotes.js";
import { journalOf as answersOf, keepAnswer } from "../src/library/subtleask.js";
import { DAY_VIRTUE, spaceOf } from "../src/lifemanagement/practice.js";
import { journalOf, journalsOf, keepEntry, newJournal, removeEntry, summarize, JOURNAL } from "../src/lifemanagement/journal.js";

const day = (d: number, h = 12) => new Date(2026, 10, d, h);
const fresh = (t = day(18).getTime()) => new Store(":memory:", { now: () => t });
const old = (id: number, actions: string[], at: Date) => ({ id, device: "w", startedAt: at.toISOString(), endedAt: at.toISOString(), title: `M${id}`,
  parts: ["hello"], state: "done", summary: "s", takeaways: ["t"], actions, daydream: "d", daemon: "PIP", audio: false });

describe("C-432: MEETINGS on PRAXIS", () => {
  it("reads the old list in once, each keeping its number, its actions items under it", () => {
    const store = fresh();
    store.setSetting("meetings", JSON.stringify([old(4, ["Call Ada", "Send the plan"], day(17)), old(2, [], day(16))]));
    expect(meetingsOf(store).map((m) => m.id)).toEqual([4, 2]);
    expect(meetingsOf(store)).toHaveLength(2);                     // read once
    const m = meetingOf(store, 4)!;
    expect(m).toMatchObject({ title: "M4", state: "done", parts: ["hello"], takeaways: ["t"], actions: ["Call Ada", "Send the plan"], audio: false });
    expect(m.actionItems!.map((a) => a.done)).toEqual([false, false]);
    expect(startMeeting(store, "w", "PIP", day(18)).id).toBe(5);    // the next number after the old ones
  });
  it("an action item done pays 1 and the day's virtue, and open again gives both back", () => {
    const store = fresh();
    store.setSetting("meetings", JSON.stringify([old(1, ["Call Ada"], day(17))]));
    const a = meetingOf(store, 1)!.actionItems![0];
    expect(actionDone(store, 1, a.id, true, day(18))!.actionItems![0].done).toBe(true);
    const space = spaceOf(store.life.px, MEETINGS)!;
    expect(store.life.px.arete(space)).toBe(1 + DAY_VIRTUE);
    actionDone(store, 1, a.id, false, day(18));
    expect(store.life.px.arete(space)).toBe(0);
    expect(actionDone(store, 1, 999, true)).toBeNull();
  });
});

describe("C-432: VOICE NOTES on PRAXIS", () => {
  it("reads the old notes in keeping their numbers, newest first, and hears, fails and forgets as before", () => {
    const store = fresh();
    store.setSetting("voicenotes", JSON.stringify([
      { id: 3, at: day(17).toISOString(), device: "w", text: "buy milk", state: "done", audio: false },
      { id: 1, at: day(15).toISOString(), device: "w", text: "", state: "failed", error: "Not heard.", audio: true }]));
    expect(voiceNotesOf(store).map((n) => [n.id, n.state])).toEqual([[3, "done"], [1, "failed"]]);
    const n = newVoiceNote(store, "w", null, day(18));
    expect(n).toMatchObject({ id: 4, state: "hearing", text: "" });
    expect(noteHeard(store, 4, "call the vet")).toMatchObject({ state: "done", text: "call the vet" });
    expect(noteHeard(store, 1, null, "Still not heard.")).toMatchObject({ state: "failed", error: "Still not heard." });
    forgetVoiceNote(store, 3);
    expect(voiceNotesOf(store).map((x) => x.id)).toEqual([4, 1]);
  });
});

describe("C-432: THE SUBTLE QUESTION's answers on PRAXIS", () => {
  it("reads the old answers in once, and a second answer on one day replaces its words", () => {
    const store = fresh();
    const q = { date: "2026-11-17", question: "What?", centre: "Sacral", note: "D", word: "Flow" };
    store.setSetting("subtle.journal", JSON.stringify([{ ...q, answer: "the sea", at: day(17).toISOString() }]));
    expect(answersOf(store).map((k) => k.answer)).toEqual(["the sea"]);
    const t = { ...q, date: "2026-11-18" };
    keepAnswer(store, t, "first", day(18, 9));
    keepAnswer(store, t, "second", day(18, 10));
    expect(answersOf(store).map((k) => [k.date, k.answer])).toEqual([["2026-11-18", "second"], ["2026-11-17", "the sea"]]);
    expect(keepAnswer(store, t, "  ")).toBe("an answer is a few words");
  });
});


describe("C-432: the JOURNAL and DREAM JOURNAL on PRAXIS", () => {
  const oldJournal = (store: Store) => {
    store.db.exec(`CREATE TABLE journals (id INTEGER PRIMARY KEY, title TEXT NOT NULL, created TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'standard');
      CREATE TABLE journal_entries (id INTEGER PRIMARY KEY, journal INTEGER NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, at TEXT NOT NULL, edited TEXT, feeling TEXT);
      CREATE TABLE journal_chapters (id INTEGER PRIMARY KEY, journal INTEGER NOT NULL, from_entry INTEGER NOT NULL, to_entry INTEGER NOT NULL, at TEXT NOT NULL,
        state TEXT NOT NULL, title TEXT NOT NULL DEFAULT '', body TEXT NOT NULL DEFAULT '', by TEXT NOT NULL DEFAULT '', error TEXT);
      CREATE TABLE journal_signs (id INTEGER PRIMARY KEY, journal INTEGER NOT NULL, entry INTEGER, chapter INTEGER, at TEXT NOT NULL, state TEXT NOT NULL, reading TEXT, by TEXT NOT NULL DEFAULT '', error TEXT);
      INSERT INTO journals VALUES (2, 'Days', '${day(10).toISOString()}', 'standard'), (5, 'Nights', '${day(11).toISOString()}', 'dream');
      INSERT INTO journal_entries VALUES (7, 2, 'rain', 'it rained', '${day(12).toISOString()}', NULL, 'calm'), (8, 5, '', 'a door', '${day(13).toISOString()}', NULL, NULL),
                                         (9, 2, 'sun', 'it shone', '${day(14).toISOString()}', NULL, NULL);
      INSERT INTO journal_chapters VALUES (3, 2, 7, 9, '${day(15).toISOString()}', 'done', 'Weather', 'A page.', 'thinker', NULL);`);
  };
  it("reads the old tables in once, each journal, entry and chapter keeping its number, the tables left as they were", () => {
    const store = fresh();
    oldJournal(store);
    expect(journalsOf(store).map((j) => [j.id, j.kind, j.entries])).toEqual([[2, "standard", 2], [5, "dream", 1]]);
    expect(journalsOf(store)).toHaveLength(2);                     // read once
    const j = journalOf(store, 2)!;
    expect(j.entries.map((e) => [e.id, e.title, e.feeling])).toEqual([[9, "sun", null], [7, "rain", "calm"]]);
    expect(j.chapters[0]).toMatchObject({ id: 3, n: 1, from: 7, to: 9, count: 2, state: "done", title: "Weather", body: "A page." });
    expect(journalOf(store, 5)!.entries[0]).toMatchObject({ id: 8, title: "", body: "a door" });
    expect((store.db.prepare("SELECT COUNT(*) AS n FROM journal_entries").get() as { n: number }).n).toBe(3);
    // new ones take the next number across every journal
    const k = keepEntry(store, { journal: 5, body: "a stair" }, day(18));
    expect(typeof k !== "string" && k.entries[0].id).toBe(10);
    expect(newJournal(store, "Work", day(18))).toMatchObject({ id: 6 });
  });
  it("an entry pays 2 once a day, and the day's virtue; one taken out gives back its virtue", () => {
    const store = fresh(day(18, 9).getTime());
    const j = newJournal(store, "Mine", day(18, 9));
    if (typeof j === "string") throw new Error(j);
    keepEntry(store, { journal: j.id, body: "one" }, day(18, 9));
    keepEntry(store, { journal: j.id, body: "two" }, day(18, 10));
    expect(store.life.arete(day(18, 20)).today).toBe(2 + DAY_VIRTUE);
    const first = journalOf(store, j.id)!.entries.at(-1)!;
    removeEntry(store, j.id, first.id, day(18, 11));
    expect(journalOf(store, j.id)!.entries.map((e) => e.body)).toEqual(["two"]);
    expect(store.life.px.ledger(undefined).filter((e) => e.key.startsWith("virtue:") && !e.back)).toHaveLength(0);
  });
  it("a chapter is linked MADE FROM the entries it covers", () => {
    const store = fresh();
    const j = newJournal(store, "Mine", day(18));
    if (typeof j === "string") throw new Error(j);
    keepEntry(store, { journal: j.id, body: "one" }, day(18));
    keepEntry(store, { journal: j.id, body: "two" }, day(18));
    const s = summarize(store, j.id, day(18));
    if (typeof s === "string") throw new Error(s);
    const space = store.life.px.spaces().find((x) => x.form?.name === JOURNAL.name && x.title === "Mine")!.id;
    const ch = store.life.px.numbered(space, s.chapter, "chapter")!;
    expect(store.life.px.links(ch.id, "made-from")).toHaveLength(2);
  });
});
