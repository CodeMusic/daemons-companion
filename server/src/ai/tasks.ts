// C-290: this file runs on the phone too (C-111) -- the app imports it, directly or through another file -- so keep it free of Node-only APIs (node:*, fs).
// C-319 (the user, 2026-11-10: "a way of visualizing everything that is happening in this mind mesh network, tasks on
// various devices, for various users, for various functions ... both a visualization, and also a way to manage mind
// tasks"): THE MIND's ledger of work -- every piece of thinking the hub does or hears of, as one kind of thing: what it is
// (its kind and a title), for whom (a user) and from where (a device), which mind took it, and how it stands (waiting,
// thinking, done, failed, stopped), with when. The hub keeps the last MOST on its store, so every phone and the site
// see the same mesh; the talks a phone reports (mindlog.ts's traces) and the hub's live talk queue (talkjobs.ts) are
// read in as tasks too, so nothing that thinks is missing. Only titles, names and times -- never what was said.

export type TaskState = "waiting" | "thinking" | "done" | "failed" | "stopped";
export type Task = {
  id: string; kind: string; title: string;
  user: string; device: string; mind?: string;
  state: TaskState; at: string; started?: string; ended?: string; ms?: number; error?: string;
  can?: { stop?: boolean; retry?: boolean };          // what the ledger lets a phone do with it
  source?: "ledger" | "trace" | "queue";              // where the view found it
  // C-319 next: how much it was given and gave back, in characters, and what the mind counted in tokens (when it says)
  size?: { in?: number; out?: number }; tokens?: { in?: number; out?: number };
};
export const LIVE: TaskState[] = ["waiting", "thinking"];
export const MOST_TASKS = 120;
const KEY = "mind.tasks";
type Get = (k: string) => string | null;
type Set_ = (k: string, v: string | null) => void;
const clip = (s: unknown, n = 80) => (typeof s === "string" && s.trim() ? s.trim().slice(0, n) : undefined);

export class Tasks {
  private n = 0;
  constructor(private get: Get, private set: Set_, private now = () => new Date()) {
    // what was in flight when the hub stopped did not finish: said so, once, at start
    const was = this.all();
    if (was.some((t) => LIVE.includes(t.state)))
      this.keep(was.map((t) => (LIVE.includes(t.state) ? { ...t, state: "failed" as const, error: "the hub restarted", ended: this.now().toISOString() } : t)));
  }
  all(): Task[] {
    try { const t = JSON.parse(this.get(KEY) ?? "[]"); return Array.isArray(t) ? t : []; } catch { return []; }
  }
  private keep(ts: Task[]) {
    // the live are never dropped for room; the oldest settled go first
    const live = ts.filter((t) => LIVE.includes(t.state)), settled = ts.filter((t) => !LIVE.includes(t.state));
    this.set(KEY, JSON.stringify([...live, ...settled].sort((a, b) => b.at.localeCompare(a.at)).slice(0, Math.max(MOST_TASKS, live.length))));
  }
  open(o: { kind: string; title: string; user?: string; device?: string; mind?: string; state?: TaskState; can?: Task["can"] }): Task {
    const at = this.now().toISOString();
    const t: Task = { id: `t${Date.now().toString(36)}${(this.n++).toString(36)}`, kind: clip(o.kind, 20) ?? "work",
                      title: clip(o.title) ?? "thinking", user: clip(o.user, 40) ?? "the house", device: clip(o.device, 40) ?? "the hub",
                      ...(o.mind ? { mind: clip(o.mind, 40) } : {}), state: o.state ?? "waiting", at,
                      ...(o.state === "thinking" ? { started: at } : {}), ...(o.can ? { can: o.can } : {}), source: "ledger" };
    this.keep([t, ...this.all()]);
    return t;
  }
  find(id: string) { return this.all().find((t) => t.id === id) ?? null; }
  update(id: string, patch: Partial<Pick<Task, "state" | "mind" | "error" | "title" | "size" | "tokens">>): Task | null {
    let out: Task | null = null;
    const nowIso = this.now().toISOString();
    this.keep(this.all().map((t) => {
      if (t.id !== id) return t;
      if (!LIVE.includes(t.state) && patch.state) return (out = t);          // settled is settled: a late answer changes nothing
      const n: Task = { ...t, ...patch };
      if (patch.size) n.size = { ...t.size, ...patch.size };
      if (patch.tokens) n.tokens = { in: (t.tokens?.in ?? 0) + (patch.tokens.in ?? 0) || undefined,   // a write asked twice counts both
                                     out: (t.tokens?.out ?? 0) + (patch.tokens.out ?? 0) || undefined };
      if (patch.state === "thinking" && !t.started) n.started = nowIso;
      if (patch.state && !LIVE.includes(patch.state)) {
        n.ended = nowIso;
        n.ms = Date.parse(nowIso) - Date.parse(t.started ?? t.at);
        if (n.can) n.can = { retry: n.can.retry && patch.state !== "done" };
      }
      return (out = n);
    }));
    return out;
  }
  forget(id: string): boolean {
    const was = this.all();
    const left = was.filter((t) => t.id !== id || LIVE.includes(t.state));   // the live are stopped, not forgotten
    if (left.length === was.length) return false;
    this.keep(left);
    return true;
  }
  // the settled cleared, for one user or all
  clear(user?: string) { this.keep(this.all().filter((t) => LIVE.includes(t.state) || (user !== undefined && t.user !== user))); }
}

// A talk a phone reported (mindlog.ts), as a settled task
type TraceLike = { at: string; kind: string; ring: string; from: string; user?: string; device?: string; thought?: string;
                   ms: { hear?: number; think?: number; voice?: number }; covered?: boolean; failed?: string[] };
export function traceTask(t: TraceLike): Task {
  const ms = (t.ms.hear ?? 0) + (t.ms.think ?? 0) + (t.ms.voice ?? 0);
  const ok = !!t.thought;
  return { id: `trace-${t.at}`, kind: t.kind, title: t.kind === "guide" ? "asked THE GUIDE" : "talked with a daemon",   // DRAFT
           user: t.user ?? "the house", device: t.device ?? t.from, ...(t.thought ? { mind: t.thought } : {}),
           state: ok ? "done" : "failed", at: new Date(Date.parse(t.at) - ms).toISOString(), ended: t.at, ms,
           ...(ok ? {} : { error: t.failed?.join(", ") || "no mind answered" }), source: "trace" };
}
// A talk in the hub's queue (talkjobs.ts), live or just settled
export type QueuedJob = { id: string; who: string; status: "waiting" | "thinking" | "done" | "failed"; at: number; ended?: number; error?: string;
                          priority?: number; what?: string };
// what a queued job is, by its priority (talkjobs.ts PRIORITY) when it was not named -- DRAFT
const QUEUED = [["talk", "a talk, someone waiting"], ["voice", "a voice made"], ["chatter", "a daemon's chatter"]] as const;
export function queuedTask(j: QueuedJob): Task {
  const [kind, title] = QUEUED[j.priority ?? 0] ?? QUEUED[0];
  return { id: `queue-${j.id}`, kind, title: j.what || title, user: "the house", device: j.who || "a device",   // DRAFT
           state: j.status, at: new Date(j.at).toISOString(), ...(j.ended ? { ended: new Date(j.ended).toISOString(), ms: j.ended - j.at } : {}),
           ...(j.error ? { error: j.error } : {}), source: "queue" };
}

// Everything as one list, newest first; `user` keeps only that user's (and "the house"'s shared work stays out of a
// user's own view); `since` keeps only what began after it
export function tasksView(ledger: Task[], traces: TraceLike[], queue: QueuedJob[], o: { user?: string; since?: string } = {}): Task[] {
  const all = [...ledger, ...traces.map(traceTask), ...queue.map(queuedTask)];
  return all.filter((t) => (o.user === undefined || t.user === o.user) && (o.since === undefined || t.at >= o.since))
            .sort((a, b) => Number(LIVE.includes(b.state)) - Number(LIVE.includes(a.state)) || b.at.localeCompare(a.at));
}
export const usersOf = (ts: Task[]) => [...new Set(ts.map((t) => t.user))].sort();
