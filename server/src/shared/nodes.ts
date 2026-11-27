// C-290: this file runs on the phone too (C-111) -- the app imports it, directly or through another file -- so keep it free of Node-only APIs (node:*, fs).
// C-596 (the user, 2026-11-27: "the architecture code for THE MIND and THE HOARD is to be as common as possible"):
// THE NODES -- what every network of the household's machines keeps the same way, whatever it moves. THE MESH
// (machine/procmesh.ts, C-360) gives WORK to the node with the most potential free; THE HOARD (hoard/, C-596) asks a
// FILE of the node that would deliver it soonest. Both are the same four things, and they are here once:
//
//   a NODE     anything that dials in to the hub with a paired key and says it is here: its id, its name, what it can
//              do (its CAPS), what it holds now, and how its last twenty went
//   FRESH      heard from inside FRESH_MS -- the hub itself is always here
//   RELIABLE   (done + 1) / (done + failed + 2), over its last HISTORY
//   the SCORE  potential x reliability x free -- potential is the network's own measure (THE MESH: cores x measured
//              speed; THE HOARD: megabits a second it can deliver to whoever asks), free is how much of it is not
//              taken now: (1 - load) / (1 + what it holds)
//
// A network adds its own fields to a node and its own potential; the registry, the freshness, the reliability and the
// ranking are these. Neither MIND nor MACHINE: plumbing. Every word DRAFT.

export type NetNode = {
  id: string; name: string; caps: string[];
  seen: number;                 // when it was last heard from (ms)
  holds: number;                // what it holds now: jobs (THE MESH), transfers (THE HOARD)
  history: boolean[];           // how its last HISTORY went, oldest first
  here?: boolean;               // the hub itself: always fresh, the last resort
};

export const FRESH_MS = 15_000, HISTORY = 20;

/** a node's id as every network keeps it: letters, digits, dot, dash, underscore; sixty at most */
export const cleanNodeId = (id: unknown) => String(id ?? "").replace(/[^A-Za-z0-9._-]/g, "").slice(0, 60) || "node";
/** a node's name as it is shown */
export const cleanNodeName = (name: unknown, otherwise: string) => (String(name ?? "").trim() || otherwise).slice(0, 60);
/** what a node says it can do, kept short */
export const cleanCaps = (caps: unknown, otherwise: string[] = []) => (Array.isArray(caps) ? caps.map(String).slice(0, 12) : otherwise);

/** how far a node is to be trusted with the next one, from how its last few went */
export const reliability = (n: { history: boolean[] }) => { const ok = n.history.filter(Boolean).length; return (ok + 1) / (n.history.length + 2); };
/** how much of a node is not taken now: by its load (0 idle to 1 full) and by what it holds */
export const freeOf = (load: number, holds: number) => Math.max(0.05, 1 - Math.min(1, Math.max(0, load))) / (1 + Math.max(0, holds));
/** the score every router ranks by */
export const scoreOf = (potential: number, n: { history: boolean[] }, free: number) => potential * reliability(n) * free;
/** how one more went, kept in its history */
export const marked = (history: boolean[], ok: boolean) => [...history, ok].slice(-HISTORY);

/** the nodes of one network, by id -- a Map, so whatever read it as one still does */
export class Nodes<T extends NetNode> extends Map<string, T> {
  now: () => number;
  freshMs: number;
  constructor(o: { now?: () => number; freshMs?: number } = {}) {
    super();
    this.now = o.now ?? Date.now;
    this.freshMs = o.freshMs ?? FRESH_MS;
  }
  /** fresh enough to be given something: the hub itself, or heard from just now */
  fresh(n: T): boolean { return !!n.here || this.now() - n.seen < this.freshMs; }
  /** a node says it is here: its id, name and caps cleaned, what it had kept (its history), and the network's own fields */
  hear(raw: { id?: unknown; name?: unknown; caps?: unknown; holds?: unknown }, more: (was: T | undefined) => Omit<T, keyof NetNode>): T {
    const id = cleanNodeId(raw.id), was = this.get(id);
    const node = { id, name: cleanNodeName(raw.name, was?.name ?? id), caps: cleanCaps(raw.caps, was?.caps ?? []),
                   holds: Math.max(0, Number(raw.holds) || 0), seen: this.now(), history: was?.history ?? [], ...more(was) } as unknown as T;
    this.set(id, node);
    return node;
  }
  /** one more of a node's went well, or did not */
  mark(id: string, ok: boolean) { const n = this.get(id); if (n) n.history = marked(n.history, ok); }
  /** the fresh nodes that pass, best first by the network's own score */
  ranked(score: (n: T) => number, able: (n: T) => boolean = () => true): T[] {
    return [...this.values()].filter((n) => this.fresh(n) && able(n)).sort((a, b) => score(b) - score(a));
  }
}
