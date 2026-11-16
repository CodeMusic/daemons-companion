// The hub's only (it runs ffmpeg and reads files): never imported by core.ts or routes.ts.
// C-358 (the user, 2026-11-14: "export the track (either regular mp3 <with or without down drift depending on your
// selection>, and you can also export right in the PulseEntrain format such that I could import it into that app"):
//
//   export.mp3 / export-drift.mp3   the night as the phone plays it: the piece looped for thirty minutes, whole for
//                                   twenty, faded over the last ten; with DRIFT DOWN, the binaural layer under it --
//                                   left at the carrier, right at carrier + beat, the beat stepping through alpha,
//                                   theta and delta as the app's does (app/sound/binaural.ts). Made once, then kept.
//                                   C-386: the carrier the piece's key (the month's), the beats placed by the day the
//                                   piece was made (drift.ts) -- so an export made twice is the same file.
//   export.imedx                    PulseEntrain's self-contained session (its docs/SESSION_FORMAT.md, v2): the beat
//                                   stages as scenes, the cover as meta.image and the piece as audio.music, both base64.
//                                   Its `id` (daemons_sleep_<id>) and generation.daemons say which creation it is, so a
//                                   file brought back is known as the same one.
//
// Every word DRAFT.
import { existsSync, readFileSync, renameSync, statSync } from "node:fs";
import { join } from "node:path";
import { argvFor, runFfmpeg } from "./procmesh.js";
import { carrierOf, driftOf, type Stage } from "./drift.js";

export { carrierOf, driftOf };

export const SESSION_S = 30 * 60, FADE_S = 10 * 60;
const DRIFT_LEVEL = 0.22;                       // as the app's: under the music, never over it
const PE_MUSIC_BYTES = 3_500_000;               // the whole .imedx stays under ~5 MB once base64
const PE_MUSIC_KBPS = 64;

// the night's stages for a piece: the day it was asked for places the beats (C-386)
export const stagesOf = (asked?: string | null): Stage[] => driftOf(asked && !Number.isNaN(Date.parse(asked)) ? new Date(asked) : new Date());

// how many beats have passed by t seconds (the beat steps at each stage): the right ear's extra phase, in cycles
export function beatsBy(t: number, DRIFT: readonly Stage[]): number {
  let cycles = 0;
  for (let i = 0; i < DRIFT.length; i++) {
    const from = DRIFT[i].at, to = i + 1 < DRIFT.length ? DRIFT[i + 1].at : Infinity;
    if (t <= from) break;
    cycles += DRIFT[i].beat * (Math.min(t, to) - from);
  }
  return cycles;
}
// the same, as an ffmpeg expression in t
export function beatsExpr(DRIFT: readonly Stage[]): string {
  let expr = "", acc = 0;
  const parts: string[] = [];
  for (let i = 0; i < DRIFT.length; i++) {
    const d = DRIFT[i], next = DRIFT[i + 1];
    parts.push(next ? `if(lt(t,${next.at}),${acc}+${d.beat}*(t-${d.at}),` : `${acc}+${d.beat}*(t-${d.at})`);
    if (next) acc += d.beat * (next.at - d.at);
  }
  expr = parts.join("") + ")".repeat(DRIFT.length - 1);
  return expr;
}

// the stages as PulseEntrain scenes: each beat held until the next begins (its engine ramps between scenes, so a
// stage ends with a scene a second before the next)
export function driftScenes(carrierHz: number, DRIFT: readonly Stage[]) {
  const scenes: { atSec: number; beatHz: number; carrierHz: number }[] = [];
  DRIFT.forEach((d, i) => {
    const end = i + 1 < DRIFT.length ? DRIFT[i + 1].at - 1 : SESSION_S;
    scenes.push({ atSec: d.at, beatHz: d.beat, carrierHz }, { atSec: end, beatHz: d.beat, carrierHz });
  });
  return scenes;
}

// C-360: each ffmpeg run goes to THE MESH (procmesh.ts) -- the node with the most potential free now, roverbyteseer before
// the hub's one small core -- with its files named @in:<name> / @out:<name>; without a mesh (tests), here, gently
export type FF = (args: string[], inputs: Record<string, string>, outputs: Record<string, string>, o: { title: string; expectMs?: number }) => Promise<void>;
let ff: FF = (args, inputs, outputs) => runFfmpeg(argvFor(args, {
  ...Object.fromEntries(Object.entries(inputs).map(([k, v]) => [`in:${k}`, v])),
  ...Object.fromEntries(Object.entries(outputs).map(([k, v]) => [`out:${k}`, v])) }));
export const useMesh = (f: FF) => { ff = f; };
export const ffmpeg: FF = (...a) => ff(...a);
// made once into `name` beside the piece, written aside and renamed; one at a time a file
const making = new Map<string, Promise<string>>();
function once(folder: string, name: string, make: (part: string) => Promise<void>): Promise<string> {
  const out = join(folder, name);
  if (existsSync(out)) return Promise.resolve(out);
  const going = making.get(out);
  if (going) return going;
  const p = (async () => {
    const part = `${out}.part.${name.split(".").pop()}`;
    await make(part);
    renameSync(part, out);
    return out;
  })().finally(() => making.delete(out));
  making.set(out, p);
  return p;
}

// The night as one MP3: thirty minutes, the last ten fading; with DRIFT DOWN under it when `drift`
export function exportMp3(folder: string, keyscale: string, drift: boolean, DRIFT: readonly Stage[] = driftOf()): Promise<string> {
  const src = join(folder, "phone.m4a");
  return once(folder, drift ? "export-drift.mp3" : "export.mp3", async (part) => {
    const fade = `afade=t=out:st=${SESSION_S - FADE_S}:d=${FADE_S}`;
    if (!drift) {
      await ffmpeg(["-stream_loop", "-1", "-i", "@in:piece", "-t", String(SESSION_S), "-af", fade, "-ac", "2", "-ar", "44100",
                    "-c:a", "libmp3lame", "-b:a", "128k", "-compression_level", "7", "-f", "mp3", "@out:mp3"],
                   { piece: src }, { mp3: part }, { title: "the night as an MP3", expectMs: 150_000 });
      return;
    }
    // the left ear the carrier for the whole night; the right, carrier + beat, a stage at a time (plain sine sources:
    // an evaluated expression a sample was far too slow on the hub). A stage changes as the app's does, at once.
    const c = carrierOf(keyscale), vol = (DRIFT_LEVEL * 8).toFixed(3);   // ffmpeg's sine is an eighth of full scale
    const sine = (f: number, d: number) => ["-f", "lavfi", "-i", `sine=frequency=${f}:duration=${d}:sample_rate=44100`];
    const stages = DRIFT.map((d, i) => ({ beat: d.beat, d: (i + 1 < DRIFT.length ? DRIFT[i + 1].at : SESSION_S) - d.at }));
    const right = stages.map((_, i) => `[${i + 2}:a]`).join("");
    await ffmpeg(["-stream_loop", "-1", "-i", "@in:piece", ...sine(c, SESSION_S), ...stages.flatMap((st) => sine(c + st.beat, st.d)),
               "-filter_complex",
               `[0:a]atrim=0:${SESSION_S},aformat=sample_rates=44100:channel_layouts=stereo[m];` +
               `${right}concat=n=${stages.length}:v=0:a=1[r];` +
               `[1:a][r]join=inputs=2:channel_layout=stereo,volume=${vol}[b];` +
               `[m][b]amix=inputs=2:duration=first:normalize=0,${fade}[o]`,
               "-map", "[o]", "-c:a", "libmp3lame", "-b:a", "128k", "-compression_level", "7", "-f", "mp3", "@out:mp3"],
                 { piece: src }, { mp3: part }, { title: "the night as an MP3, with DRIFT DOWN", expectMs: 180_000 });
  });
}

// The piece for PulseEntrain's music: looped as long as fits its size, ending with a soft fade
function peMusic(folder: string): Promise<string> {
  const seconds = Math.floor((PE_MUSIC_BYTES * 8) / (PE_MUSIC_KBPS * 1000));
  return once(folder, "pe-music.mp3", (part) => ffmpeg(["-stream_loop", "-1", "-i", "@in:piece", "-t", String(seconds),
    "-af", `afade=t=out:st=${seconds - 15}:d=15`, "-ac", "2", "-ar", "44100", "-c:a", "libmp3lame", "-b:a", `${PE_MUSIC_KBPS}k`, "-f", "mp3", "@out:mp3"],
    { piece: join(folder, "phone.m4a") }, { mp3: part }, { title: "the piece for PulseEntrain", expectMs: 40_000 }));
}
function peCover(folder: string): Promise<string | null> {
  if (!existsSync(join(folder, "cover.png"))) return Promise.resolve(null);
  return once(folder, "pe-cover.jpg", (part) => ffmpeg(["-i", "@in:cover", "-vf", "scale=512:-2", "-q:v", "4", "-f", "mjpeg", "@out:jpg"],
    { cover: join(folder, "cover.png") }, { jpg: part }, { title: "the cover for PulseEntrain", expectMs: 3_000 }));
}

// whether each export is made yet -- and, asked, start the ones that are not (one piece's at a time, behind any other)
export const EXPORTS = ["export.mp3", "export-drift.mp3", "export.imedx"] as const;
export type ExportName = (typeof EXPORTS)[number];
export function exportsMade(folder: string): Record<ExportName, boolean> {
  return { "export.mp3": existsSync(join(folder, "export.mp3")), "export-drift.mp3": existsSync(join(folder, "export-drift.mp3")),
           "export.imedx": existsSync(join(folder, "pe-music.mp3")) };
}
let queue: Promise<unknown> = Promise.resolve();
export function makeExports(folder: string, keyscale: string, asked?: string | null): void {
  const made = exportsMade(folder);
  if (made["export.mp3"] && made["export-drift.mp3"] && made["export.imedx"]) return;
  queue = queue.then(async () => {
    if (!existsSync(join(folder, "phone.m4a"))) return;
    await peMusic(folder).catch(() => {}); await peCover(folder).catch(() => {});
    await exportMp3(folder, keyscale, false).catch(() => {});
    await exportMp3(folder, keyscale, true, stagesOf(asked)).catch(() => {});
  });
}

export const imedxId = (id: string) => `daemons_sleep_${id}`;
export type ImedxTrack = { id: string; title?: string; about?: string; said: string; nickname: string; keyscale: string;
                           bpm: number; caption: string; made?: string; asked: string; by?: string };

// PulseEntrain's session for a piece, as JSON
export async function exportImedx(folder: string, t: ImedxTrack, hub: string): Promise<Record<string, unknown>> {
  const [music, cover] = await Promise.all([peMusic(folder), peCover(folder)]);
  const carrierHz = carrierOf(t.keyscale);
  const b64 = (f: string) => readFileSync(f).toString("base64");
  return {
    formatVersion: 2,
    id: imedxId(t.id),
    meta: {
      name: t.title || `${t.nickname || "A daemon"}'s sleep sounds`,
      description: t.about || t.said,
      category: "sleep",
      strength: 2, strengthLabel: "Gentle",
      durationSec: SESSION_S,
      image: cover ? `data:image/jpeg;base64,${b64(cover)}` : null,
      rating: null, playCount: 0,
    },
    generation: {
      source: "studio", tool: "DAEMONS companion", createdAt: t.made ?? t.asked,
      prompt: t.caption, model: "ACE-Step 1.5",
      // C-358: which creation this is, so the same piece brought back is known as the same one
      daemons: { kind: "sleep", id: t.id, hub, daemon: t.nickname, by: t.by ?? null, keyscale: t.keyscale, bpm: t.bpm,
                 musicBytes: statSync(music).size },
    },
    entrainment: { ramp: "linear", scenes: driftScenes(carrierHz, stagesOf(t.asked)) },
    audio: {
      binaural: { carrierHz, follow: "beat" },
      beds: [],
      music: `data:audio/mpeg;base64,${b64(music)}`,
      masterVolume: 0.6,
      transitionFade: "long",
    },
    nova: { mode: "follow", maxHz: 13, brightness: 0.5 },
    pulsetto: { enabled: false, follow: "none" },
  };
}
