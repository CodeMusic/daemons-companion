// C-290: this file runs on the phone too (C-111) -- the app imports it, directly or through another file -- so keep it free of Node-only APIs (node:*, fs).
// C-469: WORKING MEMORY, the companion's daemon's own (the user, 2026-11-22: "there should be a project which represents
// the working memory of daemon"; PROJECTS.md 8). What the daemon has in mind NOW, kept in a PRAXIS space of the form
// daemons-praxis carries (WORKING_MEMORY): about seven things, each ABOUT one thing and rewritten when it changes, the
// least rehearsed let go when a new one comes. One space for each daemon carried, by its personality, written by the
// daemon as the actor. Three things write it, from the day:
//
//   the goal     the next open step toward the goal in hand ("goal"), let go once there is none
//   noticed      what moved it most today, and how it felt about it ("noticed")
//   a talk       an open thread in what the person said to it -- a plan, a promise, something left for later ("talk:...")
//
// The night (memory.ts, api.ts's rememberDay) gives what it holds to the day's material, so YESTERDAY and KEPT are made
// from it, and then lets it all go. MIND: no model is called here; an open thread is found by its words. Every word DRAFT.
import { hold, inMind, letGo, WORKING_MEMORY, type Praxis } from "@daemons/praxis";
import type { Goal } from "../shared/store.js";

export type Held = { id: string; words: string; about: string; from: string | null; at: string };

/** where a daemon's space is remembered (its id), by the daemon's personality */
export const spaceKey = (daemon: number) => `mind.working.${daemon >>> 0}`;

/** words that leave a thread open: a plan, a promise, something put off. A pattern, not a model (DRAFT) */
export const OPEN_THREAD = /\b(i'?ll|i will|i'?m going to|i am going to|i'?m gonna|i need to|i have to|i must|i should|i want to|remind me|tomorrow|tonight|later today|next week|this weekend)\b/i;
const MOST = 140;

/** a talk's open thread from what the person said, or null: the words held, and what they are about (their first
 *  words, so saying it again rewrites it rather than holding it twice) */
export function threadOf(said: string): { about: string; words: string } | null {
  const s = said.replace(/\s+/g, " ").trim();
  if (s.length < 6 || !OPEN_THREAD.test(s)) return null;
  const key = s.toLowerCase().replace(/[^a-z0-9' ]/g, "").split(" ").filter(Boolean).slice(0, 6).join(" ");
  return { about: `talk:${key}`, words: `you said: "${s.length > MOST ? s.slice(0, MOST - 1) + "…" : s}"` };   // DRAFT
}

/** the goal's next open step, as held */
export function stepOf(goal: Goal | null): string | null {
  if (!goal || goal.done) return null;
  for (const sub of goal.subitems) for (const st of sub.steps) if (!st.done) return `the next step toward "${goal.title}": ${st.text}`;   // DRAFT
  return `the goal in hand: "${goal.title}"`;                                                                                         // DRAFT
}

/** what moved it most today, as held (mind.ts's cause: "it ate", and the feeling's name) */
export const noticedOf = (cause: { said: string; name: string } | null) =>
  cause ? `what moved it most today: ${cause.said}, and it felt ${cause.name}` : null;                                               // DRAFT

const ACTOR = "daemon";

export class WorkingMemory {
  constructor(private readonly px: Praxis, private readonly get: (k: string) => string | null,
              private readonly put: (k: string, v: string) => void, private readonly daemon: number,
              private readonly now: () => number = Date.now) {}

  /** the daemon's space, made the first time it holds anything */
  private space(make: boolean): string | null {
    const had = this.get(spaceKey(this.daemon));
    if (had && this.px.space(had)) return had;
    if (!make) return null;
    const id = this.px.makeSpace({ title: "Working memory", prefix: "HELD", form: WORKING_MEMORY, reach: "home", actor: ACTOR });
    this.put(spaceKey(this.daemon), id);
    return id;
  }

  /** what it has in mind now, the most lately rehearsed first */
  held(): Held[] {
    const s = this.space(false);
    return s ? inMind(this.px, s).map((it) => ({ id: it.id, words: it.title, about: String(it.fields.about ?? ""),
      from: typeof it.fields.from === "string" ? it.fields.from : null, at: String(it.fields.rehearsed ?? it.made) })) : [];
  }

  /** a thing held: rewritten if it is held already with other words, rehearsed if `again` (said again), else left as
   *  it is -- so the day's refresh does not keep its own things in mind for ever */
  keep(about: string, words: string, from: string, again = false) {
    const had = this.held().find((h) => h.about === about);
    if (had && had.words === words && !again) return;
    hold(this.px, this.space(true)!, words, { about, from, at: this.now(), actor: ACTOR });
  }

  /** one thing let go, by what it is about */
  drop(about: string) {
    const s = this.space(false), had = this.held().find((h) => h.about === about);
    if (s && had) letGo(this.px, s, had.id, { actor: ACTOR });
  }

  /** the day's own things, read again: the goal's step and what moved it */
  fromDay(o: { goal: Goal | null; cause: { said: string; name: string } | null }) {
    const step = stepOf(o.goal), noticed = noticedOf(o.cause);
    if (step) this.keep("goal", step, "goal"); else this.drop("goal");
    if (noticed) this.keep("noticed", noticed, "day");
  }

  /** what the person said in a talk: held if it leaves a thread open (rehearsed if said again) */
  fromTalk(said: string) {
    const t = threadOf(said);
    if (t) this.keep(t.about, t.words, "talk", true);
  }

  /** let go: the night, once its memory is made -- the things it was given (`ids`), so one held while the night wrote
   *  stays for tomorrow's; or, without ids, everything. How many were */
  clear(ids?: string[]): number {
    const s = this.space(false);
    if (!s) return 0;
    if (!ids) return letGo(this.px, s, undefined, { actor: ACTOR });
    return ids.reduce((n, id) => n + letGo(this.px, s, id, { actor: ACTOR }), 0);
  }
}
