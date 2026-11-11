// C-299: the third book's three sealed recordings each open with their own book's key, read from that book's first entry
// (the user, 2026-11-05) -- the night half's WARNING (the revised one says "read it", 5d0e7a0; the first said "set it
// down"), the dawn half's BLESSING, the mended book's ATTESTATION. Only their shapes are checked: no key is written here.
// DAEMONS T-533: THE ORIGIN OF A DAEMON's whole-book recording opens with the last word of its own last page, as
// tools/bookpdf.py's vault_key('origin', ...) reads it; its expected key is built here from the book's own text.
import { describe, expect, it } from "vitest";
import { keyOfBook, keyOfOrigin, keyOfWarning } from "../src/bookkeys.js";
import hermetic from "../data/hermetic.json" with { type: "json" };
import eudaimon from "../data/eudaimon.json" with { type: "json" };
import unity from "../data/unity.json" with { type: "json" };
import origin from "../data/origin.json" with { type: "json" };

type Section = { entries: { paragraphs: { text: string }[] }[] };
const opening = (b: unknown) => (b as { sections: Section[] })
  .sections[0].entries[0].paragraphs.map((p) => p.text).join(" ");
// a section's paragraphs, joined, as Origin.tsx hands the last one to LISTEN
const page = (s: Section) => s.entries.flatMap((e) => e.paragraphs.map((p) => p.text)).join(" ");
const ORIGIN = (origin as unknown as { sections: Section[] }).sections;

describe("the sealed recordings' keys", () => {
  it("are found in each torn book's first entry as it reads now", () => {
    expect(keyOfBook("hermetic", opening(hermetic))).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
    expect(keyOfBook("eudaimon", opening(eudaimon))).toMatch(/^The [A-Z][a-z]+$/);
    expect(keyOfBook("unity", opening(unity))).toMatch(/^[A-Z][a-z]+ and [A-Z][a-z]+$/);
  });
  it("read the warning's first wording too, and nothing from a line that names no one", () => {
    expect(keyOfWarning("ABLE BAKER set it down here.")).toBe("Able Baker");
    expect(keyOfWarning("ABLE BAKER read it on a ship.")).toBe("Able Baker");
    expect(keyOfBook("eudaimon", "A HERON read it once.")).toBe("The Heron");
    expect(keyOfBook("unity", "One was read by a crow, and one at noon by an owl.")).toBe("Crow and Owl");
    expect(keyOfBook("hermetic", "Someone read it once.")).toBeNull();
    expect(keyOfBook("unity", "Nobody read it.")).toBeNull();
  });
});

describe("THE ORIGIN OF A DAEMON's sealed recording (DAEMONS T-533)", () => {
  const lastSection = ORIGIN[ORIGIN.length - 1];
  const lastEntry = lastSection.entries[lastSection.entries.length - 1].paragraphs.map((p) => p.text).join(" ");   // bookpdf.py's reading

  it("opens with the last word of the book's own last page, in title case, as bookpdf.py reads it", () => {
    const m = /\bThat is how I (\w+)\.\s*$/.exec(lastEntry);
    expect(m, "the last page still ends the book").not.toBeNull();
    const want = m![1][0].toUpperCase() + m![1].slice(1).toLowerCase();
    expect(want).toMatch(/^[A-Z][a-z]+$/);
    expect(keyOfOrigin(lastEntry)).toBe(want);
    expect(keyOfOrigin(page(lastSection))).toBe(want);             // the last section's paragraphs, as the app joins them
    expect(keyOfBook("origin", page(lastSection))).toBe(want);     // and as LISTEN asks for it
  });

  it("is on no other page: a book with any section still to come holds no key", () => {
    for (let k = 1; k < ORIGIN.length; k++) {
      const back = ORIGIN.slice(0, k);
      expect(keyOfOrigin(page(back[k - 1])), `${k} sections back`).toBeNull();   // the last page a partial book holds
      expect(keyOfOrigin(back.map(page).join(" ")), `${k} sections back`).toBeNull();
    }
    expect(keyOfOrigin(opening(origin))).toBeNull();               // nor its first page, where the torn books keep theirs
  });

  it("reads only a line that ends the page", () => {
    expect(keyOfOrigin("It was long. That is how I listened.")).toBe("Listened");
    expect(keyOfOrigin("That is how I LISTENED.  \n")).toBe("Listened");
    expect(keyOfOrigin("That is how I listened. Then the rest.")).toBeNull();
    expect(keyOfOrigin("That is how I listened")).toBeNull();
    expect(keyOfOrigin("that is how I listened.")).toBeNull();
    expect(keyOfBook("origin", "A HERON read it once.")).toBeNull();
  });
});
