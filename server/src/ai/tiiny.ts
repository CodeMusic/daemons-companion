// C-249 (the user, 2026-10-30: "I plug it in to ROVERBYTESEER ... and once set up the hub can talk to it"): the Tiiny
// Pocket as one more thinker for the daemons' talk, reached over the house network -- through roverbyteseer's LiteLLM
// (http://roverbyteseer:4000/v1, the default) or straight at the device (http://<its address>/openai/v1). Both speak
// OpenAI's API; the base is kept whole and must end in /v1, so neither is guessed at. The key lives in the store (this
// machine's database), never in a tracked file. What it holds is learned from its own /models, never assumed.
//
// Its window is large, so unlike the module (house.ts) the daemon's whole self rides as the system message (self.ts).
// No node: imports -- this runs on the phone too.
import { sayable } from "./say.js";   // C-270

// Two thinkers (the user, 2026-11-05: "the larger one for async tasks but if we have a user talking to a daemon it needs to
// respond quick"): model is the BACKGROUND thinker -- write-ups, meetings, anything that may take a while, thinking on;
// quick is the FOREGROUND one -- a talk, the GUIDE, a command, someone waiting -- thinking off, a few sentences. quick
// unset is the background model with thinking off (measured 2026-11-05 on the Tiiny: Qwen3.6-35B-A3B answers a talk in
// 1-1.5 s, first words streamed in 0.4 s, no slower than Qwen3.5-9B -- it wakes only 3B of itself per word).
export type TiinyAt = { url: string; key: string; model: string; quick: string; tts: string; asr: string; voice: string };

export const TIINY_SETTINGS = ["tiiny.url", "tiiny.key", "tiiny.model", "tiiny.quick", "tiiny.tts", "tiiny.asr", "tiiny.voice"] as const;

export const tiinyUrl = (raw: string): string | null => {
  const u = raw.trim().replace(/\/+$/, "");
  return /^https?:\/\/[^\s/]+(\/[^\s]*)?\/v1$/.test(u) ? u : null;
};

// What the store holds, or null until an address is given
export function tiinyIn(get: (k: string) => string | null): TiinyAt | null {
  const url = tiinyUrl(get("tiiny.url") ?? "");
  if (!url) return null;
  return { url, key: get("tiiny.key") ?? "", model: get("tiiny.model") ?? "", quick: get("tiiny.quick") ?? "", tts: get("tiiny.tts") ?? "",
           asr: get("tiiny.asr") ?? "", voice: get("tiiny.voice") ?? "" };
}

const headers = (at: TiinyAt, json = true): Record<string, string> =>
  ({ ...(json ? { "content-type": "application/json" } : {}), ...(at.key ? { authorization: `Bearer ${at.key}` } : {}) });

async function timed<T>(ms: number, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), ms);
  try { return await run(ctl.signal); } finally { clearTimeout(timer); }
}

// The models it holds, by id -- null when it cannot be reached (the health dot, C-211)
export async function tiinyModels(at: TiinyAt, f: typeof fetch = fetch, ms = 5000): Promise<string[] | null> {
  try {
    return await timed(ms, async (signal) => {
      const r = await f(`${at.url}/models`, { headers: headers(at, false), signal });
      if (!r.ok) return null;
      const j = await r.json();
      return Array.isArray(j?.data) ? j.data.map((m: { id?: unknown }) => String(m?.id ?? "")).filter(Boolean) : [];
    });
  } catch { return null; }
}

// The thinker to ask: the one chosen, else the first that is not for hearing, speaking or pictures
const SIDE = /asr|tts|whisper|speech|voice|image|flux|embed|rerank|ocr|music|3d/i;
export const pickThinker = (at: TiinyAt, held: string[]) => at.model || held.find((m) => !SIDE.test(m)) || "";
// The foreground thinker: the quick one if chosen, else the background one (with its thinking off, in tiinyChat)
export const pickQuick = (at: TiinyAt, held: string[]) => at.quick || pickThinker(at, held);

// What a background thinker may spend reasoning before it answers, over what it may say (Qwen counts both in max_tokens)
export const THINK_BUDGET = 4096;

export type Turn = { said: string; answer: string };

// One answer: the self as the system message, the turns before, then what was said. Throws on any failure, so the
// caller takes the talk elsewhere (the module, then n8n). think: the background path -- it reasons first, with
// THINK_BUDGET more tokens and the caller's longer wait; if all of it went on reasoning, it is asked again without.
export async function tiinyChat(at: TiinyAt, model: string, system: string, history: Turn[], said: string,
                                f: typeof fetch = fetch, ms = 30_000, maxTokens = 220, think = false, plain = false): Promise<string> {
  // plain (C-280 (1)): a public endpoint is not sent chat_template_kwargs -- a strict API refuses an argument it does not know
  if (!model) throw new Error("no model chosen");
  const messages = [{ role: "system", content: system },
                    ...history.slice(-6).flatMap((t) => [{ role: "user", content: t.said }, { role: "assistant", content: t.answer }]),
                    { role: "user", content: said.slice(0, think ? 16_000 : 1000) }];   // C-298: the background path reads a write-up's whole input (a journal; a meeting's 4000)
  return timed(ms, async (signal) => {
    const r = await f(`${at.url}/chat/completions`, { method: "POST", headers: headers(at), signal,
      // thinking off: Qwen3.6 otherwise spends every token reasoning and says nothing (2026-11-03: 220 tokens of
      // reasoning_content, content ""); off, it answered in 3-4 s. Read at the top level by the Tiiny, through LiteLLM.
      body: JSON.stringify({ model, messages, max_tokens: maxTokens + (think ? THINK_BUDGET : 0), temperature: think ? 0.7 : 0.8,
                             ...(plain ? {} : { chat_template_kwargs: { enable_thinking: think } }) }) });
    if (!r.ok) throw new Error(`the Tiiny answered ${r.status}`);
    const j = await r.json();
    // a thinking model's reasoning is left out: only what it says
    let text = String(j?.choices?.[0]?.message?.content ?? "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    // cut off by the cap: end on its last whole sentence, so a voice never stops mid-word
    if (j?.choices?.[0]?.finish_reason === "length") { const end = Math.max(...[".", "!", "?", "…"].map((c) => text.lastIndexOf(c)));
                                                       if (end > 20) text = text.slice(0, end + 1); }
    if (!text && think) return tiinyChat(at, model, system, history, said, f, ms, maxTokens, false, plain);
    if (!text) throw new Error("the Tiiny said nothing");
    return text;
  });
}

// A line in a daemon's voice: the TTS model, its speaker and an instruction (C-251's recipe). null without a TTS model.
export async function tiinySpeak(at: TiinyAt, text: string, instructions = "", f: typeof fetch = fetch, ms = 30_000):
    Promise<{ audio: Uint8Array; mime: string } | null> {
  if (!at.tts) return null;
  try {
    return await timed(ms, async (signal) => {
      const r = await f(`${at.url}/audio/speech`, { method: "POST", headers: headers(at), signal,
        body: JSON.stringify({ model: at.tts, input: sayable(text).slice(0, 600), voice: at.voice || "default", response_format: "wav",
                               ...(instructions ? { instructions } : {}) }) });
      if (!r.ok) return null;
      const audio = new Uint8Array(await r.arrayBuffer());
      // the bytes say what it is: the Tiiny sends a WAV labelled audio/mpeg (seen 2026-11-03, through LiteLLM)
      const riff = audio.length > 12 && String.fromCharCode(...audio.subarray(0, 4)) === "RIFF";
      return audio.length ? { audio, mime: riff ? "audio/wav" : r.headers.get("content-type") || "audio/mpeg" } : null;
    });
  } catch { return null; }
}

// C-317 (the user, 2026-11-10: "look into the 23 s voice"): the same voice, streamed -- the Tiiny makes it a little faster
// than it is spoken (20 s of speech in 13 s, measured), so its first words arrive in about two seconds where the whole
// took thirteen. The body as it comes, and what the first bytes say it is; null when it would not start (no TTS model,
// refused, nothing within `ms`).
export async function tiinySpeakStream(at: TiinyAt, text: string, instructions = "", f: typeof fetch = fetch, ms = 20_000):
    Promise<{ first: Uint8Array; rest: ReadableStreamDefaultReader<Uint8Array>; kind: "wav" | "mp3" | "pcm" } | null> {
  if (!at.tts) return null;
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await f(`${at.url}/audio/speech`, { method: "POST", headers: headers(at), signal: ctl.signal,
      body: JSON.stringify({ model: at.tts, input: sayable(text).slice(0, 600), voice: at.voice || "default", response_format: "pcm",
                             stream: true, ...(instructions ? { instructions } : {}) }) });
    if (!r.ok || !r.body) return null;
    const rest = r.body.getReader();
    let first = new Uint8Array(0);
    while (first.length < 64) {                          // enough to say what it is
      const { done, value } = await rest.read();
      if (done) break;
      const both = new Uint8Array(first.length + value.length); both.set(first); both.set(value, first.length); first = both;
    }
    clearTimeout(timer);
    if (!first.length) return null;
    const head = String.fromCharCode(...first.subarray(0, 4));
    const kind = head === "RIFF" ? "wav" : head.startsWith("ID3") || (first[0] === 0xff && (first[1] & 0xe0) === 0xe0) ? "mp3" : "pcm";
    // the stream outlives the first bytes: the timer is gone, and a stall later is the reader's to notice
    return { first, rest, kind };
  } catch { clearTimeout(timer); return null; }
}

// What was said, from a 16 kHz WAV. null without an ASR model, or when it hears nothing.
// The Tiiny's hearing model answers with its pieces run together ("me.Did"), then the whole, spaced -- and then, on a
// longer clip, any piece that came after it (seen 2026-11-06: "There.That was me.Did anything see?There, that was me. Did
// anything see? ..."; 2026-11-10, a 13 s memo: "...And the basil.Okay, team. Quick sync: ... and the basil.Let's meet
// again on Monday."). Cut at each run-together end, the whole is the longest stretch, as long as the pieces before it:
// kept with what followed it. A hearing whose longest stretch comes first is kept as it came.
export function lastHearing(text: string): string {
  const t = text.trim(), cuts = [0];
  for (const m of t.matchAll(/[.?!](?=[A-Z])/g)) cuts.push(m.index! + 1);
  if (cuts.length < 2) return t;
  const parts = cuts.map((c, i) => t.slice(c, cuts[i + 1] ?? t.length).trim()).filter(Boolean);
  const words = (x: string) => x.split(/\s+/).filter(Boolean).length;
  let w = 0;
  parts.forEach((p, i) => { if (words(p) > words(parts[w])) w = i; });
  const before = parts.slice(0, w).reduce((n, p) => n + words(p), 0);
  if (w === 0 || words(parts[w]) < 3 || words(parts[w]) < 0.6 * before) return t;
  return [parts[w], ...parts.slice(w + 1)].join(" ");
}

export async function tiinyHear(at: TiinyAt, wav: Uint8Array, f: typeof fetch = fetch, ms = 30_000): Promise<string | null> {
  if (!at.asr) return null;
  try {
    return await timed(ms, async (signal) => {
      const form = new FormData();
      form.append("model", at.asr);
      form.append("response_format", "json");      // the Tiiny takes json or text only (2026-11-05)
      form.append("file", new Blob([new Uint8Array(wav)], { type: "audio/wav" }), "said.wav");
      const r = await f(`${at.url}/audio/transcriptions`, { method: "POST", headers: headers(at, false), body: form, signal });
      if (!r.ok) return null;
      const text = lastHearing(String((await r.json())?.text ?? ""));
      return text || null;
    });
  } catch { return null; }
}

// The settings as the app is shown them: the key never, only whether there is one
export const tiinyView = (get: (k: string) => string | null) => ({
  url: get("tiiny.url") ?? "", keySet: !!get("tiiny.key"), model: get("tiiny.model") ?? "", quick: get("tiiny.quick") ?? "",
  tts: get("tiiny.tts") ?? "", asr: get("tiiny.asr") ?? "", voice: get("tiiny.voice") ?? "",
});
