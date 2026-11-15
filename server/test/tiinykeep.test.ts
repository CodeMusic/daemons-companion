// C-375: the hub keeps the Tiiny's models loaded
import { beforeEach, describe, expect, it } from "vitest";
import { tiinyIn } from "../src/ai/tiiny.js";
import { gateOf, keepLoaded, keepOf, keepReset, KEEP, KEEP_AGAIN_MS, missing } from "../src/ai/tiinykeep.js";

const settings = (o: Record<string, string>) => (k: string) => o[k] ?? null;
const at = tiinyIn(settings({ "tiiny.url": "http://seer.test:4000/v1", "tiiny.key": "k", "tiiny.stream": "http://seer.test:4001/v1" }))!;

describe("C-375: the hub keeps the Tiiny's models loaded", () => {
  beforeEach(() => keepReset());
  it("finds the gate beside the voice stream", () => {
    expect(gateOf(at)).toBe("http://seer.test:4001");
  });
  it("loads only the kept models that are downloaded and not running", () => {
    const models = [{ id: KEEP[0], status: "downloaded" }, { id: KEEP[1], status: "running" }, { id: "other/Model", status: "downloaded" }];
    expect(missing(models)).toEqual([KEEP[0]]);   // the voice is not on the device: left for the user to get
    expect(keepOf(null)).toEqual(KEEP);
    expect(keepOf("")).toEqual([]);
    expect(keepOf("a/b, c/d")).toEqual(["a/b", "c/d"]);
  });
  it("loads them one at a time through the gate, tells each, and waits before trying again", async () => {
    const asked: string[] = [];
    const f = (async (u: string, o?: RequestInit) => {
      asked.push(`${o?.method ?? "GET"} ${u}`);
      if (u.endsWith("/tiiny/models")) return new Response(JSON.stringify({ data: KEEP.map((id) => ({ id, status: "downloaded" })) }));
      return new Response("{}");
    }) as unknown as typeof fetch;
    const told: string[] = [];
    const tell = { start: (id: string) => { told.push(`start ${id}`); return id; }, end: (task: string, ok: boolean) => { told.push(`end ${task} ${ok}`); } };
    const t0 = 1_000_000;
    expect(await keepLoaded(at, KEEP, tell, f, t0)).toEqual(KEEP);
    expect(asked[0]).toBe("GET http://seer.test:4001/tiiny/models");
    expect(asked.slice(1)).toEqual(KEEP.map((id) => `POST http://seer.test:4001/tiiny/models/${id}/start`));
    expect(told).toEqual(KEEP.flatMap((id) => [`start ${id}`, `end ${id} true`]));
    expect(await keepLoaded(at, KEEP, tell, f, t0 + 60_000)).toBeNull();               // too soon
    expect(await keepLoaded(at, KEEP, tell, f, t0 + KEEP_AGAIN_MS + 1)).not.toBeNull();
  });
  it("does nothing without a gate", async () => {
    const bare = tiinyIn(settings({ "tiiny.url": "http://seer.test:4000/v1", "tiiny.key": "k" }))!;
    expect(await keepLoaded(bare, KEEP, { start: () => "", end: () => {} }, (async () => new Response("{}")) as unknown as typeof fetch)).toBeNull();
  });
});
