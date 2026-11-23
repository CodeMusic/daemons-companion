// C-433 (PRAXIS 6): THE REWARD SHELF -- rewards stocked with their prices, SPENT at once, taken back the same day only.
import { describe, expect, it } from "vitest";
import { Store } from "../src/shared/db.js";
import { shelfView, spend, stock, unspend, editReward, removeReward, type Reward } from "../src/lifemanagement/rewards.js";

const day = (d: number, h = 12) => new Date(2026, 10, d, h);
function fresh(at = day(18).getTime()) {
  let t = at;
  const store = new Store(":memory:", { now: () => t });
  return { store, set: (d: Date) => { t = d.getTime(); } };
}
// ARETE to spend: a goal's steps finished (1 each, and the day's virtue 2)
function earn(store: Store, steps: number) {
  const g = store.addGoal("Earn", { subitems: [{ title: "", steps: Array.from({ length: steps }, (_, i) => `s${i}`) }] });
  for (const s of g.subitems[0].steps) store.completeStep(s.id);
}
const shelf = (r: unknown) => { if (typeof r === "string") throw new Error(r); return r as ReturnType<typeof shelfView>; };
const named = (v: ReturnType<typeof shelfView>, t: string) => v.rewards.find((x) => x.title === t) as Reward;

describe("C-433: THE REWARD SHELF", () => {
  it("is stocked with a name and a whole price, and refuses neither", () => {
    const { store } = fresh();
    expect(stock(store, { title: "", price: 5 })).toMatch(/name/);
    expect(stock(store, { title: "Coffee out", price: 0 })).toMatch(/price/);
    expect(stock(store, { title: "Coffee out", price: 2.5 })).toMatch(/price/);
    const v = shelf(stock(store, { title: "Coffee out", price: 8, times: "any" }));
    expect(named(v, "Coffee out")).toMatchObject({ price: 8, times: "any", taken: false, spends: [] });
    expect(named(shelf(editReward(store, { id: named(v, "Coffee out").id, price: 9 })), "Coffee out").price).toBe(9);
  });
  it("spends at once, never more than is held; a reward for once is taken", () => {
    const { store } = fresh();
    earn(store, 8);                                                 // 8 steps + the day's virtue 2 + the goal's 20 = 30
    const held = store.life.arete().held;
    shelf(stock(store, { title: "An episode", price: 10, times: "any" }));
    const v = shelf(stock(store, { title: "A day off", price: 25, times: "once" }));
    const ep = named(v, "An episode").id, off = named(v, "A day off").id;
    const r = spend(store, ep);
    expect(r).toMatchObject({ spent: { title: "An episode", price: 10 } });
    expect(store.life.arete().held).toBe(held - 10);
    expect(spend(store, off)).toMatch(/more than you hold/);         // 20 left
    spend(store, ep);
    expect(named(shelfView(store), "An episode").spends).toHaveLength(2);
    expect(store.life.arete().held).toBe(held - 20);
  });
  it("a reward for once is taken, and not spent twice", () => {
    const { store } = fresh();
    earn(store, 3);
    const v = shelf(stock(store, { title: "Cake", price: 5, times: "once" }));
    const id = named(v, "Cake").id;
    spend(store, id);
    expect(named(shelfView(store), "Cake").taken).toBe(true);
    expect(spend(store, id)).toMatch(/already taken/);
  });
  it("a spend is taken back on its own day only, and a reward taken off the shelf keeps its spends in the ledger", () => {
    const { store, set } = fresh();
    earn(store, 5);
    const held = store.life.arete().held;
    const id = named(shelf(stock(store, { title: "Film", price: 4, times: "once" })), "Film").id;
    spend(store, id);
    const key = named(shelfView(store), "Film").spends[0].key;
    unspend(store, id, key);
    expect(store.life.arete().held).toBe(held);
    expect(named(shelfView(store), "Film")).toMatchObject({ taken: false, spends: [] });
    spend(store, id);
    set(day(19));
    const k2 = named(shelfView(store), "Film").spends[0].key;
    expect(unspend(store, id, k2)).toMatch(/own day/);
    removeReward(store, id);
    expect(shelfView(store).rewards).toHaveLength(0);
    expect(store.life.px.ledger(undefined).filter((e) => e.op === "spend" && !e.back)).toHaveLength(1);
  });
});
