// C-290: this file runs on the phone too (C-111) -- the app imports it, directly or through another file -- so keep it free of Node-only APIs (node:*, fs).
// C-432 (PRAXIS 5): what every space beside LIFE shares -- the space of a form (found, or made, and taught a newer version
// of its form), the person's local day, and THE DAY'S VIRTUE (docs/PROJECTS.md 6): the first thing finished on a day
// earns 2 ARETE more, once a day (the user, 2026-11-22, by multiple choice). Each weekday has its virtue over its shadow
// (data/week.json; T-418: "over", never "cures"); finishing anything on its day is living it.
import { Praxis, type Form } from "@daemons/praxis";
import weekJson from "../data/week.json" with { type: "json" };

export const DAY_VIRTUE = 2;
export const WEEK = weekJson.days as { day: string; virtue: string; shadow: string; chakra: string; colour: string }[];

/** a local calendar day, "2026-11-22" */
export const localDate = (d: Date) => [d.getFullYear(), d.getMonth() + 1, d.getDate()].map((n, i) => String(n).padStart(i ? 2 : 4, "0")).join("-");
export const midnight = (ms: number) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };

/** the space made from this form: the one this copy keeps, else the earliest read on its own; null when there is none */
export function spaceOf(px: Praxis, form: Form): string | null {
  const all = px.spaces().filter((s) => s.form?.name === form.name && !s.archived && s.home === s.id);
  return (all.find((s) => s.keeper === px.replica) ?? all[0])?.id ?? null;
}

/** the space of this form, made when there is none (by `px`, so at its clock), and on the form's newest version */
export function ensureSpace(px: Praxis, form: Form, o: { title: string; prefix: string }): string {
  let id = spaceOf(px, form);
  if (!id) id = px.makeSpace({ title: o.title, prefix: o.prefix, form, reach: "home" });
  if ((px.space(id)!.form?.version ?? 0) < form.version) px.adopt(id, form);
  return id;
}

/** THE DAY'S VIRTUE: paid on `item` (just finished) when nothing has been paid for this day's virtue yet, in any space.
 *  Its key is the day, so it is paid once a day wherever the finish happens. The ARETE it paid, or 0. */
export function dayVirtue(px: Praxis, item: string, now: Date): number {
  const date = localDate(now), key = `virtue:${date}`;
  if (px.ledger(undefined, { since: midnight(now.getTime()) - 86400000 }).some((e) => e.op === "award" && !e.back && e.key === key)) return 0;
  return px.award(item, key, DAY_VIRTUE, { reason: `${WEEK[now.getDay()].virtue} over ${WEEK[now.getDay()].shadow}` }) ? DAY_VIRTUE : 0;
}
