// C-180: the Module LLM's thinking through StackFlow itself (TCP 10001, docs/LLM630.md), not M5's OpenAI plugin. Measured
// on the hub's module (the hardware lane, 2026-10-28): through the plugin a user message over ~70 characters answers
// "", and a system message sticks to the first pooled client -- so a daemon's persona cannot reach the model there. Here
// the persona is the llm unit's own setup `prompt` and only what was said is sent: ~0.6 s to the first words.
// One connection per module, kept open: an instance (its work_id) lives on it, set up once per persona and reused.
// node:net, so only api.ts's side reaches it (the House is given it); never core.ts or routes.ts.
import { createConnection, type Socket } from "node:net";
import { LATE } from "./module.js";

export type Thought = { text: string; firstMs: number | null; totalMs: number };
type Obj = { request_id?: string; work_id?: string; error?: { code: number; message?: string }; data?: unknown };

export class StackFlow {
  private sock: Socket | null = null;
  private buf = "";
  private got: Obj[] = [];
  private wake: (() => void) | null = null;
  private dead = 0;                                       // bumped when the connection drops: every instance on it is gone
  constructor(readonly host: string, readonly port = 10001) {}
  get generation() { return this.dead; }
  // one exchange at a time on the connection: a setup, an answer streaming, an exit never interleave
  private chain: Promise<unknown> = Promise.resolve();
  private locked<T>(f: () => Promise<T>): Promise<T> { const run = this.chain.then(f, f); this.chain = run.catch(() => {}); return run; }

  private connect(): Promise<Socket> {
    if (this.sock && !this.sock.destroyed) return Promise.resolve(this.sock);
    return new Promise((done, fail) => {
      const s = createConnection({ host: this.host, port: this.port });
      s.setEncoding("utf8");
      s.setTimeout(5000, () => s.destroy(new Error("the module's StackFlow did not answer")));
      s.once("connect", () => { s.setTimeout(0); this.sock = s; done(s); });
      s.once("error", (e) => { fail(e); });
      s.on("data", (chunk: string) => {
        this.buf += chunk;
        let i: number;
        while ((i = this.buf.indexOf("\n")) >= 0) {
          const line = this.buf.slice(0, i).trim(); this.buf = this.buf.slice(i + 1);
          if (line) try { this.got.push(JSON.parse(line)); } catch { /* a line it could not finish; the next is whole */ }
        }
        this.wake?.();
      });
      s.on("close", () => { if (this.sock === s) { this.sock = null; this.buf = ""; this.got = []; this.dead++; this.wake?.(); } });
    });
  }
  // the next object the module sends, within ms
  private next(ms: number): Promise<Obj> {
    const at = Date.now();
    return new Promise((done, fail) => {
      const look = () => {
        if (this.got.length) { this.wake = null; clearTimeout(t); return done(this.got.shift()!); }
        if (!this.sock) { this.wake = null; clearTimeout(t); return fail(new Error("the module's StackFlow closed")); }
      };
      const t = setTimeout(() => { this.wake = null; fail(new Error(`the module's StackFlow was silent for ${Date.now() - at} ms`)); }, ms);
      this.wake = look; look();
    });
  }
  private async send(o: object) { (await this.connect()).write(JSON.stringify(o)); }

  // a thinker with this persona; its work_id ("llm.1003")
  setup(model: string, prompt: string, maxTokens = 128, ms = 20000): Promise<string> { return this.locked(async () => {
    await this.send({ request_id: "setup", work_id: "llm", action: "setup", object: "llm.setup",
                      data: { model, response_format: "llm.utf-8.stream", input: "llm.utf-8", enoutput: true, max_token_len: maxTokens, prompt } });
    const r = await this.next(ms);
    if (r.error?.code || !r.work_id) throw new Error(`the module's StackFlow setup failed: ${r.error?.message ?? "no work_id"}`);
    return r.work_id;
  }); }
  // what was said, to that thinker; its words as they stream. firstWithinMs: no first words by then is LATE for the caller.
  infer(workId: string, said: string, opts: { firstWithinMs?: number; totalMs?: number } = {}): Promise<Thought> { return this.locked(async () => {
    const t0 = Date.now();
    await this.send({ request_id: "infer", work_id: workId, action: "inference", object: "llm.utf-8", data: said });
    let text = "", firstMs: number | null = null;
    for (;;) {
      const wait = firstMs === null && opts.firstWithinMs ? opts.firstWithinMs - (Date.now() - t0) : (opts.totalMs ?? 30000) - (Date.now() - t0);
      if (wait <= 0) { this.sock?.destroy(); throw new Error(firstMs === null ? LATE : "the module's StackFlow ran too long"); }
      let r: Obj;
      try { r = await this.next(wait); }
      catch (e) { if (firstMs === null && opts.firstWithinMs) { this.sock?.destroy(); throw new Error(LATE); } throw e; }
      if (r.error?.code) throw new Error(`the module's StackFlow: ${r.error.message ?? r.error.code}`);
      const d = r.data as { delta?: string; finish?: boolean } | string | undefined;
      if (!d || typeof d !== "object") break;
      if (d.delta) { if (firstMs === null) firstMs = Date.now() - t0; text += d.delta; }
      if (d.finish) break;
    }
    return { text, firstMs, totalMs: Date.now() - t0 };
  }); }
  exit(workId: string): Promise<void> { return this.locked(async () => {
    try { await this.send({ request_id: "exit", work_id: workId, action: "exit" }); await this.next(5000); } catch { /* gone already */ }
  }); }
}
