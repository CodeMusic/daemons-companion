// C-554: what a mind says becomes a drift only inside safe bounds; a reverie's music keeps its own key
import { describe, expect, it } from "vitest";
import { driftFromMind, reverieAsk } from "../src/psyche/reverie.js";
import { reverieRecipe, sleepRecipe } from "../src/psyche/sleepsound.js";

const o = { kind: "meditation" as const, side: "you" as const, id: "made-test" };
describe("REVERIE's MAKE", () => {
  it("keeps a good answer, stretched onto its own length", () => {
    const d = driftFromMind('Here: {"name":"slow tide","line":"A long breath out.","minutes":20,"carrierHz":220,' +
                            '"scenes":[{"atSec":0,"beatHz":10},{"atSec":5,"beatHz":7},{"atSec":10,"beatHz":6}]}', o)!;
    expect(d.meta.name).toBe("SLOW TIDE");
    expect(d.entrainment.scenes).toEqual([{ atSec: 0, beatHz: 10 }, { atSec: 600, beatHz: 7 }, { atSec: 1200, beatHz: 6 }]);
    expect(d.audio?.binaural?.carrierHz).toBe(220);
    expect(d.machine).toBeUndefined();
  });
  it("holds what is out of bounds, and refuses what is not a drift", () => {
    const d = driftFromMind('{"name":"X","minutes":300,"carrierHz":9000,"scenes":[{"atSec":0,"beatHz":200},{"atSec":1,"beatHz":-3}]}', o)!;
    expect(d.meta.durationSec).toBe(45 * 60);
    expect(d.audio?.binaural?.carrierHz).toBe(500);
    expect(d.entrainment.scenes.map((s) => s.beatHz)).toEqual([45, 0.5]);
    expect(driftFromMind("no json here", o)).toBeNull();
    expect(driftFromMind('{"scenes":[{"atSec":0,"beatHz":4}]}', o)).toBeNull();
  });
  it("never keeps a cure or a drug in its words", () => {
    const d = driftFromMind('{"name":"THE CURE","line":"A dose to treat worry.","scenes":[{"atSec":0,"beatHz":8},{"atSec":9,"beatHz":4}]}', o)!;
    expect(d.meta.name).toBe("A NEW REVERIE");
    expect(d.meta.description).toBe("");
  });
  it("a daemon's sounds like a machine", () => {
    const d = driftFromMind('{"name":"BOOT","scenes":[{"atSec":0,"beatHz":8},{"atSec":9,"beatHz":4}]}', { ...o, side: "daemon" })!;
    expect(d.machine?.wave).toBe("square");
    expect(d.audio?.isochronic?.voice).toBe("glitch");
    expect(d.meta.name).toBe("BOOT");
  });
  it("asks in the daemon's voice, and its music keeps its own key", () => {
    expect(reverieAsk({ kind: "nature", side: "daemon", sound: "rain on a tin roof", nickname: "EMERGENCE" })).toMatch(/EMERGENCE.*NATURE.*machine.*tin roof/s);
    const c = { species: 148, nickname: "EMERGENCE", types: ["SIGNAL"] };
    const r = reverieRecipe(c, { kind: "nature", side: "daemon", style: "lo-fi <b>synth</b>" });
    expect(r.key).not.toBe(sleepRecipe(c).key);
    expect(r.caption).toMatch(/^lo-fi b synth b, /);
    expect(r.caption).toMatch(/field recording.*circuit hum/);
  });
});
