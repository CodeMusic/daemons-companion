// C-290: this file runs on the phone too (C-111) -- the app imports it, directly or through another file -- so keep it free of Node-only APIs (node:*, fs).
// C-432 (PRAXIS 5): THE WEEK'S BALANCE (docs/PROJECTS.md 6; the user, 2026-11-22, by multiple choice). Each weekday has
// its virtue over its shadow (data/week.json). A virtue is LIVED when something the companion counts was done on its own
// day -- a step, a milestone or a goal finished, the centre tended, a journal entry, a dream written, a meeting's action done; its shadow is
// UNTENDED when its day passed with nothing. Lit, never scolded (T-418): nothing is taken for a day missed, and the words
// never say a virtue cures its shadow. Shown on TODAY under the day's centre, Sunday first, as the week's climb is.
//
// What counts is read from ARETE's ledger, in every space: LIFE, TENDING, MEETINGS, the journals and the dream journals
// (a finish past its day's cap is still there, at nothing). Every word the app shows is DRAFT.
import { parseHlc } from "@daemons/praxis";
import type { Store } from "./store.js";
import { localDate, WEEK } from "./practice.js";

export type Acts = { goals: number; tended: number; entries: number; dreams: number; actions: number };
export type BalanceDay = { day: string; date: string; virtue: string; shadow: string; today: boolean; ahead: boolean;
                           lived: boolean; acts: Acts };

const none = (): Acts => ({ goals: 0, tended: 0, entries: 0, dreams: 0, actions: 0 });
const KIND_ACT: Record<string, keyof Acts> = { step: "goals", milestone: "goals", goal: "goals", tended: "tended", entry: "entries", dream: "dreams", action: "actions" };

export function weekBalance(store: Store, now = new Date(store.now())) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());   // this Sunday, 00:00
  const acts = new Map<string, Acts>();
  const add = (ms: number, k: keyof Acts) => { const d = localDate(new Date(ms)); const a = acts.get(d) ?? none(); a[k]++; acts.set(d, a); };
  // every finish since Sunday, in every space (a finish past its day's cap is still in the ledger, at nothing)
  for (const e of store.life.px.ledger(undefined, { since: start.getTime() })) {
    const k = e.kind ? KIND_ACT[e.kind] : undefined;
    if (e.op !== "award" || e.back || !k || !e.key.startsWith("finish:")) continue;
    const ms = parseHlc(e.hlc)?.ms;
    if (ms !== undefined) add(ms, k);
  }
  const days: BalanceDay[] = WEEK.map((w, i) => {
    const on = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i), date = localDate(on);
    const a = acts.get(date) ?? none();
    return { day: w.day, date, virtue: w.virtue, shadow: w.shadow, today: i === now.getDay(), ahead: i > now.getDay(),
             lived: a.goals + a.tended + a.entries + a.dreams + a.actions > 0, acts: a };
  });
  const today = days[now.getDay()];
  const key = `virtue:${today.date}`;
  const paid = store.life.px.ledger(undefined, { since: start.getTime() }).some((e) => e.op === "award" && !e.back && e.key === key);
  return { days, lived: days.filter((d) => d.lived).length, today: { virtue: today.virtue, shadow: today.shadow, paid } };
}
