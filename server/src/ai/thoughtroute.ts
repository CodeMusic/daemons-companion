// C-290: this file runs on the phone too (C-111) -- the app imports it, directly or through another file -- so keep it free of Node-only APIs (node:*, fs).
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
export type Mind = { name: string; power: number; ask: () => Promise<string> };

// how each mind has done lately, kept while the hub runs
const done = new Map<string, boolean[]>();
export function record(name: string, ok: boolean) { done.set(name, [...(done.get(name) ?? []), ok].slice(-HISTORY)); }
export const reliabilityOf = (name: string) => { const h = done.get(name) ?? []; return (h.filter(Boolean).length + 1) / (h.length + 2); };
export const forgetHistory = () => done.clear();

export const scoreOf = (m: Pick<Mind, "name" | "power">, holds: number) => m.power * reliabilityOf(m.name) * (1 / (1 + Math.max(0, holds)));
export function order(minds: Mind[], holds: (name: string) => number): Mind[] {
  return minds.map((m, i) => ({ m, i, s: scoreOf(m, holds(m.name)) })).sort((a, b) => b.s - a.s || a.i - b.i).map((x) => x.m);
}

// ask the minds in order; hedged when `hedgeMs` is given. `tried(name)` is told each mind as it is asked, `fell` each
// failure; stopped() ends it at once
export async function think(minds: Mind[], o: { hedgeMs?: number; tried?: (name: string) => void; fell?: (name: string, e: unknown) => void;
                                                 stopped?: () => boolean } = {}): Promise<{ text: string; by: string }> {
  const queue = [...minds];
  let lastError: unknown = new Error("no mind answered");   // DRAFT
  const one = async (m: Mind) => {
    o.tried?.(m.name);
    try { const text = await m.ask(); if (!text?.trim()) throw new Error("no words came"); record(m.name, true); return { text, by: m.name }; }   // DRAFT
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
