// The hub's only (it runs ffmpeg and keeps files): never imported by core.ts or routes.ts.
// C-331 (1) (the user, 2026-11-11, by multiple choice: "Books' real recordings"): a book's own recording -- the one LISTEN
// plays in the app (DAEMONS tools/bookaudio.py, published at docs/books/audio/, each book in its own voice) -- cut at one
// chapter and sent as a board plays a voice: raw 16 kHz mono 16-bit PCM. The T-Watch Ultra keeps each on its card and
// plays it there after, with no network. A chapter is found by its title in the recording's chapter marks (the shelf's
// chapters are the books' entries, and bookaudio.py marks each entry). The recording is fetched once per reading
// (`sources`, its hash), kept beside the database, and each chapter cut from it once. A sealed book's recording is
// sealed (its key is in the book), so only the open ones are offered.
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FOUND_FFMPEG } from "./ai/voice.js";

const AUDIO = "https://raw.githubusercontent.com/CodeMusic/DAEMONS/main/docs/books/audio/";
// a shelf book (books.ts BookId) -> its recording's file (app/ui/bookAudio.tsx BOOKS)
export const RECORDED: Record<string, string> = { guide: "guide", subtle: "the-subtle-layer" };
type Mark = { kind: string; title: string; start: number; end: number };
type Marks = { sources?: string; duration?: number; chapters: Mark[] };
const MARKS_FOR_MS = 60 * 60 * 1000;
export const titleKey = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// the span of a recording that reads one chapter, by its title; null when the recording has no such chapter
export function spanOf(m: Marks, title: string): { start: number; end: number } | null {
  const want = titleKey(title), c = m.chapters.find((x) => titleKey(x.title) === want);
  return c && c.end > c.start ? { start: c.start, end: c.end } : null;
}

export class BookRecordings {
  private marks = new Map<string, { at: number; m: Marks }>();
  private cutting = new Map<string, Promise<string | null>>();
  constructor(private dir: string, private get: typeof fetch = fetch) {}

  async marksOf(book: string): Promise<Marks | null> {
    const file = RECORDED[book];
    if (!file) return null;
    const had = this.marks.get(file);
    if (had && Date.now() - had.at < MARKS_FOR_MS) return had.m;
    try {
      const r = await this.get(`${AUDIO}${file}.chapters.json`, { signal: AbortSignal.timeout(15000) });
      if (!r.ok) return had?.m ?? null;
      const m = (await r.json()) as Marks;
      this.marks.set(file, { at: Date.now(), m });
      return m;
    } catch { return had?.m ?? null; }
  }
  // the chapter's PCM file, cut once; null when the book or chapter has no recording, or ffmpeg is missing
  async chapter(book: string, title: string): Promise<string | null> {
    const m = await this.marksOf(book), file = RECORDED[book];
    const span = m && spanOf(m, title);
    if (!span || !file || !FOUND_FFMPEG) return null;
    const reading = (m!.sources ?? "unmarked").replace(/[^a-z0-9]/gi, "");
    const here = join(this.dir, file, reading), out = join(here, createHash("sha1").update(titleKey(title)).digest("hex").slice(0, 16) + ".pcm");
    if (existsSync(out)) return out;
    const busy = this.cutting.get(out);
    if (busy) return busy;
    const job = this.cut(file, here, span, out).finally(() => this.cutting.delete(out));
    this.cutting.set(out, job);
    return job;
  }
  private async cut(file: string, here: string, span: { start: number; end: number }, out: string): Promise<string | null> {
    mkdirSync(here, { recursive: true });
    const mp3 = join(here, "book.mp3");
    if (!existsSync(mp3)) {
      const r = await this.get(`${AUDIO}${file}.mp3`, { signal: AbortSignal.timeout(300000) });
      if (!r.ok) return null;
      writeFileSync(mp3 + ".part", new Uint8Array(await r.arrayBuffer()));
      renameSync(mp3 + ".part", mp3);
    }
    const ok = await new Promise<boolean>((done) => execFile(FOUND_FFMPEG!,
      ["-v", "error", "-y", "-ss", String(span.start), "-to", String(span.end), "-i", mp3, "-ac", "1", "-ar", "16000", "-f", "s16le", out + ".part"],
      { timeout: 120000 }, (e) => done(!e)));
    if (!ok) return null;
    renameSync(out + ".part", out);
    return out;
  }
}
