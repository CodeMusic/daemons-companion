// C-307 (the user, 2026-11-10: "grow THE MIND ... something that I could run test"): THE MIND remembers how it thought --
// each talk's trace (who heard, thought and said it, and how long each took, whether the phone covered), the last few
// kept on the hub so every phone and the site see the same mesh, and each mind's recent speed, so a mind that has been
// slow lately is covered at once rather than after the hedge. No node: imports (reached from api.ts and the phone alike).

export type Trace = {
  at: string; kind: "talk" | "guide"; ring: "anywhere" | "home" | "phone"; from: string;   // from: "phone", "site"
  heard?: string; thought?: string; said?: string;                                       // where each happened
  ms: { hear?: number; think?: number; voice?: number };
  covered?: boolean;                                                                     // the phone answered for a late mind
  failed?: string[];                                                                     // minds that failed on the way
  user?: string; device?: string;                                                        // C-319: whose, and which phone
};
const MOST = 40, KEY = "mind.traces";
const clip = (s: unknown, n = 60) => (typeof s === "string" ? s.slice(0, n) : undefined);
const num = (n: unknown) => (typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.round(Math.min(n, 600_000)) : undefined);

// what a phone sent, made safe to keep -- only short names and numbers, never what was said
export function traceOf(b: Record<string, any>, from: string, now = new Date()): Trace | null {
  if (!b || typeof b !== "object") return null;
  const kind = b.kind === "guide" ? "guide" : "talk";
  const ring = b.ring === "home" || b.ring === "phone" ? b.ring : "anywhere";
  const ms = (b.ms ?? {}) as Record<string, unknown>;
  return { at: now.toISOString(), kind, ring, from: clip(from, 20) ?? "phone",
           heard: clip(b.heard), thought: clip(b.thought), said: clip(b.said),
           ms: { hear: num(ms.hear), think: num(ms.think), voice: num(ms.voice) },
           ...(b.covered === true ? { covered: true } : {}),
           ...(clip(b.user, 40) ? { user: clip(b.user, 40) } : {}), ...(clip(b.device, 40) ? { device: clip(b.device, 40) } : {}),   // C-319
           ...(Array.isArray(b.failed) && b.failed.length ? { failed: b.failed.slice(0, 4).map((f: unknown) => clip(f) ?? "?") } : {}) };
}
type Get = (k: string) => string | null;
type Set_ = (k: string, v: string | null) => void;
export function traces(get: Get): Trace[] {
  try { const t = JSON.parse(get(KEY) ?? "[]"); return Array.isArray(t) ? t : []; } catch { return []; }
}
export function keepTrace(get: Get, set: Set_, t: Trace) {
  set(KEY, JSON.stringify([t, ...traces(get)].slice(0, MOST)));
}

// each mind's recent speed of thought: the median of its last five, in ms -- what the phone's hedge reads
export function speeds(ts: Trace[]): Record<string, { ms: number; n: number }> {
  const by: Record<string, number[]> = {};
  for (const t of ts) if (t.thought && t.ms.think !== undefined && !t.covered) (by[t.thought] ??= []).push(t.ms.think);
  const out: Record<string, { ms: number; n: number }> = {};
  for (const [k, v] of Object.entries(by)) {
    const last = v.slice(0, 5).sort((a, b) => a - b);
    out[k] = { ms: last[Math.floor(last.length / 2)], n: last.length };
  }
  return out;
}
