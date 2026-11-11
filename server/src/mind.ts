// C-254 (the user, 2026-10-30: "a separate mind portal that lets you look around your daemon's mind ... this would allow
// us to load dreams from the game too"; decided 2026-10-31: "feelings shown (face, colour, the room's weather) with the
// words behind a tap; the portal opens on NOW"): what the portal shows, worked out from what the companion already
// knows -- the feelings and the event behind the strongest (feelings.ts), the dream the save carries (VAR_0x40D4, T-462),
// and the words a model is given (self.ts). This file runs on the phone too (C-111): no node:*.
// Every word DRAFT.
import eventsJson from "../data/events.json" with { type: "json" };
import { DREAM_TITLES, DREAM_VARS, type Quality } from "./dreams.js";
import type { Feelings } from "./feelings.js";
import { blocks, LAYOUT, type Layout } from "./save/reader.js";
import { feelingWord } from "./self.js";

// each feeling as the room shows it: its colour, and the weather it makes in the den when it is the strongest
// (CALM's far side is AFRAID, as self.ts says it)
export const FELT = {
  GLAD:     { colour: "#e8b84a", weather: "sun through the window" },
  MAD:      { colour: "#d0564b", weather: "thunder, far off" },
  SAD:      { colour: "#5d7fb8", weather: "rain on the glass" },
  CALM:     { colour: "#6fae9a", weather: "still air" },
  AFRAID:   { colour: "#8b70b3", weather: "fog at the door" },
  RESTLESS: { colour: "#e08a3c", weather: "wind in the eaves" },
} as const;
export type FeltName = keyof typeof FELT;
export const ORDINARY = "an ordinary sky";              // nothing felt strongly enough to change the weather

// what each kind of time together was, as the tap says it
const CAUSES: Record<string, string> = {
  feed: "it ate", water: "it drank", train: "you trained together", step: "a step of your goal, done together",
  walk: "the day's walk, reached", routine: "a routine on a board", met: "it met another daemon", sleep: "it was put to bed",
  "missed-meal": "a meal time passed with nothing to eat", woken: "it was woken while it slept",
  "alone-at-night": "it stayed up late, alone",
};

export type Felt = { name: FeltName; value: number; said: string; colour: string };
export type MindNow = { felt: Felt[]; weather: string; colour: string | null;
                        cause: { said: string; at: string; name: FeltName } | null };

// NOW: every feeling, strongest first, each with its colour and the words a model is given for it ("very GLAD");
// the room's weather from the strongest, once it is felt at all (10 of 100, self.ts's "a little")
export function mindNow(f: Feelings): MindNow {
  const calm = f.calm ?? 0;
  const raw: [FeltName, number][] = [["GLAD", f.glad], ["MAD", f.mad], ["SAD", f.sad], calm < 0 ? ["AFRAID", -calm] : ["CALM", calm]];
  if ((f.restless ?? 0) >= 10) raw.push(["RESTLESS", f.restless]);
  const felt = raw.map(([name, v]) => ({ name, value: Math.max(0, Math.min(100, Math.round(v))),
                                         said: `${feelingWord(v)} ${name}`, colour: FELT[name].colour }))
                  .sort((a, b) => b.value - a.value);
  const top = felt[0], strong = top && top.value >= 10;
  const s = f.strongest;
  const name: FeltName | null = s ? (s.axis === "calm" ? (s.now < 0 ? "AFRAID" : "CALM") : (s.axis.toUpperCase() as FeltName)) : null;
  return { felt, weather: strong ? FELT[top.name].weather : ORDINARY, colour: strong ? top.colour : null,
           cause: s && name ? { said: CAUSES[s.kind] ?? s.kind, at: s.at, name } : null };
}

// THE GAME'S DREAM: the dream the save carries (T-462): its picture's title, how it went, the night's hours, and how
// many nights since it was last carried home -- or null when the save holds none
export type GameDream = { title: string; quality: Quality; tucked: boolean; hours: number; nights: number; rested: number };
const EV = eventsJson as unknown as { sb1_vars: number; vars_start: number };
export function gameDream(save: Uint8Array, l: Layout = LAYOUT): GameDream | null {
  const { sb1 } = blocks(save, l);
  const v = new DataView(sb1.buffer, sb1.byteOffset, sb1.byteLength);
  const at = (n: number) => EV.sb1_vars + 2 * (n - EV.vars_start);
  if (at(DREAM_VARS.day) + 2 > sb1.byteLength) return null;
  const read = (n: number) => v.getUint16(at(n), true);
  const dream = read(DREAM_VARS.dream), q = dream & 3;
  if (!q) return null;                                     // 0: no dream carried yet
  const image = dream >> 8, nights = read(DREAM_VARS.nights);
  return { title: DREAM_TITLES[image] ?? "A DREAM", quality: (["broken", "broken", "quiet", "vivid"] as const)[q],
           tucked: !!(dream & 4), hours: read(DREAM_VARS.hours) / 10, nights: nights & 0xff, rested: nights >> 8 };
}
