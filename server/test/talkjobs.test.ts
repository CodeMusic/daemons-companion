// C-180: a talk answered at once with an id, the answer fetched when ready; the device in the hand first.
import { describe, expect, it } from "vitest";
import { PRIORITY, TalkJobs } from "../src/ai/talkjobs.js";

const gate = () => { let open!: (v: string) => void; const p = new Promise<string>((r) => { open = r; }); return { p, open }; };
const tick = () => new Promise((r) => setTimeout(r, 0));

describe("the talk queue (C-180)", () => {
  it("runs a few at once, the rest waiting in priority order, and keeps each answer", async () => {
    const q = new TalkJobs<string>(1);
    const a = gate(), b = gate(), c = gate(), order: string[] = [];
    const ia = q.start("tab5", PRIORITY.reading, () => { order.push("a"); return a.p; });
    const ib = q.start("watch", PRIORITY.chatter, () => { order.push("b"); return b.p; });
    const ic = q.start("phone", PRIORITY.inHand, () => { order.push("c"); return c.p; });   // jumps ahead of b
    expect(q.get(ia)!.status).toBe("thinking");
    expect(q.get(ic)).toEqual({ status: "waiting", ahead: 1 });
    expect(q.get(ib)).toEqual({ status: "waiting", ahead: 2 });
    a.open("first"); await tick(); await tick();
    expect(q.get(ia)).toEqual({ status: "done", result: "first" });
    expect(order).toEqual(["a", "c"]);
    c.open("second"); await tick(); await tick();
    expect(order).toEqual(["a", "c", "b"]);
    b.open("third"); await tick(); await tick();
    expect(q.get(ib)!.result).toBe("third");
    expect(q.load).toEqual({ running: 0, waiting: 0 });
  });

  it("says a failure, and forgets an answer nobody fetched after a few minutes", async () => {
    let t = 0;
    const q = new TalkJobs<string>(2, () => t);
    const id = q.start("x", PRIORITY.inHand, () => Promise.reject(new Error("n8n did not answer")));
    await tick(); await tick();
    expect(q.get(id)).toEqual({ status: "failed", error: "n8n did not answer" });
    t = 6 * 60 * 1000;
    expect(q.get(id)).toBeNull();
    expect(q.get("not-an-id")).toBeNull();
  });
});
