// 2026-11-05: a voice the hub sent, under the name its bytes say -- iOS decodes a file by its name, and a WAV (the
// Tiiny's voice) filed as .mp3 played as static. The hub sends MP3 to the phone now; this keeps a WAV playable too.
//
// And kept (the user, 2026-11-05: "for any content that is created, it should save it on the iPhone so it can replay it
// efficiently"): every voice made for a reading -- a dream, an INDEX entry, a page read aloud -- is kept in the app's own
// documents, by what was read, and played from there the next time; only a voice never heard is asked of the hub.
// A talk's answer is kept too, so it can be heard again. The oldest go when the kept voices pass KEEP_BYTES.
import { Directory, File, Paths } from "expo-file-system";
import { apiLater } from "./net";
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

function tidy() {
  const files = kept().list().filter((x): x is File => x instanceof File)
    .map((f) => ({ f, size: f.size ?? 0, at: f.modificationTime ?? 0 })).sort((x, y) => y.at - x.at);
  let total = 0;
  for (const x of files) { total += x.size; if (total > KEEP_BYTES) x.f.delete(); }
}

// Every kept voice forgotten (a new INDEX voice, say): how many went
export function forgetVoices(): number {
  const files = kept().list().filter((x): x is File => x instanceof File);
  files.forEach((f) => f.delete());
  return files.length;
}

// A reading's voice: the kept one if it was made before, else the hub's, kept. It is known by its words, or by the
// species for an INDEX entry the phone was not given the words of. null when no voice came.
// C-303: {own: true} is what the daemon says of itself, in its own voice -- kept by its words (`said`) as well as its
// species, so a telling that is rewritten is asked for again and never heard stale.
// Bumped when the daemons' own voices change (voices.ts), so a telling kept in an old voice is made again -- 2: each
// species a voice of its own (2026-11-05)
const OWN_VOICES = 2;
export async function readingVoice(body: { text?: string; species?: number; own?: boolean }, said?: string): Promise<File | null> {
  const words = body.text !== undefined ? `text:${body.text}` : body.own ? `said:${OWN_VOICES}:${body.species}:${said ?? ""}` : `species:${body.species}`;
  const had = keptVoice(words);
  if (had) return had;
  const spoken = await apiLater<Spoken>("/api/ai/speak", body);
  return spoken.audioBase64 ? keepVoice(words, spoken.audioBase64) : null;
}
