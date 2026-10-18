// C-149: the holiday a date keeps in an edition (DAEMONS T-416's table, by its real names), and how a board dresses.
import { describe, expect, it } from "vitest";
import { easter, holiday } from "../src/holidays.js";

const on = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12);

describe("holidays (C-149, T-416)", () => {
  it("finds Easter by the computus", () => {
    expect(easter(2026)).toEqual({ month: 4, day: 5 });
    expect(easter(2027)).toEqual({ month: 3, day: 28 });
    expect(easter(2030)).toEqual({ month: 4, day: 21 });
  });

  it("keeps the COMMON days in both editions, dressed", () => {
    for (const ed of ["CONTENT", "CONTEXT"] as const)
      expect(holiday(ed, on(2026, 10, 31))).toMatchObject({ name: "Halloween", look: "pumpkins", hat: "witch", quiet: false });
    expect(holiday("CONTENT", on(2026, 10, 30))).toBeNull();
    expect(holiday("CONTENT", on(2026, 12, 25))?.name).toBe("Christmas (Eve and Day)");
    expect(holiday("CONTENT", on(2026, 12, 26))).toBeNull();
  });

  it("keeps each hemisphere's own", () => {
    expect(holiday("CONTENT", on(2026, 10, 12))?.name).toBe("Thanksgiving (Canada)");    // the 2nd Monday of October
    expect(holiday("CONTEXT", on(2026, 10, 12))).toBeNull();
    expect(holiday("CONTENT", on(2026, 11, 26))?.name).toBe("Thanksgiving (US)");        // the 4th Thursday of November
    expect(holiday("CONTEXT", on(2026, 2, 14))?.name).toBe("Carnival");                  // Easter -50: 14-17 Feb 2026, the edition's first
    expect(holiday("CONTENT", on(2026, 2, 14))?.name).toBe("Valentine's Day");
  });

  it("starts the equinoxes and solstices with the edition's own seasons", () => {
    expect(holiday("CONTENT", on(2026, 3, 21))?.name).toBe("Spring equinox");
    expect(holiday("CONTEXT", on(2026, 3, 21))?.name).toBe("Autumn equinox");             // the southern year, two seasons on
    expect(holiday("CONTEXT", on(2026, 12, 21))?.name).toBe("Summer solstice");
  });

  it("names a QUIET day and leaves it undressed", () => {
    expect(holiday("CONTENT", on(2026, 11, 2))).toEqual({ name: "Day of the Dead", quiet: true, look: "none", colours: [], hat: "none", flip: false });
    expect(holiday("CONTEXT", on(2026, 4, 25))?.quiet).toBe(true);
  });

  it("steps a holiday off the one it gives way to: Science Week round Youth Day (T-416)", () => {
    expect(holiday("CONTEXT", on(2026, 8, 11))?.name).toBe("National Science Week");
    expect(holiday("CONTEXT", on(2026, 8, 12))?.name).toBe("International Youth Day");    // the day is Youth Day's
    expect(holiday("CONTEXT", on(2026, 8, 13))?.name).toBe("National Science Week");      // and the fair goes on
    expect(holiday("CONTENT", on(2026, 8, 12))?.name).toBe("International Youth Day");
    expect(holiday("CONTENT", on(2040, 9, 20))?.name).toBe("Mid-Autumn Festival");         // the table runs to 2040
  });

  it("runs a holiday of several days to its end, and turns April Fools' upside down", () => {
    expect(holiday("CONTEXT", on(2026, 8, 16))?.name).toBe("National Science Week");      // the 2nd Saturday, Aug 8, for 9 days
    expect(holiday("CONTEXT", on(2026, 8, 17))).toBeNull();
    expect(holiday("CONTENT", on(2026, 4, 1))?.flip).toBe(true);
  });
});
