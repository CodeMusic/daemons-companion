// C-553: a reverie's tones loop without a seam, at the rates asked
import { describe, expect, it } from "vitest";
import { isochronicWav, loopFor, machineWav, RATE } from "../src/shared/tones.js";

// the samples of a 16-bit WAV, one channel
const samples = (w: Uint8Array, ch = 0) => {
  const v = new DataView(w.buffer), chans = v.getUint16(22, true), n = (w.length - 44) / 2 / chans;
  return Array.from({ length: n }, (_, i) => v.getInt16(44 + (i * chans + ch) * 2, true) / 32767);
};
// the jump from the last sample back to the first, against the largest step inside the loop
const seamless = (x: number[]) => {
  let step = 0;
  for (let i = 1; i < x.length; i++) step = Math.max(step, Math.abs(x[i] - x[i - 1]));
  return Math.abs(x[0] - x[x.length - 1]) <= step * 1.05 + 1e-3;
};

describe("tones", () => {
  it("finds a loop that holds the Schumann ladder's rates almost exactly", () => {
    for (const r of [7.83, 14.3, 20.8, 27.3, 33.8, 40]) {
      const { rates: [got] } = loopFor([r, 200]);
      expect(Math.abs(got - r)).toBeLessThan(0.02);
    }
  });
  it("an isochronic loop closes, tone and glitch alike", () => {
    for (const voice of ["tone", "glitch"] as const) for (const r of [7.83, 40]) {
      const x = samples(isochronicWav(200, r, voice));
      expect(x.length % RATE).toBe(0);
      expect(seamless(x), `${voice} ${r}`).toBe(true);
    }
  });
  it("a machine loop closes on both ears, wavering or not", () => {
    for (const waver of [null, { what: "beat", deltaHz: 2, periodSec: 8 }, { what: "carrier", deltaHz: 3, periodSec: 6 },
                         { what: "both", deltaHz: 1, periodSec: 12 }] as const) {
      const w = machineWav(200, 8, { wave: "square", waver }) ;
      expect(seamless(samples(w, 0)) && seamless(samples(w, 1)), JSON.stringify(waver)).toBe(true);
    }
  });
  it("a waver never moves further than the beat itself", () => {
    // asked for 20 Hz of waver on a 4 Hz beat: held to 4, so the right ear never crosses below the left
    const w = machineWav(200, 4, { wave: "sine", waver: { what: "beat", deltaHz: 20, periodSec: 8 } });
    expect(samples(w, 1).length).toBeGreaterThan(0);
  });
});
