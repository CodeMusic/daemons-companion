import { describe, expect, it } from "vitest";
import { checkNight, dreamWords, dreamsOf, freshDream, keepNight, quality, rested, rewriteDream } from "../src/dreams.js";
import { bondAdd, bondOf, bondScore } from "../src/evolve.js";
import { Store } from "../src/db.js";

const night = (hours: number, stirs: number, tucked = false) => {
  const to = new Date("2026-10-29T07:00:00Z");
  return checkNight({ from: new Date(to.getTime() - hours * 3600000).toISOString(), to: to.toISOString(), stirs, tucked });
};
const who = { nickname: "SPARKY", species: 25, personality: 1234, device: "t-watch-ultra-f351d4" };

describe("C-200: a night and its dream", () => {
  it("checks the night as the watch tells it", () => {
    expect(checkNight({ from: "x", to: "y" })).toBe("a night needs from and to (ISO times)");
    expect(night(0.5, 0)).toBe("a night is one to sixteen hours");
    expect(night(17, 0)).toBe("a night is one to sixteen hours");
    expect(night(7.5, 2, true)).toMatchObject({ hours: 7.5, stirs: 2, tucked: true });
  });
  it("judges a night by its length and its stirs", () => {
    expect(quality(night(8, 1) as any)).toBe("vivid");
    expect(quality(night(5, 2) as any)).toBe("quiet");
    expect(quality(night(3, 0) as any)).toBe("broken");
    expect(quality(night(7, 12) as any)).toBe("broken");
    expect(rested(night(7, 2) as any)).toBe(true);
    expect(rested(night(7, 12) as any)).toBe(false);
  });
  it("writes the same dream for the same night, in the daemon's name", () => {
    const n = night(8, 1) as any;
    expect(dreamWords(n, "SPARKY", 1234)).toBe(dreamWords(n, "SPARKY", 1234));
    expect(dreamWords(n, "SPARKY", 1234)).toMatch(/^SPARKY dreamt of .+\. It woke .+\.$/);
    expect(dreamWords(night(3, 0) as any, "SPARKY", 1234)).toMatch(/^SPARKY dreamt in pieces: /);
  });
  it("keeps the journal, once a night, the module's telling over the written one", () => {
    const store = new Store(":memory:");
    const n = night(8, 1) as any;
    const d = keepNight(store, n, who);
    expect(d).toMatchObject({ id: 1, quality: "vivid", by: "words", nickname: "SPARKY" });
    expect(keepNight(store, n, who).id).toBe(1);                // told again: the same dream
    expect(dreamsOf(store)).toHaveLength(1);
    expect(rewriteDream(store, 1, "  It dreamt the moon was a coin.  ")?.text).toBe("It dreamt the moon was a coin.");
    expect(freshDream(store)).toMatchObject({ id: 1, by: "module", text: "It dreamt the moon was a coin." });
    expect(freshDream(store, new Date(Date.now() + 20 * 3600000))).toBeNull();
  });
  it("counts a rested night toward the bond", () => {
    const store = new Store(":memory:");
    bondAdd(store, 9, "nights"); bondAdd(store, 9, "nights");
    expect(bondOf(store, 9).nights).toBe(2);
    expect(bondScore(bondOf(store, 9))).toBe(4);
  });
});
