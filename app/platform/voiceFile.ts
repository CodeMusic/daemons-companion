// 2026-11-05: a voice the hub sent, under the name its bytes say -- iOS decodes a file by its name, and a WAV (the
// Tiiny's voice) filed as .mp3 played as static. The hub sends MP3 to the phone now; this keeps a WAV playable too.
//
// And kept (the user, 2026-11-05: "for any content that is created, it should save it on the iPhone so it can replay it
// efficiently"): every voice made for a reading -- a dream, an INDEX entry, a page read aloud -- is kept in the app's own
// documents, by what was read, and played from there the next time; only a voice never heard is asked of the hub.
// A talk's answer is kept too, so it can be heard again. The oldest go when the kept voices pass KEEP_BYTES.
//
// C-303 (the user, 2026-11-06): only the TRUE voice is kept -- the hub says `final` when the voice is the one meant (the
// Tiiny's, in the daemon's own recipe). A voice that fell back to the hub's own is played once and not kept, "that way if
// I retry it will try to make the true voice". And every kept voice is under the voices' GENERATION the hub names
// (ai/voices.ts; MAKE THE VOICES AGAIN in the app's settings bumps it): when the hub's differs from the one the phone kept
// its voices under, it forgets them all and asks again, so a newer voice is heard without a new build.
import { Directory, File, Paths } from "expo-file-system";
import { api, apiLater, ON_PHONE } from "./net";
import type { Spoken } from "../state/types";

export const voiceExt = (b64: string) => (b64.startsWith("UklGR") ? "wav" : "mp3");   // "UklGR": RIFF, base64

export function voiceFile(prefix: string, b64: string): File {
  const f = new File(Paths.cache, `${prefix}-${Date.now()}.${voiceExt(b64)}`);
  f.create(); f.write(b64, { encoding: "base64" });
  return f;
}

export const KEEP_BYTES = 150 * 1024 * 1024;   // about five hours of the hub's 64 kbit MP3

// FNV-1a over the words, two ways, as hex: a file name that is the same for the same words, and short
export function keyOf(words: string): string {
  let a = 0x811c9dc5, b = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < words.length; i++) {
    const c = words.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x5bd1e995) >>> 0;
  }
  return a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0");
}

const kept = () => { const d = new Directory(Paths.document, "voices"); if (!d.exists) d.create({ intermediates: true, idempotent: true }); return d; };

// A voice already kept for these words, or null
export function keptVoice(words: string): File | null {
  const k = keyOf(words);
  for (const ext of ["mp3", "wav"]) { const f = new File(kept(), `${k}.${ext}`); if (f.exists) return f; }
  return null;
}

// Keep a voice for these words, and make room by forgetting the oldest
export function keepVoice(words: string, b64: string): File {
  const f = new File(kept(), `${keyOf(words)}.${voiceExt(b64)}`);
  if (f.exists) f.delete();
  f.create(); f.write(b64, { encoding: "base64" });
  try { tidy(); } catch { /* a full tidy next time */ }
  return f;
}

// C-317: a voice streamed from the hub, kept whole once it has all come (the hub sends the whole to a late asker): its
// link fetched again into the kept voices, under these words. null on the site, or when it could not be fetched.
export async function keepStreamed(words: string, url: string): Promise<File | null> {
  if (!ON_PHONE) return null;
  try {
    const f = new File(kept(), `${keyOf(words)}.mp3`);
    if (f.exists) f.delete();
    const got = await File.downloadFileAsync(url, f);
    try { tidy(); } catch { /* a full tidy next time */ }
    return got.exists && (got.size ?? 0) > 0 ? got : null;
  } catch { return null; }
}

function tidy() {
  const files = kept().list().filter((x): x is File => x instanceof File)
    .map((f) => ({ f, size: f.size ?? 0, at: f.modificationTime ?? 0 })).sort((x, y) => y.at - x.at);
  let total = 0;
  for (const x of files) { total += x.size; if (total > KEEP_BYTES) x.f.delete(); }
}

// Every kept voice forgotten (a new INDEX voice, say): how many went
export function forgetVoices(): number {
  const files = kept().list().filter((x): x is File => x instanceof File && !isMark(x));
  files.forEach((f) => f.delete());
  return files.length;
}

// --- the generation the kept voices were made in: a mark beside them, and the hub's word, asked once a run ---
const MARK = "generation.txt";
const isMark = (f: File) => f.name === MARK;
const markFile = () => new File(kept(), MARK);
const keptGeneration = (): string => { try { const m = markFile(); return m.exists ? m.textSync().trim() : ""; } catch { return ""; } };
const markGeneration = (g: string) => { try { const m = markFile(); if (!m.exists) m.create(); m.write(g); } catch { /* next time */ } };
let generationAsked: Promise<string> | null = null;
export function forgetGeneration() { generationAsked = null; }   // ask the hub again (after MAKE THE VOICES AGAIN)

// The voices' generation: the hub's if it answers, else the one the kept voices were made in (so a voice heard once
// still plays away from home), else "0". When the hub's differs from the kept one, every kept voice goes.
export function voiceGeneration(): Promise<string> {
  if (!generationAsked) {
    generationAsked = (async () => {
      const had = keptGeneration();
      let g = had;
      try { g = String((await api<{ generation: string }>("/api/voices/generation")).generation || had); }
      catch { generationAsked = null; }                      // not reached: the kept one for now, and the hub asked again next time
      if (g && g !== had) { forgetVoices(); markGeneration(g); }
      return g || "0";
    })();
  }
  return generationAsked;
}

// A reading's voice: the kept one if it was made before, else the hub's -- kept only when the hub says it is the true
// voice (`final`). It is known by its words, or by the species for an INDEX entry the phone was not given the words of.
// null when no voice came.
// C-303: {own: true} is what the daemon says of itself, in its own voice -- kept by its words (`said`) as well as its
// species, so a telling that is rewritten is asked for again and never heard stale.
export async function readingVoice(body: { text?: string; species?: number; own?: boolean }, said?: string): Promise<File | null> {
  const g = await voiceGeneration();
  const words = body.text !== undefined ? `text:${g}:${body.text}` : body.own ? `said:${g}:${body.species}:${said ?? ""}`
              : `species:${g}:${body.species}`;
  const had = keptVoice(words);
  if (had) return had;
  const spoken = await apiLater<Spoken>("/api/ai/speak", body);
  if (!spoken.audioBase64) return null;
  if (spoken.generation && spoken.generation !== g) {        // the hub moved on while this ran: start over from its word
    forgetVoices(); markGeneration(spoken.generation); forgetGeneration();
  }
  // a fallback voice (the hub's own, not the daemon's) is played from the cache folder once and never kept
  return spoken.final === true ? keepVoice(words, spoken.audioBase64) : voiceFile("once", spoken.audioBase64);
}
