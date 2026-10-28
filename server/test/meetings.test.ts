import { describe, expect, it } from "vitest";
import { allHeard, endMeeting, meetingOf, partHeard, readWriteUp, startMeeting, stretches, transcriptOf, writeUp } from "../src/meetings.js";
import { Store } from "../src/db.js";

describe("C-212: a meeting, recorded and written up", () => {
  it("keeps the parts in order, however they arrive", () => {
    const store = new Store(":memory:");
    const m = startMeeting(store, "t-watch-ultra-f351d4", "SPARKY");
    partHeard(store, m.id, 1, "then we agreed.");
    partHeard(store, m.id, 0, "We talked first,");
    expect(allHeard(meetingOf(store, m.id)!)).toBe(false);   // not ended yet
    endMeeting(store, m.id, 2);
    expect(allHeard(meetingOf(store, m.id)!)).toBe(true);
    expect(transcriptOf(meetingOf(store, m.id)!)).toBe("We talked first, then we agreed.");
  });
  it("reads a small model's write-up leniently", () => {
    const w = readWriteUp("Title: Launch plan\nsummary: We set the date.\nTake-aways:\n- ship Friday\n* test Thursday\nACTION ITEMS:\n1. Sam books the room\n- none");
    expect(w).toEqual({ title: "Launch plan", summary: "We set the date.", takeaways: ["ship Friday", "test Thursday"], actions: ["Sam books the room"] });
  });
  it("cuts a long transcript into stretches at its sentences", () => {
    const t = Array.from({ length: 300 }, (_, i) => `Point ${i} was made.`).join(" ");
    const s = stretches(t, 500);
    expect(s.every((x) => x.length <= 500)).toBe(true);
    expect(s.join(" ")).toBe(t);
  });
  it("writes it up: notes for a long one, the write-up, then the day-dream", async () => {
    const store = new Store(":memory:");
    const m = startMeeting(store, "w", "SPARKY");
    partHeard(store, m.id, 0, Array.from({ length: 200 }, (_, i) => `We discussed item ${i}.`).join(" "));
    endMeeting(store, m.id, 1);
    const asked: string[] = [];
    const done = await writeUp(store, m.id, async (system) => {
      asked.push(system.slice(0, 12));
      if (system.startsWith("You take notes")) return "- items discussed";
      if (system.startsWith("You write up")) return "TITLE: Items\nSUMMARY: Many items.\nTAKE-AWAYS:\n- all of them\nACTION ITEMS:\n- none";
      return "SPARKY dreamt of a river of lanterns.";
    }, { nickname: "SPARKY" });
    expect(done).toMatchObject({ state: "done", title: "Items", summary: "Many items.", takeaways: ["all of them"], actions: [], daydream: "SPARKY dreamt of a river of lanterns." });
    expect(asked.filter((a) => a.startsWith("You take not")).length).toBeGreaterThan(1);
  });
  it("fails gently when no model can write", async () => {
    const store = new Store(":memory:");
    const m = startMeeting(store, "w", "SPARKY");
    partHeard(store, m.id, 0, "Hello."); endMeeting(store, m.id, 1);
    const r = await writeUp(store, m.id, async () => { throw new Error("No module can write"); }, { nickname: "SPARKY" });
    expect(r).toMatchObject({ state: "failed", error: "No module can write" });
  });
});
