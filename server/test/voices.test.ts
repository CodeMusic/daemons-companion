// C-251: a daemon's voice as a description, for a voice-design model
import { describe, expect, it } from "vitest";
import { moodOfVoice, ownVoice, TYPE_VOICE, VOICES_OF_OWN, voiceRecipe } from "../src/ai/voices.js";

const calm = { glad: 0, mad: 0, sad: 0, calm: 0, restless: 0, strongest: null };

describe("a daemon's voice recipe", () => {
  it("has a voice for every type", () => expect(Object.keys(TYPE_VOICE)).toHaveLength(18));
  it("is its type's voice, a touch of its second type, and its category", () => {
    const r = voiceRecipe({ types: ["SIGNAL", "FLOW"], category: "DEMAND" }, calm);
    expect(r).toContain(TYPE_VOICE.SIGNAL);
    expect(r).toContain("with a touch of smooth");
    expect(r).toContain("It is a demand creature.");
    expect(r).not.toMatch(/right now/i);
  });
  it("takes types written as A/B", () => expect(voiceRecipe({ types: "FROZEN/LOGIC" })).toContain(TYPE_VOICE.FROZEN));
  it("is shaded by a strong feeling, never by a faint one", () => {
    expect(moodOfVoice({ ...calm, sad: 60 })).toContain("slower and softer");
    expect(moodOfVoice({ ...calm, calm: -70 })).toContain("hesitant");
    expect(moodOfVoice({ ...calm, glad: 20 })).toBe("");
  });
  it("uses a trainer's own words whole, with the mood after", () => {
    expect(voiceRecipe({ types: ["SIGNAL"] }, { ...calm, glad: 90 }, "a tiny robot with a squeaky voice"))
      .toBe("a tiny robot with a squeaky voice Right now it sounds happy and light, smiling as it speaks.");
  });
  it("never says the word it is mistaken for", () => {
    for (const t of Object.keys(TYPE_VOICE)) expect(voiceRecipe({ types: [t], category: "X" }).toLowerCase()).not.toContain("demon");
  });
  it("gives every species a voice of its own, kin by type", () => {
    const seen = new Set<string>();
    for (let n = 0; n < VOICES_OF_OWN; n++) seen.add(ownVoice(n));
    expect(seen.size).toBe(VOICES_OF_OWN);
    const a = voiceRecipe({ types: ["SIGNAL"], category: "DEMAND", species: 25 }), b = voiceRecipe({ types: ["SIGNAL"], category: "DEMAND", species: 26 });
    expect(a).not.toBe(b);
    expect(a).toContain(TYPE_VOICE.SIGNAL); expect(b).toContain(TYPE_VOICE.SIGNAL);
    expect(a).toContain(ownVoice(25));
    expect(ownVoice(null)).toBe("");
    expect(voiceRecipe({ types: ["SIGNAL"], species: 25 }, null, "my own words")).toBe("my own words");
  });
});
