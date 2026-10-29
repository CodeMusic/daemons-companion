// C-220: the line filter -- what a daemon may say to another player's (kids play)
import { describe, expect, it } from "vitest";
import { safeLine } from "../src/meetsafe.js";
import { meetLines, type Speaker } from "../src/together.js";

const known = ["ROVERCUB", "LABEL", "SIGNAL/STATE"];
describe("a meeting's lines (C-220)", () => {
  it("lets a daemon talk about its life", () => {
    for (const ok of ["Hello, LABEL! I napped in the sun.", "I dreamt of rain last night.", "ROVERCUB! Have you eaten today?",
                      "Is it always this windy on Monday?", "I'm so full of berries.", "Same time tomorrow, LABEL?"])
      expect(safeLine(ok, known)).toBe(ok);
  });
  it("refuses anything out of the game, about a person, rude, made-up names, or too long", () => {
    for (const no of ["Visit www.example.com to play!", "Email me at kid@example.com", "Call 555 123 4567 tonight.",
                      "What is your real name?", "I live in a big house on the hill.", "Where do you live?", "What school do you go to?",
                      "Shut up, LABEL.", "You are so stupid.", "My friend Sarah feeds me berries.", "Hi! I met Tommy today.",
                      "Follow @rovercub for more.", "x".repeat(121), "   "])
      expect(safeLine(no, known)).toBeNull();
  });
  it("tidies the spaces of a line it keeps", () => {
    expect(safeLine("  Hello,\n  LABEL!  ", known)).toBe("Hello, LABEL!");
  });

  it("a meeting says a written line wherever the module's would not pass", async () => {
    const a: Speaker = { nickname: "ROVERCUB", name: "ROVERCUB", types: "SIGNAL", category: "", level: 5 };
    const b: Speaker = { nickname: "LABEL", name: "LABEL", types: "STATE", category: "", level: 5 };
    const say = async (me: Speaker) => (me.nickname === "ROVERCUB" ? "Visit www.example.com, says Sarah." : "I napped in the sun, ROVERCUB.");
    const lines = await meetLines(a, b, "2026-10-29T10:00", say);
    expect(lines[0]).toMatchObject({ who: "a", by: "written" });
    expect(lines[1]).toMatchObject({ who: "b", by: "module", said: "I napped in the sun, ROVERCUB." });
    expect(lines.map((l) => l.said).join(" ")).not.toMatch(/example|Sarah/);
  });
});
