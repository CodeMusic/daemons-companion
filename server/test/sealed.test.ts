// C-299: the third book's three sealed recordings each open with their own book's key, read from that book's first entry
// (the user, 2026-11-05) -- the night half's WARNING (the revised one says "read it", 5d0e7a0; the first said "set it
// down"), the dawn half's BLESSING, the mended book's ATTESTATION. Only their shapes are checked: no key is written here.
import { describe, expect, it } from "vitest";
import { keyOfBook, keyOfWarning } from "../src/bookkeys.js";
import hermetic from "../data/hermetic.json" with { type: "json" };
import eudaimon from "../data/eudaimon.json" with { type: "json" };
import unity from "../data/unity.json" with { type: "json" };

const opening = (b: unknown) => (b as { sections: { entries: { paragraphs: { text: string }[] }[] }[] })
  .sections[0].entries[0].paragraphs.map((p) => p.text).join(" ");

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
