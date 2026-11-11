// C-331 (1): a chapter's span in a book's recording, found by its title as the shelf names it
import { describe, expect, it } from "vitest";
import { RECORDED, spanOf, titleKey } from "../src/bookrecordings.js";

const marks = { sources: "abc", chapters: [
  { kind: "section", title: "Introduction", start: 10.27, end: 13.03 },
  { kind: "entry", title: "Understanding the Mind as Software", start: 13.03, end: 56 },
  { kind: "entry", title: "Empty", start: 60, end: 60 },
] };

describe("book recordings", () => {
  it("finds a chapter by its title, whatever its case and punctuation", () => {
    expect(spanOf(marks, "UNDERSTANDING THE MIND AS SOFTWARE")).toEqual({ start: 13.03, end: 56 });
    expect(titleKey("The Mind -- as  Software!")).toBe("the mind as software");
  });
  it("has nothing for a chapter the recording does not mark, or one with no length", () => {
    expect(spanOf(marks, "A page of the NOTEBOOK")).toBeNull();
    expect(spanOf(marks, "Empty")).toBeNull();
  });
  it("offers only the open books, never a sealed one", () => {
    expect(Object.keys(RECORDED).sort()).toEqual(["guide", "subtle"]);
  });
});
