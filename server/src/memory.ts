// C-290: this file runs on the phone too (C-111) -- keep it free of Node-only APIs (node:*, fs).
// C-253 (the user, 2026-10-30: "yesterday the following happened [a very much compressed paragraph] ... over the last
// month [a few paragraphs]"; docs/MIND.md 2): MEMORY MADE AT NIGHT. Once a day, after the wake (persona.ts WAKE), the
// house's mind is given what the day before the wake left behind -- the cares and talks counted, the goal's steps done,
// what was painted, the night's dream -- and writes three things the daemon's self carries (self.ts): YESTERDAY, one
// short paragraph; THE MONTH, yesterday folded into the running month and rewritten the same size, so what falls out of
// it is gone, as it is for anyone; and KEPT, the moments worth keeping past the month, a line each. If no mind answers,
// the day waits and is made at the next chance; the self works from the last month kept. Never shown as written: DRAFT.
import type { Store } from "./store.js";
import { lastWake } from "./persona.js";

export const KEPT_MOST = 40;
export const RETRY_MIN = 60;

const DAY_WORDS: [string[], string, string][] = [
  [["feed"], "a meal", "meals"], [["water"], "a drink", "drinks"], [["train"], "a training", "trainings"],
  [["sleep"], "a bedtime", "bedtimes"], [["wake"], "a waking", "wakings"],
  [["walk"], "a walk", "walks"], [["routine"], "a routine kept", "routines kept"], [["talk", "talkfirst"], "a talk", "talks"],
  [["music", "song"], "a song played", "songs played"], [["casino", "table"], "a game at the CASINO", "games at the CASINO"],
  [["read", "lean"], "a read of THE SUBTLE LAYER", "reads of THE SUBTLE LAYER"], [["card"], "a card turned", "cards turned"],
  [["met"], "another daemon met", "other daemons met"], [["gift"], "a gift", "gifts"], [["evolved"], "an evolution", "evolutions"],
  [["battle"], "a battle", "battles"],
];

// The local date a memory is for: the day that ended at this morning's wake
export const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export function memoryDue(madeFor: string | null, now: Date): { day: string; from: Date; to: Date } | null {
  const to = lastWake(now), from = new Date(to.getTime() - 24 * 3600_000), day = dayKey(from);
  return madeFor === day ? null : { day, from, to };
}

export type Extra = { nickname?: string; feelings?: string | null; dream?: string | null; paintings?: string[]; dayName?: string | null };

// What the day left behind, in words (the mind's material; never shown)
export function dayMaterial(store: Store, from: Date, to: Date, extra: Extra = {}): string {
  const seen = store.interactionsSince(from).filter((e) => Date.parse(e.at) < to.getTime());
  const counts = DAY_WORDS.map(([kinds, one, many]) => { const k = seen.filter((e) => kinds.includes(e.kind)).length;
    return k === 0 ? "" : k === 1 ? one : `${k} ${many}`; }).filter(Boolean);
  const steps = (store.db.prepare(`SELECT s.text AS step, g.title AS goal FROM steps s JOIN subitems i ON i.id = s.subitem JOIN goals g ON g.id = i.goal
                                    WHERE s.done >= ? AND s.done < ? ORDER BY s.done`).all(from.toISOString(), to.toISOString()) as { step: string; goal: string }[]);
  const goals = (store.db.prepare("SELECT title FROM goals WHERE done >= ? AND done < ?").all(from.toISOString(), to.toISOString()) as { title: string }[]);
  const lines = [
    extra.dayName ? `The day was a ${extra.dayName}.` : "",
    `Together you had: ${counts.length ? counts.join(", ") : "a quiet day, little done together"}.`,
    steps.length ? `Steps done toward goals: ${steps.map((s) => `"${s.step}" (for ${s.goal})`).join("; ")}.` : "",
    goals.length ? `Goals finished: ${goals.map((g) => `"${g.title}"`).join(", ")}.` : "",
    extra.paintings?.length ? `You painted: ${extra.paintings.map((p) => `"${p}"`).join(", ")}.` : "",
    extra.feelings ? `By the end of it you felt ${extra.feelings}.` : "",
    extra.dream ? `That night you dreamt: ${extra.dream.replace(/\s+/g, " ").slice(0, 500)}` : "",
  ];
  return lines.filter(Boolean).join("\n");
}

export const YESTERDAY_ASK =
  "You keep the memory of a small creature, a daemon, who lives beside a person (its trainer). From what the day left behind, " +
  "write YESTERDAY: one short paragraph, at most 70 words, in the second person to the daemon (\"you\"), of what happened and how it " +
  "felt -- concrete, plain, nothing invented. Then, only if something in it is worth remembering for a long time (a first meeting, " +
  "a goal finished, an evolution, a big step), one line for each beginning \"KEEP:\" -- at most two. Answer exactly in this shape:\n" +
  "YESTERDAY: <the paragraph>\nKEEP: <a moment>   (only if there is one)";
export const MONTH_ASK =
  "You keep the memory of a small creature, a daemon. Fold the new day into its month: rewrite THE MONTH as at most three short " +
  "paragraphs, at most 220 words in all, in the second person (\"you\"), the newest days the clearest, the older ones blurred into " +
  "what they were mostly like; let what matters least fall out. Nothing invented. Answer with the month only.";

const clip = (s: string, most: number) => s.replace(/<think>[\s\S]*?<\/think>/g, "").replace(/\s+\n/g, "\n").trim().slice(0, most);

export function readYesterday(t: string | null | undefined): { yesterday: string; keep: string[] } | null {
  const raw = clip(String(t ?? ""), 3000);
  if (!raw) return null;
  const keep = [...raw.matchAll(/^\s*\**\s*KEEP\s*:\s*\**\s*(.+)$/gim)].map((m) => m[1].replace(/\*+/g, "").trim()).filter(Boolean).slice(0, 2);
  const body = raw.replace(/^\s*\**\s*KEEP\s*:.*$/gim, "").replace(/^\s*\**\s*YESTERDAY\s*:\s*\**\s*/i, "").trim();
  return body ? { yesterday: body.slice(0, 700), keep } : null;
}

// The shelf: new moments first, each once, at most KEPT_MOST
export function keepMoments(had: string[], add: string[], day: string): string[] {
  const seen = new Set(had.map((k) => k.replace(/^\d{4}-\d{2}-\d{2}: /, "").toLowerCase()));
  const fresh = add.map((k) => k.slice(0, 160)).filter((k) => !seen.has(k.toLowerCase())).map((k) => `${day}: ${k}`);
  return [...fresh, ...had].slice(0, KEPT_MOST);
}

export type Writer = (system: string, user: string, maxTokens: number) => Promise<string | null>;
export type Memory = { yesterday: string; month: string; kept: string[] };

// The night's work: yesterday, then the month folded; throws if no mind answers (the day then waits)
export async function consolidate(material: string, had: { month: string | null; kept: string[] }, day: string, write: Writer, who = "the daemon"): Promise<Memory> {
  const y = readYesterday(await write(YESTERDAY_ASK, `The daemon is ${who}. The day: ${day}.\n\n${material}`, 400));
  if (!y) throw new Error("No mind wrote yesterday.");   // DRAFT
  const m = await write(MONTH_ASK, `THE MONTH SO FAR:\n${had.month?.trim() || "(nothing yet: this is the first day remembered)"}\n\n` +
                                   `THE NEW DAY (${day}):\n${y.yesterday}`, 600);
  const month = clip(String(m ?? ""), 2400);
  return { yesterday: y.yesterday, month: month || had.month || y.yesterday, kept: keepMoments(had.kept, y.keep, day) };
}

export const readKept = (raw: string | null | undefined): string[] => {
  try { const l = JSON.parse(raw ?? "[]"); return Array.isArray(l) ? l.filter((x) => typeof x === "string") : []; } catch { return []; }
};
