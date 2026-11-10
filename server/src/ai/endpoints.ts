// C-280 (1) (the user, 2026-11-03: "you should be able to enter any openai compatible endpoint and model for it to use"):
// ENDPOINTS on the hub -- any OpenAI-compatible base (`…/v1`), a key and a model, named by the player, several kept, each
// one more mind in the hub's chain. The Tiiny is the first of them (its own settings, tiiny.*, since it also hears and
// speaks); the ones given here follow it in the order given, then the house's boards, then n8n. A key is kept in the
// hub's store and never shown again. Whether an endpoint is AT HOME (a private, local or tailnet address) decides
// whether THE MIND's "only at home" ring may use it (C-307). No node: imports -- the phone reads atHome from here too.
import { tiinyChat, tiinyModels, tiinyUrl, type TiinyAt, type Turn } from "./tiiny.js";

export type Endpoint = { id: string; name: string; url: string; key: string; model: string };
export type EndpointView = Omit<Endpoint, "key"> & { keySet: boolean; home: boolean };
export type EndpointHealth = { id: string; ok: boolean; at: string; models: string[] };

export const MOST_ENDPOINTS = 8;
const KEY = "mind.endpoints";

// At home: this machine, a private network, the tailnet (100.64/10, *.ts.net), or a bare name only a home network answers
export function atHome(url: string): boolean {
  let h: string;
  try { h = new URL(url.trim()).hostname.toLowerCase(); } catch { return false; }
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".lan") || h.endsWith(".home") || h.endsWith(".ts.net") || !h.includes(".")) return true;
  const m = /^(\d+)\.(\d+)\.\d+\.\d+$/.exec(h);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 10 || a === 127 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 100 && b >= 64 && b <= 127);
}

const clean = (e: any): Endpoint | null => {
  const url = typeof e?.url === "string" ? tiinyUrl(e.url) : null;
  if (!url || typeof e?.id !== "string" || !e.id) return null;
  return { id: e.id.slice(0, 40), name: String(e.name ?? "").trim().slice(0, 40), url, key: String(e.key ?? ""), model: String(e.model ?? "").trim().slice(0, 200) };
};

// What the store holds, in the order the player gave them
export function endpointsIn(get: (k: string) => string | null): Endpoint[] {
  try { const l = JSON.parse(get(KEY) ?? "[]"); return Array.isArray(l) ? l.map(clean).filter((e): e is Endpoint => !!e) : []; }
  catch { return []; }
}
const keep = (set: (k: string, v: string | null) => void, list: Endpoint[]) => set(KEY, list.length ? JSON.stringify(list) : null);

// As the app is shown them: the key never, only whether there is one
export const endpointsView = (get: (k: string) => string | null): EndpointView[] =>
  endpointsIn(get).map(({ key, ...e }) => ({ ...e, keySet: !!key, home: atHome(e.url) }));

// One given or changed: {id?, name, url, key?, model}. A key left out (or empty) keeps the one held. An error said, or the list.
export function keepEndpoint(get: (k: string) => string | null, set: (k: string, v: string | null) => void, b: any,
                             newId = () => Math.random().toString(36).slice(2, 10)): Endpoint[] | string {
  const list = endpointsIn(get), was = typeof b?.id === "string" ? list.find((e) => e.id === b.id) : undefined;
  if (b?.id && !was) return "no endpoint has that id";
  const url = tiinyUrl(String(b?.url ?? was?.url ?? ""));
  if (!url) return "an endpoint's address ends in /v1: https://openrouter.ai/api/v1, or http://<a machine at home>:11434/v1";   // DRAFT
  if (!was && list.length >= MOST_ENDPOINTS) return `at most ${MOST_ENDPOINTS} endpoints`;   // DRAFT
  const e: Endpoint = { id: was?.id ?? newId(), url,
    name: (typeof b?.name === "string" ? b.name : was?.name ?? "").trim().slice(0, 40) || new URL(url).hostname,
    key: typeof b?.key === "string" && b.key.trim() ? b.key.trim().slice(0, 400) : was?.key ?? "",
    model: (typeof b?.model === "string" ? b.model : was?.model ?? "").trim().slice(0, 200) };
  const next = was ? list.map((x) => (x.id === e.id ? e : x)) : [...list, e];
  keep(set, next);
  return next;
}
export function forgetEndpoint(get: (k: string) => string | null, set: (k: string, v: string | null) => void, id: string): Endpoint[] {
  const next = endpointsIn(get).filter((e) => e.id !== id);
  keep(set, next);
  return next;
}
// Moved up or down the chain: the order given is the order asked
export function moveEndpoint(get: (k: string) => string | null, set: (k: string, v: string | null) => void, id: string, by: -1 | 1): Endpoint[] {
  const list = endpointsIn(get), i = list.findIndex((e) => e.id === id), j = i + by;
  if (i < 0 || j < 0 || j >= list.length) return list;
  [list[i], list[j]] = [list[j], list[i]];
  keep(set, list);
  return list;
}

// The client is the Tiiny's (tiiny.ts) -- it was always a general one; an endpoint only thinks
const asAt = (e: Endpoint): TiinyAt => ({ url: e.url, key: e.key, model: e.model, quick: "", tts: "", asr: "", voice: "" });
export const modelsOn = (e: Endpoint, f: typeof fetch = fetch, ms = 5000) => tiinyModels(asAt(e), f, ms);
// the model it was given, else the first it holds that thinks
const SIDE = /asr|tts|whisper|speech|voice|image|flux|embed|rerank|ocr|music|3d|dall-e|moderation/i;
export const modelOf = (e: Endpoint, held: string[]) => e.model || held.find((m) => !SIDE.test(m)) || "";
export async function chatOn(e: Endpoint, model: string, system: string, history: Turn[], said: string,
                             f: typeof fetch = fetch, ms = 30_000, maxTokens = 220, think = false): Promise<string> {
  try { return await tiinyChat(asAt(e), model, system, history, said, f, ms, maxTokens, think, !atHome(e.url)); }
  catch (err) { throw new Error(`${e.name}: ${(err as Error).message.replace(/^the Tiiny /, "")}`); }
}

// Each one's health, for the dots (C-211) and so the chain skips one that is not answering
export async function checkEndpoints(list: Endpoint[], f: typeof fetch = fetch, now = () => new Date().toISOString()): Promise<EndpointHealth[]> {
  return Promise.all(list.map(async (e) => {
    const held = await modelsOn(e, f);
    return { id: e.id, ok: !!held && !!modelOf(e, held), at: now(), models: held ?? [] };
  }));
}

// The ones to ask now, in order: answering, a model to ask, and -- for the "only at home" ring -- at home
export type EndpointNow = { e: Endpoint; model: string; home: boolean };
export function endpointsNow(list: Endpoint[], health: EndpointHealth[] | undefined, homeOnly = false): EndpointNow[] {
  return list.flatMap((e) => {
    const h = health?.find((x) => x.id === e.id), home = atHome(e.url);
    if (!h?.ok || (homeOnly && !home)) return [];
    const model = modelOf(e, h.models);
    return model ? [{ e, model, home }] : [];
  });
}
