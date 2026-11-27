// BRAIN: visual (see) -- a picture shown to a model on the household's own machines; text comes back
// C-577 (C-596; the user, 2026-11-26: "local models only"; 2026-11-27: "THE MIND, usually through the Tiiny, looks at
// the image"): THE SEEING DOOR -- the first place the companion shows a model a picture. MACHINE: it asks; what it asks
// and what the answer means are the mind's (psyche/photovoice.ts).
//
// It speaks the same door the house's writer does (the Tiiny's, through LiteLLM on the always-on machine: an OpenAI
// chat with the picture inside it), and picks a model that can see from the ones that door holds. A model on someone
// else's machines is never picked: a person's picture does not leave the house, whatever the door also lists.
import type { TiinyAt } from "./tiiny.js";

/** the seeing models, best first (DRAFT order: what the always-on machine holds, 2026-11-27) */
export const SEERS = ["qwen3-vl-8b", "qwen3-vl-4b", "daemons-vision", "qwen-mlxvlm", "minicpm-v-4-6", "minicpm-mlxvlm", "gemma-3-4b"];
/** a model that runs on someone else's machines, by the names the door gives them (or-: OpenRouter) */
export const away = (model: string) => /^(or-|openrouter\/|gpt-|claude|gemini)/i.test(model);
/** which model sees: the one asked for when the door holds it and it is the house's own, else the best the door holds */
export function pickSeer(held: string[], asked?: string | null): string | null {
  const own = held.filter((m) => !away(m));
  if (asked && own.includes(asked)) return asked;
  return SEERS.find((m) => own.includes(m)) ?? own.find((m) => /(^|[-_/])(vl|vlm|vision|minicpm-v)([-_/]|$)/i.test(m)) ?? null;
}

/** show one picture (a JPEG) with a question; the model's words. `schema` asks for JSON of that shape where the door can */
export async function seeImage(at: Pick<TiinyAt, "url" | "key">, model: string, jpeg: Uint8Array, prompt: string,
                               o: { schema?: object; maxTokens?: number; f?: typeof fetch; ms?: number; signal?: AbortSignal } = {}): Promise<string> {
  if (away(model)) throw new Error("a picture is shown only to the house's own models");
  const ask = async (shaped: boolean) => {
    const r = await (o.f ?? fetch)(`${at.url}/chat/completions`, { method: "POST",
      headers: { "content-type": "application/json", ...(at.key ? { authorization: `Bearer ${at.key}` } : {}) },
      body: JSON.stringify({ model, max_tokens: o.maxTokens ?? 500, temperature: 0.2,
        messages: [{ role: "user", content: [{ type: "image_url", image_url: { url: `data:image/jpeg;base64,${Buffer.from(jpeg).toString("base64")}` } },
                                             { type: "text", text: prompt }] }],
        ...(shaped && o.schema ? { response_format: { type: "json_schema", json_schema: { name: "seen", strict: true, schema: o.schema } } } : {}) }),
      signal: o.signal ? AbortSignal.any([o.signal, AbortSignal.timeout(o.ms ?? 180_000)]) : AbortSignal.timeout(o.ms ?? 180_000) });
    if (!r.ok) throw Object.assign(new Error(`the seeing model answered ${r.status}: ${(await r.text()).slice(0, 160)}`), { status: r.status });
    const j: any = await r.json();
    return String(j?.choices?.[0]?.message?.content ?? "");
  };
  // a door that does not know response_format refuses it (400): asked again plainly, the prompt already says JSON only
  try { return await ask(true); } catch (e) { if (o.schema && (e as { status?: number }).status === 400) return ask(false); throw e; }
}
