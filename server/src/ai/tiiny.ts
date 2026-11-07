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
                                f: typeof fetch = fetch, ms = 30_000, maxTokens = 220, think = false): Promise<string> {
  if (!model) throw new Error("no model chosen");
  const messages = [{ role: "system", content: system },
                    ...history.slice(-6).flatMap((t) => [{ role: "user", content: t.said }, { role: "assistant", content: t.answer }]),
                    { role: "user", content: said.slice(0, think ? 16_000 : 1000) }];   // C-298: the background path reads a write-up's whole input (a journal; a meeting's 4000)
  return timed(ms, async (signal) => {
    const r = await f(`${at.url}/chat/completions`, { method: "POST", headers: headers(at), signal,
      // thinking off: Qwen3.6 otherwise spends every token reasoning and says nothing (2026-11-03: 220 tokens of
      // reasoning_content, content ""); off, it answered in 3-4 s. Read at the top level by the Tiiny, through LiteLLM.
      body: JSON.stringify({ model, messages, max_tokens: maxTokens + (think ? THINK_BUDGET : 0), temperature: think ? 0.7 : 0.8,
                             chat_template_kwargs: { enable_thinking: think } }) });
    if (!r.ok) throw new Error(`the Tiiny answered ${r.status}`);
    const j = await r.json();
    // a thinking model's reasoning is left out: only what it says
    let text = String(j?.choices?.[0]?.message?.content ?? "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    // cut off by the cap: end on its last whole sentence, so a voice never stops mid-word
    if (j?.choices?.[0]?.finish_reason === "length") { const end = Math.max(...[".", "!", "?", "…"].map((c) => text.lastIndexOf(c)));
                                                       if (end > 20) text = text.slice(0, end + 1); }
    if (!text && think) return tiinyChat(at, model, system, history, said, f, ms, maxTokens, false);
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

// What was said, from a 16 kHz WAV. null without an ASR model, or when it hears nothing.
// The Tiiny's hearing model answers with its pieces run together ("me.Did") and then the whole, spaced -- seen
// 2026-11-06, every clip: "There.That was me.Did anything see?There, that was me. Did anything see? ...". The whole is
// what follows the last piece's end; a hearing with no run-together end is kept as it came.
export function lastHearing(text: string): string {
  const t = text.trim();
  let cut = -1;
  for (const m of t.matchAll(/[.?!](?=[A-Z])/g)) cut = m.index! + 1;
  if (cut < 0) return t;
  const whole = t.slice(cut).trim();
  return whole.split(/\s+/).length >= 3 ? whole : t;
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
