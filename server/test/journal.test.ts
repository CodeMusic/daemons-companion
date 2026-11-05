// C-298: the JOURNAL -- journals, titled entries, and SUMMARIZE closing a chapter of what is new since the last one
import { describe, expect, it } from "vitest";
import { Store } from "../src/db.js";
import { route } from "../src/routes.js";
import type { Host } from "../src/core.js";
import { chapterWords, journalOf, plainPage, readPage, writeChapter, writePage, STALE_MIN } from "../src/journal.js";

const h: Host = { edition: "CONTENT", save: { read: () => null, write: () => null } };
const post = (store: Store, path: string, body: object, now = new Date("2026-11-05T12:00:00Z")) =>
  route(h, store, { method: "POST", path, body, deviceId: "phone" }, now);

describe("C-298: the JOURNAL", () => {
  it("keeps several journals, each titled, and their titled entries, newest first", () => {
    const s = new Store(":memory:");
    const a = post(s, "/api/journal", { title: "Autumn" }), b = post(s, "/api/journal", { title: "Work" });
    expect(a.status).toBe(201);
    const id = (a.body as any).id;
    post(s, "/api/journal/entry", { journal: id, title: "First frost", body: "The grass was white." });
    const r = post(s, "/api/journal/entry", { journal: id, title: "", body: "A walk by the river." });
    expect((r.body as any).entries.map((e: any) => e.body)).toEqual(["A walk by the river.", "The grass was white."]);
    expect((route(h, s, { method: "GET", path: "/api/journals", body: {}, deviceId: "p" }).body as any).journals).toHaveLength(2);
    expect(post(s, "/api/journal", { title: "  " }).status).toBe(400);
    expect(post(s, "/api/journal/entry", { journal: (b.body as any).id }).status).toBe(400);
  });
  it("SUMMARIZE closes a chapter of what is new since the last, and refuses with nothing new", () => {
    const s = new Store(":memory:");
    const id = (post(s, "/api/journal", { title: "Autumn" }).body as any).id;
    for (const t of ["one", "two"]) post(s, "/api/journal/entry", { journal: id, title: t, body: `entry ${t}` });
    const r = post(s, "/api/journal/summarize", { journal: id });
    expect((r.body as any).writing).toBeGreaterThan(0);
    expect((r.body as any).chapters[0]).toMatchObject({ n: 1, count: 2, state: "writing" });
    expect((r.body as any).waiting).toBe(0);
    expect(post(s, "/api/journal/summarize", { journal: id }).status).toBe(400);
    post(s, "/api/journal/entry", { journal: id, title: "three", body: "entry three" });
    const r2 = post(s, "/api/journal/summarize", { journal: id });
    expect((r2.body as any).chapters[0]).toMatchObject({ n: 2, count: 1 });
    expect(chapterWords(s, (r2.body as any).writing)!.entries.map((e) => e.title)).toEqual(["three"]);
  });
  it("writes the page by the thinker, plainly without one, and a stale one shows as failed", async () => {
    const s = new Store(":memory:");
    const id = (post(s, "/api/journal", { title: "Autumn" }).body as any).id;
    post(s, "/api/journal/entry", { journal: id, title: "Frost", body: "The grass was white and I was glad." });
    const ch = (post(s, "/api/journal/summarize", { journal: id }).body as any).writing;
    let asked = "";
    await writeChapter(s, ch, async (_sys, user) => { asked = user; return "TITLE: A White Morning\n\nYou woke to frost."; });
    expect(asked).toContain("Frost");
    expect(journalOf(s, id)!.chapters[0]).toMatchObject({ state: "done", title: "A White Morning", body: "You woke to frost.", by: "thinker" });
    post(s, "/api/journal/entry", { journal: id, title: "Rain", body: "It rained." });
    const ch2 = (post(s, "/api/journal/summarize", { journal: id }).body as any).writing;
    await writeChapter(s, ch2, async () => null);
    expect(journalOf(s, id)!.chapters[0]).toMatchObject({ state: "failed" });
    const plain = post(s, "/api/journal/plain", { journal: id, chapter: ch2 });
    expect((plain.body as any).chapters[0]).toMatchObject({ state: "done", by: "plain" });
    expect((plain.body as any).chapters[0].body).toContain("It rained.");
    post(s, "/api/journal/entry", { journal: id, title: "Wind", body: "Windy." });
    post(s, "/api/journal/summarize", { journal: id }, new Date("2026-11-05T12:00:00Z"));
    const later = new Date(Date.parse("2026-11-05T12:00:00Z") + (STALE_MIN + 1) * 60_000);
    expect(journalOf(s, id, later)!.chapters[0].state).toBe("failed");
  });
  it("reads a page's title however the thinker dressed it, and asks in stretches when it is long", async () => {
    expect(readPage("**TITLE:** Leaves\n\nYou raked.", { journal: "A", n: 1 })).toEqual({ title: "Leaves", body: "You raked." });
    expect(readPage("You raked.", { journal: "A", n: 2 }).title).toBe("A, chapter 2");
    const long = Array.from({ length: 6 }, (_, i) => ({ title: `day ${i}`, body: "word ".repeat(700), at: "2026-11-01T10:00:00Z" }));
    const asks: string[] = [];
    await writePage({ journal: "Long", n: 1, entries: long }, async (sys) => { asks.push(sys); return "TITLE: T\n\nB"; });
    expect(asks.length).toBeGreaterThan(2);
    expect(plainPage({ journal: "A", n: 1, entries: long }).body.length).toBeLessThan(3000);
  });
});
