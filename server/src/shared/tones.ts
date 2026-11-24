// C-290: this file runs on the phone too (C-111) -- the app imports it, directly or through another file -- so keep it free of Node-only APIs (node:*, fs).
// C-553 (the user, 2026-11-24): the tones a reverie is made of, as WAV bytes the phone loops -- each loop holding whole
// cycles of everything in it, so it repeats without a seam.
//
//   ISOCHRONIC  a tone switched on and off at the beat's own rate: heard on a speaker as well as in headphones, and at the
//               exact rate (the binaural loop rounds to a quarter hertz): EARTH'S HUM's 7.83 Hz, THE BRIGHT CLIMB's 40.
//               ("on top of this binaural beat we could layer isochronic actual beat"). A daemon's is GLITCH: bursts of
//               noise at the rate instead of a tone ("isochronic tones are glitch noises at a rate").
//   MACHINE     a daemon's binaural pair: square waves instead of sines ("more square waves with modulations and
//               glitching"), the beat, the carrier or both WAVERING by a set amount over a set period ("you choose the
//               delta ... up to a max of what your current beat is"), and GLITCHES -- short drops and crushed blips -- at a
//               rate. The waver is a sine about the set value, so over its period it adds no cycles and the loop still
//               closes; the loop is the period, a whole number of four seconds.
//
// Every number DRAFT; the sound is the user's to judge.
export const RATE = 22050;

/** 16-bit PCM WAV from one channel (mono) or two (stereo), each sample -1..1. */
export function wav(channels: Float32Array[]): Uint8Array {
  const n = channels[0].length, ch = channels.length, out = new Uint8Array(44 + n * 2 * ch), v = new DataView(out.buffer);
  const text = (at: number, s: string) => [...s].forEach((c, i) => v.setUint8(at + i, c.charCodeAt(0)));
  text(0, "RIFF"); v.setUint32(4, 36 + n * 2 * ch, true); text(8, "WAVE"); text(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true); v.setUint32(24, RATE, true);
  v.setUint32(28, RATE * 2 * ch, true); v.setUint16(32, 2 * ch, true); v.setUint16(34, 16, true); text(36, "data");
  v.setUint32(40, n * 2 * ch, true);
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++)
    v.setInt16(44 + (i * ch + c) * 2, Math.round(32767 * Math.max(-1, Math.min(1, channels[c][i]))), true);
  return out;
}

/** The loop (whole seconds, 1..12) in which every rate makes the most nearly whole number of cycles, and each rate as it
 *  is then played: n / loop, never more than a few thousandths of a hertz off. */
export function loopFor(rates: number[], most = 12): { seconds: number; rates: number[] } {
  let best = { seconds: 4, err: Infinity };
  for (let s = 1; s <= most; s++) {
    const err = Math.max(...rates.map((r) => Math.abs(r * s - Math.round(r * s))));
    if (err < best.err - 1e-9) best = { seconds: s, err };
  }
  return { seconds: best.seconds, rates: rates.map((r) => Math.max(1, Math.round(r * best.seconds)) / best.seconds) };
}

// a seeded noise, so the same glitch is the same file
function noise(seed: number) {
  let s = seed >>> 0 || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 31 - 1; };
}
// on for half of each pulse, with soft shoulders (a quarter of the on time) so it never clicks
const gate = (phase: number) => {
  const p = phase - Math.floor(phase);
  if (p >= 0.5) return 0;
  const edge = 0.125, x = p < edge ? p / edge : p > 0.5 - edge ? (0.5 - p) / edge : 1;
  return 0.5 - 0.5 * Math.cos(Math.PI * x);
};

export type Voice = "tone" | "glitch";
/** An isochronic loop, mono: a tone (or, for a daemon, noise) pulsed at `rate`. */
export function isochronicWav(tone: number, rate: number, voice: Voice = "tone", level = 0.5): Uint8Array {
  const { seconds, rates: [r, t] } = loopFor([rate, tone]);
  const n = RATE * seconds, x = new Float32Array(n), rnd = noise(Math.round(rate * 1000));
  for (let i = 0; i < n; i++) {
    const s = i / RATE, g = gate(r * s);
    x[i] = level * g * (voice === "glitch" ? rnd() * 0.8 : Math.sin(2 * Math.PI * t * s));
  }
  return wav([x]);
}

export type Waver = { what: "beat" | "carrier" | "both"; deltaHz: number; periodSec: number };
export type Machine = { wave?: "square" | "sine"; glitch?: { perSec: number; level?: number }; waver?: Waver | null };
// a square wave from its odd harmonics up to the ninth (soft enough not to alias, hard enough to sound like a machine)
const square = (ph: number) => {
  let y = 0;
  for (let k = 1; k <= 9; k += 2) y += Math.sin(2 * Math.PI * k * ph) / k;
  return y * (4 / Math.PI) * 0.5;
};

/** A daemon's binaural loop, stereo: left at the carrier, right at carrier + beat -- square, wavering, glitching. */
export function machineWav(carrier: number, beat: number, m: Machine = {}, level = 0.5): Uint8Array {
  const w = m.waver && m.waver.deltaHz > 0 ? { ...m.waver, deltaHz: Math.min(m.waver.deltaHz, beat) } : null;
  // the loop is the waver's period, rounded up to whole four seconds (quarter-hertz carriers then close)
  const seconds = w ? Math.max(4, Math.ceil(w.periodSec / 4) * 4) : 4, n = RATE * seconds;
  const L = new Float32Array(n), R = new Float32Array(n), rnd = noise(Math.round(carrier * 100 + beat * 10));
  const wave = m.wave === "sine" ? (ph: number) => Math.sin(2 * Math.PI * ph) : square;
  // a waver's extra cycles by time s: the integral of delta * sin(2 pi s / P), which is back to nothing at s = P
  const extra = (s: number) => (w ? (w.deltaHz * seconds / (2 * Math.PI)) * (1 - Math.cos((2 * Math.PI * s) / seconds)) : 0);
  const onCarrier = w && (w.what === "carrier" || w.what === "both") ? 1 : 0;
  const onBeat = w && (w.what === "beat" || w.what === "both") ? 1 : 0;
  // glitches: at their rate, each 20-60 ms, a drop to silence or a crushed blip, placed the same every loop
  const glitches: [number, number, boolean][] = [];
  const g = m.glitch?.perSec ?? 0;
  for (let k = 0; k < Math.round(g * seconds); k++) {
    const at = Math.floor(((k + 0.5 + 0.4 * rnd()) / Math.max(1, Math.round(g * seconds))) * n);
    glitches.push([at, Math.floor(RATE * (0.02 + 0.04 * Math.abs(rnd()))), rnd() > 0]);
  }
  const gl = m.glitch?.level ?? 0.6;
  for (let i = 0; i < n; i++) {
    const s = i / RATE, e = extra(s);
    L[i] = level * wave(carrier * s + onCarrier * e);
    R[i] = level * wave((carrier + beat) * s + onCarrier * e + onBeat * e);
  }
  for (const [at, len, drop] of glitches) for (let i = at; i < Math.min(n, at + len); i++) {
    if (drop) { L[i] *= 1 - gl; R[i] *= 1 - gl; }
    else { const q = 4; L[i] = Math.round(L[i] * q) / q; R[i] = Math.round(R[i] * q) / q; }   // crushed to a few steps
  }
  return wav([L, R]);
}
