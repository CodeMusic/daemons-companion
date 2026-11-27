// C-591, C-592: the PULSETTO's and the NOVA's protocols (carried from PulseEntrain) and ENTRAINMENT, what a drift asks of each
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { batteryPercent, clampLevel, CMD, fromBase64, levelCmd, parseNotification, startSequence, STOP_SEQUENCE, textBytes,
         toBase64, withResponse } from "../src/shared/pulsetto.js";
import { clampHz, eyeInts, frame, HARD_MAX_HZ, OFF, packLE, symmetric } from "../src/shared/nova.js";
import { cueAt, inferStim, lightTarget, LIGHT_DEFAULT, rangeOf, rateOf, STIM_DEFAULT, stimStep, stimTarget, type Cue } from "../src/psyche/entrain.js";
import { Synesthesia } from "../src/psyche/synesthesia.js";
import type { DriftFile } from "../src/psyche/drift.js";

const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, "0")).join(" ");

describe("the PULSETTO's protocol", () => {
  it("never sends a level outside 0..9, whatever it is given", () => {
    expect([clampLevel(12), clampLevel(-3), clampLevel(NaN), clampLevel("4.6"), clampLevel(0, 1)]).toEqual([9, 0, 0, 5, 1]);
    expect(levelCmd(99)).toBe("9\n");
  });
  it("begins as the maker's app does: ramps, 0 -> 5 -> 0, the level (at least 1), both pads, the LED low", () => {
    const sends = startSequence(0).filter((s) => "send" in s).map((s) => (s as { send: string }).send);
    expect(sends).toEqual(["+\n", "-\n", "0\n", "5\n", "0\n", "1\n", "D\n", "E\n"]);
    expect(STOP_SEQUENCE.map((s) => (s as { send: string }).send)).toEqual(["+\n", "-\n", "-\n"]);
    expect([withResponse(CMD.rampUp), withResponse(CMD.rampDown), withResponse("5\n")]).toEqual([true, true, false]);
  });
  it("reads its battery, charging and firmware", () => {
    expect(batteryPercent(3.97)).toBe(100);
    expect(batteryPercent(3.7)).toBe(50);
    expect(parseNotification(textBytes("Batt:3.80"))).toEqual({ battery: 75 });
    expect(parseNotification(Uint8Array.from([0x75, 0x01, 0x31]))).toEqual({ charging: true });
    expect(parseNotification(Uint8Array.from([0x75, 0x01, 0x30]))).toEqual({ charging: false });
    expect(parseNotification(textBytes("fw:1.1.22"))).toEqual({ firmware: "1.1.22" });
  });
  it("carries bytes as base64 both ways, as the Bluetooth library does", () => {
    for (const s of ["", "D\n", "+\n", "Batt:3.97", "ÿ\u0000abc"]) {
      const b = textBytes(s);
      expect(toBase64(b)).toBe(Buffer.from(b).toString("base64"));
      expect([...fromBase64(toBase64(b))]).toEqual([...b]);
    }
  });
});

describe("the NOVA's protocol", () => {
  it("encodes the protocol's golden vector exactly (10 Hz, half lit, full level)", () => {
    expect(hex(symmetric(10, 0.5, 1))).toBe("a0 86 01 00 50 c3 00 00 40 42 0f 00");
  });
  it("is clamped here, since the device enforces nothing: never past 40 Hz or the ceiling, never under half a hertz", () => {
    expect([clampHz(100), clampHz(0), clampHz(NaN), clampHz(30, 12), clampHz(6, 12)]).toEqual([HARD_MAX_HZ, 0.5, 0.5, 12, 6]);
    expect(eyeInts({ hz: 1000, duty: 0.5 })[0]).toBe(25000);          // 40 Hz, not 1000
  });
  it("makes a forty-byte frame, five ints an eye, and a dark one to stop with", () => {
    const f = frame({ hz: 10, duty: 0.5, level: 0 }, { hz: 5, duty: 0.25, level: 0 });
    const b = fromBase64(f.b64);
    expect(b.length).toBe(40);
    expect(hex(b.slice(0, 8))).toBe("a0 86 01 00 50 c3 00 00");
    expect(hex(b.slice(20, 28))).toBe(hex(packLE([200000, 50000])));
    const off = fromBase64(OFF);
    expect([off.length, off[4], off[24], off[16], off[36]]).toEqual([40, 0, 0, 0, 0]);   // nothing lit, no level
  });
});

const file = (scenes: object[], extra: object = {}): DriftFile => ({ id: "t", kind: "sleep", meta: {}, entrainment: { scenes } as DriftFile["entrainment"], ...extra });

describe("ENTRAINMENT: a drift's cues", () => {
  const f = file([
    { atSec: 0, beatHz: 10, intensity: 4, brightness: 0.8 },
    { atSec: 60, beatHz: 6, flash: "left", biphotic: 2 },
    { atSec: 120, beatHz: 2, intensity: "=-" },
  ]);
  it("holds intensity, flash and brightness forward from the scene that set each", () => {
    expect(cueAt(f, 30)).toMatchObject({ intensity: 4, flash: null, brightness: 0.8 });
    expect(cueAt(f, 90)).toMatchObject({ intensity: 4, flash: "left", brightness: 0.8 });
    expect(cueAt(f, 200)).toMatchObject({ intensity: "=-", flash: "left", brightness: 0.8 });
  });
  it("glides biphotic, as the beat glides, and eases it back to 0 where a later scene leaves it out", () => {
    expect(cueAt(f, 0).biphotic).toBe(0);
    expect(cueAt(f, 30).biphotic).toBe(1);
    expect(cueAt(f, 60).biphotic).toBe(2);
    expect(cueAt(f, 90).biphotic).toBe(1);
    expect(cueAt(f, 130).biphotic).toBe(0);
  });
  it("is empty for THE LONG FALL (no file) and for a drift that writes no devices", () => {
    expect(cueAt(null, 10)).toEqual({ intensity: null, flash: null, flashHz: null, brightness: null, biphotic: 0 });
    expect(cueAt(file([{ atSec: 0, beatHz: 3 }]), 5).intensity).toBeNull();
  });
});

describe("ENTRAINMENT: the PULSETTO's level", () => {
  const none: Cue = cueAt(null, 0);
  it("AUTO takes the drift's own, a token against the file's base, and stays inside MIN..MAX", () => {
    const set = { ...STIM_DEFAULT, min: 1, max: 9 };
    expect(stimTarget({ ...none, intensity: 7 }, 6, set)).toEqual({ level: 7, why: "drift" });
    expect(stimTarget({ ...none, intensity: "=+" }, 6, set, 4)).toEqual({ level: 5, why: "drift" });
    expect(stimTarget({ ...none, intensity: "=-" }, 6, set, 4).level).toBe(3);
    expect(stimTarget({ ...none, intensity: 8 }, 6, { ...set, max: 6 }).level).toBe(6);
    expect(stimTarget({ ...none, intensity: 1 }, 6, { ...set, min: 3 }).level).toBe(3);
    expect(stimTarget({ ...none, intensity: 0 }, 6, set)).toEqual({ level: 0, why: "drift" });   // the drift's own pause
  });
  it("AUTO infers from the beat where the drift gives none: slower, gentler", () => {
    expect([1, 5, 10, 20, 40].map(inferStim)).toEqual([2, 3, 4, 5, 6]);
    expect(stimTarget(none, 2, STIM_DEFAULT)).toEqual({ level: 2, why: "beat" });
  });
  it("FIXED holds the player's level, inside the range", () => {
    expect(stimTarget({ ...none, intensity: 8 }, 2, { mode: "fixed", level: 5, min: 1, max: 9 })).toEqual({ level: 5, why: "fixed" });
    expect(stimTarget(none, 2, { mode: "fixed", level: 9, min: 1, max: 6 }).level).toBe(6);
  });
  it("a range written backwards is made sound; the fade eases the level down to MIN", () => {
    expect(rangeOf({ ...STIM_DEFAULT, min: 7, max: 3 })).toEqual([7, 7]);
    expect(stimTarget(none, 40, { ...STIM_DEFAULT, min: 2, max: 9 }, null, 0.5).level).toBe(4);   // 6 halfway to 2
    expect(stimTarget(none, 40, { ...STIM_DEFAULT, min: 2, max: 9 }, null, 0).level).toBe(2);
  });
  it("moves one step at a time", () => {
    expect([stimStep(2, 6), stimStep(6, 2), stimStep(4, 4), stimStep(null, 5), stimStep(3, 0)]).toEqual([3, 5, 4, 5, 0]);
  });
});

describe("ENTRAINMENT: the NOVA's flash", () => {
  const none = cueAt(null, 0);
  it("flashes at the beat, never past the ceiling, both eyes together by default", () => {
    const l = lightTarget(none, 6, LIGHT_DEFAULT);
    expect([l.hz, l.left.hz, l.right.hz, l.pattern]).toEqual([6, 6, 6, "together"]);
    expect(lightTarget(none, 40, LIGHT_DEFAULT).hz).toBe(12);
    expect(lightTarget({ ...none, flashHz: 9 }, 2, LIGHT_DEFAULT).hz).toBe(9);
  });
  it("follows the drift's pattern, or the player's", () => {
    expect(lightTarget({ ...none, flash: "left" }, 6, LIGHT_DEFAULT)).toMatchObject({ pattern: "left", right: { duty: 0 } });
    expect(lightTarget({ ...none, flash: "off" }, 6, LIGHT_DEFAULT).dark).toBe(true);
    const bi = lightTarget({ ...none, biphotic: 2 }, 6, LIGHT_DEFAULT);
    expect([bi.pattern, bi.left.hz, bi.right.hz]).toEqual(["biphotic", 6, 4]);
    const dr = lightTarget({ ...none, flash: "left" }, 10, { ...LIGHT_DEFAULT, pattern: "drifting" });
    expect(dr.left.hz).toBeLessThan(10); expect(dr.right.hz).toBeGreaterThan(10);
  });
  it("is dimmed by shorter flashes, and goes dark as the night fades out", () => {
    expect(lightTarget(none, 6, { ...LIGHT_DEFAULT, brightness: 1 }).left.duty).toBe(0.5);
    expect(lightTarget(none, 6, { ...LIGHT_DEFAULT, brightness: 1 }, 0.5).left.duty).toBe(0.29);
    expect(lightTarget(none, 6, LIGHT_DEFAULT, null, 0).dark).toBe(true);
  });
});

describe("the library, read for devices", () => {
  it("every drift's cues read without a throw, and every level it would ask for is inside the range", () => {
    const dir = new URL("../data/drifts/", import.meta.url);
    for (const n of readdirSync(dir).filter((x) => x.endsWith(".json") && x !== "index.json" && x !== "phone.json")) {
      const d = JSON.parse(readFileSync(new URL(n, dir), "utf8")) as DriftFile;
      for (const s of (d.entrainment.scenes ?? []).map((x) => x.atSec)) {
        const c = cueAt(d, s), t = stimTarget(c, 6, STIM_DEFAULT, d.pulsetto?.intensity);
        expect(t.level === 0 || (t.level >= 1 && t.level <= 6)).toBe(true);
        expect(lightTarget(c, 6, LIGHT_DEFAULT, d.nova?.brightness).hz).toBeLessThanOrEqual(12);
      }
    }
  });
});

describe("SYNESTHESIA, felt: a note's rate", () => {
  it("runs from red's 4 Hz to violet's 12 across each wheel", () => {
    expect([1, 2, 3, 4, 5, 6, 7].map((d) => rateOf(Synesthesia.day(d)))).toEqual([4, 5, 7, 8, 9, 11, 12]);
    expect(rateOf(Synesthesia.month(1))).toBe(4);
    expect(rateOf(Synesthesia.month(12))).toBe(12);
  });
});
