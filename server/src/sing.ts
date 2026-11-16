// Runs on the phone too (C-111): no node: imports.
// C-362, C-387: THE DAEMON SINGS -- the song's words. What the daemon is asked (its persona of the day and the kind of
// song), and how its answer is read into a title, a style, lyrics and a line about it. MIND: the singer. The music door
// that sings it and the files it is kept in are songs.ts (MACHINE), and api.ts joins them. Every word DRAFT.

export type SingMode = "prompt" | "lyrics" | "own";

export const SING_SYSTEM =
  "You are a small creature who sings. You will be told who you are today and what kind of song to make. Write the song " +
  "as yourself, coloured by your day, your feelings and your own way of seeing. Never name a real person and never write " +
  "anything cruel. Answer with JSON only, no other words: {\"title\": 2 to 6 words, \"style\": a comma-separated list of " +
  "music words for a music model -- genre, instruments, tempo, mood, and the singing voice -- under 40 words, \"lyrics\": " +
  "the song's words with [verse] and [chorus] on their own lines, 8 to 24 short lines, \"about\": one sentence in your " +
  "own voice about the song, under 30 words}.";
export function singAsk(mode: SingMode, persona: string, voice: string, request: string, styleGuide: string): string {
  const who = `Who you are today:\n${persona}\n\nYour singing voice: ${voice}.`;
  if (mode === "lyrics")
    return `${who}\n\nSing these words exactly as they are -- give "lyrics" back unchanged, only adding [verse] and [chorus] ` +
           `lines if they have none:\n${request}\n\n${styleGuide ? `Sing them in this style: ${styleGuide}` : "Choose the style yourself."}`;
  if (mode === "prompt")
    return `${who}\n\nWrite and sing a song about: ${request}${styleGuide ? `\n\nIn this style: ${styleGuide}` : ""}`;
  return `${who}\n\nWrite and sing a song of your own, about whatever is on your mind today -- your days, the one who cares ` +
         `for you, what you hope for.${styleGuide ? `\n\nIn this style: ${styleGuide}` : ""}`;
}
export type Sung = { title: string; style: string; lyrics: string; about: string };
const clean = (s: unknown, most: number) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, most);
export const musicWords = (s: string) => plain(s).replace(/[^\w ,.'()/&+:-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 400);
// curly quotes made plain first, so "I’ll" keeps its apostrophe
const plain = (s: string) => s.replace(/[\u2018\u2019\u02bc]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/[\u2013\u2014]/g, "-");
export const lyricWords = (s: string) => plain(s).replace(/\r/g, "").replace(/[^\w \n,.'!?()[\]:;-]/gu, "").replace(/\n{3,}/g, "\n\n").trim().slice(0, 3000);
export function readSong(text: string | null | undefined, mode: SingMode, request: string, styleGuide: string): Sung {
  const raw = String(text ?? "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  let j: Record<string, unknown> = {};
  const m = raw.match(/\{[\s\S]*\}/);
  if (m) try { j = JSON.parse(m[0]); } catch { /* below */ }
  const given = lyricWords(request);
  const lyrics = mode === "lyrics" ? (/\[(verse|chorus)/i.test(String(j.lyrics ?? "")) && given.length > 0
                                       ? lyricWords(String(j.lyrics)) : `[verse]\n${given}`)
                                   : lyricWords(String(j.lyrics ?? ""));
  const firstLine = lyrics.split("\n").find((l) => l.trim() && !l.startsWith("[")) ?? "";
  return { title: clean(j.title, 60) || clean(firstLine, 40).toUpperCase() || "UNTITLED",
           style: musicWords(String(j.style ?? styleGuide ?? "")) || musicWords(styleGuide) || "gentle acoustic pop, warm voice",
           lyrics, about: clean(j.about, 240) };
}
// the style as the music model hears it: the daemon's words, its voice, and that it is sung
export const captionOf = (style: string, voice: string) => musicWords(`${style}, vocals: ${voice}, sung clearly, a full song`);

