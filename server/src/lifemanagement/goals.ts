// C-290: this file runs on the phone too (C-111) -- the app imports it, directly or through another file -- so keep it free of Node-only APIs (node:*, fs).
// C-430: GOALS on PRAXIS (docs/PROJECTS.md 9). A goal, its milestones (and the unnamed group that holds its loose steps,
// as the old store kept them) and their steps are ITEMS in the person's LIFE space, and each keeps the number it always
// had as its handle -- LIFE-3, MILESTONE-4, STEP-17 -- so every route, every board and every queued tick that names a step
// by its number names the same one. The Store's goal calls (store.ts) answer from here, in the shapes they always had.
//
//   one open goal   TODAY's rule (the LIFE form's `today` view), kept by the route -- no longer the database's shape
//   40 characters   ENTRY_LIMIT is PRAXIS's SHORT: what an item shows on a device
//   ARETE           paid once per finish by the form's rules, each under a daily cap; a finish past the cap is kept in
//                   the ledger at nothing, so every finish can be read there. Undo takes it back; nothing is taken for a
//                   day missed
//   the daemon      what a finish gives it is the rule's `daemon` list, given by core.ts (doStep) with today's numbers:
//                   EXP_PER_STEP, the step's meal, training and mood, BOND.goal and the gift
//   THRIVE          the week's finishes, read from the ledger -- and, for the days before the move, from the log as it
//                   always was (today's values for today's history)
//   the old tables  goals, subitems and steps are read into events once, each at its own time, and left as they were
//   another LIFE    C-431: a phone that hosted alone, joining a hub, pushes its own LIFE; the hub JOINS it to its own
//                   (joinOthers), so there is one LIFE again -- the phone's goals numbered here, their ARETE counted here
import { hlcIso, parseHlc, Praxis, type Form, type Item, type StateDef } from "@daemons/praxis";
import type { Goal, Plan, Step, Store, SubItem } from "../shared/store.js";
import { dayVirtue } from "./practice.js";

/** what a finish gives the daemon (core.ts gives it): its time together (the log's "step": a meal, training, its mood),
 *  experience, the week's goals (C-207), the bond, the gift */
export type DaemonGets = "together" | "exp" | "goal" | "bond" | "gift";
/** a rule: ARETE for finishing an item of a kind, at most `cap` a day, and what the finish gives the daemon */
export interface Rule { kind: string; arete: number; cap: number; daemon: DaemonGets[] }
// DRAFT: the ARETE are PROJECTS.md 6's placeholders and the caps a first guess (OPEN, section 13); the daemon's are today's
export const RULES: Rule[] = [
  { kind: "step", arete: 1, cap: 20, daemon: ["together", "exp"] },
  { kind: "milestone", arete: 5, cap: 15, daemon: [] },
  { kind: "goal", arete: 20, cap: 60, daemon: ["goal", "bond", "gift"] },
];
export const ruleOf = (kind: string) => RULES.find((r) => r.kind === kind) ?? null;

/** TODAY (PROJECTS.md 4.1's view): one open goal at a time (C-46) */
export const TODAY = { name: "today", goals: 1 };

const OPEN: StateDef = { name: "open", phase: "open" }, DONE: StateDef = { name: "done", phase: "done" };
const WORDS = { text: { type: "long" as const, title: "the words as given, where they cannot be a title" } };
export const LIFE: Form = {
  name: "life",
  version: 1,
  kinds: {
    goal: { title: "Goal", states: [OPEN, DONE, { name: "aside", phase: "aside", title: "set aside" }], fields: WORDS },
    milestone: { title: "Milestone", prefix: "MILESTONE", states: [OPEN, DONE], fields: WORDS },
    loose: { title: "Loose steps", prefix: "MILESTONE", states: [OPEN, DONE] },   // shares the milestones' numbers, as before
    step: { title: "Step", prefix: "STEP", states: [OPEN, DONE], fields: WORDS },
  },
  views: [TODAY],
  rules: RULES,
};
const LOOSE = "loose steps";                    // the unnamed group's title (shown as "", as the old store showed it)
const TITLE_MOST = 400;                         // PRAXIS's longest title

/** an item's fields from words: the words as its title, or -- blank, or too long to be one -- a stand-in title and the
 *  words kept whole in `text` */
function named(words: unknown): { title: string; text?: string } {
  const w = typeof words === "string" ? words : String(words ?? "");
  if (w.trim() && w.length <= TITLE_MOST) return { title: w };
  let t = w.trim() ? w.slice(0, TITLE_MOST) : "-";
  if (/[\uD800-\uDBFF]$/.test(t)) t = t.slice(0, -1);
  return { title: t, text: w };
}
const wordsOf = (it: Item) => (typeof it.fields.text === "string" ? it.fields.text : it.title);
const isSub = (it: Item) => it.kind === "milestone" || it.kind === "loose";
const num = (it: Item) => it.number as number;    // the keeper is this copy, so every item is numbered as it is made
const byNumber = (a: Item, b: Item) => num(a) - num(b);
const time = (s: unknown) => { const t = typeof s === "string" ? Date.parse(s) : NaN; return Number.isFinite(t) ? t : null; };
const midnight = (ms: number) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
const finishes = (e: { op: string; back: boolean; key: string }) => e.op === "award" && !e.back && e.key.startsWith("finish:");

/** an item into done, paid by its kind's rule under the day's cap (the day `at` falls in) */
function finish(px: Praxis, life: string, it: Item, at: number) {
  const rule = ruleOf(it.kind);
  if (!rule) return px.state(it.id, "done");
  const paid = px.ledger(life, { since: midnight(at) }).filter((e) => finishes(e) && e.kind === rule.kind).reduce((n, e) => n + e.points, 0);
  px.state(it.id, "done", { pay: Math.max(0, Math.min(rule.arete, rule.cap - paid)), reason: "finish" });
}

/** when the old tables were read: the time, the last row of the daemon's log then, and the last row of each table */
type Moved = { at: string; log: number; goals: number; subitems: number; steps: number };
const MOVED = "goals.praxis";
type Row = Record<string, any>;

export class Goals {
  px: Praxis;
  readonly life: string;
  private readonly moved: Moved;

  constructor(private readonly store: Store) {
    new Praxis(store.db, { now: store.now });            // this copy's replica id, made at today's time
    this.moved = this.bringIn();
    this.px = new Praxis(store.db, { now: store.now });  // its clock past every event the old tables became
    this.life = lifeOf(this.px)!;
    if ((this.px.space(this.life)!.form?.version ?? 0) < LIFE.version) this.px.adopt(this.life, LIFE);
  }

  /** C-432: a clock past every event another copy of the engine wrote here (a space's old settings read in at their own
   *  times, as bringIn does): this one's next event is then ordered after them */
  reclock() { this.px = new Praxis(this.store.db, { now: this.store.now }); }

  // ---- the old tables, read once ------------------------------------------------------------------------------------

  /** every row of goals, subitems and steps the LIFE space does not hold yet, made into events at its own time: made
   *  when its goal was, done (and paid, under that day's cap) when it was done, set aside when it was. Rows already held
   *  are never read again, so it runs once; rows an older server added later are read the next time. Old finishes keep
   *  the ARETE they are paid here (the user, 2026-11-20, by multiple choice: "Keep them"). */
  private bringIn(): Moved {
    const store = this.store, db = store.db;
    const rows = (sql: string) => db.prepare(sql).all() as Row[];
    const most = (t: string) => Number((db.prepare(`SELECT MAX(id) AS n FROM ${t}`).get() as Row | undefined)?.n ?? 0);
    const top = { goals: most("goals"), subitems: most("subitems"), steps: most("steps") };
    let was: Moved | null = null;
    try { was = JSON.parse(store.getSetting(MOVED) ?? "null"); } catch { /* read again */ }
    const now = store.now();
    const moved: Moved = { ...(was ?? { at: new Date(now).toISOString(), log: store.lastInteractionId() }), ...top };
    if (was && lifeOf(new Praxis(db)) && top.goals <= was.goals && top.subitems <= was.subitems && top.steps <= was.steps) return was;

    let at = now;
    const px = new Praxis(db, { now: () => at });
    px.transaction(() => {
      const goals = rows("SELECT id, title, created, done FROM goals ORDER BY id");
      const subs = rows("SELECT id, goal, title, position, done FROM subitems ORDER BY goal, position, id");
      const steps = rows("SELECT id, subitem, text, position, done FROM steps ORDER BY subitem, position, id");
      const first = Math.min(now, ...goals.map((g) => time(g.created) ?? now));
      let life = lifeOf(px);
      if (!life) { at = first; life = px.makeSpace({ title: "Life", prefix: "LIFE", form: LIFE, reach: "home" }); }
      const space = life;
      // what the space holds already, by the number each kept
      const held = { goal: new Map<number, string>(), sub: new Map<number, string>(), step: new Map<number, string>() };
      for (const it of px.items(space)) (it.kind === "goal" ? held.goal : it.kind === "step" ? held.step : held.sub).set(num(it), it.id);
      const fresh = { goal: new Set(goals.filter((g) => !held.goal.has(g.id)).map((g) => g.id)),
                      sub: new Set(subs.filter((s) => !held.sub.has(s.id)).map((s) => s.id)),
                      step: new Set(steps.filter((t) => !held.step.has(t.id)).map((t) => t.id)) };
      const goalAt = new Map(goals.map((g) => [g.id as number, time(g.created) ?? first]));
      const subAt = new Map(subs.map((s) => [s.id as number, goalAt.get(s.goal) ?? first]));
      const ops: { t: number; order: number; run: () => void }[] = [];
      const made = (m: Map<number, string>, n: number) => px.item(m.get(n)!)!;
      const under = <T extends Row>(rows: T[], key: string) => {
        const m = new Map<number, T[]>();
        for (const r of rows) { const k = m.get(r[key]); if (k) k.push(r); else m.set(r[key], [r]); }
        return (id: number) => m.get(id) ?? [];
      };
      const subsOf = under(subs, "goal"), stepsOf = under(steps, "subitem");
      // made: each goal at its making, its milestones and steps with it, in their order (rows with no goal, at the first)
      const makeSub = (s: Row, parent: string | null) => {
        if (fresh.sub.has(s.id)) held.sub.set(s.id, px.make(space, s.title === "" ? "loose" : "milestone",
          s.title === "" ? { title: LOOSE } : named(s.title), { parent, number: s.id }));
        for (const t of stepsOf(s.id))
          if (fresh.step.has(t.id)) held.step.set(t.id, px.make(space, "step", named(t.text), { parent: held.sub.get(s.id)!, number: t.id }));
      };
      for (const g of goals) ops.push({ t: goalAt.get(g.id)!, order: 0, run: () => {
        if (fresh.goal.has(g.id)) held.goal.set(g.id, px.make(space, "goal", named(g.title), { number: g.id }));
        for (const s of subsOf(g.id)) makeSub(s, held.goal.get(g.id)!);
      } });
      ops.push({ t: first, order: 0, run: () => {
        for (const s of subs.filter((x) => !goalAt.has(x.goal))) makeSub(s, null);
        for (const t of steps.filter((x) => !subAt.has(x.subitem) && fresh.step.has(x.id)))
          held.step.set(t.id, px.make(space, "step", named(t.text), { number: t.id }));
      } });
      // done: a step, then its milestone, then its goal, each when it was -- and never before it was made
      const done = (raw: unknown, made_: number) => Math.max(made_, time(raw) ?? made_);
      for (const t of steps) if (fresh.step.has(t.id) && t.done)
        ops.push({ t: done(t.done, subAt.get(t.subitem) ?? first), order: 1, run: () => finish(px, space, made(held.step, t.id), at) });
      for (const s of subs) if (fresh.sub.has(s.id) && s.done)
        ops.push({ t: done(s.done, subAt.get(s.id)!), order: 2, run: () => finish(px, space, made(held.sub, s.id), at) });
      for (const g of goals) if (fresh.goal.has(g.id) && g.done) {
        const aside = /^set aside /.test(String(g.done));
        ops.push({ t: done(aside ? String(g.done).slice(10) : g.done, goalAt.get(g.id)!), order: 3,
                   run: () => (aside ? px.state(held.goal.get(g.id)!, "aside") : finish(px, space, made(held.goal, g.id), at)) });
      }
      ops.map((o, i) => ({ ...o, i })).sort((a, b) => a.t - b.t || a.order - b.order || a.i - b.i)
        .forEach((o) => { at = o.t; o.run(); });
      store.setSetting(MOVED, JSON.stringify(moved));
    });
    return moved;
  }

  // ---- reading, in the old shapes -----------------------------------------------------------------------------------

  private kids(id: string) { return this.px.items(this.life, { parent: id, archived: false }); }

  private find(n: number, kind: "goal" | "sub" | "step"): Item | null {
    if (!Number.isInteger(n)) return null;
    const it = this.px.numbered(this.life, n, kind === "sub" ? "milestone" : kind);
    if (!it || it.archived) return null;
    return (kind === "sub" ? isSub(it) : it.kind === kind) ? it : null;
  }

  /** a goal in the old shape; `kids` reads an item's children (from the database, or from one read of the whole space) */
  private view(g: Item, kids = (id: string) => this.kids(id)): Goal {
    const step = (t: Item): Step => ({ id: num(t), text: wordsOf(t), done: t.phase === "done" });
    const subitems = kids(g.id).filter(isSub).map((s): SubItem => ({ id: num(s), title: s.kind === "loose" ? "" : wordsOf(s),
      done: s.phase === "done", steps: kids(s.id).filter((t) => t.kind === "step").map(step) }));
    return { id: num(g), title: wordsOf(g), done: g.phase !== "open", subitems };   // set aside reads as done, as it did
  }

  private open(): Item[] { return this.px.items(this.life, { kind: "goal", phase: "open", archived: false }).sort(byNumber); }

  goal(id: number): Goal | null { const g = this.find(id, "goal"); return g ? this.view(g) : null; }
  goals(): Goal[] {
    const all = this.px.items(this.life, { archived: false }), under = new Map<string | null, Item[]>();
    for (const it of all) { const k = under.get(it.parent); if (k) k.push(it); else under.set(it.parent, [it]); }
    return all.filter((it) => it.kind === "goal").sort(byNumber).map((g) => this.view(g, (id) => under.get(id) ?? []));
  }
  openGoals(): Goal[] { return this.open().map((g) => this.view(g)); }
  currentGoal(): Goal | null { const g = this.open()[0]; return g ? this.view(g) : null; }

  /** TODAY's rule: is there room for another open goal */
  roomToday(): boolean {
    const today = (this.px.space(this.life)?.form?.views as { name?: string; goals?: number }[] | undefined)?.find((v) => v.name === TODAY.name);
    return this.open().length < (today?.goals ?? TODAY.goals);
  }

  // THE ONE THING (PLAN 2): the first open step of the first open sub-item of the oldest open goal, and where it sits in
  // its milestone (C-49); null when loose
  nextStep(): { goal: string; subitem: string; step: Step; milestone: { title: string; at: number; of: number } | null } | null {
    for (const g of this.open()) for (const s of this.kids(g.id)) {
      if (!isSub(s) || s.phase !== "open") continue;
      const steps = this.kids(s.id).filter((t) => t.kind === "step"), at = steps.findIndex((t) => t.phase === "open");
      if (at < 0) continue;
      const t = steps[at], loose = s.kind === "loose";
      return { goal: wordsOf(g), subitem: loose ? "" : wordsOf(s), step: { id: num(t), text: wordsOf(t), done: false },
               milestone: loose ? null : { title: wordsOf(s), at: at + 1, of: steps.length } };
    }
    return null;
  }

  /** the time an item's state now was written: when a done step was done */
  private doneAt(it: Item): string { return this.px.writes(it.id, "state").find((w) => w.won)?.hlc ?? ""; }

  // C-357 (4): when each of a goal's done steps was ticked (ISO times), for SLOW WRITES
  stepTimes(goal: number): string[] {
    const g = this.find(goal, "goal");
    if (!g) return [];
    return this.kids(g.id).filter(isSub).flatMap((s) => this.kids(s.id))
      .filter((t) => t.kind === "step" && t.phase === "done").map((t) => hlcIso(this.doneAt(t)));
  }

  /** C-253: the steps done in a span, each with its goal, and the goals finished in it (not those set aside) */
  doneBetween(from: Date, to: Date): { steps: { step: string; goal: string }[]; goals: { title: string }[] } {
    const steps: { at: number; step: string; goal: string }[] = [], goals: Item[] = [];
    for (const it of this.px.items(this.life, { phase: "done", archived: false })) {
      const at = parseHlc(this.doneAt(it))?.ms ?? 0;
      if (at < from.getTime() || at >= to.getTime()) continue;
      if (it.kind === "goal") goals.push(it);
      const s = it.kind === "step" && it.parent ? this.px.item(it.parent) : null, g = s?.parent ? this.px.item(s.parent) : null;
      if (g?.kind === "goal") steps.push({ at, step: wordsOf(it), goal: wordsOf(g) });
    }
    return { steps: steps.sort((a, b) => a.at - b.at).map(({ step, goal }) => ({ step, goal })),
             goals: goals.sort(byNumber).map((g) => ({ title: wordsOf(g) })) };
  }

  /** C-207's count for THRIVE: the goals (or steps) finished since a time -- from ARETE's ledger since the move, and
   *  from the daemon's log before it, as it was always counted */
  finishedSince(kind: "goal" | "step", since: Date): number {
    const cut = Date.parse(this.moved.at);
    const before = since.getTime() < cut ? this.store.kindSince(kind, since).filter((e) => e.id <= this.moved.log).length : 0;
    return before + this.px.ledger(this.life, { since: Math.max(since.getTime(), cut) }).filter((e) => finishes(e) && e.kind === kind).length;
  }

  /** C-455: the ARETE earned in a span (MENTIONS' numbers) -- awards not taken back, by when they were given */
  earnedBetween(from: Date, to: Date): number {
    const until = String(Math.max(0, Math.floor(to.getTime()))).padStart(18, "0");
    // C-432: every space's ARETE, LIFE's and the others'
    return this.px.ledger(undefined, { since: from.getTime() }).filter((e) => e.op === "award" && !e.back && e.hlc < until)
      .reduce((n, e) => n + e.points, 0);
  }
  /** ARETE: held now, earned today and this week, and the rules it is earned by */
  arete(now = new Date(this.store.now())) {
    // C-432: ARETE is the person's, earned in every space (LIFE, TENDING, the journals), so it is counted across them
    const earned = (since: number) => this.px.ledger(undefined, { since }).filter((e) => e.op === "award" && !e.back).reduce((n, e) => n + e.points, 0);
    return { held: this.px.arete(), today: earned(midnight(now.getTime())), week: earned(now.getTime() - 7 * 86400000), rules: RULES };
  }

  // ---- changing -----------------------------------------------------------------------------------------------------

  /** C-431: every other LIFE read on its own -- a phone's that hosted alone, pushed here when it paired -- joined to this
   *  one, when this copy keeps it (the hub), so there is one LIFE again and nothing is lost: each of its goals numbered
   *  here after this LIFE's own, each keeping the number it had there, and every ARETE it earned counted here. Returns
   *  the LIFEs it joined. */
  joinOthers(): string[] {
    if (this.px.space(this.life)?.keeper !== this.px.replica) return [];
    const others = this.px.spaces().filter((s) => s.form?.name === LIFE.name && !s.archived && s.home === s.id && s.id !== this.life);
    return this.px.transaction(() => others.map((s) => { this.px.join(s.id, this.life); return s.id; }));
  }

  addGoal(title: string, plan?: Plan): Goal {
    return this.px.transaction(() => {
      const g = this.px.make(this.life, "goal", named(title));
      for (const s of plan?.subitems ?? []) {
        const sub = this.px.make(this.life, s.title === "" ? "loose" : "milestone", s.title === "" ? { title: LOOSE } : named(s.title), { parent: g });
        for (const text of s.steps) this.px.make(this.life, "step", named(text), { parent: sub });
      }
      return this.view(this.px.item(g)!);
    });
  }

  /** a goal set aside for another (POST /api/goal with replace) */
  setAside(goal: number) {
    const g = this.find(goal, "goal");
    if (g?.phase === "open") this.px.state(g.id, "aside");
  }

  // Tick a step off; a sub-item whose steps are all done is done, and a goal whose sub-items are all done is done (each
  // paid by its rule). C-50: and say what that finished -- a milestone (a named sub-item), the whole goal.
  completeStep(id: number): { ok: boolean; fresh: boolean; milestone: string | null; goal: string | null } {
    return this.px.transaction(() => {
      const t = this.find(id, "step");
      if (!t) return { ok: false, fresh: false, milestone: null, goal: null };
      if (t.phase === "done") return { ok: true, fresh: false, milestone: null, goal: null };   // nothing new to celebrate
      const at = this.store.now();
      finish(this.px, this.life, t, at);
      dayVirtue(this.px, t.id, new Date(at));            // C-432: the day's first finish lives the day's virtue
      let milestone: string | null = null, goal: string | null = null;
      const s = t.parent ? this.px.item(t.parent) : null;
      if (s && isSub(s) && !this.kids(s.id).some((x) => x.kind === "step" && x.phase !== "done")) {
        if (s.phase !== "done") finish(this.px, this.life, s, at);
        if (s.kind === "milestone") milestone = wordsOf(s);
        const g = s.parent ? this.px.item(s.parent) : null;
        if (g?.kind === "goal" && !this.kids(g.id).some((x) => isSub(x) && x.phase !== "done")) {
          if (g.phase === "open") finish(this.px, this.life, g, at);
          goal = wordsOf(g);
        }
      }
      return { ok: true, fresh: true, milestone, goal };
    });
  }

  // C-49: undo a step ticked by accident -- it, its milestone and its goal are open again, their ARETE taken back
  undoStep(id: number): boolean {
    return this.px.transaction(() => {
      const t = this.find(id, "step");
      if (!t) return false;
      const s = t.parent ? this.px.item(t.parent) : null, g = s?.parent ? this.px.item(s.parent) : null;
      for (const it of [t, s, g]) if (it && it.phase !== "open") this.px.state(it.id, "open");
      // C-432: and the day's virtue, if this step was what lived it
      for (const e of this.px.ledger(undefined).filter((x) => x.item === t.id && x.op === "award" && !x.back && x.key.startsWith("virtue:")))
        this.px.takeBack(t.id, "award", e.key);
      return true;
    });
  }

  // C-46: a milestone is a named sub-item; a step added straight to the goal lives in an unnamed one (consecutive loose
  // steps share it), so a goal keeps its one shape
  addMilestone(goal: number, title: string): number {
    return this.px.transaction(() => {
      const g = this.find(goal, "goal");
      if (!g) throw new Error(`no goal ${goal}`);
      if (g.phase !== "open") this.px.state(g.id, "open");
      const id = this.px.make(this.life, title === "" ? "loose" : "milestone", title === "" ? { title: LOOSE } : named(title), { parent: g.id });
      return num(this.px.item(id)!);
    });
  }

  addStep(goal: number, text: string, milestone?: number): number | null {
    return this.px.transaction(() => {
      const g = this.find(goal, "goal");
      if (!g) return null;
      let sub: Item | null;
      if (milestone != null) {
        sub = this.find(milestone, "sub");
        if (!sub || sub.kind !== "milestone" || sub.parent !== g.id) return null;
      } else {
        const last = this.kids(g.id).filter(isSub).at(-1);
        sub = last?.kind === "loose" ? last : this.px.item(this.px.make(this.life, "loose", { title: LOOSE }, { parent: g.id }))!;
      }
      if (sub.phase !== "open") this.px.state(sub.id, "open");
      if (g.phase !== "open") this.px.state(g.id, "open");
      return num(this.px.item(this.px.make(this.life, "step", named(text), { parent: sub.id }))!);
    });
  }

  /** a step taken off its goal -- archived, never deleted (the log keeps it); an unnamed group left empty goes with it */
  removeStep(id: number) {
    this.px.transaction(() => {
      const t = this.find(id, "step");
      if (!t) return;
      this.px.archive(t.id);
      const s = t.parent ? this.px.item(t.parent) : null;
      if (s?.kind === "loose" && !this.kids(s.id).some((x) => x.kind === "step")) this.px.archive(s.id);
    });
  }

  removeMilestone(id: number) {
    this.px.transaction(() => {
      const s = this.find(id, "sub");
      if (!s) return;
      for (const t of this.kids(s.id)) this.px.archive(t.id);
      this.px.archive(s.id);
    });
  }
}

/** the LIFE space: the one this copy keeps, or else the earliest made from the LIFE form -- of those read on their own
 *  (C-431: one joined to another is read in that one) */
function lifeOf(px: Praxis): string | null {
  const lives = px.spaces().filter((s) => s.form?.name === LIFE.name && !s.archived && s.home === s.id);
  return (lives.find((s) => s.keeper === px.replica) ?? lives[0])?.id ?? null;
}
