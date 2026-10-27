// C-180 (HUB.md Phase 5 item 5): a WAV as the boards play it -- 16 kHz, 16-bit, mono -- in plain TypeScript, so the
// module's voice reaches a board without ffmpeg (5.5 s a call on the hub, the slowest thing there). Reads PCM 8/16/24/32
// bit and 32-bit float, any channels (mixed down) and any rate (linear resampling: speech, not music). null for anything
// else, and the caller falls back to ffmpeg. No node: imports.
export function devicePcmOf(wav: Uint8Array, rate = 16000): Uint8Array | null {
  const v = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  const tag = (at: number) => String.fromCharCode(wav[at], wav[at + 1], wav[at + 2], wav[at + 3]);
  if (wav.length < 12 || tag(0) !== "RIFF" || tag(8) !== "WAVE") return null;
  let fmt: { format: number; channels: number; rate: number; bits: number } | null = null, data: Uint8Array | null = null;
  for (let at = 12; at + 8 <= wav.length; ) {
    const id = tag(at), len = v.getUint32(at + 4, true);
    if (id === "fmt " && len >= 16) {
      let format = v.getUint16(at + 8, true);
      if (format === 0xfffe && len >= 26) format = v.getUint16(at + 32, true);   // WAVE_FORMAT_EXTENSIBLE: its sub-format
      fmt = { format, channels: v.getUint16(at + 10, true), rate: v.getUint32(at + 12, true), bits: v.getUint16(at + 22, true) };
    } else if (id === "data") { data = wav.subarray(at + 8, Math.min(wav.length, at + 8 + len)); break; }
    at += 8 + len + (len & 1);
  }
  if (!fmt || !data || !fmt.channels || !fmt.rate) return null;
  const { format, channels, bits } = fmt, step = bits / 8, frame = step * channels;
  if (!((format === 1 && [8, 16, 24, 32].includes(bits)) || (format === 3 && bits === 32))) return null;
  const d = new DataView(data.buffer, data.byteOffset, data.byteLength), frames = Math.floor(data.length / frame);
  const sample = (at: number): number => {           // -1..1
    if (format === 3) return d.getFloat32(at, true);
    if (bits === 8) return (d.getUint8(at) - 128) / 128;
    if (bits === 16) return d.getInt16(at, true) / 32768;
    if (bits === 24) return ((d.getUint8(at) | (d.getUint8(at + 1) << 8) | (d.getInt8(at + 2) << 16))) / 8388608;
    return d.getInt32(at, true) / 2147483648;
  };
  const mono = new Float32Array(frames);
  for (let i = 0; i < frames; i++) { let s = 0; for (let c = 0; c < channels; c++) s += sample(i * frame + c * step); mono[i] = s / channels; }
  const n = Math.floor(frames * rate / fmt.rate), out = new Uint8Array(n * 2), o = new DataView(out.buffer);
  for (let i = 0; i < n; i++) {
    const x = i * fmt.rate / rate, j = Math.floor(x), f = x - j;
    const s = (mono[j] ?? 0) * (1 - f) + (mono[j + 1] ?? mono[j] ?? 0) * f;
    o.setInt16(i * 2, Math.max(-32768, Math.min(32767, Math.round(s * 32768))), true);
  }
  return out;
}
