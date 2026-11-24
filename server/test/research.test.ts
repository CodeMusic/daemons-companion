// C-454: RESEARCH -- a study, its expert, sources, the talk and findings on PRAXIS; only what is ticked is drawn in.
import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { Store } from "../src/shared/db.js";
import { addSource, answerWords, ask, decideFinding, expertSystem, keepFinding, keepStudy, readAnswer, removeSource, removeStudy,
         studiesOf, studyState, studyView, writeAnswer, type StudyView } from "../src/lifemanagement/research.js";
import { keepEntry, newJournal } from "../src/lifemanagement/journal.js";
import { DAY_VIRTUE } from "../src/lifemanagement/practice.js";
import { newVoiceNote, noteHeard } from "../src/lifemanagement/voicenotes.js";
import { keepItem, makeSpace, mineView, saveForm } from "../src/lifemanagement/myforms.js";
import { pdfText, sourceText } from "../src/shared/sourcetext.js";

const day = (d: number, h = 12) => new Date(2026, 10, d, h);
function fresh(at = day(23).getTime()) {
  let t = at;
  return { store: new Store(":memory:", { now: () => t }), set: (d: Date) => { t = d.getTime(); } };
}
const study = (r: unknown): StudyView => { if (typeof r === "string") throw new Error(r); return (r as { study: StudyView }).study; };

describe("C-454: RESEARCH", () => {
  it("keeps a study with its field and hypothesis, writes an editable expert, and refuses one without a hypothesis", () => {
    const { store } = fresh();
    expect(keepStudy(store, { title: "Sleep", field: "sleep science" })).toMatch(/hypothesis/);
    const s = study(keepStudy(store, { title: "Sleep", field: "sleep science", hypothesis: "I sleep better after a walk." }));
    expect(s).toMatchObject({ title: "Sleep", field: "sleep science", state: "open", draws: [] });
    expect(s.system).toBe(expertSystem("sleep science", "I sleep better after a walk."));
    expect(s.system).not.toMatch(/daemon/i);
    const e = study(keepStudy(store, { id: s.id, system: "Answer as a sleep physician.", draws: ["journal", "nonsense"] }));
    expect(e.system).toBe("Answer as a sleep physician.");
    expect(e.draws).toEqual(["journal"]);
    expect(study(studyState(store, s.id, "not-supported")).state).toBe("not-supported");
    expect(studyState(store, s.id, "failed")).toMatch(/open, supported/);
    removeStudy(store, s.id);
    expect(studiesOf(store)).toEqual([]);
  });

  it("draws in only what is ticked, each piece labelled, and says what it read", () => {
    const { store } = fresh();
    const j = newJournal(store, "Days", day(22));
    if (typeof j === "string") throw new Error(j);
    keepEntry(store, { journal: j.id, title: "Tuesday", body: "Walked an hour and slept through." }, day(22));
    const s = study(keepStudy(store, { title: "Sleep", field: "sleep science", hypothesis: "Walking helps me sleep." }));
    study(addSource(store, { study: s.id, sort: "text", name: "Notes", text: "Eight nights logged." }));
    const a = ask(store, { study: s.id, text: "What do my notes show?" });
    if (typeof a === "string") throw new Error(a);
    let w = answerWords(store, s.id, a.answering)!;
    expect(w.read).toEqual(["SOURCE-1: Notes"]);
    expect(w.user).not.toMatch(/slept through/);                         // the journal is off until ticked
    keepStudy(store, { id: s.id, draws: ["journal", "goals"] });
    w = answerWords(store, s.id, a.answering)!;
    expect(w.read.some((l) => l.startsWith('JOURNAL "Days"'))).toBe(true);
    expect(w.user).toMatch(/slept through/);
    expect(w.system).toMatch(/FINDING:/);
  });

  it("an answer kept says what it read, and each FINDING: becomes a proposal kept for 2 ARETE or declined", async () => {
    const { store } = fresh(day(23, 9).getTime());
    const s = study(keepStudy(store, { title: "Sleep", field: "sleep science", hypothesis: "Walking helps me sleep." }));
    addSource(store, { study: s.id, sort: "note", text: "Walks on 5 of 8 nights." });
    const a = ask(store, { study: s.id, text: "Is it supported?" });
    if (typeof a === "string") throw new Error(a);
    await writeAnswer(store, s.id, a.answering, async () => "Partly.\nFINDING: Walks came before 4 of the 5 good nights.\n- FINDING: **Eight nights is too few.**", "the Tiiny");
    let v = studyView(store, s.id)!;
    expect(v.talk[0]).toMatchObject({ state: "answered", answer: "Partly.", by: "the Tiiny", read: ["SOURCE-1: A note (the person's note)"] });
    expect(v.waiting.map((f) => f.text)).toEqual(["Walks came before 4 of the 5 good nights.", "Eight nights is too few."]);
    v = study(decideFinding(store, { study: s.id, proposal: v.waiting[0].proposal, keep: true }, day(23, 10)));
    v = study(decideFinding(store, { study: s.id, proposal: v.waiting[0].proposal, keep: false }, day(23, 10)));
    expect(v.waiting).toEqual([]);
    expect(v.kept.map((f) => f.text)).toEqual(["Walks came before 4 of the 5 good nights."]);
    expect(store.life.arete(day(23, 20)).today).toBe(2 + DAY_VIRTUE);
    for (let i = 0; i < 4; i++) keepFinding(store, { study: s.id, text: `my own ${i}` }, day(23, 11 + i));
    expect(store.life.arete(day(23, 20)).today).toBe(6 + DAY_VIRTUE);     // three findings a day pay
  });

  it("with no mind at home the ask fails at once, to be asked again; sources can be removed; a link must be an address", async () => {
    const { store } = fresh();
    const s = study(keepStudy(store, { title: "T", hypothesis: "H" }));
    expect(addSource(store, { study: s.id, sort: "link", url: "javascript:x" })).toMatch(/address/);
    expect(addSource(store, { study: s.id, sort: "file", blob: "nope" })).toMatch(/home/);
    study(addSource(store, { study: s.id, sort: "link", url: "https://example.org/paper" }));
    expect(study(removeSource(store, s.id, 1)).sourcesList).toEqual([]);
    const a = ask(store, { study: s.id, text: "Well?" });
    if (typeof a === "string") throw new Error(a);
    await writeAnswer(store, s.id, a.answering, null);
    expect(studyView(store, s.id)!.talk[0]).toMatchObject({ state: "failed" });
  });

  it("draws in DREAMS (a dream journal's and the daemon's own) and CONVERSATIONS (voice notes heard) only when ticked", () => {
    const { store } = fresh();
    const dj = newJournal(store, "Nights", day(21), "dream");
    if (typeof dj === "string") throw new Error(dj);
    keepEntry(store, { journal: dj.id, title: "", body: "I was on a pier at dawn." }, day(21));
    store.setSetting("dreams", JSON.stringify([{ id: 1, at: day(22, 7).toISOString(), text: "Rain fell upward.", title: "RAIN FALLING UP",
                                                  nickname: "EMBER", species: 4, personality: 1, device: "d" }]));
    const v = newVoiceNote(store, "phone", null, day(22));
    noteHeard(store, v.id, "Remember: the walk felt easier today.");
    const s = study(keepStudy(store, { title: "Dreams", field: "dream research", hypothesis: "Water returns in my dreams." }));
    const a = ask(store, { study: s.id, text: "What returns?" });
    if (typeof a === "string") throw new Error(a);
    expect(answerWords(store, s.id, a.answering)!.read).toEqual([]);
    keepStudy(store, { id: s.id, draws: ["dreams", "talks"] });
    const w = answerWords(store, s.id, a.answering)!;
    expect(w.read).toHaveLength(3);
    expect(w.read).toEqual(expect.arrayContaining([expect.stringMatching(/^EMBER'S DREAM, .*: RAIN FALLING UP$/),
                                                   expect.stringMatching(/^DREAM JOURNAL "Nights"/), expect.stringMatching(/^VOICE NOTE, /)]));
    expect(w.user).toMatch(/Rain fell upward/);
    expect(w.user).toMatch(/pier at dawn/);
    expect(w.user).toMatch(/walk felt easier/);
  });

  it("draws in one of the player's own spaces (MINE) when it alone is ticked, its items with their fields", () => {
    const { store } = fresh();
    const f = saveForm(store, { title: "Sleep log", kinds: [{ title: "Night", fields: [{ title: "Hours", type: "number" }], arete: 0, cap: 0 }] });
    if (typeof f === "string") throw new Error(f);
    makeSpace(store, { form: f.id, title: "My nights" });
    makeSpace(store, { form: f.id, title: "Other" });
    const [mine, other] = mineView(store).spaces;
    keepItem(store, { space: mine.id, kind: "k_night", title: "Monday", fields: { f_hours: 7.5 } });
    keepItem(store, { space: other.id, kind: "k_night", title: "Not this one", fields: { f_hours: 3 } });
    const s = study(keepStudy(store, { title: "S", hypothesis: "H" }));
    expect(s.spaces.map((x) => x.title).sort()).toEqual(["My nights", "Other"]);
    keepStudy(store, { id: s.id, draws: [`space:${mine.id}`, "space:../x"] });
    expect(studyView(store, s.id)!.draws).toEqual([`space:${mine.id}`]);
    const a = ask(store, { study: s.id, text: "?" });
    if (typeof a === "string") throw new Error(a);
    const w = answerWords(store, s.id, a.answering)!;
    expect(w.read).toEqual(['SPACE "My nights"']);
    expect(w.user).toMatch(/- Monday -- Hours: 7\.5/);
    expect(w.user).not.toMatch(/Not this one/);
  });

  it("reads FINDING lines out of an answer, at most three", () => {
    expect(readAnswer("a\nFINDING: one\nfinding: two\n* FINDING: three\nFINDING: four\nb")).toEqual({ answer: "a\nFINDING: four\nb", findings: ["one", "two", "three"] });
  });
});

describe("C-454: a source file's text", () => {
  it("reads text files as they are, and a simple PDF's shown strings", async () => {
    expect((await sourceText(new TextEncoder().encode("hello\nthere"), "text/plain", "a.txt")).text).toBe("hello\nthere");
    const ops = "BT /F1 12 Tf 72 720 Td (Walking helps) Tj 0 -14 Td [(sle) 20 (ep) -250 (\\(often\\))] TJ ET";
    const z = deflateSync(Buffer.from(ops, "latin1"));
    const pdf = Buffer.concat([Buffer.from(`%PDF-1.4\n4 0 obj\n<< /Length ${z.length} /Filter /FlateDecode >>\nstream\n`, "latin1"), z,
                               Buffer.from("\nendstream\nendobj\n%%EOF", "latin1")]);
    expect(pdfText(new Uint8Array(pdf))).toBe("Walking helps\nsleep (often)");
    expect((await sourceText(new Uint8Array(pdf), "application/pdf", "p.pdf")).text).toMatch(/Walking helps/);
  });
});
