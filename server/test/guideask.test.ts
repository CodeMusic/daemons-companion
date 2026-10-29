import { describe, expect, it } from "vitest";
import { guidePages, guidePassages, guidePersona, keptToPage, NO_PAGE } from "../src/guideask.js";
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
    expect(guidePersona(p)).toMatch(/^You are a small book\. .* From THE GUIDE: /);
  });
  it("answers as the GUIDE, from what was heard, when asked of it", () => {
    const ask = { history: [], daemon: { nickname: "SPARKY" }, speak: false, guide: (heard: string) => guidePages(guidePassages(g, heard)) };
    expect(persona(ask, "the mind as code")).toMatch(/From THE GUIDE: /);
    expect(persona({ ...ask, book: "THE SUBTLE LAYER" }, "a hunch")).toMatch(/From THE SUBTLE LAYER: /);
    expect(persona({ ...ask, guide: undefined })).toMatch(/^You are SPARKY/);
  });
});

describe("the GUIDE kept to its page (C-209)", () => {
  const page = { title: "THE SCHOOL", text: "The school is in the north of the town. Its bell rings at nine. Daemons are not allowed in the library." };
  const grounded = (said: string, p: string) => said.toLowerCase().split(/\W+/).filter((w) => w.length > 3).every((w) => p.toLowerCase().includes(w));
  it("keeps an answer from the page, and says the page's own sentence for one that is not", () => {
    expect(keptToPage("The bell rings at nine.", [page], "when does the bell ring", grounded)).toBe("The bell rings at nine.");
    expect(keptToPage("Paris is the capital of France.", [page], "when does the bell ring", grounded)).toBe("Its bell rings at nine.");
    expect(keptToPage("Anything at all.", [], "what is the capital of France", grounded)).toBe(NO_PAGE);
  });
});
