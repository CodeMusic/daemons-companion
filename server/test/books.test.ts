import { describe, expect, it } from "vitest";
import { bookList, booksOf, chapterOf, readable, READ_MAX } from "../src/books.js";
import { guideOf } from "../src/save/guide.js";

const subtle = { held: true, title: "THE SUBTLE LAYER", sections: [{ label: "I", heading: "I", entries: [
  { short: "P", title: "A Word First", picture: "", caption: "", paragraphs: [{ text: "One.", voice: "telling" as const }, { text: "Two?", voice: "asking" as const }] }] }] };
const notebook = { held: true, sections: [{ name: "SCHOOL NOTES", pages: [
  { title: "1F LANGUAGE", kind: "text", about: null, text: "TOPICS: NAMES,\nPIECES.\n\nPASS MARK: 80.", unread: false, place: null, link: null },
  { title: "A PICTURE", kind: "picture", about: null, text: null, unread: false, place: null, link: null }] }] };

describe("C-208: the books, as a board reads them", () => {
  it("lists only the books held, and the NOTEBOOK's pages with words", () => {
    const books = booksOf(subtle as any, { held: false }, notebook as any);
    expect(bookList(books)).toEqual([
      { id: "subtle", title: "THE SUBTLE LAYER", chapters: ["A Word First"] },
      { id: "notebook", title: "THE NOTEBOOK", chapters: ["SCHOOL NOTES: 1F LANGUAGE"] }]);
    expect(chapterOf(books, "notebook", 0)?.paragraphs).toEqual(["TOPICS: NAMES, PIECES.", "PASS MARK: 80."]);
    expect(chapterOf(books, "guide", 0)).toBeNull();
  });
  it("lists the GUIDE once it is found", () => {
    const g = guideOf(() => true);
    const books = booksOf({ held: false }, g, { held: false, sections: [] } as any);
    expect(books[0].id).toBe("guide");
    expect(books[0].chapters.length).toBeGreaterThan(0);
  });
  it("cuts a long paragraph at its sentences, each short enough to say at once", () => {
    const long = Array.from({ length: 40 }, (_, i) => `Sentence number ${i} is here.`).join(" ");
    const parts = readable([long]);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((p) => p.length <= READ_MAX)).toBe(true);
    expect(parts.join(" ")).toBe(long);
  });
});
