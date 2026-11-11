// C-319: THE MIND's ledger of work, and C-318: WHAT'S NEW's spans
import { describe, expect, it } from "vitest";
import { Tasks, queuedTask, traceTask, tasksView, usersOf } from "../src/ai/tasks.js";
import { STOPPED, tiinyChat } from "../src/ai/tiiny.js";
import { NOTES, digestAsk, digests, keepDigest, readDigest, spanOf, spanText } from "../src/whatsnew.js";

const mem = () => { const m = new Map<string, string>(); return { get: (k: string) => m.get(k) ?? null, set: (k: string, v: string | null) => { if (v === null) m.delete(k); else m.set(k, v); } }; };

describe("tasks", () => {
  it("opens, settles once, and times a task", () => {
    const s = mem();
    let t0 = Date.parse("2026-11-10T12:00:00Z");
    const tasks = new Tasks(s.get, s.set, () => new Date(t0));
    const t = tasks.open({ kind: "whatsnew", title: "WHAT'S NEW 950–963", user: "Chris", device: "iPhone", state: "thinking", can: { stop: true, retry: true } });
    t0 += 4200;
    expect(tasks.update(t.id, { state: "done" })).toMatchObject({ state: "done", ms: 4200, can: { retry: false } });
    expect(tasks.update(t.id, { state: "failed" })!.state).toBe("done");   // a late failure changes nothing
  });
  it("says what a restart left unfinished", () => {
    const s = mem();
    new Tasks(s.get, s.set).open({ kind: "dream", title: "a dream", state: "thinking" });
    const again = new Tasks(s.get, s.set);
    expect(again.all()[0]).toMatchObject({ state: "failed", error: "the hub restarted" });
  });
  it("never forgets a live task, and clears one user's settled", () => {
    const s = mem(), tasks = new Tasks(s.get, s.set);
    const live = tasks.open({ kind: "a", title: "live", user: "A", state: "thinking" });
    const a = tasks.open({ kind: "a", title: "done", user: "A" }); tasks.update(a.id, { state: "done" });
    const b = tasks.open({ kind: "b", title: "done", user: "B" }); tasks.update(b.id, { state: "done" });
    expect(tasks.forget(live.id)).toBe(false);
    tasks.clear("A");
    expect(tasks.all().map((t) => t.title + t.user).sort()).toEqual(["doneB", "liveA"]);
  });
  it("reads traces and the queue in, live first", () => {
    const view = tasksView([], [{ at: "2026-11-10T12:00:05Z", kind: "talk", ring: "home", from: "phone", user: "B", thought: "the Tiiny", ms: { think: 2000 } }],
                           [{ id: "q", who: "box3", status: "thinking", at: Date.parse("2026-11-10T11:00:00Z") }]);
    expect(view[0]).toMatchObject({ source: "queue", state: "thinking", device: "box3" });
    expect(view[1]).toMatchObject({ source: "trace", state: "done", mind: "the Tiiny", user: "B", ms: 2000 });
    expect(usersOf(view)).toEqual(["B", "the house"]);
    expect(traceTask({ at: "2026-11-10T12:00:00Z", kind: "guide", ring: "anywhere", from: "site", ms: {}, failed: ["n8n"] })).toMatchObject({ state: "failed", error: "n8n" });
    expect(queuedTask({ id: "x", who: "", status: "done", at: 0, ended: 1500 }).ms).toBe(1500);
  });
});

describe("tasks, next (C-319)", () => {
  it("adds up a task's tokens and keeps its sizes", () => {
    const s = mem(), tasks = new Tasks(s.get, s.set);
    const t = tasks.open({ kind: "journal", title: "a page", state: "thinking" });
    tasks.update(t.id, { size: { in: 1200 } }); tasks.update(t.id, { tokens: { in: 300, out: 90 } });
    tasks.update(t.id, { tokens: { out: 40 } }); tasks.update(t.id, { size: { out: 500 } });
    expect(tasks.find(t.id)).toMatchObject({ size: { in: 1200, out: 500 }, tokens: { in: 300, out: 130 } });
  });
  it("names a queued job by what it is", () => {
    expect(queuedTask({ id: "a", who: "phone", status: "waiting", at: 0, priority: 1 })).toMatchObject({ kind: "voice", title: "a voice made" });
    expect(queuedTask({ id: "b", who: "phone", status: "waiting", at: 0, what: "a chapter heard" }).title).toBe("a chapter heard");
  });
  it("ends a mind's request when the task is stopped, and counts its tokens when it is not", async () => {
    const at = { url: "http://t", key: "", model: "m", quick: "", tts: "", asr: "", voice: "" };
    const hang = ((_u: string, init: RequestInit) => new Promise((_r, no) => init.signal!.addEventListener("abort", () => no(new Error("aborted"))))) as unknown as typeof fetch;
    const ctl = new AbortController();
    const asked = tiinyChat(at, "m", "s", [], "hi", hang, 60_000, 50, false, false, { signal: ctl.signal });
    setTimeout(() => ctl.abort(), 10);
    await expect(asked).rejects.toThrow(STOPPED);
    const spent: unknown[] = [];
    const ok = (async () => new Response(JSON.stringify({ choices: [{ message: { content: "Hello there." } }], usage: { prompt_tokens: 12, completion_tokens: 3 } }))) as unknown as typeof fetch;
    expect(await tiinyChat(at, "m", "s", [], "hi", ok, 1000, 50, false, false, { spent: (t) => spent.push(t) })).toBe("Hello there.");
    expect(spent).toEqual([{ in: 12, out: 3 }]);
  });
});

describe("whatsnew", () => {
  it("has every build newest first, each with something to say", () => {
    expect(NOTES.builds[0].build).toBe(NOTES.latest);
    for (const b of NOTES.builds) expect(b.sections.length).toBeGreaterThan(0);
  });
  it("takes a span either way round, and tells it oldest first", () => {
    const [a, b] = [NOTES.builds[3].build, NOTES.builds[0].build];
    expect(spanOf(NOTES, b, a).map((x) => x.build)).toEqual(spanOf(NOTES, a, b).map((x) => x.build));
    const t = spanText(spanOf(NOTES, a, b));
    expect(t.indexOf(`BUILD ${a}`)).toBeLessThan(t.indexOf(`BUILD ${b}`));
    expect(digestAsk(spanOf(NOTES, a, b))).toContain(`from build ${a} to build ${b}`);
  });
  it("pulls out the title and never keeps the frightening word", () => {
    const r = readDigest("# A Week of Voices\n\n## Louder\n- The demons speak sooner\n");
    expect(r.title).toBe("A Week of Voices");
    expect(r.text).toBe("## Louder\n- The daemons speak sooner");
  });
  it("keeps a digest once, newest first", () => {
    const s = mem();
    const d = { id: "d1", from: 950, to: 963, at: "x", by: "B", task: "t", state: "thinking" as const };
    keepDigest(s.get, s.set, d); keepDigest(s.get, s.set, { ...d, state: "done" });
    expect(digests(s.get)).toEqual([{ ...d, state: "done" }]);
  });
});
