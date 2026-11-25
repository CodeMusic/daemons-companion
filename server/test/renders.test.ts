// C-508: REVERIE's renders -- made once on asking, one at a time; past the limit the oldest unplayed go, never a drift
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderArgs, renderSeconds, Renders } from "../src/machine/reverierenders.js";
import type { DriftFile } from "../src/psyche/drift.js";

const drift = (id: string, minutes = 10, bed = true): DriftFile => ({
  id, kind: "sleep", meta: { name: id.toUpperCase(), durationSec: minutes * 60 },
  entrainment: { ramp: "linear", scenes: [{ atSec: 0, beatHz: 10 }, { atSec: minutes * 60, beatHz: 3 }] },
  audio: { binaural: { carrierHz: 200 }, beds: bed ? [{ source: "noise", type: "pink", level: 0.2 }] : [] } });
const T = (n: number) => ({ id: n.toString(16).padStart(32, "0"), file: "/the/piece.m4a", carrier: 220 });
const settle = (r: Renders) => new Promise((ok) => setTimeout(ok, 30)).then(() => r);

describe("REVERIE's renders", () => {
  it("asks ffmpeg for both ears, every stage, the bed and a fade", () => {
    const a = renderArgs(drift("x", 10), 220), graph = a[a.indexOf("-filter_complex") + 1];
    expect(renderSeconds(drift("x", 10))).toBe(600);
    expect(a.filter((x) => x.startsWith("sine=")).length % 2).toBe(0);
    expect(a.some((x) => x.startsWith("anoisesrc=color=pink"))).toBe(true);
    expect(graph).toMatch(/join=inputs=2:channel_layout=stereo/);
    expect(graph).toMatch(/afade=t=out:st=540:d=60/);
    expect(renderArgs(drift("y", 10, false), 220)[renderArgs(drift("y", 10, false), 220).indexOf("-filter_complex") + 1]).toMatch(/amix=inputs=2/);
  });
  it("makes one once, says when it failed, and lets the oldest unplayed go past the limit", async () => {
    const dir = mkdtempSync(join(tmpdir(), "renders-")), made: string[] = [];
    const fake = async (_a: string[], _i: Record<string, string>, out: Record<string, string>) => { made.push(out.mp3); writeFileSync(out.mp3, Buffer.alloc(400)); };
    const r = new Renders(dir, 1000, fake as never);
    const a = r.ask(drift("a"), T(1));
    expect(r.ask(drift("a"), T(1))).toBe(a);                          // asked again while making: the same one
    await settle(r);
    expect(r.byId(a.id)?.state).toBe("ready");
    r.ask(drift("b"), T(2)); await settle(r);
    expect(r.file(a.id)).toBeTruthy();                                // a is played now, so b is the oldest unplayed
    r.ask(drift("c"), T(3)); await settle(r);                          // 1200 bytes > 1000: one goes
    expect(r.list().map((x) => x.drift).sort()).toEqual(["a", "c"]);
    expect(made.length).toBe(3);
    const broken = new Renders(mkdtempSync(join(tmpdir(), "renders-")), 1000, (async () => { throw new Error("ffmpeg said no"); }) as never);
    const f = broken.ask(drift("d"), T(4)); await settle(broken);
    expect(broken.byId(f.id)).toMatchObject({ state: "failed", error: "ffmpeg said no" });
  });
});
