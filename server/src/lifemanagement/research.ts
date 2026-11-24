// C-290: this file runs on the phone too (C-111) -- the app imports it, directly or through another file -- so keep it free of Node-only APIs (node:*, fs).
// C-454 (the user, 2026-11-21, by multiple choice; docs/RESEARCH.md): RESEARCH, a PRAXIS form beside the JOURNAL. A STUDY
// holds a field and a hypothesis, an EXPERT whose system is written from them (shown, and the player's to edit), its
// SOURCES (text typed or pasted, a note, a link, or a file kept by its SHA-256 as a blob with its text beside it), the
// TALK (each ask and the expert's answer, saying what it read) and its FINDINGS -- kept by the player, or proposed by the
// expert and kept or declined (PRAXIS's rule: the AI proposes, you decide). A finding kept earns 2 ARETE (at most three
// a day pay) and the day's virtue if it is the day's first finish. What the expert may draw in is ticked per study, all
// off until turned on: the JOURNAL, DREAMS (the dream journals' dreams and the daemon's own), CONVERSATIONS (meetings
// written up and voice notes heard) and GOALS.
//
// MIND (C-387): this file writes the expert's system, gathers what the ticks allow (each piece labelled with where it
// came from) and reads the answer; it is handed a Writer and never calls a model. Every word the player reads is DRAFT.
import type { Store } from "../shared/store.js";
import type { Form, Item } from "@daemons/praxis";
import { dayVirtue, ensureSpace, midnight } from "./practice.js";
import { journalOf, journalsOf } from "./journal.js";
import { meetingsOf } from "./meetings.js";
import { voiceNotesOf } from "./voicenotes.js";
import { mineView, spaceView } from "./myforms.js";
import { dreamsOf } from "../damagotchi/dreams.js";

const TEXT = { type: "text" as const }, LONG = { type: "long" as const }, NUM = { type: "number" as const };
const WORK = [{ name: "writing", phase: "doing" as const }, { name: "answered", phase: "done" as const }, { name: "failed", phase: "aside" as const }];
export const RESEARCH: Form = {
  name: "research", version: 1,
  kinds: {
    study: { title: "Study", prefix: "STUDY",
             states: [{ name: "open", phase: "open" }, { name: "supported", phase: "done" }, { name: "not-supported", phase: "done" },
                      { name: "set-aside", phase: "aside" }],
             fields: { field: TEXT, hypothesis: LONG, system: LONG, draws: TEXT, created: TEXT } },
    source: { title: "Source", prefix: "SOURCE", states: [{ name: "kept", phase: "open" }],
              fields: { sort: TEXT, blob: { type: "blob" }, mime: TEXT, size: NUM, text: LONG, url: TEXT, at: TEXT } },
    ask: { title: "Ask", prefix: "ASK", states: WORK,
           fields: { ask: LONG, answer: LONG, read: LONG, at: TEXT, by: TEXT, error: TEXT } },
    finding: { title: "Finding", prefix: "FINDING", states: [{ name: "open", phase: "open" }, { name: "kept", phase: "done" }],
               fields: { text: LONG, from: NUM, at: TEXT } },
  },
  views: [{ name: "study" }, { name: "list" }],
  rules: [{ kind: "finding", arete: 2, cap: 6, daemon: [] }],
};

export const STATES = ["open", "supported", "not-supported", "set-aside"] as const;
export const DRAWS = ["journal", "dreams", "talks", "goals"] as const;   // C-454 (2): DREAMS and CONVERSATIONS; other spaces follow
export type Draw = (typeof DRAWS)[number] | `space:${string}`;   // C-454 (3): one of the player's own spaces (MINE), each ticked on its own
export const MOST = { title: 80, field: 80, hypothesis: 600, system: 4000, ask: 2000, source: 60000, name: 120, finding: 600,
                      context: 24000, findingPay: 2, findingCap: 6 };
export const STALE_MIN = 30;

export type Source = { id: number; sort: "text" | "note" | "link" | "file"; name: string; mime: string; size: number;
                       url: string; blob: string | null; chars: number; preview: string; at: string };
export type Ask = { id: number; ask: string; answer: string; read: string[]; at: string; by: string;
                    state: "writing" | "answered" | "failed"; error: string | null };
export type Finding = { id: number; text: string; from: number | null; at: string; kept: boolean; proposal: string | null };
export type StudyRow = { id: number; title: string; field: string; hypothesis: string; state: string; created: string;
                         sources: number; asks: number; findings: number; proposed: number; last: string };
export type StudyView = StudyRow & { system: string; draws: Draw[]; spaces: { id: string; title: string }[]; sourcesList: Source[]; talk: Ask[]; kept: Finding[];
                                     waiting: Finding[]; limits: typeof MOST };
// What writes an answer: a system prompt and the words, and at most so many tokens -- null if nobody can (api.ts' house.write)
export type Writer = (system: string, user: string, maxTokens: number) => Promise<string | null>;

const SPACES = new WeakMap<Store, string>();
function space(store: Store): string {
  const had = SPACES.get(store);
  if (had) return had;
  const s = ensureSpace(store.life.px, RESEARCH, { title: "Research", prefix: "RESEARCH" });
  SPACES.set(store, s);
  return s;
}
const str = (v: unknown): string => (v == null ? "" : typeof v === "object" && typeof (v as { text?: unknown }).text === "string" ? (v as { text: string }).text : String(v));   // a long field in a proposal is {text, base}
const clean = (v: unknown, most: number) => str(v).replace(/\s+/g, " ").trim().slice(0, most);
const block = (v: unknown, most: number) => str(v).replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, most);
const drawsOf = (v: unknown): Draw[] => str(v).split(",").map((s) => s.trim())
  .filter((s): s is Draw => (DRAWS as readonly string[]).includes(s) || /^space:[\w-]{1,64}$/.test(s));
const studyOf = (store: Store, id: number) => { const it = store.life.px.numbered(space(store), id, "study"); return it && !it.archived ? it : null; };
const kids = (store: Store, study: Item, kind: string) => store.life.px.items(study.space, { kind, parent: study.id, archived: false })
  .sort((a, b) => (a.number ?? 0) - (b.number ?? 0));

/** the expert's system, written from the field and the hypothesis: an expert, never the daemon. The player may rewrite it. */
export function expertSystem(field: string, hypothesis: string): string {
  const f = field || "the field this study belongs to";
  return [
    `You are a senior expert in ${f}, with long practice in its research and its methods.`,
    `You are helping one person examine a hypothesis: "${hypothesis || "(not yet written)"}".`,
    "Speak as that expert, plainly and candidly -- not as anyone's companion or pet. Say what would support the hypothesis,",
    "what would count against it, and what is not known. Separate what the sources and notes you are given show from what",
    "your field generally holds, and never invent a study, a citation or a number.",
  ].join(" ");
}
// the rules every answer is written under, whatever the player made of the system
const RULES = [
  "You are given labelled material, each piece in [brackets] saying where it came from. Use only what helps; name the labels you relied on.",
  "If something you say would be worth keeping as a finding, put it on its own line beginning FINDING: (at most three).",
  "Keep the answer under 350 words.",
].join(" ");

function asSource(it: Item): Source {
  const f = it.fields, text = str(f.text);
  return { id: it.number as number, sort: (["text", "note", "link", "file"].includes(str(f.sort)) ? f.sort : "text") as Source["sort"],
           name: it.title, mime: str(f.mime), size: Number(f.size ?? 0) || 0, url: str(f.url), blob: f.blob ? str(f.blob) : null,
           chars: text.length, preview: text.slice(0, 240), at: str(f.at) };
}
function asAsk(it: Item, now: number): Ask {
  const f = it.fields, at = str(f.at);
  let state = (it.state ?? "writing") as Ask["state"], error = f.error ? str(f.error) : null;
  if (state === "writing" && Date.parse(at) < now - STALE_MIN * 60000) { state = "failed"; error = error ?? "no answer came -- ask again"; }   // DRAFT
  let read: string[] = [];
  try { const r = JSON.parse(str(f.read) || "[]"); if (Array.isArray(r)) read = r.map(String); } catch { /* none */ }
  return { id: it.number as number, ask: str(f.ask), answer: str(f.answer), read, at, by: str(f.by), state, error };
}
function asFinding(it: Item, proposal: string | null = null): Finding {
  const f = it.fields;
  return { id: it.number ?? 0, text: str(f.text) || it.title, from: f.from == null ? null : Number(f.from), at: str(f.at),
           kept: it.phase === "done", proposal };
}
function proposed(store: Store, study: Item): Finding[] {
  const px = store.life.px;
  return px.proposals(study.space, "open").filter((p) => p.op === "make")
    .map((p) => ({ p, v: (p.value ?? {}) as Record<string, unknown> })).filter(({ v }) => v.kind === "finding" && v.parent === study.id)
    .map(({ p, v }) => ({ id: 0, text: str(v.text) || str(v.title), from: v.from == null ? null : Number(v.from), at: str(v.at), kept: false, proposal: p.id }));
}

function rowOf(store: Store, it: Item): StudyRow {
  const asks = kids(store, it, "ask"), findings = kids(store, it, "finding").filter((f) => f.phase === "done");
  const last = [str(it.fields.created), ...asks.map((a) => str(a.fields.at))].sort().at(-1) ?? "";
  return { id: it.number as number, title: it.title, field: str(it.fields.field), hypothesis: str(it.fields.hypothesis),
           state: it.state ?? "open", created: str(it.fields.created), sources: kids(store, it, "source").length, asks: asks.length,
           findings: findings.length, proposed: proposed(store, it).length, last };
}
export function studiesOf(store: Store): StudyRow[] {
  return store.life.px.items(space(store), { kind: "study", archived: false }).map((it) => rowOf(store, it))
    .sort((a, b) => b.last.localeCompare(a.last));
}
export function studyView(store: Store, id: number, now = store.now()): StudyView | null {
  const it = studyOf(store, id);
  if (!it) return null;
  const findings = kids(store, it, "finding");
  return { ...rowOf(store, it), system: str(it.fields.system), draws: drawsOf(it.fields.draws),
           spaces: mineView(store).spaces.map((x) => ({ id: x.id, title: x.title })),
           sourcesList: kids(store, it, "source").map(asSource), talk: kids(store, it, "ask").map((a) => asAsk(a, now)),
           kept: findings.filter((f) => f.phase === "done").map((f) => asFinding(f)).reverse(), waiting: proposed(store, it), limits: MOST };
}
const viewOf = (store: Store, id: number) => ({ studies: studiesOf(store), study: studyView(store, id) });

/** a new study, or (with id) one changed: title, field, hypothesis, the expert's system, the draws */
export function keepStudy(store: Store, b: any, now = new Date(store.now())) {
  const px = store.life.px, s = space(store);
  const title = clean(b?.title, MOST.title), field = clean(b?.field, MOST.field), hypothesis = block(b?.hypothesis, MOST.hypothesis);
  const draws = Array.isArray(b?.draws) ? drawsOf(b.draws.join(",")).join(",") : undefined;
  if (b?.id != null) {
    const it = studyOf(store, Number(b.id));
    if (!it) return "no such study";                                                        // DRAFT
    const next: Record<string, unknown> = {};
    if (b.title !== undefined) { if (!title) return "a study needs a name"; next.title = title; }   // DRAFT
    if (b.field !== undefined) next.field = field;
    if (b.hypothesis !== undefined) { if (!hypothesis) return "a study needs its hypothesis"; next.hypothesis = hypothesis; }   // DRAFT
    if (b.system !== undefined) next.system = block(b.system, MOST.system) || expertSystem(next.field as string ?? str(it.fields.field), next.hypothesis as string ?? str(it.fields.hypothesis));
    if (draws !== undefined) next.draws = draws;
    px.transaction(() => { for (const [f, v] of Object.entries(next)) if ((f === "title" ? it.title : str(it.fields[f])) !== v) px.set(it.id, f, v); });
    return viewOf(store, it.number as number);
  }
  if (!title) return "a study needs a name";                                                // DRAFT
  if (!hypothesis) return "a study needs its hypothesis: one sentence you want to test";     // DRAFT
  const system = block(b?.system, MOST.system) || expertSystem(field, hypothesis);
  const id = px.make(s, "study", { title, field, hypothesis, system, draws: draws ?? "", created: now.toISOString() });
  return viewOf(store, px.item(id)!.number as number);
}
/** open, supported, not supported, or set aside -- never "failed": a hypothesis not supported is a finding too */
export function studyState(store: Store, id: number, state: unknown) {
  const it = studyOf(store, id);
  if (!it) return "no such study";                                                          // DRAFT
  if (!(STATES as readonly string[]).includes(str(state))) return "a study is open, supported, not-supported or set-aside";   // DRAFT
  if (it.state !== state) store.life.px.state(it.id, str(state));
  return viewOf(store, id);
}
export function removeStudy(store: Store, id: number) {
  const it = studyOf(store, id);
  if (!it) return "no such study";
  store.life.px.archive(it.id);                                                             // archived, the log keeps it
  return { studies: studiesOf(store), study: null };
}

/** a source: {sort: text | note | link | file, name, text, url}; a file comes with {blob, mime, size} once the hub has kept it */
export function addSource(store: Store, b: any, now = new Date(store.now())) {
  const it = studyOf(store, Number(b?.study));
  if (!it) return "no such study";
  const sort = ["text", "note", "link", "file"].includes(str(b?.sort)) ? str(b.sort) : "text";
  const text = block(b?.text, MOST.source), url = str(b?.url).trim();
  if (sort === "link" && !/^https?:\/\/\S+$/.test(url)) return "a link is an address, http or https";   // DRAFT
  if (sort === "file" && !/^[0-9a-f]{64}$/.test(str(b?.blob))) return "a file is kept by the companion at home first";   // DRAFT
  if ((sort === "text" || sort === "note") && !text) return "nothing was written to keep";   // DRAFT
  const name = clean(b?.name, MOST.name) || (sort === "link" ? url.replace(/^https?:\/\/(www\.)?/, "").slice(0, MOST.name)
             : sort === "note" ? "A note" : sort === "file" ? "A file" : text.split("\n")[0].slice(0, 60));   // DRAFT
  const fields: Record<string, unknown> = { title: name, sort, text, at: now.toISOString() };
  if (sort === "link") fields.url = url.slice(0, 400);
  if (sort === "file") { fields.blob = str(b.blob); fields.mime = clean(b?.mime, 80); fields.size = Math.max(0, Math.round(Number(b?.size) || 0)); }
  store.life.px.make(it.space, "source", fields as { title: string }, { parent: it.id });
  return viewOf(store, Number(b.study));
}
export function removeSource(store: Store, study: number, id: number) {
  const it = studyOf(store, study);
  if (!it) return "no such study";
  const src = store.life.px.numbered(it.space, id, "source");
  if (!src || src.archived || src.parent !== it.id) return "no such source";                // DRAFT
  store.life.px.archive(src.id);
  return viewOf(store, study);
}

/** an ask kept at once, "writing"; the answer is written after (writeAnswer), by whoever writes */
export function ask(store: Store, b: any, now = new Date(store.now())): { studies: StudyRow[]; study: StudyView | null; answering: number } | string {
  const it = studyOf(store, Number(b?.study));
  if (!it) return "no such study";
  const text = block(b?.text, MOST.ask);
  if (!text) return "ask the expert something";                                             // DRAFT
  const id = store.life.px.make(it.space, "ask", { title: text.slice(0, 80), ask: text, at: now.toISOString() }, { parent: it.id });
  return { ...viewOf(store, Number(b.study)), answering: store.life.px.item(id)!.number as number };
}
/** an answer that failed, or never came, asked again */
export function askAgain(store: Store, study: number, id: number, now = new Date(store.now())) {
  const it = studyOf(store, study), px = store.life.px;
  if (!it) return "no such study";
  const a = px.numbered(it.space, id, "ask");
  if (!a || a.archived || a.parent !== it.id) return "no such ask";                         // DRAFT
  px.transaction(() => { px.state(a.id, "writing"); px.set(a.id, "at", now.toISOString()); px.set(a.id, "error", ""); });
  return { ...viewOf(store, study), answering: id };
}

// ---- what the expert is given -------------------------------------------------------------------------------------
type Piece = { label: string; text: string };
/** the study's sources and what its ticks allow, each piece labelled with where it came from, within the budget */
export function gather(store: Store, study: Item): Piece[] {
  const out: Piece[] = [];
  let room = MOST.context;
  const take = (label: string, text: string, most: number) => {
    const t = text.trim().slice(0, Math.min(most, room));
    if (!t || room <= 0) return;
    out.push({ label, text: t });
    room -= t.length + label.length + 4;
  };
  for (const s of kids(store, study, "source").map(asSource)) {
    const it = store.life.px.numbered(study.space, s.id, "source")!, text = str(it.fields.text);
    const label = `SOURCE-${s.id}: ${s.name}${s.sort === "link" ? ` (${s.url})` : s.sort === "file" ? ` (${s.mime || "a file"})` : s.sort === "note" ? " (the person's note)" : ""}`;
    if (text) take(label, text, 12000);
    else if (s.sort === "link") take(label, "(a link the person keeps; its page was not read)", 200);
    else if (s.sort === "file") take(label, "(a file whose text could not be read)", 200);
  }
  const draws = drawsOf(study.fields.draws);
  if (draws.includes("journal")) {
    const entries = journalsOf(store).filter((j) => j.kind === "standard").flatMap((j) => (journalOf(store, j.id)?.entries ?? [])
      .map((e) => ({ journal: j.title, ...e }))).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 12);
    for (const e of entries) take(`JOURNAL "${e.journal}", ${e.at.slice(0, 10)}${e.title ? `: ${e.title}` : ""}`, e.body, 1500);
  }
  if (draws.includes("dreams")) {                                    // a dream journal's dreams, and the daemon's own nights
    const told = journalsOf(store).filter((j) => j.kind === "dream").flatMap((j) => (journalOf(store, j.id)?.entries ?? [])
      .map((e) => ({ at: e.at, label: `DREAM JOURNAL "${j.title}", ${e.at.slice(0, 10)}${e.title ? `: ${e.title}` : ""}`, text: e.body })));
    const nights = dreamsOf(store).filter((d) => d.text).map((d) => ({ at: d.at, label: `${d.nickname || "YOUR DAEMON"}'S DREAM, ${d.at.slice(0, 10)}${d.title ? `: ${d.title}` : ""}`, text: d.text }));
    for (const d of [...told, ...nights].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 10)) take(d.label, d.text, 1200);
  }
  if (draws.includes("talks")) {                                     // CONVERSATIONS: meetings written up, voice notes heard
    const met = meetingsOf(store).filter((m) => m.state === "done" && (m.summary || m.takeaways.length)).map((m) => ({ at: m.startedAt,
      label: `MEETING, ${m.startedAt.slice(0, 10)}${m.title ? `: ${m.title}` : ""}`,
      text: [m.summary, ...m.takeaways.map((t) => `- ${t}`), ...m.actions.map((a) => `- to do: ${a}`)].filter(Boolean).join("\n") }));
    const said = voiceNotesOf(store).filter((v) => v.state === "done" && v.text).map((v) => ({ at: v.at, label: `VOICE NOTE, ${v.at.slice(0, 10)}`, text: v.text }));
    for (const c of [...met, ...said].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8)) take(c.label, c.text, 1500);
  }
  for (const d of draws.filter((x) => x.startsWith("space:"))) {    // C-454 (3): a space of the player's own, its items and their fields
    const v = spaceView(store, d.slice(6));
    if (!v) continue;
    const kinds = Object.fromEntries(v.kinds.map((k) => [k.key, k]));
    take(`SPACE "${v.title}"`, v.items.slice(0, 30).map((i) => {
      const k = kinds[i.kind], fs = Object.entries(i.fields ?? {}).filter(([, x]) => x !== "" && x != null)
        .map(([f, x]) => `${k?.fields.find((y) => y.key === f)?.title ?? f}: ${str(x).replace(/\s+/g, " ").slice(0, 200)}`);
      return `- ${i.title}${i.done ? " (done)" : ""}${fs.length ? ` -- ${fs.join("; ")}` : ""}`;
    }).join("\n"), 3000);
  }
  if (draws.includes("goals")) {
    const goals = store.goals().slice(-8);
    if (goals.length) take("GOALS", goals.map((g) => {
      const x = g as unknown as { title?: string; name?: string; state?: string; done?: boolean };
      return `- ${x.title ?? x.name ?? "a goal"}${x.done || x.state === "done" ? " (done)" : ""}`;
    }).join("\n"), 2000);
  }
  return out;
}
/** the words an answer is asked with: the system (and the rules), and the material, the talk so far and the ask */
export function answerWords(store: Store, study: number, id: number): { system: string; user: string; read: string[] } | null {
  const it = studyOf(store, study);
  if (!it) return null;
  const a = store.life.px.numbered(it.space, id, "ask");
  if (!a) return null;
  const pieces = gather(store, it);
  const before = kids(store, it, "ask").filter((x) => (x.number ?? 0) < id && x.state === "answered").slice(-4)
    .map((x) => `The person asked: ${str(x.fields.ask)}\nYou answered: ${str(x.fields.answer)}`);
  const user = [
    `THE STUDY: ${it.title}. Field: ${str(it.fields.field) || "(not named)"}. Hypothesis: ${str(it.fields.hypothesis)}`,
    pieces.length ? `THE MATERIAL:\n${pieces.map((p) => `[${p.label}]\n${p.text}`).join("\n\n")}` : "THE MATERIAL: none given yet.",
    before.length ? `THE TALK SO FAR:\n${before.join("\n\n")}` : "",
    `THE PERSON ASKS: ${str(a.fields.ask)}`,
  ].filter(Boolean).join("\n\n");
  return { system: `${str(it.fields.system) || expertSystem(str(it.fields.field), str(it.fields.hypothesis))}\n\n${RULES}`, user,
           read: pieces.map((p) => p.label) };
}
/** an answer read: its FINDING: lines taken out to be proposed */
export function readAnswer(t: string): { answer: string; findings: string[] } {
  const findings: string[] = [], keep: string[] = [];
  for (const line of t.replace(/\r\n?/g, "\n").split("\n")) {
    const m = /^\s*(?:[-*]\s*)?\**FINDING\**\s*:\s*(.+)$/i.exec(line);
    if (m && findings.length < 3) findings.push(m[1].replace(/^\*+|\*+$/g, "").trim().slice(0, MOST.finding));
    else keep.push(line);
  }
  return { answer: keep.join("\n").replace(/\n{3,}/g, "\n\n").trim(), findings: findings.filter(Boolean) };
}
/** the answer kept, and each FINDING: the expert wrote proposed to the player */
export function finishAnswer(store: Store, study: number, id: number, text: string, by: string, read: string[]) {
  const it = studyOf(store, study), px = store.life.px;
  if (!it) return;
  const a = px.numbered(it.space, id, "ask");
  if (!a) return;
  const r = readAnswer(text);
  px.transaction(() => {
    px.set(a.id, "answer", r.answer || text.trim());
    px.set(a.id, "read", JSON.stringify(read));
    px.set(a.id, "by", by);
    px.set(a.id, "error", "");
    px.state(a.id, "answered");
    for (const f of r.findings) px.proposeMake(it.space, "finding", { title: f.slice(0, 80), text: f, from: id, at: new Date(store.now()).toISOString() }, { parent: it.id });
  });
}
export function failAnswer(store: Store, study: number, id: number, error: string) {
  const it = studyOf(store, study), px = store.life.px;
  const a = it ? px.numbered(it.space, id, "ask") : null;
  if (!a) return;
  px.transaction(() => { px.set(a.id, "error", error.slice(0, 200)); px.state(a.id, "failed"); });
}
/** the answer written by `write` (the hub's thinker); with none, failed, to be asked again once a mind is at home */
export async function writeAnswer(store: Store, study: number, id: number, write: Writer | null, by = "the house's mind") {
  const w = answerWords(store, study, id);
  if (!w) return;
  if (!write) return failAnswer(store, study, id, "the expert needs a mind at home to answer -- ask again when one is there");   // DRAFT
  try {
    const t = await write(w.system, w.user, 900);
    if (!t || !t.trim()) return failAnswer(store, study, id, "no answer came -- ask again");   // DRAFT
    finishAnswer(store, study, id, t, by, w.read);
  } catch (e) { failAnswer(store, study, id, (e as Error)?.message || "the answer failed"); }   // DRAFT
}

// ---- findings ------------------------------------------------------------------------------------------------------
// kept: paid 2 under the day's cap (three findings a day), and the day's virtue if it is the day's first finish
function pay(store: Store, item: string, now: Date) {
  const px = store.life.px, it = px.item(item)!;
  const paid = px.ledger(it.space, { since: midnight(now.getTime()) }).filter((e) => e.op === "award" && !e.back && e.kind === "finding" && e.key.startsWith("finish:")).reduce((n, e) => n + e.points, 0);
  px.state(item, "kept", { pay: Math.max(0, Math.min(MOST.findingPay, MOST.findingCap - paid)), reason: "finish" });
  dayVirtue(px, item, now);
}
/** a finding the player writes, kept at once */
export function keepFinding(store: Store, b: any, now = new Date(store.now())) {
  const it = studyOf(store, Number(b?.study));
  if (!it) return "no such study";
  const text = block(b?.text, MOST.finding);
  if (!text) return "a finding is a line worth keeping";                                     // DRAFT
  const px = store.life.px;
  px.transaction(() => {
    const id = px.make(it.space, "finding", { title: text.slice(0, 80), text, at: now.toISOString() }, { parent: it.id });
    pay(store, id, now);
  });
  return viewOf(store, Number(b.study));
}
/** a finding the expert proposed: kept (made, and paid) or declined */
export function decideFinding(store: Store, b: any, now = new Date(store.now())) {
  const it = studyOf(store, Number(b?.study));
  if (!it) return "no such study";
  const px = store.life.px, p = px.proposal(str(b?.proposal));
  if (!p || p.space !== it.space || p.status !== "open") return "no such finding waiting";   // DRAFT
  px.transaction(() => {
    if (b?.keep) { px.accept(p.id); pay(store, p.item, now); }
    else px.decline(p.id);
  });
  return viewOf(store, Number(b.study));
}
export function removeFinding(store: Store, study: number, id: number) {
  const it = studyOf(store, study);
  if (!it) return "no such study";
  const f = store.life.px.numbered(it.space, id, "finding");
  if (!f || f.archived || f.parent !== it.id) return "no such finding";                     // DRAFT
  store.life.px.archive(f.id);                                                              // its ARETE stays: it was found
  return viewOf(store, study);
}
