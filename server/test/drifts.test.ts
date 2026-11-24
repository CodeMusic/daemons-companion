// C-506: REVERIE's drifts -- every file in the library becomes stages the phone can loop without a seam, THE LONG FALL is
// DRIFT DOWN as it always was, and a drift chosen is kept
import { describe, expect, it } from "vitest";
import { driftOf, LONG_FALL, longFallFile, stagesOfFile, stageAt } from "../src/psyche/drift.js";
import { chooseDrift, chosenDrift, driftFile, driftList } from "../src/machine/drifts.js";

const settings = new Map<string, string | null>();
const store = { getSetting: (k: string) => settings.get(k) ?? null, setSetting: (k: string, v: string | null) => { settings.set(k, v); } } as never;
const whole = (hz: number) => Number.isInteger(hz * 4);       // a four-second loop holds whole cycles

describe("drifts", () => {
  it("lists THE LONG FALL first, then the library", () => {
    const all = driftList();
    expect(all[0].id).toBe(LONG_FALL);
    expect(all.length).toBeGreaterThan(90);
    expect(new Set(all.map((d) => d.kind))).toEqual(new Set(["sleep", "meditation", "tinctures"]));
  });
  it("turns every drift into stages on whole quarter-hertz, in time order", () => {
    for (const d of driftList()) {
      const f = driftFile(d.id);
      expect(f, d.id).not.toBeNull();
      const st = stagesOfFile(f!, 220);
      expect(st.length, d.id).toBeGreaterThan(0);
      for (let i = 0; i < st.length; i++) {
        expect(whole(st[i].beat) && whole(st[i].carrier!), `${d.id} @${st[i].at}`).toBe(true);
        if (i) expect(st[i].at).toBeGreaterThan(st[i - 1].at);
      }
    }
  });
  it("ramps between scenes and holds past the last", () => {
    const st = stagesOfFile({ id: "t", kind: "sleep", meta: {}, entrainment: { scenes: [{ atSec: 0, beatHz: 10 }, { atSec: 60, beatHz: 4 }] },
                               audio: { binaural: { carrierHz: 200 }, beds: [{ source: "noise", type: "pink", level: 0.2 }] } }, 220, 15);
    expect(st.map((s) => s.beat)).toEqual([10, 8.5, 7, 5.5, 4]);
    expect(st.every((s) => s.carrier === 200 && s.bed?.type === "pink")).toBe(true);
    expect(stageAt(9999, st).beat).toBe(4);
  });
  it("THE LONG FALL is DRIFT DOWN: the day's three beats, stepped", () => {
    const day = new Date(2026, 10, 24), st = stagesOfFile(longFallFile(day), 220);
    expect(st.map((s) => [s.at, s.beat])).toEqual(driftOf(day).map((s) => [s.at, s.beat]));
  });
  it("keeps the drift chosen, and falls back to THE LONG FALL", () => {
    expect(chosenDrift(store)).toBe(LONG_FALL);
    const other = driftList()[5].id;
    expect(chooseDrift(store, other)).toBe(true);
    expect(chosenDrift(store)).toBe(other);
    expect(chooseDrift(store, "no-such-drift")).toBe(false);
    expect(driftFile("../../etc/passwd")).toBeNull();
  });
});
