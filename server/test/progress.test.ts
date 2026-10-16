// C-128, C-129: the save's progress -- the paper's letter is the game's GradeLetter, by school.json's grades.
import { describe, expect, it } from "vitest";
import { gradeOf } from "../src/save/progress.js";
import school from "../data/school.json" with { type: "json" };

describe("CALLOW SCHOOL's marks", () => {
  it("gives a letter for every mark, the top grade from its own floor", () => {
    const top = school.grades[0];
    expect(gradeOf(100)).toBe(top.letter);
    expect(gradeOf(top.from)).toBe(top.letter);
    for (let m = 0; m <= 100; m++) expect(gradeOf(m)).not.toBeNull();
  });
});
