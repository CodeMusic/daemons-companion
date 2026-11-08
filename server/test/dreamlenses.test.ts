// C-308: a dream told twice at once (in order; all at once) and made whole, with its title
import { describe, expect, it } from "vitest";
import { checkNight, dreamAsk, dreamTwice, dreamsOf, keepLenses, keepNight, mergeAsk, readMerged, titleOf, DREAM_TITLES, type Night } from "../src/dreams.js";
import { Store } from "../src/db.js";

const to = new Date("2026-11-08T07:00:00Z");
const night = checkNight({ from: new Date(to.getTime() - 8 * 3600000).toISOString(), to: to.toISOString(), stirs: 1, tucked: true }) as Night;
const who = { nickname: "SPARKY", species: 25, personality: 1234, device: "t-watch-ultra-f351d4" };
const dreamer = { nickname: "SPARKY", name: "PIKACHU", trainer: "Chris" };

describe("C-308: two tellings and one made of them", () => {
  it("asks each telling its own way, and the plain ask stays as it was", () => {
    const left = dreamAsk(night, "a walk", dreamer, "day", "left"), right = dreamAsk(night, "a walk", dreamer, "day", "right");
    expect(left).toMatch(/in order/); expect(left).toMatch(/under 420 characters/);
    expect(right).toMatch(/all at once/); expect(right).not.toMatch(/in order, as it went/);
    expect(dreamAsk(night, "a walk", dreamer)).toMatch(/under 320 characters/);
    for (const a of [left, right, mergeAsk("I dreamt a.", "I dreamt b.")]) expect(a).not.toMatch(/hemisphere|brain/i);
  });
  it("reads the joined telling from JSON, a TITLE line, or not at all", () => {
    expect(readMerged('Here: {"title": "the glass stair", "dream": "I dreamt I climbed a stair of glass."}'))
      .toEqual({ title: "THE GLASS STAIR", dream: "I dreamt I climbed a stair of glass." });
    expect(readMerged("<think>hmm {\"x\":1}</think>TITLE: Rain in the Library\nI dreamt the rain read aloud."))
      .toEqual({ title: "RAIN IN THE LIBRARY", dream: "I dreamt the rain read aloud." });
    expect(readMerged("")).toBeNull();
    expect(readMerged('{"title": "only"}')).toBeNull();
  });
  it("writes both tellings at once, then joins them; nothing kept when one fails", async () => {
    const asked: string[] = [];
    let open = 0, most = 0;
    const write = async (_s: string, user: string) => {
      asked.push(user); open++; most = Math.max(most, open);
      await new Promise((r) => setTimeout(r, 5)); open--;
      if (user.includes("IN ORDER:")) return '{"title": "Counting lanterns", "dream": "I dreamt we counted lanterns until they were one light."}';
      return user.includes("as it went") ? "I dreamt first a lantern, then ten." : "Lanterns, all of them, a warm sea.";
    };
    const made = await dreamTwice(night, "a walk", dreamer, write);
    expect(most).toBe(2);                                             // the two tellings at once
    expect(asked).toHaveLength(3);
    expect(asked[2]).toContain("IN ORDER: I dreamt first a lantern, then ten.");
    expect(asked[2]).toContain("ALL AT ONCE: I dreamt this: Lanterns, all of them, a warm sea.");
    expect(made).toEqual({ title: "COUNTING LANTERNS", text: "I dreamt we counted lanterns until they were one light.",
                           left: "I dreamt first a lantern, then ten.", right: "I dreamt this: Lanterns, all of them, a warm sea." });
    expect(await dreamTwice(night, null, dreamer, async (_s, u) => (u.includes("all at once") ? null : "I dreamt x."))).toBeNull();
    expect(await dreamTwice(night, null, dreamer, async () => { throw new Error("down"); })).toBeNull();
  });
  it("keeps the lenses on the night, and every dream has a title", () => {
    const store = new Store(":memory:");
    const d = keepNight(store, night, who);
    expect(DREAM_TITLES).toContain(titleOf(d));                       // a written dream: the game's own title
    keepLenses(store, d.id, { title: "COUNTING LANTERNS", text: "I dreamt one light.", left: "I dreamt a.", right: "I dreamt b." });
    const kept = dreamsOf(store)[0];
    expect(kept).toMatchObject({ by: "module", title: "COUNTING LANTERNS", text: "I dreamt one light.", left: "I dreamt a.", right: "I dreamt b." });
    expect(titleOf(kept)).toBe("COUNTING LANTERNS");
    keepLenses(store, d.id, { title: "", text: "I dreamt again.", left: "l", right: "r" });
    expect(dreamsOf(store)[0].title).toBe("COUNTING LANTERNS");      // no new title: the last one stays
  });
});
