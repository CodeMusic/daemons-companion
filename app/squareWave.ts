// A tune as a WAV file's bytes -- the square wave the boards play (C-114). [semitones from `root` (MIDI), milliseconds];
// 127 is a rest, as in firmware/common/tunes.h. `level` scales it, as the boards' own levels do.
const RATE = 22050;
export function wav(tune: [number, number][], root: number, level = 1): Uint8Array {
  const samples: number[] = [];
  for (const [semis, ms] of tune) {
    if (semis === 127) { for (let i = 0, n = Math.round((RATE * ms) / 1000); i < n; i++) samples.push(0); continue; }
    const f = 440 * 2 ** ((root + semis - 69) / 12), n = Math.round((RATE * ms) / 1000), gap = Math.round(RATE * 0.012);
    for (let i = 0; i < n; i++) {
      const env = Math.min(1, i / 80) * (i < n * 0.8 ? 1 : Math.max(0, (n - i) / (n * 0.2)));
      samples.push(i > n - gap ? 0 : ((i * f) / RATE) % 1 < 0.5 ? 0.22 * level * env : -0.22 * level * env);
    }
  }
  const out = new Uint8Array(44 + samples.length * 2), v = new DataView(out.buffer);
  const text = (at: number, s: string) => [...s].forEach((c, i) => v.setUint8(at + i, c.charCodeAt(0)));
  text(0, "RIFF"); v.setUint32(4, 36 + samples.length * 2, true); text(8, "WAVE"); text(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, RATE, true);
  v.setUint32(28, RATE * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); text(36, "data");
  v.setUint32(40, samples.length * 2, true);
  samples.forEach((s, i) => v.setInt16(44 + i * 2, Math.round(s * 32767), true));
  return out;
}

