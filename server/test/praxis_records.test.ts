// C-432 (PRAXIS 5): MEETINGS (each action an item), VOICE NOTES and THE SUBTLE QUESTION's answers on PRAXIS -- what their
// settings held read in once, keeping each one's number, and every call answering in the shape it always had.
import { describe, expect, it } from "vitest";
import { Store } from "../src/db.js";
import { actionDone, meetingOf, meetingsOf, startMeeting, MEETINGS } from "../src/meetings.js";
import { newVoiceNote, noteHeard, voiceNotesOf, forgetVoiceNote } from "../src/voicenotes.js";
import { journalOf, keepAnswer } from "../src/subtleask.js";
import { DAY_VIRTUE, spaceOf } from "../src/practice.js";

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
    expect(journalOf(store).map((k) => k.answer)).toEqual(["the sea"]);
    const t = { ...q, date: "2026-11-18" };
    keepAnswer(store, t, "first", day(18, 9));
    keepAnswer(store, t, "second", day(18, 10));
    expect(journalOf(store).map((k) => [k.date, k.answer])).toEqual([["2026-11-18", "second"], ["2026-11-17", "the sea"]]);
    expect(keepAnswer(store, t, "  ")).toBe("an answer is a few words");
  });
});
