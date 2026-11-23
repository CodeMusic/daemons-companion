// C-433 (PRAXIS 6): FORMS YOU MAKE YOURSELF -- kinds, fields and ARETE; spaces made from them; items kept, paid; a form
// changed taken by its spaces; one shared to THE COMMONS (its form.json alone) and taken in as a copy.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Store } from "../src/shared/db.js";
import { formToShare, itemDone, itemState, keepItem, makeSpace, mineView, saveForm, spaceView, takeForm, type MineForm } from "../src/lifemanagement/myforms.js";
import { CommonsCreations } from "../src/commons/commonscreations.js";
import { DAY_VIRTUE } from "../src/lifemanagement/practice.js";

const day = (d: number, h = 12) => new Date(2026, 10, d, h);
const fresh = (t = day(18, 9).getTime()) => new Store(":memory:", { now: () => t });
const GARDEN = { title: "Garden", about: "what grows", kinds: [
  { title: "Plant", fields: [{ title: "Planted", type: "date" }, { title: "Where", type: "choice", choices: "bed, pot, window" }], arete: 0, cap: 0 },
  { title: "Watering", fields: [{ title: "Litres", type: "number" }, { title: "How it looked", type: "rating" }], arete: 2, cap: 6 }] };
const kept = (r: unknown) => { if (typeof r === "string") throw new Error(r); return r as MineForm; };

describe("C-433: FORMS YOU MAKE YOURSELF", () => {
  it("keeps a form of kinds and typed fields, and refuses one with no kind, no name, or a choice without choices", () => {
    const store = fresh();
    expect(saveForm(store, { title: "x", kinds: [] })).toMatch(/at least one kind/);
    expect(saveForm(store, { title: "", kinds: GARDEN.kinds })).toMatch(/name/);
    expect(saveForm(store, { title: "x", kinds: [{ title: "A", fields: [{ title: "B", type: "choice" }] }] })).toMatch(/choices/);
    const f = kept(saveForm(store, GARDEN));
    expect(f.kinds.map((k) => [k.key, k.title, k.fields.map((x) => [x.key, x.type]), k.arete, k.cap])).toEqual([
      ["k_plant", "Plant", [["f_planted", "date"], ["f_where", "choice"]], 0, 0],
      ["k_watering", "Watering", [["f_litres", "number"], ["f_how_it_looked", "rating"]], 2, 6]]);
    expect(mineView(store).forms.map((x) => x.title)).toEqual(["Garden"]);
  });
  it("makes a space from it; items are checked by their fields, paid by their kind under its cap, the day's virtue once", () => {
    const store = fresh();
    const f = kept(saveForm(store, GARDEN));
    makeSpace(store, { form: f.id, title: "The balcony" });
    const space = mineView(store).spaces[0];
    expect(space).toMatchObject({ title: "The balcony", formTitle: "Garden", open: 0 });
    expect(keepItem(store, { space: space.id, kind: "k_watering", title: "Tomatoes", fields: { f_how_it_looked: 7 } })).toMatch(/0 to 5/);
    expect(keepItem(store, { space: space.id, kind: "k_plant", title: "Basil", fields: { f_where: "roof" } })).toMatch(/one of/);
    for (let i = 0; i < 4; i++) keepItem(store, { space: space.id, kind: "k_watering", title: `Water ${i}`, fields: { f_litres: 1.5, f_how_it_looked: 4 } });
    const items = spaceView(store, space.id)!.items;
    expect(items[0].fields).toMatchObject({ f_litres: 1.5, f_how_it_looked: 4 });
    for (const it of items) itemDone(store, it.id, true, day(18, 10));
    expect(store.life.arete(day(18, 20)).today).toBe(6 + DAY_VIRTUE);         // 2 each, at most 6 a day
    expect(spaceView(store, space.id)!.items.every((x) => x.done)).toBe(true);
  });
  it("a changed form is a new version, and every space made from it takes it", () => {
    const store = fresh();
    const f = kept(saveForm(store, GARDEN));
    makeSpace(store, { form: f.id });
    const g = kept(saveForm(store, { id: f.id, title: "Garden", kinds: [...f.kinds, { title: "Harvest", fields: [{ title: "Grams", type: "number" }], arete: 3, cap: 9 }] }));
    expect(g.version).toBe(2);
    const sp = spaceView(store, mineView(store).spaces[0].id)!;
    expect(sp.kinds.map((k) => k.title)).toEqual(["Plant", "Watering", "Harvest"]);
    expect(keepItem(store, { space: sp.id, kind: "k_harvest", title: "Beans", fields: { f_grams: 200 } })).not.toBeTypeOf("string");
  });
  it("shares the form's shape alone to THE COMMONS, and a friend takes it in as a copy of their own", () => {
    const store = fresh();
    const f = kept(saveForm(store, GARDEN));
    makeSpace(store, { form: f.id });
    const shared = formToShare(store, f.id)!;
    expect(shared.form).toEqual({ title: "Garden", about: "what grows", kinds: f.kinds });
    const dir = mkdtempSync(join(tmpdir(), "commons-forms-"));
    try {
      const c = new CommonsCreations(dir);
      const r = c.share({ id: "h1", name: "ROVERBYTE HOME" }, { uid: `form:${f.id}@ROVERBYTE HOME`, kind: "form", id: f.id, home: "ROVERBYTE HOME",
        title: f.title, about: f.about, made: "", state: "ready", daemon: { nickname: "", species: 0 }, by: null, cover: null, files: {}, meta: {} },
        { "form.json": Buffer.from(JSON.stringify(shared.form)).toString("base64") });
      expect("shared" in r && r.shared.files).toEqual({ "form.json": "/commons/creations/1/form.json" });
      expect(c.file("1", "form.json")?.type).toBe("application/json");
    } finally { rmSync(dir, { recursive: true, force: true }); }
    const friend = fresh();
    const t = kept(takeForm(friend, shared.form, "ROVERBYTE HOME"));
    expect(t).toMatchObject({ title: "Garden", version: 1, from: "ROVERBYTE HOME" });
    expect(mineView(friend).spaces).toEqual([]);                                // the form alone: no items, no spaces
  });
});

describe("C-476: STATES OF YOUR OWN (the user, 2026-11-22: a BUGS space with its own steps up to done)", () => {
  const BUGS = { title: "Bugs", kinds: [{ title: "Bug", fields: [], arete: 3, cap: 30,
    states: [{ title: "Found", phase: "open" }, { title: "Seen again", phase: "open" }, { title: "Fixing", phase: "doing" },
             { title: "Fixed", phase: "done" }, { title: "Won't fix", phase: "aside" }] }] };
  it("keeps a kind's own states, and refuses too few, one starting done, or none that counts as done", () => {
    const store = fresh();
    expect(saveForm(store, { title: "x", kinds: [{ title: "A", states: [{ title: "Only", phase: "open" }] }] })).toMatch(/at least two/);
    expect(saveForm(store, { title: "x", kinds: [{ title: "A", states: [{ title: "Done", phase: "done" }, { title: "B", phase: "open" }] }] })).toMatch(/cannot start done/);
    expect(saveForm(store, { title: "x", kinds: [{ title: "A", states: [{ title: "B", phase: "open" }, { title: "C", phase: "aside" }] }] })).toMatch(/counts as done/);
    const f = kept(saveForm(store, BUGS));
    expect(f.kinds[0].states!.map((x) => [x.key, x.phase])).toEqual([["s_found", "open"], ["s_seen_again", "open"], ["s_fixing", "doing"], ["s_fixed", "done"], ["s_won_t_fix", "aside"]]);
    expect(kept(saveForm(store, GARDEN)).kinds[0].states).toBeUndefined();               // a kind naming none: open, then done
  });
  it("an item starts in the first, moves through them, is paid on reaching done once, and taken back on leaving it", () => {
    const store = fresh();
    makeSpace(store, { form: kept(saveForm(store, BUGS)).id, title: "Bugs" });
    const sp = mineView(store).spaces[0];
    keepItem(store, { space: sp.id, kind: "k_bug", title: "The watch skips a song" });
    let v = spaceView(store, sp.id)!, it = v.items[0];
    expect(v.kinds[0].states.map((x) => x.title)).toEqual(["Found", "Seen again", "Fixing", "Fixed", "Won't fix"]);
    expect([it.state, it.phase, it.done]).toEqual(["s_found", "open", false]);
    expect(itemState(store, it.id, "s_nope")).toMatch(/no such state/);
    itemState(store, it.id, "s_fixing");
    const arete = () => store.life.px.ledger(sp.id).filter((e) => e.op === "award" && !e.back && e.key.startsWith("finish:")).reduce((n, e) => n + e.points, 0);
    expect(arete()).toBe(0);
    v = itemState(store, it.id, "s_fixed") as any; it = v.items[0];
    expect([it.state, it.done]).toEqual(["s_fixed", true]);
    expect(arete()).toBe(3);
    itemState(store, it.id, "s_seen_again");
    expect(arete()).toBe(0);
    expect(mineView(store).spaces[0]).toMatchObject({ open: 1, done: 0 });
    itemDone(store, it.id, true);                                                         // the checkbox: the first done state
    expect(spaceView(store, sp.id)!.items[0].state).toBe("s_fixed");
  });
  it("a new version taking out a state moves its items to the first of the same phase, else the first", () => {
    const store = fresh();
    const f = kept(saveForm(store, BUGS));
    makeSpace(store, { form: f.id, title: "Bugs" });
    const sp = mineView(store).spaces[0];
    keepItem(store, { space: sp.id, kind: "k_bug", title: "A" }); keepItem(store, { space: sp.id, kind: "k_bug", title: "B" });
    const [a, b] = spaceView(store, sp.id)!.items.sort((x, y) => x.title.localeCompare(y.title));
    itemState(store, a.id, "s_seen_again"); itemState(store, b.id, "s_won_t_fix");
    kept(saveForm(store, { id: f.id, title: "Bugs", kinds: [{ key: "k_bug", title: "Bug", fields: [], arete: 3, cap: 30,
      states: [{ key: "s_found", title: "Found", phase: "open" }, { key: "s_fixed", title: "Fixed", phase: "done" }] }] }));
    const after = Object.fromEntries(spaceView(store, sp.id)!.items.map((x) => [x.title, x.state]));
    expect(after).toEqual({ A: "s_found", B: "s_found" });
  });
});
