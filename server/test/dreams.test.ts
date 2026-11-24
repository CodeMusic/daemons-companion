import { describe, expect, it } from "vitest";
import { checkNight, dreamWords, dreamsOf, freshDream, keepNight, quality, rested, rewriteDream } from "../src/damagotchi/dreams.js";
import { bondAdd, bondOf, bondScore } from "../src/damagotchi/evolve.js";
import { Store } from "../src/shared/db.js";

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
  it("writes the same dream for the same night, told by the daemon itself (C-293)", () => {
    const n = night(8, 1) as any;
    expect(dreamWords(n, "SPARKY", 1234)).toBe(dreamWords(n, "SPARKY", 1234));
    expect(dreamWords(n, "SPARKY", 1234)).toMatch(/^I dreamt of .+\. I woke .+\.$/);
    expect(dreamWords(night(3, 0) as any, "SPARKY", 1234)).toMatch(/^I dreamt in pieces: /);
  });
  it("keeps the journal, once a night, the module's telling over the written one", () => {
    const store = new Store(":memory:");
    const n = night(8, 1) as any;
    const d = keepNight(store, n, who);
    expect(d).toMatchObject({ id: 1, quality: "vivid", by: "words", nickname: "SPARKY" });
    expect(keepNight(store, n, who).id).toBe(1);                // told again: the same dream
    expect(dreamsOf(store)).toHaveLength(1);
    expect(rewriteDream(store, 1, "  I dreamt the moon was a coin.  ")?.text).toBe("I dreamt the moon was a coin.");
    expect(freshDream(store)).toMatchObject({ id: 1, by: "module", text: "I dreamt the moon was a coin." });
    expect(freshDream(store, new Date(Date.now() + 20 * 3600000))).toBeNull();
  });
  it("counts a rested night toward the bond", () => {
    const store = new Store(":memory:");
    bondAdd(store, 9, "nights"); bondAdd(store, 9, "nights");
    expect(bondOf(store, 9).nights).toBe(2);
    expect(bondScore(bondOf(store, 9))).toBe(4);
  });
});

// C-456: DREAM-BOOKS -- every dream kept for good, bound a volume a month for each daemon
import { boundOf, dreamAuthors, dreamBooks } from "../src/damagotchi/dreams.js";
describe("DREAM-BOOKS (C-456)", () => {
  it("binds dreams past the journal's ninety and gathers a volume a month for each daemon", () => {
    const store = new Store(":memory:");
    const cub = { nickname: "ROVERCUB", species: 4, personality: 1001, device: "t-watch-ultra-abc123" };
    const lab = { nickname: "LABEL", species: 7, personality: 1002, device: "t-watch-ultra-def456" };
    // a hundred nights from the 1st of October, ROVERCUB's, and LABEL's five in November
    for (let i = 0; i < 100; i++) {
      const from = new Date(2026, 9, 1 + i, 23), to = new Date(from.getTime() + 7 * 3600000);
      keepNight(store, { from: from.toISOString(), to: to.toISOString(), hours: 7, stirs: 1, tucked: false }, cub);
    }
    for (let i = 0; i < 5; i++) {
      const from = new Date(2026, 10, 3 + i, 22, 30), to = new Date(from.getTime() + 8 * 3600000);
      keepNight(store, { from: from.toISOString(), to: to.toISOString(), hours: 8, stirs: 0, tucked: true }, lab);
    }
    expect(dreamsOf(store)).toHaveLength(90);
    expect(boundOf(store)).toHaveLength(15);                        // none dropped
    const vols = dreamBooks(store);
    expect(vols.reduce((n, v) => n + v.dreams.length, 0)).toBe(105);
    const cubs = vols.filter((v) => v.personality === 1001).map((v) => [v.month, v.dreams.length]);
    expect(cubs).toEqual([["JANUARY 2027", 8], ["DECEMBER 2026", 31], ["NOVEMBER 2026", 30], ["OCTOBER 2026", 31]]);
    const labs = vols.find((v) => v.personality === 1002)!;
    expect(labs).toMatchObject({ title: "LABEL'S DREAMS", month: "NOVEMBER 2026", species: 7 });
    expect(labs.dreams.map((d) => d.from)).toEqual([...labs.dreams.map((d) => d.from)].sort());   // dreamt order
  });
  it("DAEMON DREAMS (C-483): one book a daemon, every dream in the order dreamt, the most dreams first", () => {
    const store = new Store(":memory:");
    const cub = { nickname: "ROVERCUB", species: 4, personality: 1001, device: "w1" };
    const lab = { nickname: "LABEL", species: 7, personality: 1002, device: "w2" };
    const night = (who: typeof cub, d: Date) =>
      keepNight(store, { from: d.toISOString(), to: new Date(d.getTime() + 7 * 3600000).toISOString(), hours: 7, stirs: 0, tucked: false }, who);
    for (let i = 0; i < 40; i++) night(cub, new Date(2026, 9, 20 + i, 23));      // across October, November and December
    for (let i = 0; i < 3; i++) night(lab, new Date(2027, 0, 2 + i, 23));        // fewer, but later
    const [first, second] = dreamAuthors(store);
    expect(first).toMatchObject({ id: "dreams-1001", title: "ROVERCUB'S DREAMS", count: 40, species: 4 });
    expect(first.dreams.map((d) => d.from)).toEqual([...first.dreams.map((d) => d.from)].sort());
    expect(first.last).toBe(first.dreams[39].from);
    expect(second).toMatchObject({ title: "LABEL'S DREAMS", count: 3 });
    expect(Date.parse(second.last)).toBeGreaterThan(Date.parse(first.last));
  });
});
