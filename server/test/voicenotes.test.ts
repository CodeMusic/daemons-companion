import { describe, expect, it } from "vitest";
import { forgetVoiceNote, newVoiceNote, noteHeard, voiceNotesOf } from "../src/voicenotes.js";
import { Store } from "../src/db.js";

describe("C-199 (5): voice notes", () => {
  it("files a note when it was said, newest first, and keeps its words once heard", () => {
    const store = new Store(":memory:"), now = new Date("2026-10-29T12:00:00Z");
    const a = newVoiceNote(store, "w", null, now);
    const b = newVoiceNote(store, "w", new Date("2026-10-29T09:00:00Z"), now);   // said earlier, kept on the card
    expect(voiceNotesOf(store).map((n) => n.id)).toEqual([a.id, b.id]);
    expect(noteHeard(store, a.id, " Buy milk. ")).toMatchObject({ text: "Buy milk.", state: "done" });
    expect(noteHeard(store, b.id, null, "No module")).toMatchObject({ state: "failed", error: "No module" });
    forgetVoiceNote(store, a.id);
    expect(voiceNotesOf(store)).toHaveLength(1);
  });
  it("takes a clock from the future as now", () => {
    const store = new Store(":memory:"), now = new Date("2026-10-29T12:00:00Z");
    expect(newVoiceNote(store, "w", new Date("2027-01-01T00:00:00Z"), now).at).toBe(now.toISOString());
  });
});
