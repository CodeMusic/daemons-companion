// C-455: MENTIONS FROM YOUR DAEMON, and a cadence on every plan (the dreams told among them)
import { describe, expect, it } from "vitest";
import { Store } from "../src/shared/db.js";
import { cadenceOk, cadenceSaid, fallsOn, isDue, keepPlan, lastDue, nextDue, PLANS, plans, type Plan } from "../src/machine/schedule.js";
import { lastOf, markRead, mentionsAsk, mentionsOf, newestUnread, plainLetter, spanSaid, statLines, statsOf, windowOf, writeMention } from "../src/mentions.js";
import { keepEntry, newJournal } from "../src/lifemanagement/journal.js";
import { keepNight } from "../src/dreams.js";
import { route } from "../src/routes.js";

const mem = () => { const m = new Map<string, string>(); return { get: (k: string) => m.get(k) ?? null, set: (k: string, v: string | null) => { if (v === null) m.delete(k); else m.set(k, v); } }; };
const plan = (id: string) => PLANS.find((p) => p.id === id)!;
const at = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(y, mo, d, h, mi);

describe("C-455: a cadence on every plan", () => {
  it("checks a cadence", () => {
    expect(cadenceOk({ every: "week", times: 3 })).toEqual({ every: "week", times: 3 });
    expect(cadenceOk({ every: "month", times: 1 })).toEqual({ every: "month" });
    expect(cadenceOk({ every: "week", times: 8 })).toBeNull();         // more than the days in it
    expect(cadenceOk({ every: "fortnight" })).toBeNull();
    expect(cadenceOk({ every: "year", times: 0 })).toBeNull();
    expect(cadenceSaid({ every: "week", times: 3 })).toBe("3 times a week");
    expect(cadenceSaid({ every: "quarter" })).toBe("every three months");
  });
  it("keeps the old weekly plan where it was", () => {
    const week = plan("whatsnew.week"), wed = at(2026, 10, 11, 9);
    expect(lastDue(week, wed)).toEqual(at(2026, 10, 8, 19));
    expect(nextDue(week, wed)).toEqual(at(2026, 10, 15, 19));
  });
  it("finds a month's, a quarter's and a year's times", () => {
    const month = plan("mentions.month"), season = plan("mentions.season"), year = plan("mentions.year");
    expect(nextDue(month, at(2026, 10, 21, 12))).toEqual(at(2026, 11, 1, 9));
    expect(lastDue(month, at(2026, 10, 21, 12))).toEqual(at(2026, 10, 1, 9));
    expect(nextDue(season, at(2026, 10, 21))).toEqual(at(2027, 0, 1, 9, 30));
    expect(lastDue(season, at(2026, 10, 21))).toEqual(at(2026, 9, 1, 9, 30));
    expect(nextDue(year, at(2026, 10, 21))).toEqual(at(2027, 0, 1, 10));
    expect(lastDue(year, at(2026, 0, 1, 9))).toEqual(at(2025, 0, 1, 10));   // before ten on New Year's: last year's
  });
  it("spreads n times through the period", () => {
    const thrice: Plan = { ...plan("mentions.day"), every: "week", times: 3 };   // Sunday, Tuesday, Thursday at nine
    const sun = at(2026, 10, 15, 22);
    expect(nextDue(thrice, sun)).toEqual(at(2026, 10, 17, 21));
    expect(nextDue(thrice, at(2026, 10, 17, 22))).toEqual(at(2026, 10, 19, 21));
    expect(nextDue(thrice, at(2026, 10, 19, 22))).toEqual(at(2026, 10, 22, 21));   // the next week's Sunday
    const twelve: Plan = { ...plan("mentions.month"), every: "year", times: 12 };
    expect(nextDue(twelve, at(2026, 0, 2))).toEqual(at(2026, 0, 31, 9));   // 365 / 12: every 30 days or so
  });
  it("keeps a cadence, and forgets it", () => {
    const s = mem();
    keepPlan(s.get, s.set, "mentions.day", { cadence: { every: "week", times: 2 } });
    expect(plans(s.get).find((p) => p.id === "mentions.day")).toMatchObject({ every: "week", times: 2, on: true });
    keepPlan(s.get, s.set, "mentions.day", { on: false });
    expect(plans(s.get).find((p) => p.id === "mentions.day")).toMatchObject({ every: "week", times: 2, on: false });
    keepPlan(s.get, s.set, "mentions.day", { cadence: null });
    const back = plans(s.get).find((p) => p.id === "mentions.day")!;
    expect(back.every).toBe("day"); expect(back.times).toBeUndefined();
    keepPlan(s.get, s.set, "mentions.month", { cadence: { every: "month", times: 2 } });
    expect(plans(s.get).find((p) => p.id === "mentions.month")).toMatchObject({ every: "month", times: 2 });
  });
  it("a gate is never run; it only says which days", () => {
    const told = plan("dreams.told");
    expect(isDue({ ...told, last: at(2020, 0, 1).toISOString() }, at(2026, 10, 21))).toBe(false);
    expect(fallsOn(told, at(2026, 10, 21, 7))).toBe(true);             // every night, by default
    const thrice: Plan = { ...told, every: "week", times: 3 };          // Sunday, Tuesday, Thursday mornings
    expect(fallsOn(thrice, at(2026, 10, 22, 7))).toBe(true);           // a Sunday
    expect(fallsOn(thrice, at(2026, 10, 23, 7))).toBe(false);          // a Monday
    expect(fallsOn(thrice, at(2026, 10, 24, 7))).toBe(true);           // a Tuesday
    expect(fallsOn({ ...told, on: false }, at(2026, 10, 21, 7))).toBe(false);
  });
});

describe("C-455: MENTIONS FROM YOUR DAEMON", () => {
  const who = { personality: 1234, species: 25, nickname: "SPARKY" };
  it("reaches back to the last letter of its kind, never further than its span", () => {
    const now = at(2026, 10, 21, 21);
    expect(windowOf("day", now, null).from).toEqual(at(2026, 10, 20, 21));
    expect(windowOf("day", now, at(2026, 10, 21, 9).toISOString()).from).toEqual(at(2026, 10, 21, 9));
    expect(windowOf("day", now, at(2026, 9, 1).toISOString()).from).toEqual(at(2026, 10, 20, 21));   // a month ago: one day
    const m = windowOf("month", at(2026, 11, 1, 9), null);
    expect([m.from, m.to]).toEqual([at(2026, 10, 1), at(2026, 11, 1)]);
    expect(spanSaid(m.from, m.to)).toBe("November 2026");
  });
  it("says its span", () => {
    expect(spanSaid(at(2026, 10, 21, 0), at(2026, 10, 21, 21))).toBe("21 November");
    expect(spanSaid(at(2026, 10, 20, 21), at(2026, 10, 21, 21), "day")).toBe("21 November");
    expect(spanSaid(at(2026, 9, 1), at(2026, 10, 1))).toBe("October 2026");
    expect(spanSaid(at(2026, 0, 1), at(2027, 0, 1))).toBe("2026");
    expect(spanSaid(at(2026, 9, 21, 9), at(2026, 10, 21, 9))).toBe("21 October to 21 November 2026");
  });
  it("counts what the span held", () => {
    const s = new Store(":memory:");
    const from = at(2026, 10, 21, 0), to = at(2026, 10, 21, 22);
    s.logInteraction("feed", null, at(2026, 10, 21, 8)); s.logInteraction("feed", null, at(2026, 10, 21, 18));
    s.logInteraction("talk", null, at(2026, 10, 21, 12)); s.logInteraction("walk", null, at(2026, 10, 20, 12));   // yesterday's: not counted
    const j = newJournal(s, "Mine", at(2026, 10, 1)) as { id: number };
    keepEntry(s, { journal: j.id, title: "A day", body: "It rained." }, at(2026, 10, 21, 20));
    const d = newJournal(s, "Dreams", at(2026, 10, 1), "dream") as { id: number };
    keepEntry(s, { journal: d.id, title: "Water", body: "A lake." }, at(2026, 10, 21, 7));
    keepNight(s, { from: at(2026, 10, 20, 23).toISOString(), to: at(2026, 10, 21, 7).toISOString(), hours: 8, stirs: 1, tucked: false },
              { ...who, device: "" });
    const st = statsOf(s, from, to);
    expect(st.together).toEqual([{ said: "meals", n: 2 }, { said: "a talk", n: 1 }]);
    expect(st).toMatchObject({ entries: 1, dreamsWritten: 1, nights: 1, vivid: 1 });
    expect(statLines(st)).toEqual(["together: 2 meals, a talk", "1 journal entry written", "1 dream written down", "1 night slept, 1 vivid"]);
  });
  it("asks for a letter in the daemon's voice, from the numbers alone", () => {
    const st = { together: [{ said: "walks", n: 3 }], steps: 4, goals: ["Paint the fence"], arete: 12, entries: 0, dreamsWritten: 0, nights: 0, vivid: 0, quiet: 0, broken: 0 };
    const a = mentionsAsk("month", st, { nickname: "SPARKY", persona: "You are SPARKY, a PIKACHU." }, "October 2026");
    expect(a.system.startsWith("You are SPARKY, a PIKACHU.")).toBe(true);
    expect(a.system).toContain("never ask for more");
    expect(a.user).toContain("4 steps done, 1 goal finished");
    expect(a.user).toContain('"Paint the fence"');
    expect(plainLetter("day", { ...st, together: [], steps: 0, goals: [], arete: 0 }, "21 November")).toContain("quiet one");
  });
  it("writes, keeps and reads a letter; a mind that fails leaves the plain one", async () => {
    const s = new Store(":memory:");
    s.logInteraction("feed", null, at(2026, 10, 21, 8));
    const asked: string[] = [];
    const m = await writeMention(s, "day", at(2026, 10, 21, 21), who, async (sys, user) => { asked.push(user); return "<think>hm</think>## A title\nYou fed me today. Thank you."; }, "the Tiiny");
    expect(m).toMatchObject({ state: "done", by: "the Tiiny", body: "You fed me today. Thank you.", title: "DAILY MENTIONS", nickname: "SPARKY", species: 25 });
    expect(asked[0]).toContain("together: a meal");
    expect(lastOf(s, "day")!.id).toBe(m.id);
    const f = await writeMention(s, "day", at(2026, 10, 22, 21), who, async () => { throw new Error("down"); }, "the Tiiny");
    expect(f).toMatchObject({ state: "done", by: "words" });
    expect(f.from).toBe(m.to);                                     // it reaches back to the last letter
    const none = await writeMention(s, "month", at(2026, 11, 1, 9), who, null, "words");
    expect(none.body).toContain("This month");
    expect(mentionsOf(s).map((x) => x.id)).toEqual([none.id, f.id, m.id]);
    expect(newestUnread(s, at(2026, 11, 1, 10))!.id).toBe(none.id);
    expect(markRead(s, none.id)).toBe(true);
    expect(newestUnread(s, at(2026, 11, 1, 10))).toBeNull();          // the others are older than a day and a half
    expect(mentionsOf(s)).toHaveLength(3);                         // read, and still in its book
  });
  it("is answered by the routes a phone hosting alone shares", async () => {
    const s = new Store(":memory:"), now = at(2026, 10, 21, 22);
    const m = await writeMention(s, "day", at(2026, 10, 21, 21), who, null, "words");
    const get = route({} as any, s, { method: "GET", path: "/api/mentions", body: {}, deviceId: "" }, now).body as any;
    expect(get).toMatchObject({ book: "MENTIONS FROM YOUR DAEMON", unread: { id: m.id } });
    const read = route({} as any, s, { method: "POST", path: "/api/mentions/read", body: { id: m.id }, deviceId: "" }, now);
    expect(read).toEqual({ status: 200, body: { unread: null } });
    expect(route({} as any, s, { method: "POST", path: "/api/mentions/read", body: { id: 99 }, deviceId: "" }, now).status).toBe(404);
  });
});
