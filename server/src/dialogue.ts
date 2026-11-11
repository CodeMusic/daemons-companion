// C-290: this file runs on the phone too (C-111) -- the app imports it, directly or through another file -- so keep it free of Node-only APIs (node:*, fs).
// C-329 (the user, 2026-11-11): DAEMONS IN DIALOGUE. Two daemons in one shared space -- OUT TOGETHER across accounts
// (C-220) now, two devices of one household when C-327 gives them -- talk, in one of two forms:
//
//   STANDARD    the bicameral conversation of THE PROGRAMMER'S GUIDE TO THE HUMAN MIND ("Feelings in Parallel",
//               "Thought and Emotion Integration"), echoed by THE UNITY BOOK's two halves: one daemon leans LOGICAL --
//               red, left, bottom-up, in series -- and the other CREATIVE -- blue, right, top-down, in parallel. The
//               daemon of the player who starts leans red; SWAP flips it (the user's choice, 2026-11-11).
//   TWO VOICES  THE SUBTLE LAYER's form: one TELLS, the other only ASKS -- a question, a clarifying question, or what it
//               heard said back to check it. The other player's daemon tells and the starter's asks, so the starter's
//               daemon puts the opening to the other; SWAP flips it (the user's choice).
//
// Turns: 1 to 11 EACH. The opening is typed on the phone (dictated on the watch). Every line is thought on the hub, the
// Tiiny first (a thinker the hub hands in, setDialogueThinker), each daemon's system message its PERSONA (ai/personaof.ts,
// from the card its own companion sent) and the form's HOW. Across accounts the opening and every line pass meetsafe.ts
// (the user's choice: lines up to 300 letters; a line that fails is asked once more, then skipped).
//
// Kept on the hub, the last sixty; both players see each one. INTEGRATE sends the tagged thread to the mind hub (its
// write-up path: the Tiiny first) and keeps a write-up with a title; the history shows the title, or the time
// (dd/MMM/yyyy hh:mm TT) until there is one. Every word a player reads is DRAFT. No node: imports.
import type { Store } from "./store.js";
import { safeLine } from "./meetsafe.js";
import { cardOf, factsFrom, personaOf, personaVoice, speciesFacts, systemOf, type PersonaFacts } from "./ai/personaof.js";
import week from "../data/week.json" with { type: "json" };

export type Mode = "standard" | "twovoices";
export type Lean = "red" | "blue";                       // red: logical, left, bottom-up; blue: creative, right, top-down
export type Role = "tells" | "asks";
export type Side = "a" | "b";
export type Party = { player: string; species: number; nickname: string; name: string; level: number; edition: string;
                      lean?: Lean; role?: Role; voice: string; voiceKey: string };
export type Line = { who: Side; said: string; at: string; by: string };
export type Written = { title: string; text: string; at: string; by: string };
export type Dialogue = {
  id: string; at: string; mode: Mode; turns: number; prompt: string; starter: string; space: "out" | "household";
  a: Party; b: Party;                                     // a: the starter's daemon
  lines: Line[];
  status: "thinking" | "done" | "failed";
  next?: Side | null;                                     // whose line is being thought now (the thinking dots)
  stopped?: string;                                      // why it stopped early (not `error`: a reply with one reads as a failed request)
  written?: Written | null;
  integrating?: boolean;
};
type Cards = Record<string, PersonaFacts>;               // the card each player sent with their daemon out, by player
interface State { list: Dialogue[]; next: number; cards: Cards }

export const MIN_TURNS = 1, MAX_TURNS = 11, LINE_MOST = 300, PROMPT_MOST = 300, KEPT = 60;
const KEY = "dialogue";
const load = (store: Store): State => {
  try { const s = JSON.parse(store.getSetting(KEY) ?? "null"); if (s?.list) return { cards: {}, ...s }; } catch { /* none yet */ }
  return { list: [], next: 1, cards: {} };
};
function change<T>(store: Store, f: (s: State) => T): T {
  return store.together(() => { const s = load(store); const r = f(s); store.setSetting(KEY, JSON.stringify(s)); return r; });
}
const fail = (error: string) => ({ error });
export const clampTurns = (n: unknown) => Math.max(MIN_TURNS, Math.min(MAX_TURNS, Math.round(Number(n)) || MIN_TURNS));

// ---- the cards: each player's daemon out, as its own companion knows it ----
export function keepCard(store: Store, player: string, raw: unknown, edition = "CONTENT") {
  const f = factsFrom(raw, edition);
  if (!f) return;
  change(store, (s) => { s.cards[player] = cardOf(f); });
}
export const cardFor = (store: Store, player: string): PersonaFacts | null => load(store).cards[player] ?? null;

// ---- the forms: how each daemon is asked to answer (DRAFT: words to a model, never shown) ----
const BOTH = "You are talking with another daemon, face to face. Speak only as yourself, in the first person, one to three short " +
  "sentences, plain words, no lists, no stage directions, never your own name before your words. Do not simply agree: add " +
  "something of your own. Never say you are a program or a model.";
export const HOW: Record<Lean | Role, string> = {
  // THE GUIDE: "Thought tends to run in series: one step, then the next ... Thought works through the details, one at a time."
  red: "In this talk you lean LOGICAL. You think bottom-up and in series: one step, then the next. Start from what is concrete -- " +
       "a detail, a fact, a cause -- and build toward the whole only as far as the steps hold. Ask what follows from what. " +
       "You are steady and exact, and you are glad of the other's leaps when you can check them.",
  // THE GUIDE: "Feeling runs in parallel. It takes in the whole at once ... and changes how the details are read."
  blue: "In this talk you lean CREATIVE. You think top-down and in parallel: you take in the whole at once -- a picture, a " +
        "feeling, a pattern -- and let it change how the details are read. Reach for an image or a likeness first, then let " +
        "the other test it. You are warm and quick, and you are glad of the other's steps when they ground you.",
  // THE SUBTLE LAYER, TWO VOICES: "Let them take turns: one says a thing, the other asks what it means."
  tells: "This talk is in TWO VOICES. You are the TELLING voice. When you are asked, answer plainly and directly with one clear " +
         "claim, then stop: no question back, no hedging, at most two short sentences. Like this --\n" +
         "Asked \"What breaks it?\" you say: \"A conclusion that stopped accepting correction.\"\n" +
         "Asked \"Is watching enough?\" you say: \"No. Watching is noticing, and then comparing what a part does with what the whole needs.\"",
  asks: "This talk is in TWO VOICES. You are the ASKING voice. You never give a view of your own. Each time it is your turn you say " +
        "ONE short line, and it ends with a question mark. It is one of three things: a QUESTION that goes one step further " +
        "into what was just said; a CLARIFYING question about one word or idea in it; or a REPEAT -- what you heard, said back " +
        "in your own few words, to check it (\"So silence means check yourself?\"). Like this --\n" +
        "Told \"Integrity is staying correctable.\" you ask: \"What breaks it?\"\n" +
        "Told \"A shadow is the unwatched part.\" you ask: \"Then how does a shadow hide?\"",
};
const FIRST_ASK = "You speak first: put the opening to them as your own short question.";
const LAST_ASK = "This is your last turn: REPEAT -- say back, in one short line ending with a question mark, what you have understood from all of it.";

// the order of the talk: who speaks at each line. STANDARD: the starter's daemon first. TWO VOICES: the asking voice first
// (it puts the opening to the other), so the talk ends on a telling, as the book's does.
export function order(d: Pick<Dialogue, "mode" | "turns" | "a" | "b">): Side[] {
  const first: Side = d.mode === "twovoices" ? (d.a.role === "asks" ? "a" : "b") : "a", second: Side = first === "a" ? "b" : "a";
  return Array.from({ length: d.turns * 2 }, (_, i) => (i % 2 ? second : first));
}
const tagOf = (p: Party) => (p.lean === "red" ? "<red logical left>" : p.lean === "blue" ? "<blue creative right>" : p.role === "tells" ? "<telling>" : "<asking>");

// One daemon's next line asked for: its system message and what it is shown
export function askFor(d: Dialogue, who: Side, persona: string, k: number, of: number): { system: string; user: string } {
  const me = d[who], other = d[who === "a" ? "b" : "a"];
  const how = [BOTH, HOW[(d.mode === "standard" ? me.lean : me.role) ?? "red"],
               me.role === "asks" && k === 0 ? FIRST_ASK : "", me.role === "asks" && k === of - 1 && of > 1 ? LAST_ASK : ""].filter(Boolean).join("\n");
  const so = d.lines.map((l) => `${d[l.who].nickname}: ${l.said}`).join("\n");
  const user = `You are with ${other.nickname}, a ${other.name} daemon.\nThe opening, set by the people who carry you both: ${d.prompt}\n` +
               (so ? `\nSo far:\n${so}\n` : "\nNobody has spoken yet.\n") + `\nNow you, ${me.nickname}: say your next line, and only that.`;
  return { system: systemOf(persona, how), user };
}

// a thinker's line, kept to the line: no name before it, no quotes round it, at most LINE_MOST, ending on a whole sentence
export function trimSaid(t: string, me: string): string {
  let s = t.replace(/<think>[\s\S]*?<\/think>/g, "").replace(/\s+/g, " ").trim()
    .replace(new RegExp(`^\\**${me.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\**\\s*:\\s*`, "i"), "").replace(/^["“]+|["”]+$/g, "").trim();
  if (s.length > LINE_MOST) { const cut = s.slice(0, LINE_MOST), end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
                              s = end > 40 ? cut.slice(0, end + 1) : `${cut.replace(/\s+\S*$/, "")}...`; }
  return s;
}

// ---- the thinkers the hub hands in ----
// one line: the system message, what it is shown, the most tokens. Its words, and which mind said them; a throw: none answered.
export type Thinker = (system: string, user: string, most: number) => Promise<{ text: string | null; by: string }>;
let thinker: Thinker | null = null, writer: Thinker | null = null;
export const setDialogueThinker = (t: Thinker | null, w: Thinker | null = t) => { thinker = t; writer = w; };

// One at a time on the hub: a second talk waits for the first (the Tiiny thinks one thing well at a time)
let queue: Promise<unknown> = Promise.resolve();
const inTurn = <T>(f: () => Promise<T>): Promise<T> => { const p = queue.then(f, f); queue = p.catch(() => {}); return p; };

const persist = (store: Store, id: string, f: (d: Dialogue) => void) =>
  change(store, (s) => { const d = s.list.find((x) => x.id === id); if (d) f(d); return d ?? null; });

// The talk, line by line, each kept as it comes so a phone watching sees it arrive
export async function run(store: Store, id: string, personas: Record<Side, string>, filtered: boolean, think: Thinker | null = thinker): Promise<Dialogue | null> {
  return inTurn(async () => {
    const d0 = load(store).list.find((x) => x.id === id);
    if (!d0) return null;
    if (!think) return persist(store, id, (d) => { d.status = "failed"; d.next = null; d.stopped = "no mind is answering on the hub"; });   // DRAFT
    const seq = order(d0), count: Record<Side, number> = { a: 0, b: 0 }, known = [d0.a.nickname, d0.b.nickname, d0.a.name, d0.b.name];
    for (let i = 0; i < seq.length; i++) {
      const who = seq[i];
      persist(store, id, (d) => { d.next = who; });
      const d = load(store).list.find((x) => x.id === id)!;
      const ask = askFor(d, who, personas[who], count[who], d.turns);
      let line: { said: string; by: string } | null = null, failed = "";
      for (let tryNo = 0; tryNo < 2 && !line; tryNo++) {           // a line that fails the filter is asked once more
        try {
          const r = await think(ask.system, ask.user, 160);
          const said = trimSaid(r.text ?? "", d[who].nickname);
          const ok = !said ? null : filtered ? safeLine(said, known, LINE_MOST) : said;
          if (ok) line = { said: ok, by: r.by }; else failed = "a line did not pass";
        } catch (e) { failed = (e as Error).message || "no mind answered"; break; }
      }
      count[who]++;
      if (line) persist(store, id, (x) => { x.lines.push({ who, said: line!.said, at: new Date().toISOString(), by: line!.by }); });
      else if (failed !== "a line did not pass")                      // no mind at all: stop here, keep what was said
        return persist(store, id, (x) => { x.status = x.lines.length ? "done" : "failed"; x.next = null; x.stopped = `stopped: ${failed}`.slice(0, 120); });
    }
    return persist(store, id, (x) => { x.status = "done"; x.next = null; });
  });
}

const partyOf = (f: PersonaFacts, player: string, edition: string): Party => {
  const v = personaVoice(f);
  return { player, species: f.species, nickname: f.nickname, name: f.name ?? "", level: f.level ?? 1, edition, voice: v.recipe, voiceKey: v.key };
};

// A talk begun between two daemons, by their facts. Answers at once with the talk (thinking); the lines follow.
export type Begin = { mode?: unknown; turns?: unknown; prompt?: unknown; swap?: unknown };
export function begin(store: Store, starter: string, a: { player: string; facts: PersonaFacts; edition: string },
                      b: { player: string; facts: PersonaFacts; edition: string }, ask: Begin, o: { filtered: boolean; space: Dialogue["space"]; now?: Date; think?: Thinker | null }): Dialogue | { error: string } {
  const mode: Mode = ask.mode === "twovoices" ? "twovoices" : "standard", swap = ask.swap === true;
  const prompt = typeof ask.prompt === "string" ? ask.prompt.replace(/\s+/g, " ").trim() : "";
  if (!prompt) return fail("say how it should begin");                                                    // DRAFT
  if (prompt.length > PROMPT_MOST) return fail(`at most ${PROMPT_MOST} letters to begin with`);           // DRAFT
  const known = [a.facts.nickname, b.facts.nickname, a.facts.name ?? "", b.facts.name ?? ""];
  if (o.filtered && !safeLine(prompt, known, PROMPT_MOST)) return fail("that opening cannot be sent to another player's daemon -- no names, numbers, links or places");   // DRAFT
  const pa = partyOf(a.facts, a.player, a.edition), pb = partyOf(b.facts, b.player, b.edition);
  if (mode === "standard") { pa.lean = swap ? "blue" : "red"; pb.lean = swap ? "red" : "blue"; }
  else { pa.role = swap ? "tells" : "asks"; pb.role = swap ? "asks" : "tells"; }
  const now = o.now ?? new Date();
  const d = change(store, (s) => {
    const x: Dialogue = { id: `t${s.next++}`, at: now.toISOString(), mode, turns: clampTurns(ask.turns), prompt, starter, space: o.space,
                          a: pa, b: pb, lines: [], status: "thinking", next: null, written: null };
    s.list = [...s.list, x].slice(-KEPT);
    return x;
  });
  const personas = { a: personaOf(a.facts, { roomy: true }), b: personaOf(b.facts, { roomy: true }) };
  void run(store, d.id, personas, o.filtered, o.think === undefined ? thinker : o.think).catch(() =>
    persist(store, d.id, (x) => { x.status = "failed"; x.next = null; x.stopped = "the talk stopped"; }));   // DRAFT
  return d;
}

// ---- OUT TOGETHER (C-220): this player's daemon out talks with another player's out now ----
type OutBrief = { player?: string; species: number; nickname: string; level: number; edition: string };
export function startOut(store: Store, player: string, mine: OutBrief | null, theirs: (OutBrief & { id?: string }) | null, ask: Begin & { card?: unknown },
                         now = new Date(), think?: Thinker | null): Dialogue | { error: string } {
  if (!mine) return fail("send one of yours out first");                                                  // DRAFT
  if (!theirs?.id) return fail("they are not out now");                                                   // DRAFT
  if (ask.card) keepCard(store, player, ask.card, mine.edition);
  const facts = (who: string, o: OutBrief) => {
    const c = cardFor(store, who);
    const f = c && c.species === o.species ? c : speciesFacts(o.species, o.nickname, o.edition);
    return { ...f, nickname: o.nickname, level: o.level };
  };
  return begin(store, player, { player, facts: facts(player, mine), edition: mine.edition },
               { player: theirs.id, facts: facts(theirs.id, theirs), edition: theirs.edition }, ask, { filtered: true, space: "out", now, think });
}

// ---- seen: the talks this player's daemons were in, the newest first ----
const mineTo = (d: Dialogue, player: string) => d.a.player === player || d.b.player === player;
const brief = (p: Party, name: (id: string) => string) => ({ player: name(p.player), species: p.species, nickname: p.nickname, name: p.name, level: p.level,
                                                             lean: p.lean, role: p.role, voice: p.voice, voiceKey: p.voiceKey });
export function shown(d: Dialogue, name: (id: string) => string = (x) => x) {
  return { ...d, a: brief(d.a, name), b: brief(d.b, name), starter: name(d.starter) };
}
export function list(store: Store, player: string, name: (id: string) => string = (x) => x) {
  return { dialogues: load(store).list.filter((d) => mineTo(d, player)).reverse()
    .map((d) => ({ id: d.id, at: d.at, mode: d.mode, turns: d.turns, status: d.status, title: d.written?.title ?? null, lines: d.lines.length,
                   integrating: !!d.integrating, a: brief(d.a, name), b: brief(d.b, name) })) };
}
export function one(store: Store, player: string, id: unknown, name: (id: string) => string = (x) => x) {
  const d = load(store).list.find((x) => x.id === id && mineTo(x, player));
  return d ? shown(d, name) : fail("no such talk");                                                       // DRAFT
}

// ---- INTEGRATE: the tagged thread to the mind hub, a titled write-up back ----
export const INTEGRATE_SYSTEM =
  "You are the integration between two minds, the bridge between two halves that each saw part of the whole. Below is a " +
  "conversation between two daemons -- small creatures from the game DAEMONS -- each line tagged with how its speaker leans: " +
  "<red logical left> thinks bottom-up, in series, from the details; <blue creative right> thinks top-down, in parallel, from " +
  "the whole; or, in the form of TWO VOICES, <telling> says a thing and <asking> asks what it means. Balance is not a midpoint " +
  "between them: it is the two passing their results to each other, quickly and honestly. Write what the conversation comes " +
  "to when its halves are put together: what each brought that the other could not, where they met, and what it adds up to. " +
  "First line exactly: TITLE: <a title of two to six words>. Then a blank line, then two or three short paragraphs, plain " +
  "and warm, in the third person, naming the two daemons. No lists, no headings, no tags.";
export function thread(d: Dialogue): string {
  return [`The opening: ${d.prompt}`, `${d.a.nickname} ${tagOf(d.a)} and ${d.b.nickname} ${tagOf(d.b)}${d.mode === "twovoices" ? ", in TWO VOICES" : ""}.`, "",
          ...d.lines.map((l) => `${tagOf(d[l.who])} ${d[l.who].nickname}: ${l.said}`)].join("\n");
}
export function readWritten(text: string): { title: string; text: string } {
  const t = text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  const m = /^\s*\**\s*TITLE\s*:\s*\**\s*(.+?)\s*\**\s*$/im.exec(t);
  const title = (m?.[1] ?? "").replace(/^["“#\s]+|["”\s]+$/g, "").slice(0, 60);
  const body = (m ? t.replace(m[0], "") : t).trim();
  return { title: title || body.split(/[.!?]/)[0].split(/\s+/).slice(0, 5).join(" ").slice(0, 60), text: body.slice(0, 4000) };
}
export async function integrate(store: Store, player: string, id: unknown, name: (id: string) => string = (x) => x,
                                write: Thinker | null = writer): Promise<ReturnType<typeof shown> | { error: string }> {
  const d = load(store).list.find((x) => x.id === id && mineTo(x, player));
  if (!d) return fail("no such talk");                                                                    // DRAFT
  if (d.status === "thinking") return fail("let them finish first");                                     // DRAFT
  if (!d.lines.length) return fail("nothing was said to put together");                                  // DRAFT
  if (!write) return fail("no mind is answering on the hub");                                            // DRAFT
  persist(store, d.id, (x) => { x.integrating = true; });
  void (async () => {
    try {
      const r = await write(INTEGRATE_SYSTEM, thread(d), 700);
      if (!r.text?.trim()) throw new Error("no words came");
      const w = readWritten(r.text);
      persist(store, d.id, (x) => { x.integrating = false; x.written = { ...w, at: new Date().toISOString(), by: r.by }; });
    } catch { persist(store, d.id, (x) => { x.integrating = false; }); }
  })();
  return shown({ ...d, integrating: true }, name);
}

// ---- the history's dates: dd/MMM/yyyy hh:mm TT, grouped by week (Sunday first), a dot in the weekday's colour ----
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function stampOf(iso: string): string {
  const t = new Date(iso), h = t.getHours() % 12 || 12;
  const two = (n: number) => String(n).padStart(2, "0");
  return `${two(t.getDate())}/${MONTHS[t.getMonth()]}/${t.getFullYear()} ${two(h)}:${two(t.getMinutes())} ${t.getHours() < 12 ? "AM" : "PM"}`;
}
export const dayColour = (iso: string) => week.days[new Date(iso).getDay()].colour;
export const dayName = (iso: string) => week.days[new Date(iso).getDay()].day;
// the week a talk falls in: its Sunday, as a local date key, and a label ("Week of 08/Nov/2026")
export function weekOf(iso: string): { key: string; label: string } {
  const t = new Date(iso), sun = new Date(t.getFullYear(), t.getMonth(), t.getDate() - t.getDay());
  const key = `${sun.getFullYear()}-${String(sun.getMonth() + 1).padStart(2, "0")}-${String(sun.getDate()).padStart(2, "0")}`;
  return { key, label: `Week of ${stampOf(sun.toISOString()).slice(0, 11)}` };                           // DRAFT
}
export function byWeek<T extends { at: string }>(items: T[]): { key: string; label: string; items: T[] }[] {
  const out: { key: string; label: string; items: T[] }[] = [];
  for (const x of [...items].sort((p, q) => q.at.localeCompare(p.at))) {
    const w = weekOf(x.at), last = out[out.length - 1];
    if (last?.key === w.key) last.items.push(x); else out.push({ ...w, items: [x] });
  }
  return out;
}
