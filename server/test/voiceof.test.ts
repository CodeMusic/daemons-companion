// C-323: one voice from any speaker and what is known of it
import { describe, expect, it } from "vitest";
import { BOOK_VOICE, keptMost, playerVoice, speakerNamed, voiceKey, voiceOf } from "../src/ai/voiceof.js";
import { playerContextOf } from "../src/playervoice.js";
import { buildSave } from "./build_save.js";
import speciesJson from "../data/species.json" with { type: "json" };
import { ENTRY_VOICE, INDEX_VOICE } from "../src/ai/tiinyfirst.js";
import { voiceRecipe } from "../src/ai/voices.js";

describe("a voice from any speaker", () => {
  it("gives a daemon its own recipe, and the INDEX its two", () => {
    const d = voiceOf({ kind: "daemon", species: 25, types: "SIGNAL", category: "FIRING" });
    expect(d.recipe).toBe(voiceRecipe({ types: "SIGNAL", category: "FIRING", species: 25 }, undefined, undefined));
    expect(voiceOf({ kind: "entry" }).recipe).toBe(ENTRY_VOICE);
    expect(voiceOf({ kind: "index" }).recipe).toBe(INDEX_VOICE);
    expect(voiceOf({ kind: "index", own: "  a trainer's own  " }).recipe).toBe("a trainer's own");
  });
  it("names each voice by its recipe: the same voice the same key, any change a new one", () => {
    const a = voiceOf({ kind: "daemon", species: 25, types: "SIGNAL" }), b = voiceOf({ kind: "daemon", species: 25, types: "SIGNAL" });
    expect(a.key).toBe(b.key);
    expect(voiceOf({ kind: "daemon", species: 26, types: "SIGNAL" }).key).not.toBe(a.key);
    expect(voiceOf({ kind: "daemon", species: 25, types: "SIGNAL", feelings: { glad: 80, sad: 0, mad: 0, calm: 0, restless: 0, strongest: null } as any }).key)
      .not.toBe(a.key);
    expect(voiceKey("index", "x")).not.toBe(voiceKey("entry", "x"));
    expect(a.key).toMatch(/^daemon-[0-9a-f]{8}$/);
  });
  it("reads each book in its own voice, and THE NOTEBOOK in the player's", () => {
    expect(voiceOf({ kind: "book", id: "subtle" }).recipe).toBe(BOOK_VOICE.subtle);
    expect(voiceOf({ kind: "book", id: "guide" }).recipe).toBe(BOOK_VOICE.guide);
    expect(BOOK_VOICE.guide).not.toBe(BOOK_VOICE.subtle);
    expect(voiceOf({ kind: "book", id: "unknown" }).recipe).toBe(INDEX_VOICE);
    const player = { choice: "REASON" as const, marks: 3 };
    expect(voiceOf({ kind: "book", id: "notebook", player }).recipe).toBe(playerVoice(player));
  });
});

describe("the player's voice", () => {
  it("is someone at the start with nothing done", () => {
    expect(playerVoice(null)).toContain("a little tentative");
    expect(playerVoice(null)).not.toContain("kept company");
  });
  it("moves as they play: their choice, their MARKS, their company, what they understood", () => {
    const start = playerVoice({ choice: "INSTINCT", marks: 0 });
    const later = playerVoice({ choice: "INSTINCT", marks: 8, roots: 5, partyTypes: ["FLOW", "FLOW", "SIGNAL"], instrument: "harp", hours: 60 });
    expect(start).toContain("goes with its first feeling");
    expect(later).toContain("seasoned by every road");
    expect(later).toContain("kept company with FLOW daemons");
    expect(later).toContain("as if it has understood a great deal");
    expect(later).toContain("plucked strings");
    expect(playerVoice({ choice: "REASON" })).toContain("thinks before it speaks");
  });
  it("moves only when a band is crossed, not every save", () => {
    expect(playerVoice({ marks: 5 })).toBe(playerVoice({ marks: 7 }));
    expect(playerVoice({ marks: 4 })).not.toBe(playerVoice({ marks: 5 }));
  });
  it("takes the type they keep most, only when one leads", () => {
    expect(keptMost(["FLOW", "flow", "SIGNAL"])).toBe("FLOW");
    expect(keptMost(["FLOW", "SIGNAL"])).toBeNull();
    expect(keptMost(["NOT A TYPE"])).toBeNull();
    expect(keptMost(["SIGNAL"])).toBe("SIGNAL");
  });
});

describe("a voice by its name", () => {
  const k = { daemon: () => ({ kind: "daemon" as const, species: 25, types: "SIGNAL" }), player: () => ({ marks: 8 }) };
  it("finds each speaker a caller can name, and nothing else", () => {
    expect(speakerNamed("daemon", k)).toMatchObject({ kind: "daemon", species: 25 });
    expect(voiceOf(speakerNamed("player", k)!).recipe).toContain("seasoned by every road");
    expect(voiceOf(speakerNamed("book:notebook", k)!).recipe).toBe(voiceOf(speakerNamed("player", k)!).recipe);
    expect(voiceOf(speakerNamed("book:subtle", k)!).recipe).toBe(BOOK_VOICE.subtle);
    expect(voiceOf(speakerNamed("entry", k)!).recipe).toBe(ENTRY_VOICE);
    expect(speakerNamed("book:../x", k)).toBeNull();
    expect(speakerNamed("someone", k)).toBeNull();
    expect(speakerNamed(undefined, k)).toBeNull();
  });
  it("uses a trainer's own recipe for a voice when one is written", () => {
    expect(voiceOf(speakerNamed("book:subtle", { ...k, own: (n) => n === "book.subtle" ? "mine" : null })!).recipe).toBe("mine");
  });
  it("reads no player from no save", () => expect(playerContextOf(null)).toBeNull());
  it("reads what it can of a save that is not one", () => {
    const c = playerContextOf(new Uint8Array(1024), "CONTEXT");
    expect(c).toMatchObject({ edition: "CONTEXT" });
    expect(() => voiceOf({ kind: "player", context: c })).not.toThrow();
  });
});

describe("the player's context from a save", () => {
  it("reads the company they keep into their voice", () => {
    const save = buildSave({ player: "ROVER", trainerId: 7, slots: [
      { counter: 1, party: [{ personality: 1, otId: 7, species: 25, nickname: "A", level: 9 }, { personality: 2, otId: 7, species: 25, nickname: "B", level: 9 }] },
      { counter: 0, party: [] }] });
    const c = playerContextOf(save, "CONTENT")!;
    const kind = (speciesJson as Record<string, { types: string[] }>)["25"].types[0];
    expect(c.partyTypes).toContain(kind);
    expect(c.marks).toBe(0);
    expect(playerVoice(c)).toContain(`kept company with ${kind} daemons`);
  });
});
