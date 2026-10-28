import { describe, expect, it } from "vitest";
import { guidePages, guidePassages, guidePersona } from "../src/guideask.js";
import { persona } from "../src/ai/house.js";
import { guideOf } from "../src/save/guide.js";

describe("C-209: asking the GUIDE", () => {
  const g = guideOf(() => true);
  it("finds nothing before the GUIDE is found", () => {
    expect(guidePassages(guideOf(() => false), "the mind")).toEqual([]);
  });
  it("takes the pages nearest the question, cut to a short window", () => {
    const p = guidePassages(g, "How is the mind like software and code?");
    expect(p.length).toBeGreaterThan(0);
    expect(p.length).toBeLessThanOrEqual(2);
    expect(p.map((x) => x.text).join("").length).toBeLessThanOrEqual(700);
    expect(guidePersona(p)).toMatch(/^You are THE GUIDE/);
  });
  it("answers as the GUIDE, from what was heard, when asked of it", () => {
    const ask = { history: [], daemon: { nickname: "SPARKY" }, speak: false, guide: (heard: string) => guidePages(guidePassages(g, heard)) };
    expect(persona(ask, "the mind as code")).toMatch(/^You are THE GUIDE/);
    expect(persona({ ...ask, guide: undefined })).toMatch(/^You are SPARKY/);
  });
});
