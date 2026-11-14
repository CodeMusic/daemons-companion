// C-359: a daemon is spoken of as the game has it -- he, she, or they, never it
import { describe, expect, it } from "vitest";
import species from "../data/species.json" with { type: "json" };
import { genderOf, pronounLine } from "../src/ai/gender.js";
import { personaOf, speciesFacts } from "../src/ai/personaof.js";
import { shortSelf, selfOf } from "../src/self.js";

const S = species as unknown as Record<string, { name: string; gender: number }>;
const first = (ratio: number) => Number(Object.keys(S).find((k) => S[k].gender === ratio));

describe("C-359: a daemon's gender", () => {
  it("every species carries the game's split", () => {
    for (const row of Object.values(S)) expect([0, 31, 63, 127, 191, 254, 255]).toContain(row.gender);
  });
  it("reads it as GetBoxMonGender does: female when the split is above the personality's low byte", () => {
    const half = first(127);
    expect(genderOf(half, 0x100 + 126)).toBe("female");
    expect(genderOf(half, 0x100 + 127)).toBe("male");
    expect(genderOf(first(0), 0)).toBe("male");
    expect(genderOf(first(254), 255)).toBe("female");
    expect(genderOf(first(255), 0)).toBe("none");
    expect(genderOf(half, undefined)).toBeUndefined();       // no personality: no guess
  });
  it("says he, she, or they -- never it", () => {
    expect(pronounLine("male")).toContain("he and him");
    expect(pronounLine("female")).toContain("she and her");
    expect(pronounLine("none")).toContain("they and them");
    expect(pronounLine("none")).toMatch(/never it\b/);
    expect(pronounLine(undefined)).toBe("");
  });
  it("every persona says it", () => {
    const sp = first(255);
    expect(personaOf(speciesFacts(sp, "", "CONTENT", 7))).toContain("they and them");
    expect(shortSelf({ nickname: "X", gender: "female" })).toContain("she and her");
    expect(selfOf({ nickname: "X", gender: "male" })).toContain("he and him");
  });
});
