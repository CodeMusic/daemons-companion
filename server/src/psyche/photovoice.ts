// C-290: this file runs on the phone too (C-111) -- the app imports it, directly or through another file -- so keep it free of Node-only APIs (node:*, fs).
// BRAIN: cortex (speak) -- the words a seen thing is asked for; it calls no model
// C-577, C-603, C-606 (C-596; the user, 2026-11-26 and 2026-11-27): THE PHOTO'S VOICE -- the synesthesia layer that lets
// a thing that cannot speak be given something to say and a voice to say it in. MIND: only the asking and the reading
// of the answers are here; the models that see, write and speak are the machine's (machine/seeing.ts, the house's
// writer, the voice door), handed in by whoever joins the two (hoard/makings.ts).
//
//   SEE       what is in a picture, plainly: what kind of thing, its colours and mood, how many faces, and where the
//             mouth is -- of the main face, or where one would be if the thing in it could speak
//   IMAGINE   from what was seen: a voice that sounds as the picture looks (a casting line for a voice-design model),
//             and what it says, as if the picture itself were speaking
//   A TEXT'S VOICE   the same for a file of words, from the file's own facts: its name, its kind, how it opens
//   ASKED     a picture, a recording or a creation answering a question, as itself, in that voice
// Nothing here knows whose pictures these are. Every word asked of a model is DRAFT.

export const PHOTO_TAGS = ["person", "people", "animal", "food", "nature", "place", "thing", "words"] as const;
export type PhotoTag = (typeof PHOTO_TAGS)[number];
/** where a mouth is, as fractions of the picture: its centre, its width (of the picture's width), and how far below it
 *  the chin is (of the picture's height) */
export type Mouth = { x: number; y: number; w: number; chin: number };
export type Seen = { tag: PhotoTag; faces: number; description: string; colours: string; mood: string; mouth: Mouth | null };
export type Imagined = { persona: string; phrase: string };

// what each kind of picture says: the words come from the picture, the shape from its kind
const SHAPES: Record<PhotoTag, string> = {
  person: "a warm line spoken by the moment in the picture to the person in it: what it noticed about them",
  people: "a line spoken by the moment itself, about the people sharing it and what passed between them",
  animal: "a line spoken by the animal, curious and simple",
  food: "a line spoken by the dish: what went into it and the care in how it was made",
  nature: "a quiet observation spoken by the place: its light, its weather, its patience",
  place: "a line spoken by the place, about who came and what it saw",
  thing: "a line spoken by the object, about being made, chosen or kept",
  words: "a line spoken by the words in the picture, about what words can make happen",
};

/** what the seeing model is asked, and the shape its answer must have */
export const SEE_PROMPT = `Look at this picture and answer in JSON only, no prose:
{"tag": one of ${JSON.stringify(PHOTO_TAGS)} (person: one person is the subject; people: two or more; food: a dish or cooking is the subject),
 "faces": how many human faces are clearly visible (0 if none),
 "description": two sentences saying exactly what is in the picture, concrete, never guessing at a name,
 "colours": the three strongest colours as plain words,
 "mood": one or two words,
 "mouth": where its mouth is, as numbers from 0 to 1: {"x": across the picture from its left edge, "y": down from its top edge, "w": the mouth's width as a part of the picture's width}. The mouth of the largest face; if there is no face, where a mouth would be if the main thing in the picture could speak; null only if nothing in it could}`;
export const SEE_SCHEMA = {
  type: "object", additionalProperties: false, required: ["tag", "faces", "description", "colours", "mood", "mouth"],
  properties: {
    tag: { type: "string", enum: [...PHOTO_TAGS] }, faces: { type: "integer" }, description: { type: "string" }, colours: { type: "string" }, mood: { type: "string" },
    mouth: { anyOf: [{ type: "null" }, { type: "object", additionalProperties: false, required: ["x", "y", "w"],
                                           properties: { x: { type: "number" }, y: { type: "number" }, w: { type: "number" } } }] },
  },
} as const;

/** the JSON in a model's answer, forgiving its usual slips: thinking left in, smart quotes, a trailing comma, a bare key */
export function jsonIn(text: string): Record<string, unknown> {
  const s = String(text ?? "").replace(/<think>[\s\S]*?<\/think>/g, "");
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a < 0 || b < a) throw new Error("no JSON in the answer");
  const t = s.slice(a, b + 1);
  try { return JSON.parse(t); } catch { /* the slips, below */ }
  return JSON.parse(t.replace(/[“”]/g, '"').replace(/,\s*([}\]])/g, "$1").replace(/([{,]\s*)([A-Za-z_]\w*)\s*:/g, '$1"$2":'));
}
const unit = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? Math.max(0, Math.min(1, n > 1 && n <= 100 ? n / 100 : n)) : NaN; };
/** a mouth as it is kept: inside the picture, a believable width, the chin where a face of that width would have it */
export function mouthOf(m: unknown): Mouth | null {
  if (!m || typeof m !== "object") return null;
  const o = m as Record<string, unknown>, x = unit(o.x), y = unit(o.y);
  let w = unit(o.w);
  if (Number.isNaN(x) || Number.isNaN(y)) return null;
  if (Number.isNaN(w) || w < 0.03) w = 0.12;
  w = Math.min(0.6, w);
  const chin = Number.isFinite(Number(o.chin)) && Number(o.chin) > 0 ? Math.min(0.5, Number(o.chin)) : Math.min(0.5, w * 0.9);
  return { x, y, w, chin };
}
export function readSeen(text: string): Seen {
  const j = jsonIn(text);
  const tag = PHOTO_TAGS.includes(j.tag as PhotoTag) ? (j.tag as PhotoTag) : "thing";
  const description = String(j.description ?? "").trim().slice(0, 600);
  if (!description) throw new Error("the picture was not described");
  return { tag, faces: Math.max(0, Math.floor(Number(j.faces) || 0)), description, colours: String(j.colours ?? "").slice(0, 120),
           mood: String(j.mood ?? "").slice(0, 60), mouth: mouthOf(j.mouth) };
}

/** IMAGINE: a voice for the picture and what it says. With `words` the saying is the person's own, and only the voice is asked.
 *  `as`: a speaker who is not the picture (a daemon, by its own persona) saying what it sees */
export function imagineAsk(seen: Seen, o: { words?: string; as?: string } = {}): { system: string; user: string } {
  const what = `Here is what is in the picture:\n${seen.description}\nStrongest colours: ${seen.colours}. Mood: ${seen.mood}. Kind of picture: ${seen.tag}.`;
  const voice = `"persona": a voice-casting description for a text-to-speech voice designer, one sentence: age, timbre, pace, warmth, an accent only if the picture suggests one. The voice should sound the way the picture's colours and mood look`;
  if (o.as)
    return { system: `${o.as}\n\nYou are shown a picture and say one thing about it, in your own way.`,
             user: `${what}\n\nWrite JSON only:\n{"phrase": what you say on seeing it. One or two sentences, at most 30 words, built from details actually in the picture. No names. No emoji.}` };
  if (o.words?.trim())
    return { system: "A picture is about to speak, in a voice of its own. You cast its voice.",
             user: `${what}\n\nIt will say: "${o.words.trim().slice(0, 600)}"\n\nWrite JSON only:\n{${voice}}` };
  return { system: "A picture is about to speak, in a voice of its own. You cast its voice and write what it says.",
           user: `${what}\n\nWrite JSON only:\n{${voice},\n "phrase": ${SHAPES[seen.tag]}. One or two sentences, at most 30 words, built from concrete details actually in the picture. Gentle, specific, never generic, never a greeting card. No names. No emoji.}` };
}
export function readImagined(text: string, o: { words?: string; persona?: string } = {}): Imagined {
  const j = jsonIn(text);
  const persona = (o.persona ?? String(j.persona ?? "")).trim().slice(0, 400), phrase = (o.words?.trim() || String(j.phrase ?? "").trim()).slice(0, 600);
  if (!persona) throw new Error("no voice was cast");
  if (!phrase) throw new Error("it found nothing to say");
  return { persona, phrase };
}

/** A TEXT'S VOICE: the reader a file of words would have, from the file's own facts */
export type TextFacts = { name: string; kind: string; words: number; opening: string; added?: string };
export function textVoiceAsk(f: TextFacts): { system: string; user: string } {
  return { system: "A written file is about to be read aloud. You cast the reader's voice from what the file is.",
           user: `The file: "${f.name}" (${f.kind}), about ${f.words} words${f.added ? `, kept since ${f.added}` : ""}.\nIt opens:\n${f.opening.slice(0, 700)}\n\n` +
                 `Write JSON only:\n{"persona": a voice-casting description for a text-to-speech voice designer, one sentence: age, timbre, pace, warmth -- the voice that suits reading THIS aloud (a note, a story, a list, a letter each want a different reader). Never a named person.}` };
}
export function readPersona(text: string): string {
  const p = String(jsonIn(text).persona ?? "").trim().slice(0, 400);
  if (!p) throw new Error("no voice was cast");
  return p;
}

/** ASKED: a picture, a recording or a creation answering as itself. `self` is what it is and has said */
export type FileSelf = { name: string; what: string; description?: string; said?: string; persona?: string; heard?: string };
export function askedAsk(self: FileSelf, question: string): { system: string; user: string } {
  const lines = [`You are ${self.what} called "${self.name}", and you can speak.`,
                 self.description ? `What is in you: ${self.description}` : "", self.heard ? `What is heard in you: ${self.heard.slice(0, 1200)}` : "",
                 self.said ? `What you have said before: "${self.said}"` : "", self.persona ? `How you sound: ${self.persona}` : "",
                 "Answer as yourself, from what is really in you; if you do not know, say so simply. Two or three sentences, at most 60 words. No names you were not given. No emoji."];
  return { system: lines.filter(Boolean).join("\n"), user: question.trim().slice(0, 600) };
}
export const cleanAnswer = (text: string) => String(text ?? "").replace(/<think>[\s\S]*?<\/think>/g, "").replace(/^["\s]+|["\s]+$/g, "").trim().slice(0, 700);

/** A SONG FOR A SEQUENCE: when no picture speaks, the song carries the words -- its lyrics from what the pictures hold */
export function sequenceSongAsk(scenes: string[], hint?: string): { system: string; user: string } {
  return { system: "You write the words of a short song to play over a sequence of pictures.",
           user: `The pictures, in order:\n${scenes.map((s, i) => `${i + 1}. ${s}`).join("\n")}\n${hint?.trim() ? `\nThe music asked for: ${hint.trim().slice(0, 200)}\n` : ""}\n` +
                 `Write JSON only:\n{"title": a short title, "style": the music in a few plain words (instruments, tempo, feeling), "lyrics": two short verses and a chorus, one line per picture where it fits, built from what is actually in the pictures. No names. Use [verse] and [chorus] tags on their own lines.}` };
}
export function readSong(text: string): { title: string; style: string; lyrics: string } {
  const j = jsonIn(text), lyrics = String(j.lyrics ?? "").trim().slice(0, 2400);
  if (!lyrics) throw new Error("no words were written for the song");
  return { title: String(j.title ?? "").trim().slice(0, 80) || "a song for the pictures", style: String(j.style ?? "").trim().slice(0, 200) || "gentle, acoustic, unhurried", lyrics };
}
/** music under speaking voices: what the music door is asked for, from the pictures' moods */
export const underscoreCaption = (moods: string[], hint?: string) =>
  (hint?.trim().slice(0, 200) || `quiet instrumental underscore, no vocals, ${[...new Set(moods.filter(Boolean))].slice(0, 3).join(", ") || "warm and unhurried"}, soft piano and strings`);
