// C-386: THE MUSE -- the persona, a thread of the journal (alluded to, never quoted), and the synesthesia of now
import { describe, expect, it } from "vitest";
import { museKey, museOf, nowSensed, paintPalette } from "../src/psyche/muse.js";
import { imagePromptOf } from "../src/psyche/easel.js";

const MONDAY_IN_NOVEMBER = new Date(2026, 10, 16, 9, 0);

describe("the muse", () => {
  it("is the persona, the journal's threads and the colours and notes of now", () => {
    const m = museOf({ persona: "You are a small daemon.", journal: ["a walk by the river", "the long week"], at: MONDAY_IN_NOVEMBER });
    expect(m.startsWith("You are a small daemon.")).toBe(true);
    expect(m).toMatch(/never quote it/);
    expect(m).toMatch(/- a walk by the river/);
    expect(m).toMatch(/November: the note A#\/Bb, the colour indigo into violet/);
    expect(m).toMatch(/Monday: the note D, the colour orange/);
  });
  it("leaves the journal out when there is none", () => {
    expect(museOf({ persona: "P", at: MONDAY_IN_NOVEMBER })).not.toMatch(/writing lately/);
  });
  it("keys the music to the month, and colours a painting by month and day", () => {
    expect(museKey(MONDAY_IN_NOVEMBER)).toBe("Bb major");
    expect(museKey(MONDAY_IN_NOVEMBER, true)).toBe("Bb minor");
    expect(paintPalette(MONDAY_IN_NOVEMBER)).toBe("the background in indigo and violet tones, the main form in orange");
    expect(imagePromptOf("A fox.", "oil", paintPalette(MONDAY_IN_NOVEMBER))).toMatch(/A fox\. Its colours: the background in indigo/);
    expect(imagePromptOf("A fox.", "oil")).not.toMatch(/Its colours/);
    expect(nowSensed(new Date(2026, 2, 2))).toMatch(/March: the note D, the colour orange, its tone balance/);
  });
});
