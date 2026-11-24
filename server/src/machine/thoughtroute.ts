// C-290: this file runs on the phone too (C-111) -- the app imports it, directly or through another file -- so keep it free of Node-only APIs (node:*, fs).
// BRAIN: thalamus (relay, gate) -- orders the minds by score, falls through, keeps private work at home
// C-360, thought (the user, 2026-11-14: "the most available machine/device with most power potential should be leveraged
// ... if the most powerful machine is busy with tasks, it would be routed to the next most ... a network of iphones to
// mesh their potential together"; by multiple choice: reliable + free, hedged): the house's minds for a write-up, put in
// order at the moment it is asked rather than in a fixed order. Each mind's POWER is how much it can think (the Tiiny
// and a full model at an endpoint far above a phone's on-device model, which is above the hub's small module); its
// RELIABILITY is how its last twenty went; how FREE it is, how many thoughts it holds now (THE MIND AT WORK's ledger).
//
//     score = power x reliability x free        free = 1 / (1 + thoughts it holds now)
//
// The best is asked first and the next follows if it fails; when someone is waiting (a quick write) and the best has
// not answered in HEDGE_MS, the next is asked too and the first answer wins. Every word DRAFT.

export const MIND_POWER = { tiiny: 40, endpoint: 30, phone: 8, module: 2 } as const;
export const HEDGE_QUICK_MS = 25_000, HISTORY = 20;
export type Mind = { name: string; power: number; ask: () => Promise<string>;
                     home?: boolean;    // C-480: on the house's own networks (false: an endpoint out in the world)
                     paid?: boolean };  // C-480: may cost money to ask (an endpoint out in the world)

// how each mind has done lately, kept while the hub runs -- and (C-480) how long its answers took, and when it last failed
const done = new Map<string, boolean[]>(), took = new Map<string, number[]>(), failedAt = new Map<string, number>();
export function record(name: string, ok: boolean, ms?: number, at = Date.now()) {
  done.set(name, [...(done.get(name) ?? []), ok].slice(-HISTORY));
  if (ok && ms !== undefined) took.set(name, [...(took.get(name) ?? []), ms].slice(-HISTORY));
  if (!ok) failedAt.set(name, at);
}
/** the middle of its recent answer times, or null before it has answered */
export const speedOf = (name: string): number | null => { const t = [...(took.get(name) ?? [])].sort((a, b) => a - b); return t.length ? t[Math.floor(t.length / 2)] : null; };
export const reliabilityOf = (name: string) => { const h = done.get(name) ?? []; return (h.filter(Boolean).length + 1) / (h.length + 2); };
export const forgetHistory = () => { done.clear(); took.clear(); failedAt.clear(); };

export const scoreOf = (m: Pick<Mind, "name" | "power">, holds: number) => m.power * reliabilityOf(m.name) * (1 / (1 + Math.max(0, holds)));
export function order(minds: Mind[], holds: (name: string) => number): Mind[] {
  return minds.map((m, i) => ({ m, i, s: scoreOf(m, holds(m.name)) })).sort((a, b) => b.s - a.s || a.i - b.i).map((x) => x.m);
}

// C-480 (the user, 2026-11-22, by multiple choice: "the daemon chooses its mind" -- it weighs the job's size and kind,
// how each mind has been doing, the job's privacy and cost; with none fitting, the job waits for one): the minds for a
// write-up, chosen rather than only scored. Only with THE MIND's setting on; off, `order` above is as it was.
//   privacy    a private job (the journal, a meeting, a memory, a dream) goes only to minds on the house's own networks
//   doing      a mind whose last three failed rests COOL_MS from its last failure
//   kind/size  someone waiting: the quickest lately is worth more; a long write: the most power is worth more
//   cost       a mind that may cost money goes after every free one
// [] back: no mind fits now -- the caller waits for one (tiinyfirst.ts). Every word DRAFT.
export const COOL_MS = 10 * 60_000, BIG_WRITE = 6000;
export type Want = { quick?: boolean; size: number; private?: boolean };
const resting = (name: string, at: number) => { const h = done.get(name) ?? [];
  return h.length >= 3 && h.slice(-3).every((x) => !x) && at - (failedAt.get(name) ?? 0) < COOL_MS; };
export function choose(minds: Mind[], holds: (name: string) => number, want: Want, at = Date.now()): Mind[] {
  const fit = minds.filter((m) => (!want.private || m.home !== false) && !resting(m.name, at));
  const worth = (m: Mind) => {
    let s = scoreOf(m, holds(m.name));
    if (want.quick) { const ms = speedOf(m.name); if (ms !== null) s /= 1 + ms / 10_000; }   // ten seconds halves it
    if (want.size > BIG_WRITE) s *= m.power;                                                  // a long write leans on power
    return s;
  };
  return fit.map((m, i) => ({ m, i, s: worth(m) }))
    .sort((a, b) => Number(!!a.m.paid) - Number(!!b.m.paid) || b.s - a.s || a.i - b.i).map((x) => x.m);
}

// ask the minds in order; hedged when `hedgeMs` is given. `tried(name)` is told each mind as it is asked, `fell` each
// failure; stopped() ends it at once
export async function think(minds: Mind[], o: { hedgeMs?: number; tried?: (name: string) => void; fell?: (name: string, e: unknown) => void;
                                                 stopped?: () => boolean } = {}): Promise<{ text: string; by: string }> {
  const queue = [...minds];
  let lastError: unknown = new Error("no mind answered");   // DRAFT
  const one = async (m: Mind) => {
    o.tried?.(m.name);
    const start = Date.now();
    try { const text = await m.ask(); if (!text?.trim()) throw new Error("no words came"); record(m.name, true, Date.now() - start); return { text, by: m.name }; }   // DRAFT
    catch (e) { record(m.name, false); o.fell?.(m.name, e); lastError = e; throw e; }
  };
  while (queue.length) {
    if (o.stopped?.()) throw new Error("stopped");
    const first = queue.shift()!;
    if (!o.hedgeMs || !queue.length) { try { return await one(first); } catch { continue; } }
    // hedged: the first, and after hedgeMs the next too; the first answer wins
    const second = queue[0];
    const a = one(first);
    let timer: ReturnType<typeof setTimeout> | null = null;
    const late = new Promise<{ text: string; by: string }>((ok, no) => {
      timer = setTimeout(() => { queue.shift(); one(second).then(ok, no); }, o.hedgeMs);
      a.then(() => { if (timer) clearTimeout(timer); }, () => { if (timer) clearTimeout(timer); no(new Error("first failed")); });
    });
    try { return await Promise.any([a, late]); }
    catch { if (timer) clearTimeout(timer); }
  }
  throw lastError;
}
