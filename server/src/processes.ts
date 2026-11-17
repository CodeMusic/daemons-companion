// C-290: this file runs on the phone too (C-111) -- the app imports it, directly or through another file -- so keep it free of Node-only APIs (node:*, fs).
// C-357, PROCESSES (the user's picks, 2026-11-17: "A: in the app", a FEELING line on a journal entry, "after its hour"):
// THE SUBTLE LAYER's page -- nouns make feelings solid; underneath each is a process. Once the save holds the book, a
// journal entry can carry one feeling word, typed or picked from a few. For the hour it was logged it stays as written, a
// noun, something to carry; after its hour it is shown as what was happening, with its time: "fearing, this morning",
// "grieving, yesterday at nine". The entry's own words are never touched, and a word with no process known stays as it was
// written, with its time. Never coloured (a feeling has no colour here: the purple is the reads' own, T-459). Mind
// vocabulary (LAYOUT.md): no model, no machine. Every word DRAFT.

export const FEELING_MOST = 24;
export const FEELINGS = ["fear", "grief", "worry", "doubt", "dread", "regret", "hope", "joy", "love", "calm"] as const;   // the few offered
// each noun's own verb, or "being" and its adjective -- never a reading of what the feeling means (the book offers, it does
// not assert)
const PROCESS: Record<string, string> = {
  fear: "fearing", grief: "grieving", worry: "worrying", doubt: "doubting", dread: "dreading", regret: "regretting",
  hope: "hoping", joy: "rejoicing", love: "loving", calm: "calming", rage: "raging", sorrow: "sorrowing", envy: "envying",
  panic: "panicking", longing: "longing", hurt: "hurting", wonder: "wondering", despair: "despairing", awe: "marvelling",
  anger: "being angry", sadness: "being sad", loneliness: "being lonely", anxiety: "being anxious", shame: "being ashamed",
  jealousy: "being jealous", stress: "being stressed", gratitude: "being grateful", pride: "being proud", relief: "being relieved",
  peace: "being at peace", excitement: "being excited", boredom: "being bored", confusion: "being confused",
  frustration: "being frustrated", tiredness: "being tired", fatigue: "being tired", exhaustion: "being exhausted",
  curiosity: "being curious", contentment: "being content", happiness: "being happy",
};
export const HOUR = 3600000;
const NUMBER = ["twelve", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven"];
const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function cleanFeeling(x: unknown): string | null {
  const w = String(x ?? "").replace(/\s+/g, " ").trim().toLowerCase().slice(0, FEELING_MOST);
  return w || null;
}
export function processOf(noun: string): string | null {
  const w = noun.trim().toLowerCase();
  if (PROCESS[w]) return PROCESS[w];
  return /ing$/.test(w) ? w : null;                    // already a process, as typed
}
const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const part = (h: number) => (h < 5 ? "in the night" : h < 12 ? "this morning" : h < 17 ? "this afternoon" : h < 21 ? "this evening" : "tonight");
// when it was, as a person would say it after the hour: this morning; yesterday at nine; on Tuesday at nine; on 3 November
export function whenSaid(at: Date, now: Date): string {
  const days = Math.round((dayStart(now) - dayStart(at)) / 86400000), clock = `at ${NUMBER[at.getHours() % 12]}`;
  if (days <= 0) return part(at.getHours());
  if (days === 1) return `yesterday ${clock}`;
  if (days < 7) return `on ${WEEKDAY[at.getDay()]} ${clock}`;
  return `on ${at.getDate()} ${MONTH[at.getMonth()]}`;
}
// what the entry shows under its title: the noun for its hour, then the process and when
export function feltOf(feeling: string | null | undefined, at: string, now = new Date()): string | null {
  if (!feeling) return null;
  const t = new Date(at);
  if (now.getTime() - t.getTime() < HOUR) return feeling;
  return `${processOf(feeling) ?? feeling}, ${whenSaid(t, now)}`;
}
