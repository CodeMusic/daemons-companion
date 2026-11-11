// C-338 (the user, 2026-11-11: "it would use the same common persona code we have been building on elsewhere -- since we
// would use this persona for many features, it might be useful in the morning before the daemon wakes to build it for the
// day ... or if it wasn't built it would when needed and then it would say valid for a period until needing to be
// rebuilt"; by choice: "At wake, rebuilt early"): THE PERSONA OF THE DAY, over the common persona (ai/personaof.ts, C-329).
// Its facts are the persona card -- the first-person telling and record, care and mood, last night's dream, the goals and
// their next steps, the day's virtue over its shadow and its chakra -- with the weather now and the day's forecast added.
// Built at WAKE (05:30, before a daemon wakes at six), kept until the next wake, and built again early when its SIGNATURE
// moves: its mood, its care's worst need, a goal's next step, the forecast's sky, another daemon. On top sits TODAY, a few
// sentences the daemon writes about meeting the day (the house's mind, in the background); until it comes, the persona is
// used without it. Every word DRAFT. No node: imports.
import type { Weather, WeatherToday } from "./context.js";
import { personaOf, type PersonaFacts } from "./ai/personaof.js";

export type DayPersonaFacts = PersonaFacts & { weather?: Weather | null; forecast?: WeatherToday | null };
export type Persona = { key: string; builtAt: string; validUntil: string; signature: string; text: string; today: string | null };

export const WAKE = { hour: 5, minute: 30 };

// The wake this persona belongs to (the last one at or before now), and the next
export function lastWake(now: Date): Date {
  const w = new Date(now); w.setHours(WAKE.hour, WAKE.minute, 0, 0);
  if (w.getTime() > now.getTime()) w.setDate(w.getDate() - 1);
  return w;
}
export function nextWake(now: Date): Date { const w = lastWake(now); w.setDate(w.getDate() + 1); return w; }

// Care banded: a need that crosses into wanting is a new day; a point either way is not
const worstNeed = (c: PersonaFacts["care"]) => {
  if (!c) return "";
  const needs: [string, number][] = [["rest", 100 - (c.rest ?? 100)], ["hunger", c.hunger ?? 0], ["thirst", c.thirst ?? 0], ["company", 100 - (c.companionship ?? 100)]];
  const [n, v] = needs.sort((a, b) => b[1] - a[1])[0];
  return v >= 50 ? n : "";
};

// What, if it moved, makes the persona stale before the next wake
export function signatureOf(f: DayPersonaFacts): string {
  const g = (f.goals ?? [])[0];
  return [f.species, f.nickname, f.mood ?? "", worstNeed(f.care), g ? `${g.goal}>${g.step ?? ""}` : "",
          f.forecast?.kind ?? f.weather?.kind ?? "", f.day?.day ?? ""].join("|");
}

const SKY: Record<string, string> = { clear: "clear skies", cloudy: "clouds", fog: "fog", snow: "snow", storm: "storms", rain: "rain" };

// The persona as words: the common persona, then the weather, then what it wrote of today
export function personaText(f: DayPersonaFacts, today?: string | null, person?: string): string {
  const lines = [personaOf(f, { roomy: true, person })];
  const fc = f.forecast, now = f.weather;
  if (fc) lines.push(`The forecast for ${fc.city} today: ${SKY[fc.kind] ?? fc.kind}, ${fc.loC} to ${fc.hiC} degrees${fc.rain != null ? `, a ${fc.rain}% chance of rain` : ""}.`);
  if (now) lines.push(`Outside right now: ${SKY[now.kind] ?? now.kind}, ${now.tempC} degrees.`);
  if (today?.trim()) lines.push(`How you meet today, in your own words: ${today.trim()}`);
  return lines.filter(Boolean).join("\n");
}

// The few sentences the daemon writes at wake, from its persona
export const TODAY_SYSTEM =
  "You are the small creature described below, just waking. In the first person, in three or four short sentences, say how " +
  "you meet today: what you feel, what you notice about the day and the weather, and what you hope for your person's next " +
  "step. Speak as yourself; never name the virtue, the shadow or the chakra outright -- let them colour what you say. No lists.";

export function readPersona(raw: string | null | undefined): Persona | null {
  try { const p = JSON.parse(raw ?? "null"); return p && typeof p.text === "string" && typeof p.validUntil === "string" ? p as Persona : null; }
  catch { return null; }
}

// Still the one for now: built since this morning's wake, and nothing that matters has moved
export const personaFresh = (p: Persona | null, signature: string, now: Date) =>
  !!p && p.signature === signature && Date.parse(p.validUntil) > now.getTime() && Date.parse(p.builtAt) >= lastWake(now).getTime();

// A persona built now from these facts; what it wrote of today is kept only for the same wake and the same signature
export function buildPersona(key: string, f: DayPersonaFacts, now: Date, had?: Persona | null, person?: string): Persona {
  const signature = signatureOf(f);
  const today = had && had.signature === signature && Date.parse(had.builtAt) >= lastWake(now).getTime() ? had.today : null;
  return { key, builtAt: now.toISOString(), validUntil: nextWake(now).toISOString(), signature, text: personaText(f, today, person), today };
}

// With what it wrote of today, once that comes
export const withToday = (p: Persona, f: DayPersonaFacts, today: string, person?: string): Persona =>
  ({ ...p, today: today.trim(), text: personaText(f, today, person) });
