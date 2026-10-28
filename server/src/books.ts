// C-208 (the user, 2026-10-28: "you should be able to read both of these books from the watch ultra also ... hit a
// button allowing the watch or app to read you the selected chapter aloud for either/any of these books, including
// notes"; by multiple choice: THE SUBTLE LAYER, the GUIDE and the NOTEBOOK): the books the save holds, as a board reads
// them -- a list of chapters, then one chapter as plain paragraphs, each short enough to be read aloud in one go (the
// INDEX voice takes 600 characters at a time). A book not yet found is not listed (a find stays findable blind, T-297);
// the NOTEBOOK's chapters are its pages that have words. No node: imports (a phone hosting alone serves them too).
import type { Guide } from "./save/guide.js";
import type { Subtle } from "./save/subtle.js";
import type { Notebook } from "./save/notebook.js";

export type BookId = "subtle" | "guide" | "notebook";
export type Chapter = { title: string; paragraphs: string[] };
export type Book = { id: BookId; title: string; chapters: Chapter[] };
export const READ_MAX = 560;                                  // a paragraph read aloud in one go, under the voice's 600

// the game's text wraps at the screen's width: its lines joined back into sentences, a blank line a paragraph
const prose = (t: string) => t.split(/\n\s*\n/).map((p) => p.replace(/\s*\n\s*/g, " ").replace(/\s+/g, " ").trim()).filter(Boolean);
// a paragraph too long to say at once, cut at its sentences (or, failing that, its words)
export function readable(paragraphs: string[]): string[] {
  const out: string[] = [];
  for (const p of paragraphs) {
    if (p.length <= READ_MAX) { out.push(p); continue; }
    let cur = "";
    for (const s of p.match(/[^.!?]+[.!?]*\s*/g) ?? [p]) {
      if ((cur + s).length > READ_MAX && cur) { out.push(cur.trim()); cur = ""; }
      if (s.length > READ_MAX) for (const w of s.split(" ")) { if ((cur + w).length > READ_MAX) { out.push(cur.trim()); cur = ""; } cur += w + " "; }
      else cur += s;
    }
    if (cur.trim()) out.push(cur.trim());
  }
  return out;
}

export function booksOf(subtle: Subtle, guide: Guide, notebook: Notebook): Book[] {
  const books: Book[] = [];
  if (subtle.held && subtle.sections)
    books.push({ id: "subtle", title: subtle.title ?? "THE SUBTLE LAYER", chapters: subtle.sections.flatMap((s) =>
      s.entries.map((e) => ({ title: e.title, paragraphs: readable(e.paragraphs.map((p) => p.text)) }))) });
  if (guide.held && guide.sections)
    books.push({ id: "guide", title: guide.title ?? "THE GUIDE", chapters: (guide.sections as any[]).flatMap((s) =>
      (s.entries as { title: string; paragraphs: string[] }[]).map((e) => ({ title: e.title, paragraphs: readable(e.paragraphs) }))) });
  if (notebook.held)
    books.push({ id: "notebook", title: "THE NOTEBOOK", chapters: notebook.sections.flatMap((s) =>
      s.pages.filter((p) => p.text).map((p) => ({ title: `${s.name}: ${p.title}`, paragraphs: readable(prose(p.text!)) }))) });
  return books;
}
// what a board is sent: the books and their chapters' titles; then one chapter at a time
export const bookList = (books: Book[]) => books.map((b) => ({ id: b.id, title: b.title, chapters: b.chapters.map((c) => c.title) }));
export function chapterOf(books: Book[], id: string, n: number): Chapter | null {
  return books.find((b) => b.id === id)?.chapters[n] ?? null;
}
