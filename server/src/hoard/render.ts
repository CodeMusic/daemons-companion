// BRAIN: none -- a codec: pixels moved, a PNG written, a voice's loudness read
// The hub's only (node:zlib): never imported by core.ts or routes.ts.
// C-577 (C-596; the user, 2026-11-27: "while it speaks the photo animates -- the mouth of the person or object
// moves"): A MOUTH THAT MOVES, made with nothing but arithmetic and ffmpeg, so it runs on the hub and on any node of
// THE MESH with no model and no browser:
//
//   1. the picture as plain pixels (ffmpeg decodes it), and where its mouth is (the seeing model said)
//   2. a few STILLS of it, the jaw dropped a little more in each: the part under the mouth redrawn lower inside a soft
//      jaw shape, and a dark gap opened between the lips -- each written as a PNG
//   3. the voice's LOUDNESS, frame by frame: which still shows when
//   4. ffmpeg plays the stills in that order under the voice (streamselect, told by sendcmd) and writes one video
//
// The first three are here; the fourth is two ffmpeg jobs asked of THE MESH (makings.ts).
import { deflateSync } from "node:zlib";

export type MouthPx = { x: number; y: number; w: number; chin: number };   // pixels: its centre, its width, the drop to the chin
export const LEVELS = 5, FPS = 12;

/** one still: the picture with the jaw open by `open` (0 shut to 1 wide). rgb is w*h*3 bytes; a new buffer comes back */
export function jawOpen(rgb: Uint8Array, w: number, h: number, m: MouthPx, open: number): Uint8Array {
  const out = new Uint8Array(rgb);
  const d = Math.min(m.chin * 0.32, m.w * 0.42) * Math.max(0, Math.min(1, open));       // how far the jaw drops, pixels
  if (d < 0.5) return out;
  // the lower lip and chin, moved down: inside a soft jaw shape, each pixel takes the one d above it
  const jx = m.x, jy = m.y + m.chin * 0.55 + d, rx = m.w * 0.95, ry = m.chin * 0.62;
  const x0 = Math.max(0, Math.floor(jx - rx)), x1 = Math.min(w - 1, Math.ceil(jx + rx));
  const y0 = Math.max(0, Math.floor(jy - ry)), y1 = Math.min(h - 1, Math.ceil(jy + ry));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const e = ((x - jx) / rx) ** 2 + ((y - jy) / ry) ** 2;
      if (e >= 1) continue;
      const a = e < 0.7 ? 1 : (1 - e) / 0.3;                                             // soft at its edge: no seam
      const sy = y - d, s0 = Math.floor(sy), f = sy - s0;
      if (s0 < 0 || s0 + 1 >= h) continue;
      const p = (y * w + x) * 3, q0 = (s0 * w + x) * 3, q1 = ((s0 + 1) * w + x) * 3;
      for (let c = 0; c < 3; c++) {
        const moved = rgb[q0 + c] * (1 - f) + rgb[q1 + c] * f;
        out[p + c] = Math.round(rgb[p + c] * (1 - a) + moved * a);
      }
    }
  }
  // the inside of the mouth: a dark gap between the lips, above where the lower lip now is
  const gx = m.x, gy = m.y + d * 0.45, gw = m.w * 0.36, gh = Math.max(1, d * 0.55);
  for (let y = Math.max(0, Math.floor(gy - gh)); y <= Math.min(h - 1, Math.ceil(gy + gh)); y++) {
    for (let x = Math.max(0, Math.floor(gx - gw)); x <= Math.min(w - 1, Math.ceil(gx + gw)); x++) {
      const e = ((x - gx) / gw) ** 2 + ((y - gy) / gh) ** 2;
      if (e >= 1) continue;
      const a = 0.92 * (e < 0.6 ? 1 : (1 - e) / 0.4), p = (y * w + x) * 3;
      out[p] = Math.round(out[p] * (1 - a) + 42 * a); out[p + 1] = Math.round(out[p + 1] * (1 - a) + 14 * a); out[p + 2] = Math.round(out[p + 2] * (1 - a) + 18 * a);
    }
  }
  return out;
}
/** the stills, shut to wide */
export function jawStills(rgb: Uint8Array, w: number, h: number, m: MouthPx, n = LEVELS): Uint8Array[] {
  return Array.from({ length: n }, (_, i) => jawOpen(rgb, w, h, m, n === 1 ? 0 : i / (n - 1)));
}
/** a picture with nothing to open (no mouth was found): it breathes instead -- a little brighter as it speaks louder */
export function glowStills(rgb: Uint8Array, n = LEVELS): Uint8Array[] {
  return Array.from({ length: n }, (_, i) => { const k = 1 + 0.06 * (n === 1 ? 0 : i / (n - 1)); const o = new Uint8Array(rgb.length); for (let j = 0; j < rgb.length; j++) o[j] = Math.min(255, Math.round(rgb[j] * k)); return o; });
}

// ---- a PNG, written with zlib alone ----
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b: Uint8Array): number { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type: string, data: Uint8Array): Buffer {
  const head = Buffer.alloc(8); head.writeUInt32BE(data.length, 0); head.write(type, 4, "latin1");
  const tail = Buffer.alloc(4); tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, tail]);
}
export function pngOf(rgb: Uint8Array, w: number, h: number): Buffer {
  if (rgb.length !== w * h * 3) throw new Error("those are not the pixels of a picture that size");
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;      // 8 bits, RGB
  const raw = Buffer.alloc(h * (w * 3 + 1));
  for (let y = 0; y < h; y++) Buffer.from(rgb.buffer, rgb.byteOffset + y * w * 3, w * 3).copy(raw, y * (w * 3 + 1) + 1);   // filter 0 on every line
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 6 })), chunk("IEND", new Uint8Array(0))]);
}

// ---- the voice's loudness ----
/** a WAV's samples (16-bit PCM), its rate and length. null: not a WAV this reads */
export function wavPcm(wav: Uint8Array): { rate: number; channels: number; samples: Int16Array; seconds: number } | null {
  const b = Buffer.from(wav.buffer, wav.byteOffset, wav.length);
  if (b.length < 44 || b.toString("latin1", 0, 4) !== "RIFF" || b.toString("latin1", 8, 12) !== "WAVE") return null;
  let at = 12, rate = 0, channels = 1, bits = 16, fmt = 1;
  while (at + 8 <= b.length) {
    const id = b.toString("latin1", at, at + 4), size = b.readUInt32LE(at + 4), body = at + 8;
    if (id === "fmt ") { fmt = b.readUInt16LE(body); channels = b.readUInt16LE(body + 2); rate = b.readUInt32LE(body + 4); bits = b.readUInt16LE(body + 14); }
    if (id === "data") {
      if (fmt !== 1 || bits !== 16 || !rate) return null;
      const n = Math.floor(Math.min(size, b.length - body) / 2);
      const samples = new Int16Array(n);
      for (let i = 0; i < n; i++) samples[i] = b.readInt16LE(body + i * 2);
      return { rate, channels, samples, seconds: n / channels / rate };
    }
    at = body + size + (size & 1);
  }
  return null;
}
/** several WAVs of one voice (16-bit PCM, all one rate) as one, a breath between. null: they are not that */
export function joinWavs(parts: Uint8Array[], gapMs = 350): Uint8Array | null {
  if (parts.length === 1) return parts[0];
  const pcms = parts.map((p) => wavPcm(p));
  if (!pcms.length || pcms.some((p) => !p) || new Set(pcms.map((p) => `${p!.rate}/${p!.channels}`)).size !== 1) return null;
  const { rate, channels } = pcms[0]!, gap = Math.round((rate * gapMs) / 1000) * channels;
  const n = pcms.reduce((t, p) => t + p!.samples.length, 0) + gap * (pcms.length - 1);
  const out = Buffer.alloc(44 + n * 2);
  out.write("RIFF", 0, "latin1"); out.writeUInt32LE(36 + n * 2, 4); out.write("WAVEfmt ", 8, "latin1"); out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20);
  out.writeUInt16LE(channels, 22); out.writeUInt32LE(rate, 24); out.writeUInt32LE(rate * channels * 2, 28); out.writeUInt16LE(channels * 2, 32); out.writeUInt16LE(16, 34);
  out.write("data", 36, "latin1"); out.writeUInt32LE(n * 2, 40);
  let at = 44;
  pcms.forEach((p, i) => { for (const v of p!.samples) { out.writeInt16LE(v, at); at += 2; } if (i < pcms.length - 1) at += gap * 2; });
  return out;
}
/** which still shows in each frame: the loudness of each frame's slice of the voice, smoothed, as 0..n-1 */
export function mouthLevels(wav: Uint8Array, fps = FPS, n = LEVELS): { levels: number[]; seconds: number } {
  const pcm = wavPcm(wav);
  if (!pcm) return { levels: [], seconds: 0 };
  const per = (pcm.rate * pcm.channels) / fps, frames = Math.max(1, Math.ceil(pcm.samples.length / per - 1e-6));   // a frame's slice, kept exact: no drift over a long voice
  const rms: number[] = [];
  for (let f = 0; f < frames; f++) {
    let sum = 0, count = 0;
    for (let i = Math.floor(f * per); i < Math.min(pcm.samples.length, Math.floor((f + 1) * per)); i++) { const v = pcm.samples[i] / 32768; sum += v * v; count++; }
    rms.push(count ? Math.sqrt(sum / count) : 0);
  }
  const peak = Math.max(0.02, ...rms.slice().sort((a, b) => a - b).slice(0, Math.max(1, Math.floor(rms.length * 0.95))));
  let level = 0;
  const levels = rms.map((r) => { level += (Math.min(1, (r / peak) * 1.15) - level) * 0.6; return Math.max(0, Math.min(n - 1, Math.round(level * (n - 1)))); });
  return { levels, seconds: pcm.seconds };
}
/** the levels as what sendcmd tells streamselect: only where the still changes */
export function selectCommands(levels: number[], fps = FPS): string {
  const out: string[] = [];
  let was = 0;
  levels.forEach((l, i) => { if (l !== was) { out.push(`${(i / fps).toFixed(3)} streamselect map ${l}`); was = l; } });
  if (was !== 0) out.push(`${(levels.length / fps).toFixed(3)} streamselect map 0`);                // shut when the voice ends
  return out.join(";");
}

// ---- what ffmpeg is asked ----
export const SIDE = 720;                                   // a making's pictures are this square (the picture fitted inside, dark around it)
/** the picture as the seeing model and the renderer both take it: fitted into a square, a JPEG */
export const squareArgs = () => ["-i", "@in:photo", "-vf", `scale=${SIDE}:${SIDE}:force_original_aspect_ratio=decrease,pad=${SIDE}:${SIDE}:(ow-iw)/2:(oh-ih)/2:color=0x14121c,format=yuvj420p`,
                                 "-frames:v", "1", "-q:v", "3", "-f", "mjpeg", "@out:square"];
/** that square as plain pixels */
export const pixelArgs = () => ["-i", "@in:square", "-f", "rawvideo", "-pix_fmt", "rgb24", "@out:pixels"];
/** the stills played by the voice's loudness, with the voice: one scene of video. `hold`: seconds it stays after the voice */
export function speakArgs(commands: string, n = LEVELS, fps = FPS, hold = 0.7): string[] {
  // each still is one frame, held for as long as it is asked for (the loop filter: no demuxer option is needed, so it
  // does not matter what a node names the file); sendcmd rides the first and tells streamselect which shows
  const ins = Array.from({ length: n }, (_, i) => ["-i", `@in:still${i}`]).flat();
  const held = Array.from({ length: n }, (_, i) => `[${i}:v]loop=loop=-1:size=1:start=0,fps=${fps}${i === 0 && commands ? `,sendcmd=c='${commands}'` : ""}[s${i}]`).join(";");
  const graph = `${held};${Array.from({ length: n }, (_, i) => `[s${i}]`).join("")}streamselect=inputs=${n}:map=0,format=yuv420p[v];[${n}:a]aresample=44100,apad=pad_dur=${hold}[a]`;
  return [...ins, "-i", "@in:voice", "-filter_complex", graph, "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-r", String(fps),
          "-c:a", "aac", "-b:a", "96k", "-ac", "1", "-shortest", "-movflags", "+faststart", "-f", "mp4", "@out:video"];
}
/** a still shown for `seconds` with no voice of its own (a scene of a sequence a song carries) */
export const stillArgs = (seconds: number, fps = FPS) =>
  ["-i", "@in:square", "-f", "lavfi", "-t", seconds.toFixed(2), "-i", "anullsrc=r=44100:cl=mono",
   "-filter_complex", `[0:v]loop=loop=-1:size=1:start=0,fps=${fps},format=yuv420p[v]`, "-map", "[v]", "-map", "1:a",
   "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-r", String(fps), "-c:a", "aac", "-b:a", "96k", "-ac", "1", "-shortest", "-movflags", "+faststart", "-f", "mp4", "@out:video"];
/** scenes joined into one video; with `music`, it plays under the voices ("under") or is the only sound ("song") */
export function joinArgs(n: number, music: "none" | "under" | "song"): string[] {
  const ins = Array.from({ length: n }, (_, i) => ["-i", `@in:scene${i}`]).flat();
  const pairs = Array.from({ length: n }, (_, i) => `[${i}:v][${i}:a]`).join("");
  let graph = `${pairs}concat=n=${n}:v=1:a=1[v][said]`, audio = "[said]";
  if (music === "under") { graph += `;[${n}:a]aresample=44100,volume=0.22[bed];[said][bed]amix=inputs=2:duration=first:dropout_transition=0[a]`; audio = "[a]"; }
  if (music === "song") { graph += `;[${n}:a]aresample=44100[a]`; audio = "[a]"; }
  return [...ins, ...(music === "none" ? [] : ["-i", "@in:music"]), "-filter_complex", graph, "-map", "[v]", "-map", audio, "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
          "-c:a", "aac", "-b:a", "128k", "-shortest", "-movflags", "+faststart", "-f", "mp4", "@out:video"];
}
/** a voice (WAV) as a small file a phone plays */
export const voiceFileArgs = () => ["-i", "@in:voice", "-c:a", "aac", "-b:a", "96k", "-ac", "1", "-movflags", "+faststart", "-f", "mp4", "@out:audio"];
/** a voice that came as something else (an MP3), as the plain WAV its loudness is read from */
export const plainWavArgs = () => ["-i", "@in:said", "-ac", "1", "-ar", "24000", "-c:a", "pcm_s16le", "-f", "wav", "@out:wav"];
/** anything said into a device, as the 16 kHz WAV the hearing model takes */
export const hearableArgs = () => ["-i", "@in:said", "-ac", "1", "-ar", "16000", "-t", "120", "-f", "wav", "@out:wav"];
