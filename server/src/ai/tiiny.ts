// C-249 (the user, 2026-10-30: "I plug it in to ROVERBYTESEER ... and once set up the hub can talk to it"): the Tiiny
// Pocket as one more thinker for the daemons' talk, reached over the house network -- through roverbyteseer's LiteLLM
// (http://roverbyteseer:4000/v1, the default) or straight at the device (http://<its address>/openai/v1). Both speak
// OpenAI's API; the base is kept whole and must end in /v1, so neither is guessed at. The key lives in the store (this
// machine's database), never in a tracked file. What it holds is learned from its own /models, never assumed.
//
// Its window is large, so unlike the module (house.ts) the daemon's whole self rides as the system message (self.ts).
// No node: imports -- this runs on the phone too.

export type TiinyAt = { url: string; key: string; model: string; tts: string; asr: string; voice: string };

export const TIINY_SETTINGS = ["tiiny.url", "tiiny.key", "tiiny.model", "tiiny.tts", "tiiny.asr", "tiiny.voice"] as const;

export const tiinyUrl = (raw: string): string | null => {
  const u = raw.trim().replace(/\/+$/, "");
  return /^https?:\/\/[^\s/]+(\/[^\s]*)?\/v1$/.test(u) ? u : null;
};

// What the store holds, or null until an address is given
export function tiinyIn(get: (k: string) => string | null): TiinyAt | null {
  const url = tiinyUrl(get("tiiny.url") ?? "");
  if (!url) return null;
  return { url, key: get("tiiny.key") ?? "", model: get("tiiny.model") ?? "", tts: get("tiiny.tts") ?? "",
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

export type Turn = { said: string; answer: string };

// One answer: the self as the system message, the turns before, then what was said. Throws on any failure, so the
// caller takes the talk elsewhere (the module, then n8n).
export async function tiinyChat(at: TiinyAt, model: string, system: string, history: Turn[], said: string,
                                f: typeof fetch = fetch, ms = 30_000): Promise<string> {
  if (!model) throw new Error("no model chosen");
  const messages = [{ role: "system", content: system },
                    ...history.slice(-6).flatMap((t) => [{ role: "user", content: t.said }, { role: "assistant", content: t.answer }]),
                    { role: "user", content: said.slice(0, 1000) }];
  return timed(ms, async (signal) => {
    const r = await f(`${at.url}/chat/completions`, { method: "POST", headers: headers(at), signal,
      body: JSON.stringify({ model, messages, max_tokens: 220, temperature: 0.8 }) });
    if (!r.ok) throw new Error(`the Tiiny answered ${r.status}`);
    const j = await r.json();
    // a thinking model's reasoning is left out: only what it says
    const text = String(j?.choices?.[0]?.message?.content ?? "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
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
        body: JSON.stringify({ model: at.tts, input: text.slice(0, 600), voice: at.voice || "default", response_format: "wav",
                               ...(instructions ? { instructions } : {}) }) });
      if (!r.ok) return null;
      const audio = new Uint8Array(await r.arrayBuffer());
      return audio.length ? { audio, mime: r.headers.get("content-type") || "audio/wav" } : null;
    });
  } catch { return null; }
}

// What was said, from a 16 kHz WAV. null without an ASR model, or when it hears nothing.
export async function tiinyHear(at: TiinyAt, wav: Uint8Array, f: typeof fetch = fetch, ms = 30_000): Promise<string | null> {
  if (!at.asr) return null;
  try {
    return await timed(ms, async (signal) => {
      const form = new FormData();
      form.append("model", at.asr);
      form.append("file", new Blob([new Uint8Array(wav)], { type: "audio/wav" }), "said.wav");
      const r = await f(`${at.url}/audio/transcriptions`, { method: "POST", headers: headers(at, false), body: form, signal });
      if (!r.ok) return null;
      const text = String((await r.json())?.text ?? "").trim();
      return text || null;
    });
  } catch { return null; }
}

// The settings as the app is shown them: the key never, only whether there is one
export const tiinyView = (get: (k: string) => string | null) => ({
  url: get("tiiny.url") ?? "", keySet: !!get("tiiny.key"), model: get("tiiny.model") ?? "",
  tts: get("tiiny.tts") ?? "", asr: get("tiiny.asr") ?? "", voice: get("tiiny.voice") ?? "",
});
