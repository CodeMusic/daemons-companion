// Runs on the phone too (C-111): no node: imports.
// C-334 (the user, 2026-11-11: "generitive sleep sounds ... DAEMON-ified (using again context to steer the output -- such
// as the daemons index entry or care/mood/companionship)"): a daemon's sleep sounds from its context, as C-323's voiceof.ts
// makes a voice from its speaker. Who it is, in; a RECIPE out -- the music words said to the music model (ACE-Step 1.5 on
// roverbyteseer, ai/litellm/sleep-sounds in DAEMONS), its tempo and key -- and a KEY naming that recipe exactly, so the
// same sounds are made once and kept, and a changed context (by bands, so not every feeling's tick) is a new piece.
//
//   its type(s)       the instruments: the colour of the room it sleeps in (TYPE_SOUND)
//   its feelings      the light: GLAD a major key, SAD a minor one, AFRAID sheltering, RESTLESS slower still
//   its care          what it carries: worn out the sparest, thirsty soft rain, hungry a warm hearth
//   closeness         how near the melody is: close a lullaby sung near, far a melody calling from a distance
//   its INDEX entry   one image from it, chosen by a talker when one is in the house (sleepAsk), or none
//   the species       which key it sleeps in (each kind its own), and a seed, so its pieces are its own
//
// The music model is asked only in music words -- nothing of the trainer, nothing personal. Every word here is DRAFT.

export type SleepContext = {
  species?: number | null;
  nickname?: string;
  types?: string[] | string | null;
  category?: string | null;
  entry?: string | null;
  feelings?: { glad?: number; mad?: number; sad?: number; calm?: number; restless?: number } | null;
  care?: { rest: number; hunger: number; thirst: number; companionship: number } | null;
};

export type SleepRecipe = {
  key: string;            // names this recipe: same key, same piece
  caption: string;        // the music words, as asked
  bpm: number;
  keyscale: string;       // "F major"
  seconds: number;        // the piece's length before it is made to loop (C-334: ~5 minutes, looped for 30)
  seed: number;           // the species' own
  bands: Record<string, string>;   // what moved it, in words (shown on the screen: why this piece)
};

// DRAFT: a sleeping room for each type, in instruments
export const TYPE_SOUND: Record<string, string> = {
  CONTENT: "warm felt piano, soft strings",
  LOGIC: "clean sine pads, a slow music box",
  VECTOR: "airy synth pads, a slow gentle pulse",
  CORRUPT: "warbling tape keys, soft vinyl crackle",
  STRATUM: "deep cello drone, low layered strings, cave reverb",
  LEGACY: "old upright piano, gramophone warmth",
  SWARM: "soft shimmering granular textures, distant crickets",
  LATENT: "hushed choir pads, slow swells",
  ENTROPY: "drifting wind chimes, free-floating pads",
  FLOW: "flowing harp, a gentle stream",
  GROWTH: "kalimba, soft forest at dusk",
  SIGNAL: "glass bells, faint warm radio hiss",
  CONTEXT: "acoustic guitar harmonics, warm room tone",
  FROZEN: "crystalline bells, cold airy pads, snowfall quiet",
  EMERGENT: "slowly evolving synth textures, a glimmering arpeggio",
  ORACLE: "low singing bowls, tanpura drone",
  HARDENED: "a slow soft heartbeat pulse, warm low brass pad",
  OPAQUE: "muffled pads, distant rain on a window",
};
const DEFAULT_SOUND = "soft warm pads, a quiet music box";
const ALWAYS = "instrumental, ambient sleep music, slow, soft, gentle, no drums, no vocals";
const NOTES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
export const SLEEP_SECONDS = 300;

const typesOf = (t: SleepContext["types"]) =>
  (Array.isArray(t) ? t : String(t ?? "").split(/[\s/,]+/)).map((x) => x.trim().toUpperCase()).filter(Boolean);
const band3 = (v: number | undefined, lo: number, hi: number): 0 | 1 | 2 => (v ?? 0) < lo ? 0 : (v ?? 0) < hi ? 1 : 2;

// the feelings, banded: only a change of band is a new piece
export function moodBand(f: SleepContext["feelings"]): "glad" | "sad" | "afraid" | "restless" | "cross" | "still" {
  if (!f) return "still";
  const afraid = Math.max(0, -(f.calm ?? 0));
  const top = ([["afraid", afraid], ["sad", f.sad ?? 0], ["restless", f.restless ?? 0], ["cross", f.mad ?? 0], ["glad", f.glad ?? 0]] as const)
    .reduce((a, b) => (b[1] > a[1] ? b : a));
  return top[1] >= 40 ? top[0] : "still";
}
const MOOD: Record<ReturnType<typeof moodBand>, { words: string; minor: boolean; bpm: number }> = {
  glad: { words: "tender, warm, contented", minor: false, bpm: 60 },
  sad: { words: "gentle melancholy, consoling", minor: true, bpm: 54 },
  afraid: { words: "sheltering, reassuring, safe and enclosed", minor: false, bpm: 52 },
  restless: { words: "settling, slower and slower, calming", minor: false, bpm: 50 },
  cross: { words: "grounding, soothing, unhurried", minor: true, bpm: 52 },
  still: { words: "peaceful, still, dreamy", minor: false, bpm: 56 },
};

// a cheap stable hash (FNV-1a), so the key and the seed are the same on the phone and the hub
export function fnv(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

export function sleepRecipe(c: SleepContext, image?: string | null): SleepRecipe {
  const types = typesOf(c.types).filter((t) => TYPE_SOUND[t]);
  const room = types.length ? TYPE_SOUND[types[0]] + (types[1] && types[1] !== types[0] ? `, a touch of ${TYPE_SOUND[types[1]].split(",")[0]}` : "") : DEFAULT_SOUND;
  const mood = moodBand(c.feelings), m = MOOD[mood];
  const care = c.care;
  const rest = care ? band3(care.rest, 30, 70) : 1, near = care ? band3(care.companionship, 30, 70) : 1;
  const thirsty = !!care && care.thirst >= 60, hungry = !!care && care.hunger >= 60;
  const carry = [rest === 0 ? "very sparse and quiet, long silences" : rest === 2 ? "floating, weightless" : "",
                 thirsty ? "soft distant rain" : "", hungry ? "a warm crackling hearth far off" : ""].filter(Boolean);
  const closeness = near === 2 ? "a close, intimate lullaby melody" : near === 0 ? "a faraway melody calling softly across a wide space" : "a simple lullaby melody";
  const sp = c.species ?? 0;
  const keyscale = `${NOTES[sp % 12]} ${m.minor ? "minor" : "major"}`;
  const picture = (image ?? "").replace(/[^\w ,'-]/g, "").trim().slice(0, 80);
  const caption = [room, m.words, ...carry, closeness, picture, ALWAYS].filter(Boolean).join(", ");
  const bands = { types: types.join("/") || "none", mood, rest: ["worn", "rested", "fresh"][rest], near: ["far", "near", "close"][near],
                  thirsty: thirsty ? "yes" : "no", hungry: hungry ? "yes" : "no" };
  const key = `s${sp}-${fnv(JSON.stringify(bands)).toString(36)}`;
  return { key, caption, bpm: m.bpm, keyscale, seconds: SLEEP_SECONDS, seed: fnv(`daemon-${sp}`) % 2147483647, bands };
}

// DRAFT: what the screen says about why this piece -- the bands in words
export function sleepSaid(r: SleepRecipe, nickname = "your daemon"): string {
  const mood = { glad: "glad", sad: "a little sad", afraid: "uneasy", restless: "restless", cross: "cross", still: "at peace" }[r.bands.mood] ?? "at peace";
  const near = { far: "far from you", near: "near you", close: "close to you" }[r.bands.near] ?? "near you";
  return `Made for ${nickname} as tonight finds them: ${mood}, ${r.bands.rest === "worn" ? "worn out" : r.bands.rest === "fresh" ? "well rested" : "rested"}, ${near}.`;
}

// C-334: when a talker is in the house, it picks one image from the INDEX entry to colour the piece -- a sound or a place
// in a few music words. Never shown; its answer is cleaned to music words before it reaches the music model.
export const SLEEP_SYSTEM = "You turn a creature's description into a sound for a lullaby. Answer with at most eight words: " +
  "one place or texture of sound that fits it (for example: \"wind through a pine forest\", \"waves on a shingle shore\"). " +
  "No names, no people, no punctuation but commas.";
export function sleepAsk(c: SleepContext): string {
  return `The creature: ${(c.entry ?? "").replace(/\s+/g, " ").slice(0, 300)}${c.category ? ` (the ${c.category} kind)` : ""}. ` +
         `Its types: ${typesOf(c.types).join(", ") || "unknown"}. The sound of the place it would sleep in:`;
}
export function cleanImage(t: string | null | undefined): string | null {
  const s = (t ?? "").split("\n")[0].replace(/["“”.]/g, "").replace(/[^\w ,'-]/g, "").trim().split(/\s+/).slice(0, 8).join(" ");
  return s.length >= 3 ? s.toLowerCase() : null;
}
