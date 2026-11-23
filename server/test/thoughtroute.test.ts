// C-360, thought: the house's minds in order of their score now, the next on failure, hedged when someone waits
import { beforeEach, describe, expect, it } from "vitest";
import { forgetHistory, MIND_POWER, order, record, think, type Mind } from "../src/machine/thoughtroute.js";
import { ProcMesh } from "../src/machine/procmesh.js";

const mind = (name: string, power: number, answer: string | Error, ms = 0): Mind =>
  ({ name, power, ask: () => new Promise((ok, no) => setTimeout(() => (answer instanceof Error ? no(answer) : ok(answer)), ms)) });
beforeEach(() => forgetHistory());

describe("the house's minds, in order", () => {
  it("asks the strongest free mind first, and passes a busy one for the next", () => {
    const minds = [mind("module", MIND_POWER.module, "m"), mind("phone", MIND_POWER.phone, "p"), mind("tiiny", MIND_POWER.tiiny, "t"), mind("cloud", MIND_POWER.endpoint, "c")];
    expect(order(minds, () => 0).map((m) => m.name)).toEqual(["tiiny", "cloud", "phone", "module"]);
    expect(order(minds, (n) => (n === "tiiny" ? 3 : 0)).map((m) => m.name)).toEqual(["cloud", "tiiny", "phone", "module"]);
    for (let i = 0; i < 10; i++) record("cloud", false);           // unreliable lately
    expect(order(minds, () => 0)[1].name).not.toBe("cloud");
  });
  it("falls through to the next when one fails", async () => {
    const r = await think([mind("a", 9, new Error("down")), mind("b", 5, "from b")]);
    expect(r).toEqual({ text: "from b", by: "b" });
  });
  it("hedges: a slow first mind is joined by the next, and the first answer wins", async () => {
    const tried: string[] = [];
    const r = await think([mind("slow", 9, "late", 400), mind("quick", 5, "soon", 10)], { hedgeMs: 50, tried: (n) => tried.push(n) });
    expect(r.by).toBe("quick");
    expect(tried).toEqual(["slow", "quick"]);
  });
  it("gives a thought to a phone that lends, and takes its answer", async () => {
    const mesh = new ProcMesh(null, { speed: 1 });
    mesh.heard({ id: "phone-1", name: "Chris's iPhone", caps: ["think"], cores: 6, speed: 3 });
    expect(mesh.thinkers()).toEqual([{ id: "phone-1", name: "Chris's iPhone" }]);
    const p = mesh.thinkOn("phone-1", "be kind", "hello", 100, "a thought");
    const j = mesh.takeThought("phone-1")!;
    expect(j.user).toBe("hello");
    expect(mesh.thought(j.id, "phone-1", true, "hi there")).toBe(true);
    await expect(p).resolves.toBe("hi there");
    expect(mesh.nodes.get("phone-1")!.history).toEqual([true]);
  });
  it("lets a stopped thought go at once", async () => {
    const mesh = new ProcMesh(null, { speed: 1 });
    mesh.heard({ id: "phone-1", caps: ["think"] });
    const ctl = new AbortController(), p = mesh.thinkOn("phone-1", "s", "u", 10, "t", ctl.signal);
    ctl.abort();
    await expect(p).rejects.toThrow("stopped");
  });
});
