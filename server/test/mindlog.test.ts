// C-307: THE MIND's traces -- kept short and safe, newest first, and each mind's recent speed
import { describe, expect, it } from "vitest";
import { keepTrace, speeds, traceOf, traces } from "../src/ai/mindlog.js";

describe("mindlog", () => {
  it("keeps only names and numbers, never what was said", () => {
    const t = traceOf({ kind: "talk", ring: "home", heard: "here", thought: "the Tiiny", said: "by the hub", text: "secret",
                        ms: { hear: 600, think: 2300.4, voice: -1 }, covered: false, failed: ["x"] }, "phone", new Date("2026-11-10T12:00:00Z"))!;
    expect(t).toEqual({ at: "2026-11-10T12:00:00.000Z", kind: "talk", ring: "home", from: "phone", heard: "here", thought: "the Tiiny",
                        said: "by the hub", ms: { hear: 600, think: 2300, voice: undefined }, failed: ["x"] });
    expect(JSON.stringify(t)).not.toContain("secret");
    expect(traceOf({ ring: "elsewhere" }, "site")!.ring).toBe("anywhere");
  });
  it("keeps the newest forty, and reads each mind's median of its last five, covered ones aside", () => {
    const kept: Record<string, string | null> = {};
    const get = (k: string) => kept[k] ?? null, set = (k: string, v: string | null) => { kept[k] = v; };
    for (let i = 0; i < 45; i++) keepTrace(get, set, traceOf({ thought: "the Tiiny", ms: { think: 1000 + i } }, "phone")!);
    keepTrace(get, set, traceOf({ thought: "this phone", ms: { think: 900 }, covered: true }, "phone")!);
    const ts = traces(get);
    expect(ts.length).toBe(40);
    expect(ts[1].ms.think).toBe(1044);
    expect(speeds(ts)).toEqual({ "the Tiiny": { ms: 1042, n: 5 } });
  });
});
