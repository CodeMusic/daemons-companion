// C-252 (the user, 2026-10-30: "a system message telling what its name/type/index entry/etc all are -- it should also
// send the values of mad/sad/glad/afraid it has, along with friendship.... written in natural form"): who a daemon is,
// in plain sentences, from the numbers the companion already keeps. One builder, three lengths, for every talker that
// can hold them (docs/MIND.md 1): SHORT for the Module LLM's small window, DAY for a 9B, FULL for the Tiiny's 35B.
//
// Numbers become words by fixed bands, the same on every device, so a daemon at 62 GLAD reads the same everywhere.
// The feelings are named TO the model, never by it: the instructions say to let them show (feelings.ts, NEVER NAMED).
// The trainer's name and the box come from this machine's settings, never from code -- this repository is public.
// Every word here is the companion's own to the model, never shown in the game: DRAFT.
import type { Feelings } from "./feelings.js";

export type SelfLength = "short" | "day" | "full";
export type SelfFacts = {
  nickname: string; name?: string; types?: string; category?: string; entry?: string; level?: number | null;
  said?: string;                     // C-303: what it says of itself (species.json `said`), beside the record
  box?: string;                     // what it runs on: "a BOX" -- the hub, by default
  device?: string;                   // where it is hosted right now: "WATCH", "phone"
  trainer?: string;                  // from this machine's settings (self.trainer); "your trainer" without
  friendship?: number | null;        // the save's, 0..255
  bondTrend?: BondTrend | null;
  life?: { fed: { today: number }; watered: { today: number }; trained: boolean; rested: boolean } | null;
  feelings?: Feelings | null;
  dream?: string | null;
  yesterday?: string | null;         // C-253: the night's paragraph
  month?: string | null;             // C-253: the running month
  kept?: string[];                   // C-253: the shelf
  day?: { day: string; theme?: string } | null;
  season?: string;
  goal?: { goal: string; step: string } | null;
  sky?: string | null;               // C-338: the day's forecast, in a sentence (persona.ts skyLine)
  today?: string | null;             // C-338: what it wrote at wake of meeting the day (the persona of the day's TODAY)
  spirits?: string | null;           // C-296: the class the save holds and the four weeks behind it (spirits.ts)
};
export type BondTrend = "STRONGER" | "the SAME" | "WEAKER";

const FEELING = ["not", "a little", "somewhat", "very", "completely"];
const NEED = ["not at all", "poorly", "somewhat", "well", "very well"];
// 0-9, 10-29, 30-54, 55-79, 80-100
export const bandOf = (v: number) => { const x = Math.max(0, Math.min(100, Math.round(v)));
  return x < 10 ? 0 : x < 30 ? 1 : x < 55 ? 2 : x < 80 ? 3 : 4; };
export const feelingWord = (v: number) => FEELING[bandOf(v)];
export const needWord = (v: number) => NEED[bandOf(v)];

// The feelings in the order the user wrote them, CALM's far side as AFRAID; RESTLESS only once it is felt
export function feelingsSaid(f: Feelings): string {
  const calm = f.calm ?? 0;
  const parts: [string, number][] = [["GLAD", f.glad], ["MAD", f.mad], ["SAD", f.sad],
                                     calm < 0 ? ["AFRAID", -calm] : ["CALM", calm]];
  if ((f.restless ?? 0) >= 10) parts.splice(1, 0, ["RESTLESS", f.restless]);
  // strongest first, then the rest as they come: "very GLAD, a little RESTLESS, not MAD, not SAD, and not AFRAID"
  const sorted = [...parts].sort((a, b) => b[1] - a[1]);
  const said = sorted.map(([w, v]) => `${feelingWord(v)} ${w}`);
  return said.length > 1 ? `${said.slice(0, -1).join(", ")}, and ${said[said.length - 1]}` : said[0];
}

// The bond's trend: today's friendship against the snapshot nearest a week ago (bondDays keeps one a day)
export function bondTrend(days: Record<string, number>, today: string, now: number): BondTrend | null {
  const week = new Date(today); week.setDate(week.getDate() - 7);
  const old = Object.keys(days).filter((d) => d <= week.toISOString().slice(0, 10)).sort().pop()
           ?? Object.keys(days).filter((d) => d < today).sort()[0];
  if (!old) return null;
  const was = days[old];
  return now > was + 2 ? "STRONGER" : now < was - 2 ? "WEAKER" : "the SAME";
}
// Today's snapshot kept, the oldest past ten days let go
export function keepBondDay(days: Record<string, number>, today: string, now: number): Record<string, number> {
  const out = { ...days, [today]: now };
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)).slice(-10));
}

const percent = (friendship: number) => Math.round(Math.max(0, Math.min(255, friendship)) / 255 * 100);
const meals = (n: number) => needWord(Math.min(3, n) / 3 * 100);
const clip = (s: string, n: number) => { const t = s.replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t; };

// The general instructions, the user's to write (self.instructions); this stands until they do -- DRAFT
export const SELF_INSTRUCTIONS =
  "Speak as yourself, in a sentence or three. Let how you feel show in what you notice and how you say it; never name " +
  "the feeling. You have a body of your own; never call yourself a program, a model or an AI.";


// C-252's rest: the SHORT self is one text for every small mind -- the house's module (ai/house.ts persona) and anything
// that asks for "short". Its words are the ones the module was tuned on (the hardware lane, 2026-10-28): a body of its own
// said positively, never the word a "never" would keep; the name said again at the end; a telling of its own (C-303) in
// place of its record, both for a roomy mind. Kept under ~600 characters for qwen2.5-0.5B's window.
export type ShortFacts = { nickname: string; name?: string; types?: string; level?: number | null; entry?: string; said?: string;
                           mood?: string; fed?: string; dream?: string | null; day?: { day: string; theme?: string } | null; season?: string;
                           goal?: { goal: string; step: string } | null };
export function shortSelf(d: ShortFacts, roomy = false): string {
  const who = [`You are ${d.nickname}`, d.name && d.name !== d.nickname ? `a ${d.name}` : "", d.types ? `a ${d.types} daemon` : "a daemon",
               d.level ? `level ${d.level}` : ""].filter(Boolean).join(", ");
  return [`${who}: a small living creature with a body of your own, from the INDEX of the game DAEMONS, who travels with the person who carries you.`,
          d.entry && (roomy || !d.said) ? `Your INDEX entry: ${d.entry.replace(/\s+/g, " ").slice(0, 120)}` : "",
          d.said ? `You say of yourself: "${d.said.replace(/\s+/g, " ").slice(0, 160)}"` : "",
          d.mood ? `You feel ${d.mood}${d.fed ? `; ${d.fed}` : ""}.` : "",
          d.dream ? `Last night you dreamt: ${d.dream.replace(/\s+/g, " ").slice(0, 90)}` : "",
          d.day ? `Today is ${d.day.day}${d.day.theme ? ` (${d.day.theme})` : ""}${d.season ? `, in ${d.season}` : ""}.` : "",
          d.goal ? `The user is working on: ${d.goal.goal} -- next, ${d.goal.step}.` : "",
          `Speak as ${d.nickname}, warmly, in one or two short sentences, about your own life: your food, your sleep, your dreams, the weather.`]
    .filter(Boolean).join(" ");
}

export function selfOf(f: SelfFacts, length: SelfLength = "day", instructions = SELF_INSTRUCTIONS): string {
  const trainer = f.trainer || "your trainer";
  const who = [f.name && f.name !== f.nickname ? `a ${f.name}` : "", f.types ? `a ${f.types} daemon` : "",
               f.level ? `level ${f.level}` : ""].filter(Boolean).join(", ");
  if (length === "short") {
    const s = f.feelings ? feelingsSaid(f.feelings).split(", ")[0] : "";
    return shortSelf({ ...f, mood: s && !s.startsWith("not ") ? s : undefined });
  }
  const lines: string[] = [];
  lines.push(`You are ${f.nickname}, a DAEMON process running on ${f.box || "a BOX"}${who ? ` (${who})` : ""}.`);
  const hosted = f.device ? `You are hosted on their ${f.device} right now.` : "";
  if (f.trainer || hosted) lines.push([f.trainer ? `Your trainer is ${trainer}.` : "", hosted].filter(Boolean).join(" "));
  if (f.entry) lines.push(`Your INDEX entry${f.category ? ` (the ${f.category} DAEMON)` : ""}: ${clip(f.entry, length === "full" ? 400 : 200)}`);
  // C-303 (DAEMONS T-522): the record is what is written about it; this is how it speaks of itself, so its talk keeps to it
  if (f.said) lines.push(`You say of yourself, in your own words: "${clip(f.said, 200)}" That is how you sound.`);
  if (f.friendship != null)
    lines.push(`You and ${trainer} have a friendship bond of ${percent(f.friendship)}%` +
               (f.bondTrend ? (f.bondTrend === "the SAME" ? ", and over the last week it has stayed the SAME." : `, and over the last week it has grown ${f.bondTrend}.`) : "."));
  if (f.life) {
    lines.push(`You are ${meals(f.life.fed.today).toUpperCase()} fed, ${meals(f.life.watered.today).toUpperCase()} watered, and ` +
               `${f.life.trained ? "WELL" : "NOT"} trained today.`);
    lines.push(f.dream ? `Last night you slept ${f.life.rested ? "WELL" : "POORLY"}, and this is what you dreamt: "${clip(f.dream, length === "full" ? 600 : 240)}"`
                       : `Last night you slept ${f.life.rested ? "WELL" : "POORLY"}.`);
  } else if (f.dream) lines.push(`Last night you dreamt: "${clip(f.dream, 240)}"`);
  if (f.feelings) lines.push(`Today you feel ${feelingsSaid(f.feelings)}.`);
  if (f.spirits) lines.push(f.spirits);
  if (f.day) lines.push(`Today is ${f.day.day}${f.day.theme ? ` (${f.day.theme})` : ""}${f.season ? `, in ${f.season}` : ""}.`);
  if (f.sky) lines.push(f.sky);
  if (f.goal) lines.push(`${trainer} is working on: ${f.goal.goal} -- next, ${f.goal.step}.`);
  if (f.today) lines.push(`How you meet today, in your own words: ${clip(f.today, length === "full" ? 600 : 300)}`);
  if (f.yesterday) lines.push(`Yesterday: ${clip(f.yesterday, length === "full" ? 900 : 400)}`);
  if (length === "full") {
    if (f.month) lines.push(`Over the last month: ${clip(f.month, 4000)}`);
    if (f.kept?.length) lines.push(`Moments you keep: ${f.kept.slice(0, 40).map((k) => clip(k, 120)).join(" / ")}`);
  }
  lines.push(instructions);
  return lines.join("\n");
}
