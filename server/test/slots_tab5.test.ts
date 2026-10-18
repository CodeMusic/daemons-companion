// C-155: the Tab5 keeps THE CASINO's table in C++ (firmware/tab5/src/slots.h). Its numbers must be slots.ts's, so the
// Tab5's odds are every player's.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BETS, OUTCOMES, PAYS, WEIGHTS } from "../src/slots.js";

const H = readFileSync(join(__dirname, "..", "..", "firmware", "tab5", "src", "slots.h"), "utf8");
const list = (name: string) => (H.match(new RegExp(`${name}\\[\\]\\s*=\\s*\\{([^}]*)\\}`))?.[1] ?? "").split(",").map((s) => s.trim()).filter(Boolean);

describe("the Tab5's CASINO table", () => {
  it("weighs, pays and bets as slots.ts does", () => {
    expect(list("WEIGHTS").map(Number)).toEqual(WEIGHTS);
    expect(list("PAYS").map(Number)).toEqual(PAYS);
    expect(list("BETS").map(Number)).toEqual(BETS);
    expect(list("OUTCOMES").map((s) => s.replace(/"/g, ""))).toEqual([...OUTCOMES]);
  });
});
