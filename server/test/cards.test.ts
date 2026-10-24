// C-186: an INDEX card's colour -- the user's rule, type match.
import { describe, expect, it } from "vitest";
import { cardColour } from "../src/save/index.js";
import cards from "../data/index_cards.json" with { type: "json" };

const none = [false, false, false, false, false, false, false];
const growth = (cards.understandings as { lobe_type: string; hex: string; name: string }[]).find((u) => u.lobe_type === "GROWTH")!;
const at = (cards.understandings as { lobe_type: string }[]).findIndex((u) => u.lobe_type === "GROWTH");

describe("an INDEX card's colour (C-186)", () => {
  it("stays grey until the understanding sharing its type is held, then takes that understanding's colour", () => {
    expect(cardColour(["GROWTH"], none)).toBeNull();
    const held = none.map((_, i) => i === at);
    expect(cardColour(["GROWTH"], held)).toEqual({ hex: growth.hex, by: "understanding", understanding: growth.name });
    expect(cardColour(["VECTOR", "GROWTH"], held)?.by).toBe("understanding");      // either of its types will do
  });
  it("takes its own type's colour when no understanding shares a type with it", () => {
    expect(cardColour(["VECTOR"], none)).toEqual({ hex: (cards.type_colours as Record<string, string>).VECTOR, by: "bound" });
  });
});
