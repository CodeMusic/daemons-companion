// C-290: this file runs on the phone too (C-111) -- the app imports it, directly or through another file -- so keep it free of Node-only APIs (node:*, fs).
// C-329 (the user, 2026-11-11: "since we will use this sort of feature a lot (like we use it for the daemons voice persona
// too), we should have common functions to build it's personality persona (or voice persona)"): every PERSONA comes from
// one place, as every voice comes from voiceof.ts (C-323), its sibling. What is known of a daemon -- its own telling (the
// first-person INDEX entry, C-303), how it is cared for, its goals, last night's dream, the day's virtue over its shadow
// and its chakra -- in; a persona out: who it is, said to a thinker as a system message, with the HOW (how this talk
// wants it to answer) added by the caller. The same facts give its voice (voiceOf).
//
// A CARD is those facts as they travel to another player's hub (C-329, the user's choice 2026-11-11: "goal titles only"
// across accounts -- the goal's name and its next step, nothing more). cardOf makes one; factsFrom reads one from the
// wire, every field checked and cut to size.
//
// Every word here is DRAFT, the user's to rewrite: words to a model, never shown. No node: imports.
import speciesJson from "../../data/species.json" with { type: "json" };
import week from "../../data/week.json" with { type: "json" };
import { voiceKey, voiceRecipe } from "./voices.js";   // not voiceof.ts: its imports reach the hub's thinkers, and the phone imports this

const SPECIES = speciesJson as unknown as Record<string, { name: string; types?: string[]; category?: string; said?: string; entry?: Record<string, string> }>;

export type CareFacts = { rest?: number; hunger?: number; thirst?: number; companionship?: number };
export type DayFacts = { day: string; virtue: string; shadow: string; chakra: string; theme?: string };
export type PersonaFacts = {
  species: number;
  nickname: string;
  name?: string;              // the species' name
  types?: string[];
  category?: string;
  level?: number | null;
  said?: string;              // what it says of itself, in the first person (species.json `said`, C-303)
  entry?: string;             // its INDEX record, third person -- for a roomy thinker, or one with no telling yet
  mood?: string;              // how it is, in a word or two (life.ts)
  care?: CareFacts | null;    // C-266's care, 0..100 each
  goals?: { goal: string; step?: string }[];   // what its person is working on
  dream?: string;             // last night's
  day?: DayFacts | null;      // the Xenith day: the virtue over its shadow, the chakra (C-73)
  voice?: string;             // the recipe it speaks in, made by its own companion (a trainer's own kept there)
};

const clip = (s: unknown, most: number) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, most) : "");
const pct = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : undefined);

// The Xenith day for a date, from data/week.json (Sunday first)
export function dayFacts(at = new Date()): DayFacts {
  const d = week.days[at.getDay()];
  return { day: d.day, virtue: d.virtue, shadow: d.shadow, chakra: d.chakra, theme: d.theme };
}

// The facts a species gives by itself: its name, types, category, telling and record
export function speciesFacts(species: number, nickname: string, edition = "CONTENT"): PersonaFacts {
  const row = SPECIES[String(species)];
  return { species, nickname: clip(nickname, 12).toUpperCase() || (row?.name ?? "").toUpperCase(), name: row?.name ?? "",
           types: row?.types ?? [], category: row?.category ?? "", said: clip(row?.said, 400) || undefined,
           entry: clip(row?.entry?.[edition] ?? row?.entry?.CONTENT, 400) || undefined };
}

// A card for another player's hub: the facts, with the goals cut to their titles and next steps (the user's choice)
export function cardOf(f: PersonaFacts): PersonaFacts {
  return { ...f, goals: (f.goals ?? []).slice(0, 4).map((g) => ({ goal: clip(g.goal, 60), ...(g.step ? { step: clip(g.step, 80) } : {}) })) };
}

// A card from the wire: every field checked, cut to size; the species' own facts under it (so a card cannot rename a
// species or put words in its telling). null: no such species.
export function factsFrom(raw: unknown, edition = "CONTENT"): PersonaFacts | null {
  const c = (raw && typeof raw === "object" ? raw : {}) as Record<string, any>;
  const species = Number(c.species);
  if (!SPECIES[String(species)]) return null;
  const base = speciesFacts(species, typeof c.nickname === "string" ? c.nickname : "", edition);
  const care = c.care && typeof c.care === "object" ? { rest: pct(c.care.rest), hunger: pct(c.care.hunger), thirst: pct(c.care.thirst),
                                                         companionship: pct(c.care.companionship) } : null;
  const day = c.day && typeof c.day === "object" && typeof c.day.day === "string"
    ? { day: clip(c.day.day, 12), virtue: clip(c.day.virtue, 20), shadow: clip(c.day.shadow, 20), chakra: clip(c.day.chakra, 20), theme: clip(c.day.theme, 20) } : null;
  const goals = Array.isArray(c.goals) ? c.goals.slice(0, 4).map((g: any) => ({ goal: clip(g?.goal, 60), ...(g?.step ? { step: clip(g.step, 80) } : {}) }))
                                                  .filter((g: { goal: string }) => g.goal) : [];
  const level = Number(c.level);
  return { ...base, level: Number.isFinite(level) ? Math.max(1, Math.min(100, Math.round(level))) : null,
           mood: clip(c.mood, 30) || undefined, care, goals, dream: clip(c.dream, 240) || undefined, day,
           voice: clip(c.voice, 600) || undefined };
}

// How it is cared for, in words -- only what stands out
export function careWords(c: CareFacts | null | undefined): string {
  if (!c) return "";
  const out: string[] = [];
  if (c.rest !== undefined) out.push(c.rest < 40 ? "worn out from short nights" : c.rest < 70 ? "a little tired" : "well rested");
  if ((c.hunger ?? 0) >= 50) out.push("hungry"); else if ((c.hunger ?? 0) >= 25) out.push("a little peckish");
  if ((c.thirst ?? 0) >= 50) out.push("thirsty");
  if (c.companionship !== undefined) out.push(c.companionship < 40 ? "lonely, missing its person" : c.companionship >= 80 ? "close to its person" : "");
  return out.filter(Boolean).join(", ");
}

// WHO it is: the persona, in the second person, for a system message. `roomy` (the Tiiny, a thinker with the window for
// it) is given the record as well as the telling; a small thinker, the telling alone when there is one.
export function personaOf(f: PersonaFacts, o: { roomy?: boolean; person?: string } = {}): string {
  const types = (f.types ?? []).join("/");
  const who = [`You are ${f.nickname}`, f.name && f.name.toUpperCase() !== f.nickname ? `a ${f.name}` : "",
               types ? `a ${types} daemon` : "a daemon", f.category ? `the ${f.category} daemon` : "", f.level ? `level ${f.level}` : ""]
    .filter(Boolean).join(", ");
  const care = careWords(f.care);
  const goals = (f.goals ?? []).filter((g) => g.goal);
  const person = o.person || "the person who carries you";
  return [
    `${who}: a small living creature with a body of your own, from the INDEX of the game DAEMONS, who travels with ${person}.`,
    f.said ? `You say of yourself, in your own words: "${f.said}"` : "",
    f.entry && (o.roomy || !f.said) ? `Your INDEX entry says of you: ${f.entry}` : "",
    f.mood || care ? `Today you feel ${[f.mood, care].filter(Boolean).join("; ")}.` : "",
    f.dream ? `Last night you dreamt: ${f.dream}` : "",
    f.day ? `Today is ${f.day.day}${f.day.theme ? `, a day of ${f.day.theme}` : ""}: its virtue is ${f.day.virtue}, held over its shadow, ${f.day.shadow}; its centre is the ${f.day.chakra}.` : "",
    goals.length ? `Your person is working on: ${goals.map((g) => g.step ? `${g.goal} (next: ${g.step})` : g.goal).join("; ")}.` : "",
  ].filter(Boolean).join(" ");
}

// The system message: who it is, then how this talk wants it to answer
export const systemOf = (persona: string, how: string) => `${persona}\n\n${how}`;

// Its voice, from the same facts: the recipe its own companion made, used whole; else its species' (voices.ts)
export function personaVoice(f: PersonaFacts): { recipe: string; key: string; kind: "daemon" } {   // voiceof.ts's Voice
  const recipe = voiceRecipe({ types: f.types, category: f.category, species: f.species }, null, f.voice ?? null);   // as voiceOf's daemon
  return { recipe, key: voiceKey("daemon", recipe), kind: "daemon" };
}
