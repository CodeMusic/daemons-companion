// C-180: the hub's Module LLM (M5Stack, AX630C), through StackFlow's OpenAI-format API (`apt install llm-openai-api`,
// port 8000, /v1 -- https://docs.m5stack.com/zh_CN/stackflow/openai_api/models). Everything runs on the module; the
// names are OpenAI's only. Written to the OpenAI shapes, so anything that speaks them (a computer's own server, say) can
// stand in for it. What each model can do is learned from /v1/models, never assumed.

export type ModuleModel = { id: string; kind: "llm" | "tts" | "stt" | "other" };
export type Said = { text: string; firstMs: number | null; totalMs: number; pieces: number; tokens: number | null };
export type Spoken = { audio: Buffer; mime: string; ms: number };
export type Heard = { text: string; ms: number };

const trim = (base: string) => base.replace(/\/+$/, "").replace(/\/v1$/, "");

// A model's kind, from its name: MeloTTS (and the module's single speaker) speaks, Whisper / SenseVoice hear, the rest
// think. sherpa-ncnn, KWS and VAD take a live microphone, never a file: one recording sent to sherpa hung the module's
// whole OpenAI server (the hardware lane, 2026-10-28), so they are "other" and never asked to hear.
export function kindOf(id: string): ModuleModel["kind"] {
  const n = id.toLowerCase();
  if (/sherpa|kws|vad|streaming/.test(n)) return "other";
  if (/tts|melo|piper|kokoro|single_speaker/.test(n)) return "tts";
  if (/whisper|asr|sense ?voice|sensevoice/.test(n)) return "stt";
  if (/qwen|llama|deepseek|gemma|phi|smol|internlm|minicpm|llm|chat|instruct/.test(n)) return "llm";
  return "other";
}

// Which of each kind to use, from the module's benchmark (2026-10-28, three runs each, over the hub's link):
// thinking -- qwen2.5-0.5B answers in ~0.65 s; qwen3 thinks aloud first; anything a billion parameters or more, and
// deepseek-r1, takes ~30 s to its first words, so never. Voice -- English MeloTTS, else the single English speaker;
// never a Chinese voice reading English (21 s). Hearing -- Whisper only.
const sizeB = (n: string) => { const m = /(\d+(?:\.\d+)?)b(?![a-z])/.exec(n); return m ? Number(m[1]) : null; };
export function pickModels(list: ModuleModel[]): { llm?: string; tts?: string; stt?: string } {
  const ids = (k: ModuleModel["kind"]) => list.filter((m) => m.kind === k).map((m) => m.id);
  const best = (xs: string[], order: RegExp[]) => {
    for (const r of order) { const hit = xs.find((x) => r.test(x.toLowerCase())); if (hit) return hit; }
    return undefined;
  };
  const thinkers = ids("llm").filter((x) => { const n = x.toLowerCase(), b = sizeB(n); return !/deepseek-r1/.test(n) && (b === null || b < 1); });
  return {
    llm: best(thinkers, [/qwen2\.5-0\.5b-prefill/, /qwen2\.5-0\.5b/, /^(?!.*qwen3)/, /./]),
    tts: best(ids("tts").filter((x) => !/zh|cn|chinese/.test(x.toLowerCase())), [/melotts[-_]en/, /single_speaker_english/, /en/, /./]),
    stt: best(ids("stt"), [/whisper/]),
  };
}

export async function listModels(base: string, timeoutMs = 5000): Promise<ModuleModel[]> {
  const r = await fetch(`${trim(base)}/v1/models`, { signal: AbortSignal.timeout(timeoutMs) });
  if (!r.ok) throw new Error(`the module's model list answered ${r.status}`);
  const j = await r.json() as { data?: { id: string }[] };
  return (j.data ?? []).map((m) => ({ id: m.id, kind: kindOf(m.id) }));
}

// A chat, streamed: the time to its first words (what a device waits on) and to its last
export async function chat(base: string, model: string, messages: { role: string; content: string }[],
                           opts: { maxTokens?: number; timeoutMs?: number; firstWithinMs?: number; onPiece?: (s: string) => void } = {}): Promise<Said> {
  const t0 = performance.now();
  // firstWithinMs: no first words by then and the chat is given up, as LATE (HUB.md Phase 5 item 4: the talk goes elsewhere)
  const stop = new AbortController(), whole = setTimeout(() => stop.abort(), opts.timeoutMs ?? 120000);
  let late = false;
  const first = opts.firstWithinMs ? setTimeout(() => { late = true; stop.abort(); }, opts.firstWithinMs) : undefined;
  try {
  const r = await fetch(`${trim(base)}/v1/chat/completions`, {
    method: "POST", headers: { "content-type": "application/json" }, signal: stop.signal,
    body: JSON.stringify({ model, messages, stream: true, max_tokens: opts.maxTokens ?? 80 }),
  });
  if (!r.ok || !r.body) throw new Error(`the module's chat answered ${r.status}: ${(await r.text().catch(() => "")).slice(0, 200)}`);
  let text = "", firstMs: number | null = null, pieces = 0, tokens: number | null = null, rest = "";
  const take = (line: string) => {
    const s = line.trim();
    if (!s.startsWith("data:")) return;
    const body = s.slice(5).trim();
    if (!body || body === "[DONE]") return;
    try {
      const j = JSON.parse(body);
      const piece: string = j.choices?.[0]?.delta?.content ?? j.choices?.[0]?.message?.content ?? "";
      if (j.usage?.completion_tokens) tokens = j.usage.completion_tokens;
      if (piece) { if (firstMs === null) { firstMs = performance.now() - t0; clearTimeout(first); } text += piece; pieces++; opts.onPiece?.(piece); }
    } catch { /* a line that is not JSON: skipped */ }
  };
  const reader = r.body.getReader(), dec = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    rest += dec.decode(value, { stream: true });
    const lines = rest.split("\n"); rest = lines.pop() ?? "";
    lines.forEach(take);
  }
  take(rest);
  return { text, firstMs, totalMs: performance.now() - t0, pieces, tokens };
  } catch (e) { throw late ? new Error(LATE) : e; } finally { clearTimeout(whole); clearTimeout(first); }
}
export const LATE = "the module had not begun an answer in time";

// Words to a voice: whatever the module sends back (WAV or raw PCM, by its content type)
export async function speak(base: string, model: string, text: string, voice?: string, timeoutMs = 60000): Promise<Spoken> {
  const t0 = performance.now();
  const r = await fetch(`${trim(base)}/v1/audio/speech`, {
    method: "POST", headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({ model, input: text, ...(voice ? { voice } : {}), response_format: "wav" }),
  });
  if (!r.ok) throw new Error(`the module's speech answered ${r.status}: ${(await r.text().catch(() => "")).slice(0, 200)}`);
  return { audio: Buffer.from(await r.arrayBuffer()), mime: r.headers.get("content-type") ?? "audio/wav", ms: performance.now() - t0 };
}

// A recording to words
export async function hear(base: string, model: string, wav: Buffer, timeoutMs = 60000): Promise<Heard> {
  const t0 = performance.now();
  const form = new FormData();
  form.append("model", model);
  form.append("file", new Blob([new Uint8Array(wav)], { type: "audio/wav" }), "said.wav");
  const r = await fetch(`${trim(base)}/v1/audio/transcriptions`, { method: "POST", body: form, signal: AbortSignal.timeout(timeoutMs) });
  if (!r.ok) throw new Error(`the module's hearing answered ${r.status}: ${(await r.text().catch(() => "")).slice(0, 200)}`);
  const j = await r.json().catch(() => ({})) as { text?: string };
  return { text: j.text ?? "", ms: performance.now() - t0 };
}
