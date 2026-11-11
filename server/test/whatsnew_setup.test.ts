// C-339: WHAT'S NEW's SET UP -- each ticket's steps (data/whatsnew_setup.json) carried on the sections that name it
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { NOTES, stepText, wikiUrl, type Setup } from "../src/whatsnew.js";

const here = new URL(".", import.meta.url);
const SETUP = JSON.parse(readFileSync(new URL("../data/whatsnew_setup.json", here), "utf8")).setup as Record<string, Setup>;
const BOOKS = ["micro", "quick", "player", "social", "tiiny", "companion", "watch"];   // HOW TO PLAY's books (state/manual.ts)

describe("whatsnew setup", () => {
  it("gives every entry a title and steps, and only known books and wiki pages", () => {
    expect(Object.keys(SETUP).length).toBeGreaterThan(0);
    for (const [t, s] of Object.entries(SETUP)) {
      expect(t).toMatch(/^C-\d+$/);
      expect(s.title.length, t).toBeGreaterThan(0);
      expect(s.steps.length, t).toBeGreaterThan(0);
      if (s.book) expect(BOOKS, t).toContain(s.book);
      if (s.wiki) expect(existsSync(new URL(`../../wiki/${s.wiki.split("#")[0]}.md`, here)), `${t}: wiki/${s.wiki}`).toBe(true);
      const words = [s.title, s.where ?? "", ...(s.needs ?? []), ...s.steps].join(" ");
      expect(words, t).not.toMatch(/\bdemons?\b/i);                  // DAY-mons
    }
  });

  it("is carried on the notes' sections, as whatsnew.py writes them", () => {
    for (const b of NOTES.builds) for (const s of b.sections) {
      if (s.ticket && SETUP[s.ticket]) expect(s.setup, `${b.build} ${s.ticket}`).toEqual(SETUP[s.ticket]);
      else expect(s.setup, `${b.build} ${s.ticket}`).toBeUndefined();
    }
    const latest = NOTES.builds.find((b) => b.build === NOTES.latest)!;
    expect(latest.sections.some((s) => s.setup)).toBe(true);
  });

  it("puts the hub's address into a step, and links the wiki", () => {
    expect(stepText("open {hub}/admin/", "http://hub:4730/")).toBe("open http://hub:4730/admin/");
    expect(wikiUrl("Settings#in-the-app")).toBe("https://github.com/CodeMusic/daemons-companion/wiki/Settings#in-the-app");
  });
});
