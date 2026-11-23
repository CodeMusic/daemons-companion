// The hub's only (it runs ffmpeg and keeps files): never imported by core.ts or routes.ts.
// C-360 (the user, 2026-11-14: "a generalized way for any request to get the best routing for that time (e.g. if the
// most powerful machine is busy with tasks, it would be routed to the next most) ... think of it as a mind/processor
// mesh network where we draw from where there is more available potential ... not just cognitive llm tasks, but also
// general processing operations. most reliable with most potential at the time of the request first"; by multiple
// choice: the hub, roverbyteseer and THE HANDS' Mac first, phones next; "Reliable + free, hedged"):
//
// THE MESH for processing. A NODE is anything that can take work: the hub itself, and every worker that dials in
// (mesh_worker_main.ts -- roverbyteseer, the Mac; phones next), each saying what it can do (its CAPS), how much it can do
// (its POWER: cores x a quick measured speed) and how busy it is now (its LOAD and the jobs it holds). A JOB names what it
// needs; the router asks every node fresh enough to trust and gives the job to the one with the most potential free:
//
//     score = power x reliability x free       free = (1 - load) / (1 + jobs it holds now)
//     reliability = (done + 1) / (done + failed + 2), over its last twenty
//
// HEDGED: a worker that has not taken its job in a few seconds, or has not finished by twice the time the job should
// take there, is passed over -- the job is given to the next best too, and the first to finish wins (the other's
// copy is thrown away). The hub is always a node, the last resort: a job never waits on a worker that has gone.
//
// Jobs today: ffmpeg runs (C-334's conversions, C-358's exports). Its arguments name files only as @in:<name> and
// @out:<name>; a worker fetches each input from the hub and sends each output back, and runs only ffmpeg.
// Every job is a task in THE MIND AT WORK (C-319), its node the mind it ran on, each hand-off a hop. Every word DRAFT.
import { execFile } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { cpus, loadavg } from "node:os";
import { existsSync, renameSync, rmSync } from "node:fs";
import { FOUND_FFMPEG } from "./voice.js";

export type Caps = string[];
export type MeshNode = { id: string; name: string; caps: Caps; cores: number; speed: number; load: number; seen: number;
                         holds: number; history: boolean[]; here?: boolean };
export type ProcJob = {
  id: string; kind: "ffmpeg"; title: string; args: string[];
  inputs: Record<string, string>; outputs: Record<string, string>;     // name -> the hub's own path
  expectMs: number;                                                   // how long it should take on a node of power 1
  asked: number; given: { node: string; at: number; taken?: number }[]; state: "waiting" | "running" | "done" | "failed";
  winner?: string; error?: string;
};
export type Ledger = { open(title: string, mind: string): string; hop(task: string, mind: string): void;
                       end(task: string, ok: boolean, error?: string): void };

export const FRESH_MS = 15_000, TAKE_MS = 8_000, HISTORY = 20;
const SAFE_ARG = (a: string) => !/^[/~]/.test(a) && !a.includes("../") && !a.includes("://") && !/^file:/i.test(a);
export const safeArgs = (args: string[]) => args.every((a) => /^@(in|out):[a-z0-9._-]{1,40}$/i.test(a) || SAFE_ARG(a));

// a node's potential free now, and the score the router ranks by
export const reliability = (n: MeshNode) => { const ok = n.history.filter(Boolean).length; return (ok + 1) / (n.history.length + 2); };
export const power = (n: MeshNode) => Math.max(0.1, n.cores * n.speed);
export const free = (n: MeshNode) => Math.max(0.05, 1 - Math.min(1, n.load)) / (1 + n.holds);
export const score = (n: MeshNode) => power(n) * reliability(n) * free(n);

// how fast this machine is, by a fixed piece of work (a node's speed is this, measured where it runs): ~1 on a
// small ARM board, more on a laptop
export function measureSpeed(): number {
  const t = performance.now();
  let h = Buffer.alloc(64);
  for (let i = 0; i < 40_000; i++) h = createHash("sha256").update(h).digest();
  const ms = performance.now() - t;
  return Math.round((250 / Math.max(1, ms)) * 100) / 100;            // the hub (a CoreMP135) measures about 1
}
// a node's speed is what it can do at best -- how busy it is now is its load, counted apart -- so one reading taken
// while the machine was busy must not stand for the day (THE HANDS' Mac measured 7.4, 2.2 and 0.49 on three starts,
// 2026-11-14): measured again from time to time, and the best of the last few kept
export const SPEED_READINGS = 6, SPEED_EVERY_MS = 10 * 60_000;
export function keepSpeed(readings: number[], fresh: number): { readings: number[]; speed: number } {
  const r = [...readings, fresh].filter((x) => Number.isFinite(x) && x > 0).slice(-SPEED_READINGS);
  return { readings: r, speed: r.length ? Math.max(...r) : 0.1 };
}

// put a job's files where they are on this machine, and run ffmpeg there, gently
export function argvFor(args: string[], files: Record<string, string>): string[] {
  return args.map((a) => { const m = /^@(in|out):(.+)$/.exec(a); return m ? files[`${m[1]}:${m[2]}`] ?? a : a; });
}
export const runFfmpeg = (argv: string[]) => new Promise<void>((done, fail) =>
  execFile("nice", ["-n", "15", FOUND_FFMPEG ?? "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", ...argv], { timeout: 60 * 60000 },
           (e, _o, err) => (e ? fail(new Error(String(err || e.message).slice(-200))) : done())));

// C-360, thought: a write asked of one phone that lends its on-device model (its node's caps include "think") -- given to
// that node alone; not taken in TAKE_MS, or not answered in THINK_MOST_MS, it fails and the house asks its next mind
export type ThinkJob = { id: string; node: string; title: string; system: string; user: string; most: number; at: number; taken?: number;
                         ok: (text: string) => void; no: (e: Error) => void };
export const THINK_MOST_MS = 120_000;

export class ProcMesh {
  nodes = new Map<string, MeshNode>();
  jobs = new Map<string, ProcJob>();
  thoughts = new Map<string, ThinkJob>();
  private waiters = new Map<string, { done: () => void; fail: (e: Error) => void; task?: string }>();
  private self: MeshNode;
  private localRunning = 0;
  constructor(private ledger: Ledger | null = null, opts: { speed?: number; name?: string; now?: () => number } = {}) {
    this.now = opts.now ?? Date.now;
    this.self = { id: "hub", name: opts.name ?? "the hub", caps: ["ffmpeg"], cores: cpus().length, speed: opts.speed ?? measureSpeed(),
                  load: 0, seen: this.now(), holds: 0, history: [], here: true };
    this.nodes.set("hub", this.self);
  }
  private now: () => number;

  // a worker says it is here (each time it asks for work)
  heard(n: { id: string; name?: string; caps?: unknown; cores?: unknown; speed?: unknown; load?: unknown; holds?: unknown }): MeshNode {
    const id = String(n.id).replace(/[^A-Za-z0-9._-]/g, "").slice(0, 60) || "node";
    const was = this.nodes.get(id);
    const node: MeshNode = { id, name: String(n.name ?? was?.name ?? id).slice(0, 60),
      caps: Array.isArray(n.caps) ? n.caps.map(String).slice(0, 12) : was?.caps ?? [],
      cores: Math.max(1, Math.min(128, Number(n.cores) || was?.cores || 1)), speed: Math.max(0.05, Math.min(100, Number(n.speed) || was?.speed || 1)),
      load: Math.max(0, Math.min(4, Number(n.load) || 0)), holds: Math.max(0, Number(n.holds) || 0), seen: this.now(), history: was?.history ?? [] };
    this.nodes.set(id, node);
    return node;
  }
  // the nodes as THE MIND AT WORK shows them: fresh or not, their potential and their score now
  view() {
    this.self.load = Math.min(1, loadavg()[0] / this.self.cores); this.self.holds = this.localRunning; this.self.seen = this.now();
    return [...this.nodes.values()].map((n) => ({ id: n.id, name: n.name, caps: n.caps, cores: n.cores, speed: n.speed, load: n.load,
      holds: n.holds, fresh: !!n.here || this.now() - n.seen < FRESH_MS, power: Math.round(power(n) * 10) / 10,
      reliability: Math.round(reliability(n) * 100) / 100, score: Math.round(score(n) * 100) / 100 }));
  }
  // the best node for a job now, other than those it was given to already
  best(cap: string, not: string[] = []): MeshNode {
    this.view();
    const able = [...this.nodes.values()].filter((n) => (n.here || this.now() - n.seen < FRESH_MS) && n.caps.includes(cap) && !not.includes(n.id));
    return able.sort((a, b) => score(b) - score(a))[0] ?? this.self;
  }

  // ---- asking: the job is given to the best node; the promise ends when its outputs are on the hub ----
  ffmpeg(args: string[], inputs: Record<string, string>, outputs: Record<string, string>, o: { title: string; expectMs?: number }): Promise<void> {
    if (!safeArgs(args)) return Promise.reject(new Error("the job names a file outside @in/@out"));
    const job: ProcJob = { id: randomBytes(12).toString("hex"), kind: "ffmpeg", title: o.title, args, inputs, outputs,
                           expectMs: o.expectMs ?? 60_000, asked: this.now(), given: [], state: "waiting" };
    this.jobs.set(job.id, job);
    return new Promise<void>((done, fail) => {
      const task = this.ledger?.open(o.title, "");
      this.waiters.set(job.id, { done, fail, task });
      this.give(job);
    });
  }
  private give(job: ProcJob) {
    const n = this.best("ffmpeg", job.given.map((g) => g.node));
    job.given.push({ node: n.id, at: this.now() });
    const w = this.waiters.get(job.id);
    if (w?.task) this.ledger?.hop(w.task, n.name);
    if (n.here) { this.runHere(job); return; }
    n.holds++;
    // hedged: not taken soon, or not done by twice what it should take there -- the next best too
    const id = job.id, node = n.id;
    setTimeout(() => { const j = this.jobs.get(id); const g = j?.given.find((x) => x.node === node);
                       if (j && j.state !== "done" && j.state !== "failed" && g && !g.taken) this.passOver(j, node, "did not take it"); }, TAKE_MS).unref?.();
    const limit = Math.max(30_000, (2 * job.expectMs) / power(n));
    setTimeout(() => { const j = this.jobs.get(id); if (j && j.state !== "done" && j.state !== "failed") this.passOver(j, node, "too slow"); },
               limit + TAKE_MS).unref?.();
  }
  private passOver(job: ProcJob, node: string, why: string) {
    const n = this.nodes.get(node);
    if (n) { n.history = [...n.history, false].slice(-HISTORY); n.holds = Math.max(0, n.holds - 1); }
    if (job.given.some((g) => this.nodes.get(g.node)?.here)) return;    // the hub has it already: it finishes it
    this.give(job);
    void why;
  }
  private async runHere(job: ProcJob) {
    this.localRunning++;
    job.state = "running";
    const outs = Object.fromEntries(Object.entries(job.outputs).map(([k, p]) => [`out:${k}`, `${p}.hub`]));
    const ins = Object.fromEntries(Object.entries(job.inputs).map(([k, p]) => [`in:${k}`, p]));
    try { await runFfmpeg(argvFor(job.args, { ...ins, ...outs })); this.finish(job, "hub", true); }
    catch (e) { this.finish(job, "hub", false, (e as Error).message); }
    finally { this.localRunning--; for (const p of Object.values(outs)) rmSync(p, { force: true }); }
  }

  // ---- thought: the phones that lend, each one a mind the house can ask ----
  thinkers(): { id: string; name: string }[] {
    return [...this.nodes.values()].filter((n) => !n.here && this.now() - n.seen < FRESH_MS && n.caps.includes("think"))
      .map((n) => ({ id: n.id, name: n.name }));
  }
  thinkOn(nodeId: string, system: string, user: string, most: number, title: string, signal?: AbortSignal): Promise<string> {
    return new Promise<string>((ok, no) => {
      const id = randomBytes(12).toString("hex");
      const n = this.nodes.get(nodeId);
      const end = (f: () => void) => { if (!this.thoughts.has(id)) return; this.thoughts.delete(id); if (n) n.holds = Math.max(0, n.holds - 1); f(); };
      const job: ThinkJob = { id, node: nodeId, title, system, user, most, at: this.now(),
                              ok: (t) => end(() => { if (n) n.history = [...n.history, true].slice(-HISTORY); ok(t); }),
                              no: (e) => end(() => { if (n) n.history = [...n.history, false].slice(-HISTORY); no(e); }) };
      this.thoughts.set(id, job);
      if (n) n.holds++;
      setTimeout(() => { const j = this.thoughts.get(id); if (j && !j.taken) j.no(new Error(`${n?.name ?? "the phone"} did not take it`)); }, TAKE_MS).unref?.();   // DRAFT
      setTimeout(() => this.thoughts.get(id)?.no(new Error(`${n?.name ?? "the phone"} took too long`)), THINK_MOST_MS).unref?.();   // DRAFT
      signal?.addEventListener("abort", () => this.thoughts.get(id)?.no(new Error("stopped")), { once: true });
    });
  }
  takeThought(nodeId: string): ThinkJob | null {
    const j = [...this.thoughts.values()].find((x) => x.node === nodeId && !x.taken);
    if (j) j.taken = this.now();
    return j ?? null;
  }
  thought(id: string, nodeId: string, ok: boolean, text?: string, error?: string): boolean {
    const j = this.thoughts.get(id);
    if (!j || j.node !== nodeId) return false;
    if (ok && text?.trim()) j.ok(text); else j.no(new Error(error || "no words came"));   // DRAFT
    return true;
  }

  // ---- a worker's side ----
  take(nodeId: string): ProcJob | null {
    const job = [...this.jobs.values()].find((j) => (j.state === "waiting" || j.state === "running") &&
                                                   j.given.some((g) => g.node === nodeId && !g.taken));
    if (!job) return null;
    job.given.find((g) => g.node === nodeId)!.taken = this.now();
    job.state = "running";
    return job;
  }
  inputFile(jobId: string, name: string): string | null {
    const p = this.jobs.get(jobId)?.inputs[name];
    return p && existsSync(p) ? p : null;
  }
  // where a worker's output is written while it is sent (the job's own path, marked as that node's)
  outputPart(jobId: string, nodeId: string, name: string): string | null {
    const j = this.jobs.get(jobId);
    const p = j?.outputs[name];
    return p && j.given.some((g) => g.node === nodeId) && j.state !== "done" ? `${p}.${nodeId.replace(/[^A-Za-z0-9_-]/g, "")}` : null;
  }
  done(jobId: string, nodeId: string, ok: boolean, error?: string) {
    const j = this.jobs.get(jobId);
    if (!j || !j.given.some((g) => g.node === nodeId)) return false;
    const n = this.nodes.get(nodeId);
    if (n && !n.here) n.holds = Math.max(0, n.holds - 1);
    this.finish(j, nodeId, ok, error);
    return true;
  }
  private finish(j: ProcJob, nodeId: string, ok: boolean, error?: string) {
    const n = this.nodes.get(nodeId);
    const part = (p: string) => `${p}.${nodeId.replace(/[^A-Za-z0-9_-]/g, "")}`;
    if (j.state === "done") { for (const p of Object.values(j.outputs)) rmSync(part(p), { force: true }); return; }   // another won
    if (n) n.history = [...n.history, ok].slice(-HISTORY);
    if (ok && Object.values(j.outputs).every((p) => existsSync(part(p)))) {
      for (const p of Object.values(j.outputs)) renameSync(part(p), p);
      j.state = "done"; j.winner = nodeId;
      const w = this.waiters.get(j.id);
      if (w?.task) this.ledger?.end(w.task, true);
      w?.done();
      this.waiters.delete(j.id);
      setTimeout(() => this.jobs.delete(j.id), 60_000).unref?.();
      return;
    }
    for (const p of Object.values(j.outputs)) rmSync(part(p), { force: true });
    // this node failed it: someone else, unless every able node has tried (the hub last of all)
    if (j.given.some((g) => this.nodes.get(g.node)?.here) && nodeId !== "hub" && j.state !== "failed") return;   // the hub is on it
    const tried = j.given.map((g) => g.node), next = this.best("ffmpeg", tried);
    if (!tried.includes(next.id)) { this.give(j); return; }
    j.state = "failed"; j.error = error ?? "it could not be done";
    const w = this.waiters.get(j.id);
    if (w?.task) this.ledger?.end(w.task, false, j.error);
    w?.fail(new Error(j.error));
    this.waiters.delete(j.id);
    setTimeout(() => this.jobs.delete(j.id), 60_000).unref?.();
  }
}
