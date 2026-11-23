// C-357, THE SUBTLE LAYER lived, the app's half picked 2026-11-17: RECOGNITION (a misread marked SEEN, counted with the
// calm), THE MASK (a week unanswered, and it stops sending), PROCESSES (a feeling as what was happening, after its hour).
// SAME DRIVE's is in weathering.test.ts.
import { describe, expect, it } from "vitest";
import { Store } from "../src/shared/db.js";
import { howOf, maskOf, MASK, readsView, seeRead, takeLean, takeRead } from "../src/psyche/intuition.js";
import { feltOf, processOf, whenSaid } from "../src/processes.js";
import { journalOf, keepEntry, newJournal } from "../src/lifemanagement/journal.js";

const calm = { glad: 0, mad: 0, sad: 0, calm: 0, restless: 0, strongest: null };
const afraid = { ...calm, calm: -60 };
const T0 = new Date(2026, 10, 18, 20);                               // after THE MASK began counting
const day = (n: number, h = 20) => new Date(2026, 10, 18 + n, h);

describe("C-357, RECOGNITION: SEEN, and the mend", () => {
  it("marks a misread SEEN without removing it, and counts it with the calm", () => {
    const store = new Store(":memory:");
    takeLean(store, "pays 0", T0, howOf(afraid, T0));                 // a misread, with argument
    takeLean(store, "not 1", day(0, 21), howOf(calm, day(0, 21)));
    let v = readsView(store, day(0, 22));
    expect(v.byHow).toMatchObject({ calm: { given: 1, landed: 1 }, argument: { given: 1, landed: 0 } });
    expect(seeRead(store, "lean", T0.toISOString(), day(0, 22))).toBe(true);
    v = readsView(store, day(0, 23));
    expect(v.recentLeans).toHaveLength(2);
    expect(v.recentLeans[1]).toMatchObject({ misread: true, seen: day(0, 22).toISOString() });
    expect(v.byHow).toMatchObject({ calm: { given: 2, landed: 1 }, argument: { given: 0, landed: 0 } });
  });
  it("answers a read once, and refuses what is not there", () => {
    const store = new Store(":memory:");
    takeRead(store, "rain 1", "w", T0);
    expect(seeRead(store, "read", T0.toISOString(), day(0, 21))).toBe(true);
    expect(seeRead(store, "read", T0.toISOString(), day(1))).toBe(true);   // once: the first answer is kept
    expect(readsView(store, day(1)).recent[0].seen).toBe(day(0, 21).toISOString());
    expect(seeRead(store, "read", "2020-01-01T00:00:00Z")).toBe("no such read");
    expect(seeRead(store, "card", T0.toISOString())).toBe("a read or a lean");
  });
});

describe("C-357, THE MASK: a week unanswered", () => {
  it("is off with nothing given, and off for a week after a read", () => {
    const store = new Store(":memory:");
    expect(maskOf(store, day(30)).mask).toBe(false);
    takeRead(store, "near 0", "w", T0);
    expect(maskOf(store, day(6)).mask).toBe(false);
    expect(maskOf(store, day(MASK.days)).mask).toBe(true);
  });
  it("comes off when one is answered, and comes back only after another unanswered week", () => {
    const store = new Store(":memory:");
    takeRead(store, "near 0", "w", T0);
    takeLean(store, "pays 0", day(1), howOf(calm, day(1)));
    expect(maskOf(store, day(9)).mask).toBe(true);
    seeRead(store, "lean", day(1).toISOString(), day(9));              // one answered: the old read still waits
    expect(maskOf(store, day(10)).mask).toBe(false);
    expect(maskOf(store, day(15)).mask).toBe(false);
    expect(maskOf(store, day(16)).mask).toBe(true);
  });
  it("counts nothing from before it began", () => {
    const store = new Store(":memory:");
    takeRead(store, "near 0", "w", new Date(2026, 10, 1, 9));
    expect(maskOf(store, day(30)).mask).toBe(false);
  });
});

describe("C-357, PROCESSES: a feeling, after its hour, as what was happening", () => {
  it("keeps the noun for its hour, then says the process and when", () => {
    const at = new Date(2026, 10, 18, 9, 10).toISOString();
    expect(feltOf("fear", at, new Date(2026, 10, 18, 9, 50))).toBe("fear");
    expect(feltOf("fear", at, new Date(2026, 10, 18, 10, 20))).toBe("fearing, this morning");
    expect(feltOf("grief", at, new Date(2026, 10, 19, 8))).toBe("grieving, yesterday at nine");
    expect(feltOf("worry", at, new Date(2026, 10, 21, 8))).toBe("worrying, on Wednesday at nine");
    expect(feltOf("hope", at, new Date(2026, 10, 30, 8))).toBe("hoping, on 18 November");
    expect(feltOf(null, at)).toBeNull();
  });
  it("never reads a word it has no process for: it keeps it as written, with its time", () => {
    expect(processOf("anger")).toBe("being angry");
    expect(processOf("aching")).toBe("aching");
    expect(processOf("blue")).toBeNull();
    expect(feltOf("blue", new Date(2026, 10, 18, 14).toISOString(), new Date(2026, 10, 18, 18))).toBe("blue, this afternoon");
    expect(whenSaid(new Date(2026, 10, 18, 23), new Date(2026, 10, 19, 0, 30))).toBe("yesterday at eleven");
  });
  it("keeps the word on the entry, and an edit that does not offer it leaves it", () => {
    const store = new Store(":memory:");
    const j = newJournal(store, "This autumn", T0);
    if (typeof j === "string") throw new Error(j);
    const at = new Date(2026, 10, 18, 9);
    let v = keepEntry(store, { journal: j.id, title: "", body: "the call", feeling: "  Fear " }, at);
    if (typeof v === "string") throw new Error(v);
    expect(v.entries[0]).toMatchObject({ feeling: "fear", felt: "fear" });
    v = keepEntry(store, { journal: j.id, id: v.entries[0].id, title: "", body: "the call, again" }, new Date(2026, 10, 18, 12));
    if (typeof v === "string") throw new Error(v);
    expect(v.entries[0]).toMatchObject({ body: "the call, again", feeling: "fear", felt: "fearing, this morning" });
    v = keepEntry(store, { journal: j.id, id: v.entries[0].id, title: "", body: "the call", feeling: "" }, new Date(2026, 10, 18, 13));
    if (typeof v === "string") throw new Error(v);
    expect(journalOf(store, j.id, new Date(2026, 10, 18, 13))!.entries[0]).toMatchObject({ feeling: null, felt: null });
  });
});
