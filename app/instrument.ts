// T-425 (the user, 2026-10-18: "we should also have these same tunes on the devices (and tab5 and phone) -- so everything
// feels in sync"): a tune on the game's own instrument rather than the boards' square wave -- DAEMONS' own harp for a
// CONTENT save and flute for a CONTEXT one (synthesized for the project, nothing of Nintendo's; server/data/sounds/,
// instruments.json saying how each is pitched and shaped). Each note is the sample played faster or slower to its pitch,
// looped between loop_start and loop_end while it is held, under its envelope -- the attack, the decay to the sustain,
// and the release after the note, which rings on under the next.
import { pcmWav } from "./squareWave";

export interface Instrument {
  sample_rate: number; root_midi: number; loop_start: number; loop_end: number;
  attack_ms: number; decay_ms: number; sustain: number; release_ms: number;
}
const RATE = 22050;

// One note's samples: `midi` held for `ms`, then released
function note(pcm: Int16Array, ins: Instrument, midi: number, ms: number): Float32Array {
  const held = Math.round((RATE * ms) / 1000), rel = Math.round((RATE * ins.release_ms) / 1000);
  const att = Math.max(1, Math.round((RATE * ins.attack_ms) / 1000)), dec = Math.max(1, Math.round((RATE * ins.decay_ms) / 1000));
  const step = 2 ** ((midi - ins.root_midi) / 12) * (ins.sample_rate / RATE);
  const loops = ins.loop_end > ins.loop_start + 1 && ins.loop_end <= pcm.length;
  const out = new Float32Array(held + rel);
  let pos = 0, level = 0;
  for (let i = 0; i < out.length; i++) {
    if (pos >= (loops ? ins.loop_end : pcm.length - 1)) { if (!loops) break; pos -= ins.loop_end - ins.loop_start; }
    const k = Math.floor(pos), f = pos - k, a = pcm[k] / 32768, b = pcm[Math.min(k + 1, pcm.length - 1)] / 32768;
    if (i < held) level = i < att ? i / att : i < att + dec ? 1 - (1 - ins.sustain) * ((i - att) / dec) : ins.sustain;
    const env = i < held ? level : level * (1 - (i - held) / Math.max(1, rel));
    out[i] = (a + (b - a) * f) * env;
    pos += step;
  }
  return out;
}

// A tune ([semitones over `root`, ms], 127 a rest -- firmware/common/tunes.h) on the instrument, as a WAV file's bytes
export function sampledWav(tune: [number, number][], root: number, pcm: Int16Array, ins: Instrument, level = 1): Uint8Array {
  const starts: number[] = [];
  let t = 0;
  for (const [, ms] of tune) { starts.push(t); t += Math.round((RATE * ms) / 1000); }
  const mix = new Float32Array(t + Math.round((RATE * ins.release_ms) / 1000));
  tune.forEach(([semis, ms], n) => {
    if (semis === 127) return;
    const s = note(pcm, ins, root + semis, ms);
    for (let i = 0; i < s.length && starts[n] + i < mix.length; i++) mix[starts[n] + i] += s[i];
  });
  let peak = 0;
  for (let i = 0; i < mix.length; i++) peak = Math.max(peak, Math.abs(mix[i]));
  const k = peak > 0 ? (0.7 * level) / Math.max(peak, 0.7) : 0;   // never louder than the sample, never clipped
  for (let i = 0; i < mix.length; i++) mix[i] *= k;
  return pcmWav(mix, RATE);
}

// The samples of a mono 16-bit WAV file (its "data" chunk)
export function wavPcm(bytes: Uint8Array): Int16Array {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 12;
  while (at + 8 <= bytes.length) {
    const id = String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]), len = v.getUint32(at + 4, true);
    if (id === "data") { const n = len >> 1, out = new Int16Array(n); for (let i = 0; i < n; i++) out[i] = v.getInt16(at + 8 + i * 2, true); return out; }
    at += 8 + len + (len & 1);
  }
  return new Int16Array(0);
}
