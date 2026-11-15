// C-290: this file runs on the phone too (C-111) -- keep it free of Node-only APIs (node:*, fs).
// C-375 (2026-11-15; the Tiiny's API reference, dev.tiiny.ai): THE HUB KEEPS THE TIINY'S MODELS LOADED. A TiinyOS update
// or restart leaves every model unloaded, and the hub then heard a stand-in or "is not loaded" until someone ticked them
// again (C-373, C-374). seer's gate (seer/tiiny-voice, the Tiiny's voice stream's address: /tiiny/models, /tiiny/models/
// <id>/start) lists what is on the device and loads one, with the same key the hub gives LiteLLM. So when a real call has
// just found the Tiiny without its models, the hub loads the ones it lives on, one at a time -- never on a timer, so a
// model the user unloaded by hand stays unloaded until the hub actually needs it, and never unloading anything.
import type { TiinyAt } from "./tiiny.js";

// The models the hub lives on, by the Tiiny's own ids: the thinker, the ear, the voice (tiiny.keep changes them; "" none)
export const KEEP = ["Qwen/Qwen3.6-35B-A3B", "Qwen/Qwen3-ASR-1.7B", "Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign"];
export const KEEP_AGAIN_MS = 10 * 60_000;   // after a try, the next not before this

export type DeviceModel = { id: string; status: string };

// The gate is the voice stream's address without its /v1
export const gateOf = (at: TiinyAt): string | null => at.stream ? at.stream.replace(/\/v1\/?$/, "") : null;
const auth = (at: TiinyAt) => (at.key ? { Authorization: `Bearer ${at.key}` } : {}) as Record<string, string>;

export async function deviceModels(at: TiinyAt, f: typeof fetch = fetch, ms = 15_000): Promise<DeviceModel[] | null> {
  const gate = gateOf(at);
  if (!gate) return null;
  try {
    const r = await f(`${gate}/tiiny/models`, { headers: auth(at), signal: AbortSignal.timeout(ms) });
    if (!r.ok) return null;
    const j = await r.json();
    return (Array.isArray(j?.data) ? j.data : []).map((m: { id?: unknown; fullname?: unknown; status?: unknown }) =>
      ({ id: String(m?.id ?? m?.fullname ?? ""), status: String(m?.status ?? "") })).filter((m: DeviceModel) => m.id);
  } catch { return null; }
}

// Load one: the gate answers once the Tiiny has started loading it
export async function loadModel(at: TiinyAt, id: string, f: typeof fetch = fetch, ms = 300_000): Promise<boolean> {
  const gate = gateOf(at);
  if (!gate) return false;
  try {
    const r = await f(`${gate}/tiiny/models/${id}/start`, { method: "POST", headers: auth(at), signal: AbortSignal.timeout(ms) });
    return r.ok;
  } catch { return false; }
}

// Which of the kept models are on the device but not running (a model not downloaded is left: the user's to get)
export function missing(models: DeviceModel[], keep: string[] = KEEP): string[] {
  const by = new Map(models.map((m) => [m.id, m.status]));
  return keep.filter((id) => by.has(id) && by.get(id) !== "running");
}

export const keepOf = (raw: string | null | undefined): string[] =>
  raw == null ? KEEP : raw.split(",").map((s) => s.trim()).filter(Boolean);

let LAST_TRY = 0, BUSY = false;
export const keepReset = () => { LAST_TRY = 0; BUSY = false; };

// When a call has just found the Tiiny without its models: load the missing ones, one at a time. Each one loaded is told
// (to the hub's ledger); the list of those loaded, or null when nothing was tried (none missing, too soon, no gate)
export async function keepLoaded(at: TiinyAt, keep: string[], tell: { start: (id: string) => string; end: (task: string, ok: boolean) => void },
                                 f: typeof fetch = fetch, now = Date.now()): Promise<string[] | null> {
  if (BUSY || !keep.length || now - LAST_TRY < KEEP_AGAIN_MS || !gateOf(at)) return null;
  BUSY = true; LAST_TRY = now;
  try {
    const models = await deviceModels(at, f);
    if (!models) return null;
    const loaded: string[] = [];
    for (const id of missing(models, keep)) {
      const task = tell.start(id);
      const ok = await loadModel(at, id, f);
      tell.end(task, ok);
      if (ok) loaded.push(id);
    }
    return loaded;
  } finally { BUSY = false; }
}
