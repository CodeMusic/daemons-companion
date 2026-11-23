// C-433 (PRAXIS 6): FORMS YOU MAKE YOURSELF -- kinds, fields and ARETE; spaces made from them; items kept, paid; a form
// changed taken by its spaces; one shared to THE COMMONS (its form.json alone) and taken in as a copy.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Store } from "../src/db.js";
import { formToShare, itemDone, keepItem, makeSpace, mineView, saveForm, spaceView, takeForm, type MineForm } from "../src/lifemanagement/myforms.js";
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
