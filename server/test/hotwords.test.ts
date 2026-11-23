// C-369: the ear hears the lexicon
import { describe, expect, it } from "vitest";
import { edits, hearAs, HOTWORD_LIST } from "../src/machine/hotwords.js";

describe("C-369: the ear hears the lexicon", () => {
  it("puts right what the Tiiny heard on 2026-11-15", () => {
    expect(hearAs("Hello there, little Damon. Are you hungry?")).toBe("Hello there, little daemon. Are you hungry?");
    expect(hearAs("My river cub learned to scrape on the way to Doldrum City.")).toBe("My ROVERCUB learned to scrape on the way to Doldrum City.");
    expect(hearAs('Crystal Clear said, "Roverbyte is waiting at Kettle Spring with the Damons."'))
      .toBe('Crystal Clear said, "Roverbyte is waiting at Kettle Spring with the daemons."');
  });
  it("never leaves the frightening word", () => {
    expect(hearAs("Demons in the grass")).toBe("Daemons in the grass");
    expect(hearAs("a demon")).toBe("a daemon");
  });
  it("leaves ordinary words alone, and keeps the lines", () => {
    expect(HOTWORD_LIST).not.toContain("FORK");
    expect(hearAs("The cannon by the fork in the road.")).toBe("The cannon by the fork in the road.");
    expect(hearAs("first line\nsecond line")).toBe("first line\nsecond line");
    expect(hearAs("")).toBe("");
  });
  it("counts edits", () => {
    expect(edits("rivercub", "rovercub")).toBe(1);
    expect(edits("abc", "abcdefgh", 2)).toBe(3);
  });
});
