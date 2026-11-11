// C-323 (the user, 2026-11-10: "we should have an abstract system for any voice representation which can take in context
// and form a voice from it"): every generated voice comes from one place. A SPEAKER -- a daemon, the INDEX, the player, a
// book -- and what is known of it, in; a voice out: the RECIPE said to the voice-design model, and a KEY that names that
// voice exactly, so the same voice is made once and kept (its designed sample, ai/voicesample.ts) and a changed context
// is a new key, heard as a new voice.
//
//   a daemon          its type, its species' own traits, its category, how it feels (ai/voices.ts) -- or its trainer's own
//   the INDEX entry   the device reading its record: robotic (tiinyfirst.ts ENTRY_VOICE) -- the gears play button
//   the INDEX         the reader: the GUIDE's answers, a page, a book with no voice of its own
//   the player        everything they have done in the game (below): it moves a little as they play
//   a book            each its own; THE NOTEBOOK is the player's, so it is read in the player's voice
//
// Every word here is DRAFT, the user's to rewrite. No node: imports (core.ts reaches this on the phone).
import type { Feelings } from "../feelings.js";
import { ENTRY_VOICE, INDEX_VOICE } from "./tiinyfirst.js";
import { TYPE_VOICE, voiceRecipe } from "./voices.js";

export type Speaker =
  | { kind: "daemon"; species?: number | null; types?: string[] | string; category?: string; feelings?: Feelings | null; own?: string | null }
  | { kind: "entry"; own?: string | null }
  | { kind: "index"; own?: string | null }
  | { kind: "player"; context: PlayerContext | null; own?: string | null }
  | { kind: "book"; id: string; player?: PlayerContext | null; own?: string | null };

export type Voice = { recipe: string; key: string; kind: Speaker["kind"] };

// --- the player: what the save says they have done, read into a voice ---
export type PlayerContext = {
  edition?: string;                         // CONTENT / CONTEXT
  choice?: "REASON" | "INSTINCT" | null;    // who they chose to be at the title
  marks?: number;                           // MARKS won, 0-8
  roots?: number;                           // understandings held, 0-7
  partyTypes?: string[];                    // every type of every daemon they keep in the party, repeats and all
  hours?: number;                           // time played
  instrument?: "harp" | "flute" | null;     // when it is unlocked
  groves?: number;                          // groves found
};

// The type they keep most of, if one leads -- the colour their company leaves on them
export function keptMost(types: string[] | undefined): string | null {
  const n = new Map<string, number>();
  for (const t of types ?? []) { const k = t.trim().toUpperCase(); if (TYPE_VOICE[k]) n.set(k, (n.get(k) ?? 0) + 1); }
  const top = [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return top.length && (top.length === 1 || top[0][1] > top[1][1]) ? top[0][0] : null;
}

// Each step is banded, so the voice moves only when something they did moved it -- not every time they save
export function playerVoice(c: PlayerContext | null | undefined): string {
  const x = c ?? {};
  const marks = Math.max(0, Math.min(8, x.marks ?? 0)), roots = Math.max(0, Math.min(7, x.roots ?? 0));
  const base = x.choice === "INSTINCT" ? "A young traveller's voice, warm and quick, that goes with its first feeling"
             : x.choice === "REASON" ? "A young traveller's voice, clear and even, that thinks before it speaks"
             : "A young traveller's voice, clear and friendly";
  const sure = marks >= 8 ? "calm and sure of itself, seasoned by every road"
             : marks >= 5 ? "steady and assured"
             : marks >= 2 ? "growing steadier"
             : "a little tentative, still finding its way";
  const tone = x.edition === "CONTEXT" ? "a cool, attentive tone" : x.edition === "CONTENT" ? "a warm, open tone" : "";
  const most = keptMost(x.partyTypes);
  const company = most ? `It has kept company with ${most} daemons long enough to have caught something of ${
    TYPE_VOICE[most].replace(/^an? /, "").split(",")[0]}.` : "";
  const depth = roots >= 5 ? "It pauses before the words that matter, as if it has understood a great deal."
              : roots >= 2 ? "Now and then it pauses, as if something has just become clear." : "";
  const music = x.instrument === "harp" ? "There is a soft lilt in it, like plucked strings."
              : x.instrument === "flute" ? "There is an airy lightness in it, like breath through a flute." : "";
  const long = (x.hours ?? 0) >= 40 ? "It sounds like someone who has travelled a long time." : "";
  return [`${base}, ${sure}${tone ? `, with ${tone}` : ""}.`, company, depth, music, long, "A human voice, speaking for itself."]
    .filter(Boolean).join(" ");
}

// --- the books: each its own reader, described after the recorded audiobook's voice the user picked by ear for it
// (DAEMONS tools/bookaudio.py VOICES, 2026-11-01 to 11-11), so a page read aloud here and the book's recording sound
// like the same reader. THE NOTEBOOK is the player's own hand, so it is read in the player's voice. ---
export const BOOK_VOICE: Record<string, string> = {
  guide: "An even, unhurried man's voice, measured and reasonable, with a slight British polish; every step of a thought set down in order.",
  subtle: "A warm, full woman's voice, close and unhurried, trusting what it feels; soft at the ends of sentences.",
  hermetic: "A low, close woman's voice with an English accent, slow and drawn down, as if speaking at night by a single candle.",
  eudaimon: "A light, clear woman's voice with an English accent, slower than speech, leaving room after each sentence, like first light.",
  unity: "An even woman's voice with an English accent, unhurried and balanced, leaning neither light nor dark; calm pauses.",
  textbook: "A grave, warm, older man's voice with an English accent, like a kind professor reading from his own book.",
  quick: "A patient, kind woman's voice, unhurried and gentle, like a good teacher showing you the first steps.",
  manual: "A bright, adventurous man's voice, the narrator on the back of a game's box, eager to get you started.",
  companion: "A warm, encouraging young woman's voice, friendly and close, glad you are here.",
  social: "A friendly, open, sociable voice, bright and easy, as if two friends were speaking as one.",
  tiiny: "A calm, precise woman's voice with a clean synthetic edge, like a helpful machine speaking clearly.",
  etymology: "An old storyteller's voice, a deep, kind man's voice, slow and fond of every old word.",
  origin: "An even, unhurried voice, neither a man's nor a woman's but both at once, calm and whole.",
};

// FNV-1a as hex: the same recipe is always the same key
export function voiceKey(kind: string, recipe: string): string {
  let h = 0x811c9dc5;
  const s = `${kind}\n${recipe}`;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return `${kind}-${h.toString(16).padStart(8, "0")}`;
}

// A voice by the name a caller gives it -- "daemon", "player", "index", "entry", "book:<id>" -- with what the hub knows:
// the carried daemon's speaker, and the player's context (read from the save only when asked for). null: no such name.
export function speakerNamed(name: unknown, k: { daemon: () => Speaker; player: () => PlayerContext | null; own?: (n: string) => string | null }): Speaker | null {
  if (typeof name !== "string") return null;
  const own = (n: string) => k.own?.(n) ?? null;
  if (name === "daemon") return k.daemon();
  if (name === "player") return { kind: "player", context: k.player(), own: own("player") };
  if (name === "index") return { kind: "index", own: own("index") };
  if (name === "entry") return { kind: "entry", own: own("entry") };
  const m = /^book:([a-z0-9_-]{1,40})$/.exec(name);
  if (!m) return null;
  return m[1] === "notebook" ? { kind: "book", id: "notebook", player: k.player(), own: own("player") }
                             : { kind: "book", id: m[1], own: own(`book.${m[1]}`) };
}

// The voice of any speaker. `own` is a trainer's own recipe for it, used whole (a daemon's keeps its mood)
export function voiceOf(s: Speaker): Voice {
  const recipe = s.kind === "daemon" ? voiceRecipe({ types: s.types, category: s.category, species: s.species }, s.feelings, s.own)
    : s.own?.trim() ? s.own.trim()
    : s.kind === "entry" ? ENTRY_VOICE
    : s.kind === "index" ? INDEX_VOICE
    : s.kind === "player" ? playerVoice(s.context)
    : s.id === "notebook" ? playerVoice(s.player)
    : BOOK_VOICE[s.id] ?? INDEX_VOICE;
  return { recipe, key: voiceKey(s.kind, recipe), kind: s.kind };
}
