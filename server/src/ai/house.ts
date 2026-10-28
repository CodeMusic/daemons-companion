// C-180 (HUB.md Phase 5): the modules in the house -- the hub's Module LLM on its own link, a standalone AX630 board on
// the network, any more found later -- each one more worker for the daemons' talk. Thinking, voice and hearing all on
// the module, so a talk never leaves the house. Which modules there are is the store's `ai.modules` (written by whatever
// finds them: the hub's discovery, or by hand); what each can do is learned from its own /v1/models, never assumed.
//
// One talk at a time on each module (one small model; a second waits rather than slowing the first). A talk asks the
// first idle module; with none idle, or no first words within the deadline, it is LATE and the caller takes it elsewhere
// (n8n, the way it goes today). No node: imports -- the words and the WAV are plain bytes.
import { chat, hear, LATE, listModels, pickModels, speak, type ModuleModel } from "./module.js";

export type ModuleAt = { url: string; name: string; found?: string };
export type TalkAsk = {
  text?: string; wav?: Uint8Array;                        // what was said: words, or a 16 kHz WAV to hear
  history: { said: string; answer: string }[];
  daemon: { nickname: string; name?: string; types?: string; category?: string; entry?: string;
            level?: number | null; mood?: string; fed?: string; dream?: string };   // the user, 2026-10-28: its game, so they can ask
  day?: { day: string; theme?: string; cue?: string } | null;
  season?: string;
  goal?: { goal: string; step: string } | null;
  speak: boolean;
  guide?: (heard: string) => string;                      // C-209: asked of the GUIDE -- who answers, from the pages nearest what was heard
};
export type TalkAnswer = { answer: string; heard: string | null; audio: Uint8Array | null; provider: string; firstMs: number | null };

export const DEADLINE_MS = 2000;                          // item 4: no first words by then, and the talk goes elsewhere
const MODELS_MS = 60_000;                                 // what a module holds, asked again after a minute

const kept = (raw: string | null): ModuleAt[] => {
  try {
    const list = JSON.parse(raw ?? "[]");
    return Array.isArray(list) ? list.filter((m) => m && typeof m.url === "string" && /^https?:\/\//.test(m.url))
      .map((m) => ({ url: m.url.replace(/\/+$/, ""), name: typeof m.name === "string" && m.name ? m.name : new URL(m.url).host,
                     ...(typeof m.found === "string" ? { found: m.found } : {}) })) : [];
  } catch { return []; }
};
export const modulesIn = (get: (k: string) => string | null) => kept(get("ai.modules"));
export function checkModules(list: unknown): ModuleAt[] | string {
  if (!Array.isArray(list)) return "modules is a list of {url, name}";
  const ok = kept(JSON.stringify(list));
  return ok.length === list.length ? ok : "each module needs a url (http://...) and may have a name";
}

// A daemon's turn, for a model with a short window: who it is, the day, and a sentence or two (DRAFT: the companion's
// own words to the model, never shown)
// Who the daemon is, for one talk -- sent at the head of the user's own message, never as the system message: M5's
// plugin keeps a pooled client's FIRST system prompt for every later talk (the hardware lane, 2026-10-28: a daemon
// answered as the benchmark's ROVERCUB), so the system message is the same every time (TALK_SYSTEM) and this rides with
// each question. Short: qwen2.5-0.5B's window is small -- under ~350 tokens, the question included.
// Short on purpose: M5's plugin sets a pooled client up with the first system message it sees, and on the module a long
// one (50 words) leaves that client answering nothing, for good, until its services restart; 15 words answer (2026-10-28)
export const TALK_SYSTEM = "You are a character in the game DAEMONS. Become who the note in brackets describes.";
export function persona(a: TalkAsk, heard = ""): string {
  if (a.guide) return a.guide(heard);                     // C-209: the GUIDE answers, not the daemon
  const d = a.daemon;
  const who = [`You are ${d.nickname}`, d.name && d.name !== d.nickname ? `a ${d.name}` : "", d.types ? `a ${d.types} daemon` : "a daemon",
               d.level ? `level ${d.level}` : ""].filter(Boolean).join(", ");
  return [`${who}, from the INDEX, who lives with the user.`,
          d.entry ? `Your INDEX entry: ${d.entry.replace(/\s+/g, " ").slice(0, 120)}` : "",
          d.mood ? `You feel ${d.mood}${d.fed ? `; ${d.fed}` : ""}.` : "",
          d.dream ? `Last night you dreamt: ${d.dream.replace(/\s+/g, " ").slice(0, 90)}` : "",
          a.day ? `Today is ${a.day.day}${a.day.theme ? ` (${a.day.theme})` : ""}${a.season ? `, in ${a.season}` : ""}.` : "",
          a.goal ? `The user is working on: ${a.goal.goal} -- next, ${a.goal.step}.` : "",
          // the style rides here, not in the system message: a long system message at a pooled client's setup made every
          // answer from it empty (the hardware lane, 2026-10-28); the name said again, the 0.5B drifts from it
          `Answer as ${d.nickname}, in one or two short warm sentences. Never say you are an AI.`]
    .filter(Boolean).join(" ");
}
// the user's message as the module is sent it: who it is, then what they said
export const askedAs = (a: TalkAsk, said: string) => `[${persona(a, said)}]\nThey say: ${said.slice(0, 500)}`;

type Held = { at: number; llm?: string; tts?: string; stt?: string; error?: string };

const HEAR_MS = 8000, DEAF_MS = 10 * 60_000;
export type Faults = { empty: number; taskFull: number; garbled: number; last: { kind: string; at: string } | null };
export class House {
  // C-180: the module's signs of leaked task slots (empty answers, "task full") and garbled words, counted since the
  // server started -- in /api/talk/settings health, so the hardware lane knows when a watchdog is due
  readonly faults: Faults = { empty: 0, taskFull: 0, garbled: 0, last: null };
  private fault(kind: "empty" | "taskFull" | "garbled") { this.faults[kind]++; this.faults.last = { kind, at: new Date(this.now()).toISOString() }; }
  private deafUntil = new Map<string, number>();
  private deaf(url: string) { return (this.deafUntil.get(url) ?? 0) > this.now(); }
  private busy = new Set<string>();
  private held = new Map<string, Held>();
  constructor(private modules: () => ModuleAt[], private now = () => Date.now()) {}

  // Each module, what it holds, whether it is answering now
  async view(): Promise<(ModuleAt & { busy: boolean; llm: string | null; tts: string | null; stt: string | null; error: string | null })[]> {
    return Promise.all(this.modules().map(async (m) => {
      const h = await this.models(m);
      return { ...m, busy: this.busy.has(m.url), llm: h.llm ?? null, tts: h.tts ?? null, stt: h.stt ?? null, error: h.error ?? null };
    }));
  }
  get any() { return this.modules().length > 0; }

  private async models(m: ModuleAt): Promise<Held> {
    const h = this.held.get(m.url);
    if (h && this.now() - h.at < MODELS_MS) return h;
    let next: Held;
    try {
      const list: ModuleModel[] = await listModels(m.url, 3000);
      next = { at: this.now(), ...pickModels(list) };                // the fast thinker, an English voice, Whisper (module.ts)
    } catch (e) { next = { at: this.now(), error: (e as Error).message }; }
    this.held.set(m.url, next);
    return next;
  }

  // The first module that is idle and can think (and hear, when it was a recording); null when every one is busy
  private async free(needsHearing: boolean): Promise<{ m: ModuleAt; h: Held } | null> {
    for (const m of this.modules()) {
      if (this.busy.has(m.url)) continue;
      const h = await this.models(m);
      if (h.llm && (!needsHearing || (h.stt && !this.deaf(m.url))) && !this.busy.has(m.url)) return { m, h };
    }
    return null;
  }

  // A daemon's talk on a module. Throws LATE (none free, or no first words in time) for the caller to go elsewhere;
  // deadlineMs null waits as long as it takes (no internet: the module is all there is).
  async talk(a: TalkAsk, deadlineMs: number | null = DEADLINE_MS): Promise<TalkAnswer> {
    const got = await this.free(!a.text && !!a.wav);
    if (!got) throw new Error(LATE);
    const { m, h } = got;
    this.busy.add(m.url);
    try {
      let heard: string | null = null, text = a.text?.trim() ?? "";
      if (!text && a.wav) {
        // a module's hearing that does not answer in HEAR_MS (Whisper beside the LLM and MeloTTS: "Server busy" after
        // 30 s, the hardware lane 2026-10-28) is LATE -- the recording goes elsewhere, and that module is not asked to
        // hear again for DEAF_MS. With nowhere else to go (deadlineMs null) it is waited on as long as before.
        try { heard = (await hear(m.url, h.stt!, Buffer.from(a.wav), deadlineMs ? HEAR_MS : undefined)).text.trim(); }
        catch (e) { if (!deadlineMs) throw e; this.deafUntil.set(m.url, this.now() + DEAF_MS); throw new Error(LATE); }
        text = heard;
        if (!text) return { answer: "", heard: "", audio: null, provider: `module:${m.name}`, firstMs: null };
      }
      const messages = [{ role: "system", content: TALK_SYSTEM },
        ...a.history.slice(-2).flatMap((x) => [{ role: "user", content: x.said.slice(0, 150) }, { role: "assistant", content: x.answer.slice(0, 150) }]),   // the small window
        { role: "user", content: askedAs(a, text) }];
      let r: Awaited<ReturnType<typeof chat>>;
      try { r = await chat(m.url, h.llm!, messages, { maxTokens: 60, ...(deadlineMs ? { firstWithinMs: deadlineMs } : {}) }); }
      catch (e) { if (/task full/i.test((e as Error).message)) this.fault("taskFull"); throw e; }
      // the plugin pastes its own JSON parse error into the words when two of StackFlow's messages share a chunk
      // ("Hello, RO[ERROR: Extra data: ...]", the hardware lane): what came before it is kept
      const cut = r.text.indexOf("[ERROR:");
      if (cut >= 0) this.fault("garbled");
      const answer = (cut >= 0 ? r.text.slice(0, cut) : r.text).trim();
      // a module that says nothing has failed (2026-10-28: its LLM answering "" with its slots leaked) -- never silence
      if (!answer) { this.fault("empty"); throw new Error("the hub's AI board answered nothing"); }
      const audio = a.speak && h.tts && answer ? new Uint8Array((await speak(m.url, h.tts, answer)).audio) : null;
      return { answer, heard, audio, provider: `module:${m.name}`, firstMs: r.firstMs };
    } finally { this.busy.delete(m.url); }
  }

  // Words in a module's voice (the INDEX, when it is set to the module); null when no module can speak
  async voice(text: string): Promise<{ audio: Uint8Array; provider: string } | null> {
    for (const m of this.modules()) {
      const h = await this.models(m);
      if (!h.tts) continue;
      return { audio: new Uint8Array((await speak(m.url, h.tts, text)).audio), provider: `module:${m.name}` };
    }
    return null;
  }
}

// The list, written for the House to use -- by the hub's discovery (ai/discover.ts, the hardware lane) or the settings
// route. Only modules whose /v1/models answers are kept; the rest are dropped and named. Never scans the network.
export async function setModules(store: { setSetting(k: string, v: string): void }, list: ModuleAt[]):
    Promise<{ kept: ModuleAt[]; dropped: { url: string; error: string }[] }> {
  const tried = await Promise.all(list.map(async (m) => {
    try { await listModels(m.url, 3000); return { m, error: null }; } catch (e) { return { m, error: (e as Error).message }; }
  }));
  const kept = tried.filter((t) => !t.error).map((t) => t.m);
  store.setSetting("ai.modules", JSON.stringify(kept));
  return { kept, dropped: tried.filter((t) => t.error).map((t) => ({ url: t.m.url, error: t.error! })) };
}
