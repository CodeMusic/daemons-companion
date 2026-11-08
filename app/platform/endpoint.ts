// C-280 (3), C-307: AN ENDPOINT -- any OpenAI-compatible base (`…/v1`), called from this phone itself, so a player with
// no hub can still talk with their daemon. The address, model and name are kept in the Keychain beside the key, and the
// key is never sent to the hub or shown again. Whether it is "at home" (a private, local or tailnet address) decides
// which of THE MIND's rings may use it. Plain fetch, no node: imports.
import * as SecureStore from "expo-secure-store";

export type Endpoint = { url: string; model: string; name: string };
const AT = "mind.endpoint", KEY = "mind.endpoint.key";
const KEEP = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };

// what was typed, made a base: no trailing slash, and /v1 kept if given (an address without one is used as typed)
export const baseOf = (url: string) => url.trim().replace(/\/+$/, "").replace(/\/chat\/completions$/, "");

export async function endpoint(): Promise<(Endpoint & { keySet: boolean }) | null> {
  try {
    const e = JSON.parse((await SecureStore.getItemAsync(AT)) ?? "null") as Endpoint | null;
    return e?.url ? { ...e, keySet: !!(await SecureStore.getItemAsync(KEY)) } : null;
  } catch { return null; }
}
export async function keepEndpoint(e: Endpoint, key?: string) {
  await SecureStore.setItemAsync(AT, JSON.stringify({ url: baseOf(e.url), model: e.model.trim(), name: e.name.trim() }), KEEP);
  if (key !== undefined && key.trim()) await SecureStore.setItemAsync(KEY, key.trim(), KEEP);
}
export async function forgetEndpoint() {
  await SecureStore.deleteItemAsync(AT).catch(() => {});
  await SecureStore.deleteItemAsync(KEY).catch(() => {});
}

// At home: this machine, a private network, the tailnet (100.64/10, *.ts.net), or a name only a home network answers
export function atHome(url: string): boolean {
  let h: string;
  try { h = new URL(baseOf(url)).hostname.toLowerCase(); } catch { return false; }
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".lan") || h.endsWith(".home") || h.endsWith(".ts.net") || !h.includes(".")) return true;
  const m = /^(\d+)\.(\d+)\.\d+\.\d+$/.exec(h);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 10 || a === 127 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 100 && b >= 64 && b <= 127);
}

const timed = (ms: number) => { const c = new AbortController(); const t = setTimeout(() => c.abort(), ms); return { signal: c.signal, done: () => clearTimeout(t) }; };
async function call(path: string, body?: unknown, ms = 30_000): Promise<any> {
  const e = await endpoint();
  if (!e) throw new Error("No endpoint is set.");   // DRAFT
  const key = await SecureStore.getItemAsync(KEY);
  const t = timed(ms);
  try {
    const r = await fetch(`${e.url}${path}`, {
      method: body ? "POST" : "GET", signal: t.signal,
      headers: { "Content-Type": "application/json", ...(key ? { Authorization: `Bearer ${key}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await r.text();
    let j: any = null; try { j = JSON.parse(text); } catch { /* said below */ }
    if (!r.ok) throw new Error(j?.error?.message ?? j?.error ?? `${e.name || "The endpoint"} answered ${r.status}`);   // DRAFT
    if (j == null) throw new Error(`${e.name || "The endpoint"} did not answer in JSON`);   // DRAFT
    return j;
  } catch (err) {
    if ((err as Error).name === "AbortError") throw new Error(`${e.name || "The endpoint"} took too long`);   // DRAFT
    throw err;
  } finally { t.done(); }
}

// The models it holds (GET /models), for the player to pick from
export async function endpointModels(): Promise<string[]> {
  const j = await call("/models", undefined, 10_000);
  return (Array.isArray(j?.data) ? j.data : []).map((m: { id?: string }) => String(m.id ?? "")).filter(Boolean);
}

// One answer: the daemon's self as the system message, the talk so far, what was said. Kept to a few sentences.
export async function endpointThink(system: string, history: { said: string; answer: string }[], said: string, ms = 30_000): Promise<string> {
  const e = await endpoint();
  if (!e?.model) throw new Error("The endpoint has no model chosen.");   // DRAFT
  const messages = [{ role: "system", content: system },
    ...history.flatMap((h) => [{ role: "user", content: h.said }, { role: "assistant", content: h.answer }]),
    { role: "user", content: said }];
  const j = await call("/chat/completions", { model: e.model, messages, max_tokens: 200, temperature: 0.8 }, ms);
  const text = String(j?.choices?.[0]?.message?.content ?? "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  if (!text) throw new Error(`${e.name || "The endpoint"} answered nothing`);   // DRAFT
  return text;
}
