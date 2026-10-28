// C-229, C-230: ASK THE SUBTLE LAYER -- a line from its nearest page and a question back, or TWO VOICES' asking voice; its
// part of the day (the centre, the word, the note); the daily question and its journal; the GUIDE's virtue now and then.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../src/db.js";
import { answerOf, askingVoice, guideAside, journalOf, keepAnswer, questionBack, subtleLine, subtlePages, todaysQuestion, type Day } from "../src/subtleask.js";
import { makeServer } from "../src/api.js";
import { DEFAULTS } from "../src/config.js";
import { buildSave } from "./build_save.js";
import subtle from "../data/subtle.json" with { type: "json" };
import layout from "../data/profile_layout.json" with { type: "json" };

const book = { held: true, sections: subtle.sections } as any;
const friday: Day = { day: "Friday", chakra: "Third Eye", note: "A", theme: "Intuition" };
const told = new Set((subtle.sections as any[]).flatMap((s) => s.entries).flatMap((e: any) =>
  e.paragraphs.filter((p: any) => p.voice === "telling").map((p: any) => p.text.replace(/\s+/g, " "))));

describe("C-229: a line from its nearest page", () => {
  it("draws the book's own sentence, from the page nearest the question", () => {
    const l = subtleLine(book, "How do I tell a read from imagination?", "2026-10-30")!;
    expect(l.title).toMatch(/Telling a Read from Imagination/);
    expect([...told].some((p) => p.includes(l.line.replace(/\.\.\.$/, "")))).toBe(true);
    expect(subtleLine(book, "How do I tell a read from imagination?", "2026-10-30")).toEqual(l);   // the same day, the same line
  });
  it("still answers when no page is near, and never before the book is held", () => {
    expect(subtleLine(book, "zzz qqq", "2026-10-30")!.line.length).toBeGreaterThan(12);
    expect(subtleLine({ held: false }, "anything", "2026-10-30")).toBeNull();
  });
  it("gives the shared thinker one page, under the window", () => {
    expect(subtlePages(book)("telling a read from imagination", 170)).toMatch(/^The page .+ says: /);
    expect(subtlePages(book)("telling a read from imagination", 170).length).toBeLessThan(260);
  });
});

describe("C-229: the question back, TWO VOICES, and the day's part", () => {
  it("turns the asker to what they notice, sometimes in the day's centre, word or note", () => {
    const backs = new Set(Array.from({ length: 40 }, (_, i) => questionBack(`question ${i}`, friday, "2026-10-30")));
    expect(backs.size).toBeGreaterThan(4);
    expect([...backs].some((b) => b.includes("Third Eye") || b.includes("Intuition") || b.includes("Hum A"))).toBe(true);
    for (const b of backs) expect(b).toMatch(/\?$|points\.$|centre is the Third Eye\.$/);
  });
  it("asks what a word of yours means, in the asking voice only", () => {
    expect(askingVoice("I feel stuck at work", 0, friday)).toBe("What does \"stuck\" mean, here?");
    expect(askingVoice("ok", 0, friday)).toBe("What breaks it?");
    const a = answerOf(book, "I feel stuck", "voices", 1, friday, "2026-10-30");
    expect(a).toMatchObject({ mode: "voices", line: "", back: "" });
    expect(a.asking).toMatch(/stuck/);
  });
  it("lets the GUIDE end on the day's virtue over its shadow, now and then", () => {
    const asides = Array.from({ length: 30 }, (_, i) => guideAside(`q${i}`, "Kindness over Envy", "2026-10-30"));
    expect(asides.filter(Boolean).length).toBeGreaterThan(3);
    expect(asides.filter(Boolean).length).toBeLessThan(20);
    expect(asides.find(Boolean)).toBe("Today: Kindness over Envy.");
  });
});

describe("C-230: the daily question, and the journal", () => {
  it("asks one question a day, set in the day", () => {
    const q = todaysQuestion("2026-10-30", friday);
    expect(todaysQuestion("2026-10-30", friday)).toEqual(q);
    expect(q).toMatchObject({ centre: "Third Eye", note: "A", word: "Intuition" });
    expect(q.question).not.toMatch(/\{/);
  });
  it("keeps one answer a day, the newest first", () => {
    const store = new Store(":memory:");
    expect(keepAnswer(store, todaysQuestion("2026-10-30", friday), "   ")).toBe("an answer is a few words");
    keepAnswer(store, todaysQuestion("2026-10-29", friday), "a still morning");
    keepAnswer(store, todaysQuestion("2026-10-30", friday), "first");
    keepAnswer(store, todaysQuestion("2026-10-30", friday), "second thoughts");
    expect(journalOf(store).map((k) => [k.date, k.answer])).toEqual([["2026-10-30", "second thoughts"], ["2026-10-29", "a still morning"]]);
  });
});

// ---- through the server: only once the book is held -------------------------------------------------------------------
function serve(held: boolean) {
  const dir = mkdtempSync(join(tmpdir(), "subtleask-")), savePath = join(dir, "copy.sav");
  const P = layout as any, f = subtle.flag;
  writeFileSync(savePath, buildSave({ player: "ROVER", trainerId: 7, slots: [
    { counter: 1, party: [{ personality: 100, otId: 7, species: 4, nickname: "LABEL", level: 9, away: true }] }, { counter: 0, party: [] }],
    edit: (sb2, sb1) => {
      if (!held) return;
      if (f < P.flags.daemons_flags_start) sb1[P.sb1.flags + (f >> 3)] |= 1 << (f & 7);
      else { const g = f - P.flags.daemons_flags_start; sb2[P.sb2.daemons_flags + (g >> 3)] |= 1 << (g & 7); }
    } }));
  return makeServer({ ...DEFAULTS, database: ":memory:", savePath });
}
const servers = { held: serve(true), not: serve(false) };
const base = { held: "", not: "" };
beforeAll(async () => {
  for (const k of ["held", "not"] as const) {
    await new Promise<void>((r) => servers[k].listen(0, "127.0.0.1", () => r()));
    base[k] = `http://127.0.0.1:${(servers[k].address() as AddressInfo).port}`;
  }
});
afterAll(() => { servers.held.close(); servers.not.close(); });
const get = (k: "held" | "not", p: string) => fetch(base[k] + p).then((r) => r.json());
const post = (k: "held" | "not", p: string, b: unknown) =>
  fetch(base[k] + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) }).then(async (r) => ({ status: r.status, json: await r.json() }));

describe("C-229, C-230: through the server", () => {
  it("answers only once the save holds the book", async () => {
    expect((await post("not", "/api/subtle/ask", { text: "what is a read?", speak: false })).json.error).toBe("Find THE SUBTLE LAYER first.");
    expect((await get("not", "/api/subtle/today")).held).toBe(false);
  });
  it("answers with a line and a question back, or the asking voice, and keeps the day's answer", async () => {
    const a = (await post("held", "/api/subtle/ask", { text: "How do I tell a read from imagination?", speak: false })).json;
    expect(a).toMatchObject({ mode: "ask", heard: "How do I tell a read from imagination?" });
    expect(a.answer).toBe(`${a.line} ${a.back}`);
    const v = (await post("held", "/api/subtle/ask", { text: "I keep doubting it", mode: "voices", speak: false })).json;
    expect(v.answer).toBe(v.asking);
    const t = await get("held", "/api/subtle/today");
    expect(t).toMatchObject({ held: true, answer: null });
    expect((await post("held", "/api/subtle/today", { text: "quiet, and sure of it" })).json.kept.answer).toBe("quiet, and sure of it");
    expect((await get("held", "/api/subtle/today")).answer).toBe("quiet, and sure of it");
    expect((await get("held", "/api/subtle/journal")).entries).toHaveLength(1);
  });
});
