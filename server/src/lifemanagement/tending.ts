// C-290: this file runs on the phone too (C-111) -- the app imports it, directly or through another file -- so keep it free of Node-only APIs (node:*, fs).
// C-357 (3), THE BODY's centres (the user's pick, 2026-11-12): once the save holds THE SUBTLE LAYER, TODAY offers the day's
// centre's tending -- the book's own words, from its pages LOWER, HEART and UPPER ("To tend it: ...") -- as the day's one
// small act. Tended by a touch, or by what the companion already sees: a walk on the root's day (Sunday: "walk, dance,
// wash"), a dream kept on the third eye's (Friday: "watch your dreams"). Kept, a line a day, and drawn as the week's climb,
// root to crown (CENTRES: "So they climb."; THE WEEK: "The Week Is a Climb"). Never a colour for a centre (the book's
// rule 3): the climb is drawn in the book's one purple. Every word DRAFT. No node: imports.
import type { Store } from "../shared/store.js";
import { hlcIso, Praxis, type Form } from "@daemons/praxis";
import { dayVirtue, ensureSpace, localDate } from "./practice.js";
import { dreamsOf } from "../dreams.js";
import subtleJson from "../../data/subtle.json" with { type: "json" };
import weekJson from "../../data/week.json" with { type: "json" };

type Para = { text: string };
type Entry = { short: string; paragraphs: Para[] };
const ENTRIES = (subtleJson as unknown as { sections: { entries: Entry[] }[] }).sections.flatMap((s) => s.entries);
export const CENTRES = weekJson.days.map((d) => d.chakra);            // Sunday the root ... Saturday the crown

// the centre's own paragraph ("The throat holds ... To tend it: sing, and say your goals aloud.") and its page
export function tendingOf(centre: string): { page: string; tending: string } | null {
  const opens = `The ${centre.toLowerCase()} holds`;
  for (const e of ENTRIES)
    for (const p of e.paragraphs)
      if (p.text.startsWith(opens)) {
        const m = /To tend it: (.+)$/.exec(p.text);
        if (m) return { page: e.short, tending: m[1] };
      }
  return null;
}

export type Tended = { date: string; centre: string; at: string; by: "you" | "walk" | "dream" };
const KEY = "subtle.tended", WALKED = 1000;                          // a walk: a thousand steps or more that day

// C-432 (PRAXIS 5): a touch's tending is an item in the TENDING space, a day each, paid 1 ARETE (the day's centre tended,
// PROJECTS.md 6) and the day's virtue if it is the day's first finish. What `subtle.tended` held is read in once, each at
// its own time, and left as it was. A walk's or a dream's tending is not kept: it is seen, each time it is asked.
const DONE_ = { name: "done", phase: "done" as const }, OPEN_ = { name: "open", phase: "open" as const };
export const TENDING: Form = {
  name: "tending", version: 1,
  kinds: { tended: { title: "Tended", prefix: "TENDED", states: [OPEN_, DONE_],
                     fields: { date: { type: "text" }, centre: { type: "text" }, by: { type: "text" } } } },
  views: [{ name: "week" }],
  rules: [{ kind: "tended", arete: 1, cap: 1, daemon: [] }],
};
const ITEMS = new WeakMap<Store, string>();
function tendingSpace(store: Store): string {
  const had = ITEMS.get(store);
  if (had) return had;
  const px = store.life.px;
  const old = (() => { try { const l = JSON.parse(store.getSetting(KEY) ?? "[]"); return Array.isArray(l) ? (l as Tended[]) : []; } catch { return []; } })();
  const space = ensureSpace(px, TENDING, { title: "Tending", prefix: "TEND" });
  const held = new Set(px.items(space, { kind: "tended" }).map((it) => String(it.fields.date)));
  const missing = old.filter((t) => t?.date && !held.has(t.date)).sort((a, b) => a.date.localeCompare(b.date));
  if (missing.length) {
    let at = store.now();
    const then = new Praxis(store.db, { now: () => at });
    then.transaction(() => {
      for (const t of missing) {
        at = Math.min(store.now(), Date.parse(t.at) || store.now());
        const id = then.make(space, "tended", { title: t.centre, date: t.date, centre: t.centre, by: t.by });
        then.state(id, "done", { pay: 1, reason: "tended" });
      }
    });
    store.life.reclock();                       // the store's clock past what was read in
  }
  ITEMS.set(store, space);
  return space;
}
export function tendedOf(store: Store): Tended[] {
  const space = tendingSpace(store), px = store.life.px;
  return px.items(space, { kind: "tended", archived: false })
    .map((it) => ({ date: String(it.fields.date), centre: String(it.fields.centre), by: String(it.fields.by) as Tended["by"],
                    at: hlcIso(px.writes(it.id, "state").find((w) => w.won)?.hlc ?? "") }))
    .sort((a, b) => b.date.localeCompare(a.date));
}
const centreOn = (d: Date) => weekJson.days[d.getDay()].chakra;

// what the companion saw that tends the day's centre by itself: the root's walk, the third eye's dream
function seen(store: Store, date: string, centre: string): Tended["by"] | null {
  if (centre === "Root" && Number(store.getSetting(`walk.${date}`) ?? 0) >= WALKED) return "walk";
  if (centre === "Third Eye" && dreamsOf(store).some((d) => localDate(new Date(d.to)) === date)) return "dream";
  return null;
}
function tendedOn(store: Store, date: string, centre: string): Pick<Tended, "at" | "by"> | null {
  const k = tendedOf(store).find((t) => t.date === date);
  if (k) return { at: k.at, by: k.by };
  const by = seen(store, date, centre);
  return by ? { at: "", by } : null;
}

// tended by a touch: once a day -- an item, paid its ARETE, and the day's virtue if nothing else has been finished today
export function tend(store: Store, now = new Date()): Tended {
  const date = localDate(now), had = tendedOf(store).find((t) => t.date === date);
  if (had) return had;
  const space = tendingSpace(store), px = store.life.px, centre = centreOn(now);
  px.transaction(() => {
    const id = px.make(space, "tended", { title: centre, date, centre, by: "you" });
    px.state(id, "done", { pay: 1, reason: "tended" });
    dayVirtue(px, id, now);
  });
  return tendedOf(store).find((t) => t.date === date)!;
}

// TODAY's card: the day's centre, its tending, whether it is tended, and the week's climb so far (Sunday first)
export function tendingView(store: Store, now = new Date()) {
  const date = localDate(now), centre = centreOn(now), t = tendingOf(centre);
  const climb = weekJson.days.map((d, i) => {
    const on = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay() + i);
    const when = localDate(on), ahead = i > now.getDay();
    return { day: d.day, centre: d.chakra, today: i === now.getDay(), ahead, tended: !ahead && !!tendedOn(store, when, d.chakra) };
  });
  return { date, day: weekJson.days[now.getDay()].day, centre, page: t?.page ?? null, tending: t?.tending ?? null,
           done: tendedOn(store, date, centre), climb };
}
