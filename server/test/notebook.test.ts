// C-125: the NOTEBOOK on the phone holds exactly the pages the save's flags hold, by notebook.c's own rule.
import { describe, expect, it } from "vitest";
import { notebookOf } from "../src/save/notebook.js";
import nb from "../data/notebook.json" with { type: "json" };
import layout from "../data/profile_layout.json" with { type: "json" };

describe("the NOTEBOOK", () => {
  it("holds nothing with no flags", () => {
    expect(notebookOf(() => false, "CHRIS", "AL")).toMatchObject({ held: false, sections: [] });
  });
  it("holds a page once its flag is set, in its section, with its words", () => {
    const page = nb.pages.find((p) => p.text && !p.flag2)!;
    const held = new Set([layout.flags.notebook, page.flag]);
    const n = notebookOf((f) => held.has(f), "CHRIS", "AL");
    expect(n.held).toBe(true);
    expect(n.sections).toEqual([{ name: nb.sections[page.section], pages: [{ title: page.title, about: page.about, text: page.text,
      unread: (page as { seen?: number | null }).seen != null, place: (page as { place?: string | null }).place ?? null,
      link: (page as { link?: string | null }).link ?? null, kind: page.kind }] }]);
  });
  it("wants both flags of a page that has two", () => {
    const page = nb.pages.find((p) => p.flag2);
    if (!page) return;
    expect(notebookOf((f) => f === page.flag, "C", "A").sections).toEqual([]);
  });
  it("names the rival as the save does", () => {
    const n = notebookOf(() => true, "CHRIS", "AL");
    const all = n.sections.flatMap((s) => s.pages).map((p) => p.text ?? "").join(" ");
    expect(all).not.toContain("{RIVAL}");
    expect(all).not.toContain("{PLAYER}");
    expect(n.sections.map((s) => s.name)).toEqual(nb.sections.filter((_, i) => nb.pages.some((p) => p.section === i)));
  });
});
