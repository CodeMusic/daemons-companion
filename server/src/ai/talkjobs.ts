// C-180 (the user, 2026-10-22: "many boards connect to this device and we need it to be as quick as possible for replies
// to not lag the device ui"): a talk is answered at once with an id, and the answer fetched when it is ready -- so no
// device holds a request open while a model thinks (the phone gave up after 8 s; the Tab5's network task waited on it).
// One queue for every talk and every voice, the device in the user's hand first; a few at once (n8n takes several; the
// hub's Module LLM will take one); each answer kept a few minutes for the device to fetch.
import { randomBytes } from "node:crypto";

export const PRIORITY = { inHand: 0, reading: 1, chatter: 2 } as const;   // lower goes first
const KEEP_MS = 5 * 60 * 1000;

type Job<R> = { id: string; who: string; priority: number; at: number; run: () => Promise<R>;
                status: "waiting" | "thinking" | "done" | "failed"; result?: R; error?: string; ended?: number };

export class TalkJobs<R = unknown> {
  private jobs = new Map<string, Job<R>>();
  private waiting: Job<R>[] = [];
  private running = 0;
  constructor(private at = 2, private now = () => Date.now()) {}

  // A job queued; its id at once
  start(who: string, priority: number, run: () => Promise<R>): string {
    this.sweep();
    const id = randomBytes(12).toString("base64url");
    const job: Job<R> = { id, who, priority, at: this.now(), run, status: "waiting" };
    this.jobs.set(id, job);
    let i = this.waiting.findIndex((w) => w.priority > priority);          // behind its equals, ahead of the less urgent
    if (i < 0) i = this.waiting.length;
    this.waiting.splice(i, 0, job);
    this.next();
    return id;
  }

  // How it stands: waiting (and how many are ahead of it), thinking, done with its answer, or failed; null if unknown
  get(id: string): { status: Job<R>["status"]; ahead?: number; result?: R; error?: string } | null {
    this.sweep();
    const j = this.jobs.get(id);
    if (!j) return null;
    if (j.status === "waiting") return { status: "waiting", ahead: this.waiting.indexOf(j) + this.running };
    if (j.status === "thinking") return { status: "thinking" };
    return j.status === "done" ? { status: "done", result: j.result } : { status: "failed", error: j.error };
  }

  get load() { return { running: this.running, waiting: this.waiting.length }; }

  private next() {
    while (this.running < this.at && this.waiting.length) {
      const j = this.waiting.shift()!;
      j.status = "thinking"; this.running++;
      j.run().then((r) => { j.status = "done"; j.result = r; }, (e) => { j.status = "failed"; j.error = (e as Error)?.message ?? String(e); })
        .finally(() => { j.ended = this.now(); this.running--; this.next(); });
    }
  }

  private sweep() {
    const t = this.now();
    for (const [id, j] of this.jobs) if (j.ended !== undefined && t - j.ended > KEEP_MS) this.jobs.delete(id);
  }
}
