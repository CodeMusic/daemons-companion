// C-290: this file runs on the phone too (C-111) -- the app imports it, directly or through another file -- so keep it free of Node-only APIs (node:*, fs).
// C-433 (PRAXIS 6; the user, 2026-11-22, by multiple choice): RECIPES (docs/PROJECTS.md 8) -- a recipe typed in, or read
// from a recipe page's link (the hub fetches it, api.ts; most recipe sites publish their ingredients and steps as a
// schema.org Recipe in JSON-LD, which readRecipePage reads). COOKED logs a meal: 3 ARETE (at most three meals a day pay),
// the day's virtue if it is the day's first finish, and the daemon eats with you ("it would eat, if you are eating").
// A recipe is an item in the RECIPES space; each time it was cooked an item under it. Every word the app shows is DRAFT.
import type { Store } from "./store.js";
import type { Form, Item } from "@daemons/praxis";
import { dayVirtue, ensureSpace, midnight } from "./practice.js";

const TEXT = { type: "text" as const }, LONG = { type: "long" as const };
export const RECIPES: Form = {
  name: "recipes", version: 1,
  kinds: {
    recipe: { title: "Recipe", prefix: "RECIPE", states: [{ name: "kept", phase: "open" }],
              fields: { ingredients: LONG, steps: LONG, serves: TEXT, minutes: { type: "number" }, source: TEXT, note: LONG } },
    cooked: { title: "Cooked", prefix: "COOKED", states: [{ name: "cooking", phase: "doing" }, { name: "cooked", phase: "done" }],
              fields: { at: TEXT } },
  },
  views: [{ name: "cards" }, { name: "log" }],
  rules: [{ kind: "cooked", arete: 3, cap: 9, daemon: ["together"] }],
};
export const MOST = { title: 80, line: 300, lines: 80, note: 2000 };
export type Recipe = { id: number; title: string; ingredients: string[]; steps: string[]; serves: string; minutes: number | null;
                       source: string; note: string; cooked: { id: number; at: string }[] };

const SPACES = new WeakMap<Store, string>();
function space(store: Store): string {
  const had = SPACES.get(store);
  if (had) return had;
  const s = ensureSpace(store.life.px, RECIPES, { title: "Recipes", prefix: "COOK" });
  SPACES.set(store, s);
  return s;
}
const lines = (v: unknown) => String(v ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
function asRecipe(store: Store, it: Item): Recipe {
  const f = it.fields, px = store.life.px;
  const cooked = px.items(it.space, { parent: it.id, kind: "cooked", archived: false }).filter((c) => c.phase === "done")
    .map((c) => ({ id: c.number as number, at: String(c.fields.at ?? "") })).sort((a, b) => b.at.localeCompare(a.at));
  return { id: it.number as number, title: it.title, ingredients: lines(f.ingredients), steps: lines(f.steps), serves: String(f.serves ?? ""),
           minutes: typeof f.minutes === "number" && f.minutes > 0 ? f.minutes : null, source: String(f.source ?? ""), note: String(f.note ?? ""), cooked };
}
const recipeOf = (store: Store, id: number) => { const s = space(store), it = store.life.px.numbered(s, id, "recipe"); return it && !it.archived ? it : null; };

export function recipesView(store: Store) {
  const s = space(store);
  const recipes = store.life.px.items(s, { kind: "recipe", archived: false }).map((it) => asRecipe(store, it))
    .sort((a, b) => (b.cooked[0]?.at ?? "").localeCompare(a.cooked[0]?.at ?? "") || a.title.localeCompare(b.title));
  return { recipes };
}

// what a recipe is made of, checked: a title, and lines of ingredients and steps (as arrays, or one a line)
function checked(b: any): Record<string, unknown> | string {
  const title = String(b?.title ?? "").replace(/\s+/g, " ").trim().slice(0, MOST.title);
  if (!title) return "a recipe needs a name";                                             // DRAFT
  const list = (v: unknown) => (Array.isArray(v) ? v.map(String) : lines(v)).map((l) => l.replace(/\s+/g, " ").trim().slice(0, MOST.line))
    .filter(Boolean).slice(0, MOST.lines).join("\n");
  const minutes = Number(b?.minutes);
  const source = String(b?.source ?? "").trim();
  return { title, ingredients: list(b?.ingredients), steps: list(b?.steps), serves: String(b?.serves ?? "").trim().slice(0, 40),
           minutes: Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes) : 0,
           source: /^https?:\/\/\S+$/.test(source) ? source.slice(0, 400) : "", note: String(b?.note ?? "").trim().slice(0, MOST.note) };
}
// a new recipe, or (with id) one rewritten
export function keepRecipe(store: Store, b: any) {
  const r = checked(b);
  if (typeof r === "string") return r;
  const px = store.life.px, s = space(store);
  if (b?.id != null) {
    const it = recipeOf(store, Number(b.id));
    if (!it) return "no such recipe";                                                     // DRAFT
    px.transaction(() => { for (const [f, v] of Object.entries(r)) if ((f === "title" ? it.title : it.fields[f] ?? "") !== v) px.set(it.id, f, v); });
    return { ...recipesView(store), recipe: asRecipe(store, px.item(it.id)!) };
  }
  const id = px.make(s, "recipe", r as { title: string });
  return { ...recipesView(store), recipe: asRecipe(store, px.item(id)!) };
}
export function removeRecipe(store: Store, id: number) {
  const it = recipeOf(store, id);
  if (!it) return "no such recipe";
  store.life.px.archive(it.id);                                                             // archived, the log keeps it
  return recipesView(store);
}

// COOKED: a meal logged, paid under the day's cap, the day's virtue if it is the first finish; the caller feeds the daemon
export function cooked(store: Store, id: number, now = new Date(store.now())) {
  const it = recipeOf(store, id);
  if (!it) return "no such recipe";
  const px = store.life.px;
  px.transaction(() => {
    const c = px.make(it.space, "cooked", { title: it.title.slice(0, 400), at: now.toISOString() }, { parent: it.id });
    const paid = px.ledger(it.space, { since: midnight(now.getTime()) }).filter((e) => e.op === "award" && !e.back && e.kind === "cooked" && e.key.startsWith("finish:")).reduce((n, e) => n + e.points, 0);
    px.state(c, "cooked", { pay: Math.max(0, Math.min(3, 9 - paid)), reason: "finish" });
    dayVirtue(px, c, now);
  });
  return { ...recipesView(store), recipe: asRecipe(store, px.item(it.id)!) };
}
// a meal logged by mistake, taken back the same day: its ARETE and its virtue with it
export function uncooked(store: Store, id: number, meal: number, now = new Date(store.now())) {
  const it = recipeOf(store, id);
  if (!it) return "no such recipe";
  const px = store.life.px, c = px.numbered(it.space, meal, "cooked");
  if (!c || c.archived || c.parent !== it.id) return "no such meal";                        // DRAFT
  if (Date.parse(String(c.fields.at)) < midnight(now.getTime())) return "a meal can be taken back on its own day only";   // DRAFT
  px.transaction(() => {
    px.state(c.id, "cooking");
    for (const e of px.ledger(it.space).filter((x) => x.item === c.id && !x.back && x.key.startsWith("virtue:"))) px.takeBack(c.id, "award", e.key);
    px.archive(c.id);
  });
  return { ...recipesView(store), recipe: asRecipe(store, px.item(it.id)!) };
}

// ---- a recipe page read (the hub fetches it; this reads what it got) -----------------------------------------------
// schema.org's Recipe in a page's JSON-LD: name, recipeIngredient, recipeInstructions (text, HowToStep or HowToSection),
// recipeYield, totalTime (ISO 8601, "PT1H20M"). Null when the page has none.
const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, "\"").replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
function minutesOf(iso: unknown): number {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?/.exec(String(iso ?? ""));
  return m ? Number(m[1] ?? 0) * 1440 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) : 0;
}
function stepsOf(v: unknown): string[] {
  if (typeof v === "string") return v.split(/\n+/).map(decode).filter(Boolean);
  if (Array.isArray(v)) return v.flatMap(stepsOf);
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (o.itemListElement) return stepsOf(o.itemListElement);
    if (typeof o.text === "string") return [decode(o.text)];
    if (typeof o.name === "string") return [decode(o.name)];
  }
  return [];
}
function findRecipe(v: unknown): Record<string, unknown> | null {
  if (Array.isArray(v)) { for (const x of v) { const r = findRecipe(x); if (r) return r; } return null; }
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>, t = o["@type"];
  if (t === "Recipe" || (Array.isArray(t) && t.includes("Recipe"))) return o;
  return findRecipe(o["@graph"]) ?? null;
}
export function readRecipePage(html: string, url: string): { title: string; ingredients: string[]; steps: string[]; serves: string; minutes: number; source: string } | null {
  for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let data: unknown;
    try { data = JSON.parse(m[1].trim()); } catch { continue; }
    const r = findRecipe(data);
    if (!r) continue;
    const ingredients = (Array.isArray(r.recipeIngredient) ? r.recipeIngredient : []).map((x) => decode(String(x))).filter(Boolean);
    const yields = Array.isArray(r.recipeYield) ? r.recipeYield[0] : r.recipeYield;
    return { title: decode(String(r.name ?? "")).slice(0, MOST.title) || "A recipe", ingredients, steps: stepsOf(r.recipeInstructions),
             serves: decode(String(yields ?? "")).slice(0, 40), minutes: minutesOf(r.totalTime ?? r.cookTime), source: url };
  }
  return null;
}
