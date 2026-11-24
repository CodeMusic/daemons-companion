// BRAIN: interface -- THE BRAIN's signal, regions and verbs (docs/BRAIN.md)
// THE BRAIN (docs/BRAIN.md; the user, 2026-11-24: "any AI harnesses or AI we write for ANY of these ... THEY ALL SHOULD be
// in neuroscience psychology code ... architected like the architecture of the human brain"). The proof of its interface,
// and nothing more: one SIGNAL, the same on every host, its regions and their verbs, the ring it may travel (the
// blood-brain barrier), a host's connectome entry, a cerebellum that learns how long each region takes on each host, and a
// thalamus that relays a signal to the best host for its region. It calls no model; a caller hands it `ask`.
// Neuroscience is the machine's vocabulary here (decided 2026-11-24): this is a MACHINE file (LAYOUT.md, C-387), and the
// daemon's own mind (feelings.ts, self.ts, memory.ts) stays psychology and is handed a region, never imports one.
// The five modes are RoverByte's (Perception, Cognition, Expression, Synesthesia, Proprioception). Every name DRAFT.
// No node: imports: the phone relays too when it hosts alone (C-111).

export const MODES = ["perception", "cognition", "expression", "proprioception", "synesthesia"] as const;
export type Mode = (typeof MODES)[number];

// how far a signal may travel: body (never off this device) < home (the house, the tailnet) < world (outside the house).
// Anything carrying a person -- the daemon's self, a journal, a dream, what was said -- is home at most.
export const RINGS = ["body", "home", "world"] as const;
export type Ring = (typeof RINGS)[number];
export const ringAllows = (signal: Ring, host: Ring) => RINGS.indexOf(host) <= RINGS.indexOf(signal);

// the regions and their verbs (docs/BRAIN.md 5)
export const REGIONS = {
  brainstem:          ["vitals", "reflex", "sleep", "wake"],
  hypothalamus:       ["drives", "clock"],
  thalamus:           ["relay", "attend", "gate"],
  salience:           ["appraise", "affect", "tag"],                 // the low road, System One, with the amygdala
  "cortex.prefrontal":["think", "plan", "hold"],
  "cortex.language":  ["speak", "comprehend"],                       // Broca and Wernicke
  "cortex.auditory":  ["hear"],
  "cortex.visual":    ["see", "imagine"],
  "cortex.motor":     ["voice"],                                     // motor speech
  hippocampus:        ["encode", "recall", "consolidate", "navigate"],   // navigate: a route over the learned map (place
                                                                     // cells, O'Keefe & Nadel 1978; Pfeiffer & Foster 2013)
  basal_ganglia:      ["repertoire", "select", "act", "stop"],      // THE HANDS
  cerebellum:         ["predict", "learn", "tempo"],
} as const satisfies Record<string, readonly string[]>;
export type Region = keyof typeof REGIONS;

export type Signal = {
  id: string; region: Region; verb: string; mode: Mode; ring: Ring;
  from: string; at: string; deadlineMs?: number; salience?: number; body?: unknown;
};
export type Response = { id: string; ok: boolean; by: string; ms: number; body?: unknown; error?: string };

// the low road's questions: Jev's four kinds (docs/research/JEV.md), answered with probabilities, never sentences
export type Question =
  | { kind: "noul"; ask: string }
  | { kind: "choice"; ask: string; options: string[] }
  | { kind: "score"; ask: string; legend: string[] }
  | { kind: "box"; ask: string };
export type Answer = { p?: number; choice?: string; probs?: Record<string, number>; score?: number;
                       box?: [number, number, number, number]; confidence: number };

// a signal as it arrives from anywhere, checked: its region known, its verb that region's, its mode and ring real
export function checkSignal(x: any): Signal | string {
  if (!x || typeof x !== "object") return "not a signal";
  if (typeof x.id !== "string" || !x.id) return "no id";
  if (!(x.region in REGIONS)) return `no region ${x.region}`;
  if (!(REGIONS[x.region as Region] as readonly string[]).includes(x.verb)) return `${x.region} has no verb ${x.verb}`;
  if (!MODES.includes(x.mode)) return `no mode ${x.mode}`;
  if (!RINGS.includes(x.ring)) return `no ring ${x.ring}`;
  if (typeof x.from !== "string" || typeof x.at !== "string") return "no from or at";
  if (x.deadlineMs != null && !(x.deadlineMs > 0)) return "a deadline must be after now";
  if (x.salience != null && !(x.salience >= 0 && x.salience <= 1)) return "salience is 0..1";
  return x as Signal;
}

// a host's connectome entry: where it is (its ring), and the regions it serves with how much it can do of each
export type Host = { name: string; at: Ring; regions: Partial<Record<Region, { power: number }>>; holds?: number };

// THE CEREBELLUM: a forward model -- for each host and region, how long it has taken lately and how often it worked
const RECENT = 20;
export class Cerebellum {
  private seen = new Map<string, { ms: number; ok: boolean }[]>();
  learn(host: string, region: Region, ms: number, ok: boolean) {
    const k = `${host}/${region}`;
    this.seen.set(k, [...(this.seen.get(k) ?? []), { ms, ok }].slice(-RECENT));
  }
  // the middle of its recent times (null: never seen), and its chance of working (a fresh host: 1/2 + a little)
  predict(host: string, region: Region): { ms: number | null; p: number } {
    const h = this.seen.get(`${host}/${region}`) ?? [];
    const times = h.filter((x) => x.ok).map((x) => x.ms).sort((a, b) => a - b);
    return { ms: times.length ? times[Math.floor(times.length / 2)] : null, p: (h.filter((x) => x.ok).length + 1) / (h.length + 2) };
  }
}

// THE THALAMUS: the hosts that may take a signal, best first. The ring gates before anything is scored (the reticular
// nucleus); then the house's own score, power x reliability x free (thoughtroute.ts, procmesh.ts); a host the cerebellum
// expects to miss the deadline goes last rather than first.
export function candidates(s: Signal, hosts: Host[], c: Cerebellum): Host[] {
  return hosts
    .filter((h) => h.regions[s.region] && ringAllows(s.ring, h.at))
    .map((h, i) => {
      const { ms, p } = c.predict(h.name, s.region);
      const late = s.deadlineMs != null && ms != null && ms > s.deadlineMs;
      return { h, i, late, score: h.regions[s.region]!.power * p / (1 + Math.max(0, h.holds ?? 0)) };
    })
    .sort((a, b) => Number(a.late) - Number(b.late) || b.score - a.score || a.i - b.i)
    .map((x) => x.h);
}

// relay: ask the candidates in order until one answers; every answer, and every failure, teaches the cerebellum
export async function relay(s: Signal, hosts: Host[], c: Cerebellum,
                            ask: (host: Host, s: Signal) => Promise<unknown>,
                            now: () => number = Date.now): Promise<Response> {
  const order = candidates(s, hosts, c);
  if (!order.length) return { id: s.id, ok: false, by: "thalamus", ms: 0, error: `no host may take ${s.region} at ring ${s.ring}` };
  let error = "";
  for (const h of order) {
    const t0 = now();
    try {
      const body = await ask(h, s);
      const ms = now() - t0;
      c.learn(h.name, s.region, ms, true);
      return { id: s.id, ok: true, by: h.name, ms, body };
    } catch (e) {
      c.learn(h.name, s.region, now() - t0, false);
      error = e instanceof Error ? e.message : String(e);
    }
  }
  return { id: s.id, ok: false, by: "thalamus", ms: 0, error };
}
