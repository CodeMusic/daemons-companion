// C-433 (PRAXIS 6): RECIPES -- typed in or read from a page's schema.org Recipe, COOKED paid 3 (at most three meals a day)
// and the day's virtue, a meal taken back on its own day.
import { describe, expect, it } from "vitest";
import { Store } from "../src/db.js";
import { cooked, keepRecipe, readRecipePage, recipesView, removeRecipe, uncooked, type Recipe } from "../src/recipes.js";
import { DAY_VIRTUE } from "../src/practice.js";

const day = (d: number, h = 12) => new Date(2026, 10, d, h);
function fresh(at = day(18).getTime()) {
  let t = at;
  return { store: new Store(":memory:", { now: () => t }), set: (d: Date) => { t = d.getTime(); } };
}
const kept = (r: unknown) => { if (typeof r === "string") throw new Error(r); return (r as { recipe: Recipe }).recipe; };

describe("C-433: RECIPES", () => {
  it("keeps a recipe typed in, a line an ingredient and a line a step, and refuses one with no name", () => {
    const { store } = fresh();
    expect(keepRecipe(store, { title: " " })).toMatch(/name/);
    const r = kept(keepRecipe(store, { title: "Toast", ingredients: "bread\n butter \n\n", steps: ["Toast it", "Butter it"], minutes: 5, source: "javascript:x" }));
    expect(r).toMatchObject({ title: "Toast", ingredients: ["bread", "butter"], steps: ["Toast it", "Butter it"], minutes: 5, source: "", cooked: [] });
    expect(kept(keepRecipe(store, { id: r.id, title: "Hot toast", ingredients: "bread" })).title).toBe("Hot toast");
    removeRecipe(store, r.id);
    expect(recipesView(store).recipes).toEqual([]);
  });
  it("COOKED pays 3 and the day's virtue, at most three meals a day, and a meal is taken back on its own day only", () => {
    const { store, set } = fresh(day(18, 8).getTime());
    const r = kept(keepRecipe(store, { title: "Soup", ingredients: "leeks", steps: "boil" }));
    for (let i = 0; i < 4; i++) cooked(store, r.id, day(18, 9 + i));
    expect(store.life.arete(day(18, 20)).today).toBe(9 + DAY_VIRTUE);     // the fourth meal is kept at nothing
    const meals = recipesView(store).recipes[0].cooked;
    expect(meals).toHaveLength(4);
    expect(uncooked(store, r.id, meals[0].id, day(18, 20))).not.toBeTypeOf("string");
    expect(recipesView(store).recipes[0].cooked).toHaveLength(3);
    set(day(19));
    expect(uncooked(store, r.id, meals[1].id, day(19))).toMatch(/own day/);
  });
  it("reads a page's schema.org Recipe, in a @graph, with HowToSteps and HowToSections", () => {
    const ld = { "@context": "https://schema.org", "@graph": [{ "@type": "WebPage", name: "x" }, {
      "@type": ["Recipe"], name: "Leek &amp; potato soup", recipeYield: ["4", "4 bowls"], totalTime: "PT1H20M",
      recipeIngredient: ["2 leeks", "3 <b>potatoes</b>"],
      recipeInstructions: [{ "@type": "HowToSection", name: "Soup", itemListElement: [{ "@type": "HowToStep", text: "Chop." }, { "@type": "HowToStep", text: "Boil." }] },
                           "Blend."] }] };
    const html = `<html><script type="application/ld+json">{ broken</script><script type='application/ld+json'>${JSON.stringify(ld)}</script></html>`;
    expect(readRecipePage(html, "https://example.org/soup")).toEqual({ title: "Leek & potato soup", ingredients: ["2 leeks", "3 potatoes"],
      steps: ["Chop.", "Boil.", "Blend."], serves: "4", minutes: 80, source: "https://example.org/soup" });
    expect(readRecipePage("<html>no recipe</html>", "https://example.org")).toBeNull();
  });
});
