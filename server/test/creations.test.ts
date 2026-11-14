// C-358: creations in one shape, and the sleep piece's exports' arithmetic
import { describe, expect, it } from "vitest";
import { beatsSaid, gallery, paintingCreation, sleepCreation, uidOf } from "../src/creations.js";
import { beatsBy, beatsExpr, carrierOf, driftScenes, imedxId, SESSION_S } from "../src/sleepexport.js";

const track = { id: "a".repeat(32), species: 7, nickname: "SEEKMUSAI", caption: "soft rain", bpm: 60, keyscale: "F major",
                said: "Made for SEEKMUSAI as tonight finds them: at peace.", state: "ready" as const, asked: "2026-11-11T23:00:00Z",
                made: "2026-11-11T23:03:00Z", bytes: { phone: 1200000 } };

describe("creations", () => {
  it("shows a sleep piece as a creation, its cover once painted", () => {
    const c = sleepCreation(track, "HOME", beatsSaid([10, 6, 2]), 175);
    expect(c.uid).toBe(`sleep:${track.id}@HOME`);
    expect(c.cover).toBeNull();
    expect(c.files["export.imedx"]).toBe(`/api/sleep/track/${track.id}/export.imedx`);
    expect(c.meta).toMatchObject({ keyscale: "F major", beats: "10 → 6 → 2 Hz", carrierHz: 175 });
    const painted = sleepCreation({ ...track, cover: "ready", title: "RAIN FALLING UP", by: "Chris's iPhone" }, "HOME", "", 175);
    expect(painted).toMatchObject({ title: "RAIN FALLING UP", by: "Chris's iPhone", cover: `/api/sleep/track/${track.id}/cover.png` });
  });
  it("keeps a making piece's files back", () => {
    expect(sleepCreation({ ...track, state: "making" }, "HOME", "", 175).files).toEqual({});
  });
  it("shows a painting, and filters ONLY WHAT I DON'T HAVE", () => {
    const p = paintingCreation({ id: "b".repeat(16), at: "2026-11-12T10:00:00Z", species: 3, nickname: "OVERLOADED", title: "THE QUIET BURDEN",
                                 about: "", request: "growth", state: "done" }, "HOME");
    const s = sleepCreation(track, "HOME", "", 175);
    expect(gallery([s, p]).map((c) => c.kind)).toEqual(["painting", "sleep"]);
    expect(gallery([s, p], { kind: "sleep" })).toHaveLength(1);
    expect(gallery([s, p], { have: new Set([s.uid]), missingOnly: true }).map((c) => c.uid)).toEqual([p.uid]);
    expect(uidOf("painting", p.id, "HOME")).toBe(p.uid);
  });
});

describe("the exports' arithmetic", () => {
  it("takes the carrier from the piece's key, as the app does", () => {
    expect(carrierOf("F major")).toBe(175);
    expect(carrierOf("C minor")).toBe(131);
  });
  it("counts the beats through the stages, and says it the same way to ffmpeg", () => {
    expect(beatsBy(0)).toBe(0);
    expect(beatsBy(600)).toBe(6000);
    expect(beatsBy(1200)).toBe(9600);
    expect(beatsBy(1800)).toBe(10800);
    const expr = beatsExpr();
    for (const t of [0, 1, 599.5, 600, 900, 1200, 1500, 1800]) {
      // eslint-disable-next-line no-new-func
      const f = new Function("t", "lt", "ifz", `return ${expr.replace(/if\(/g, "ifz(")};`);
      expect(f(t, (a: number, b: number) => (a < b ? 1 : 0), (c: number, a: number, b: number) => (c ? a : b))).toBeCloseTo(beatsBy(t), 6);
    }
  });
  it("gives PulseEntrain each stage held, a scene a second before the next", () => {
    const s = driftScenes(175);
    expect(s[0]).toEqual({ atSec: 0, beatHz: 10, carrierHz: 175 });
    expect(s.map((x) => x.atSec)).toEqual([0, 599, 600, 1199, 1200, SESSION_S]);
    expect(s.map((x) => x.beatHz)).toEqual([10, 10, 6, 6, 2, 2]);
    expect(imedxId("ab12")).toMatch(/^[a-z0-9_]+$/);
  });
});
