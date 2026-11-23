// The hub's only (it runs ffmpeg and keeps files): never imported by core.ts or routes.ts.
// C-332 (the user, 2026-11-11, by multiple choice: "the game's music on the watch"): the LIBRARY's songs as real audio --
// the game's own tracks (DAEMONS tools/port_music.py's MIDI), rendered once and published beside the books' recordings
// (docs/music/audio/: <id>.mp3 and tracks.json, {tracks: [{id, title, place?, seconds?}]}), here cut to a board's PCM
// (raw 16 kHz mono 16-bit) once each, as a book's chapter is (bookrecordings.ts). The T-Watch Ultra keeps each on its
// card and plays it there after, with no network. Until tracks.json is published the list is empty and the watch says so.
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FOUND_FFMPEG } from "./machine/voice.js";

const AUDIO = "https://raw.githubusercontent.com/CodeMusic/DAEMONS/main/docs/music/audio/";
const LIST_FOR_MS = 60 * 60 * 1000;
export type Track = { id: string; title: string; place?: string; seconds?: number };
export const trackId = (s: string) => (/^[a-z0-9_-]{1,40}$/.test(s) ? s : "");

export function readTracks(j: unknown): Track[] {
  const list = (j as { tracks?: unknown[] })?.tracks;
  if (!Array.isArray(list)) return [];
  return list.flatMap((t: any) => {
    const id = trackId(String(t?.id ?? ""));
    if (!id) return [];
    return [{ id, title: String(t.title ?? id).slice(0, 40), ...(t.place ? { place: String(t.place).slice(0, 40) } : {}),
              ...(Number.isFinite(t.seconds) ? { seconds: Math.round(t.seconds) } : {}) }];
  }).slice(0, 64);
}

export class GameMusic {
  private list: { at: number; tracks: Track[] } | null = null;
  private cutting = new Map<string, Promise<string | null>>();
  constructor(private dir: string, private get: typeof fetch = fetch) {}

  async tracks(): Promise<Track[]> {
    if (this.list && Date.now() - this.list.at < LIST_FOR_MS) return this.list.tracks;
    try {
      const r = await this.get(`${AUDIO}tracks.json`, { signal: AbortSignal.timeout(15000) });
      if (!r.ok) return this.list?.tracks ?? [];
      this.list = { at: Date.now(), tracks: readTracks(await r.json()) };
      return this.list.tracks;
    } catch { return this.list?.tracks ?? []; }
  }
  // the track's PCM file, cut once; null when it is not published, or ffmpeg is missing
  async pcm(id: string): Promise<string | null> {
    const t = (await this.tracks()).find((x) => x.id === trackId(id));
    if (!t || !FOUND_FFMPEG) return null;
    const out = join(this.dir, `${t.id}.pcm`);
    if (existsSync(out)) return out;
    const busy = this.cutting.get(out);
    if (busy) return busy;
    const job = this.cut(t.id, out).finally(() => this.cutting.delete(out));
    this.cutting.set(out, job);
    return job;
  }
  private async cut(id: string, out: string): Promise<string | null> {
    mkdirSync(this.dir, { recursive: true });
    const mp3 = join(this.dir, `${id}.mp3`);
    if (!existsSync(mp3)) {
      const r = await this.get(`${AUDIO}${id}.mp3`, { signal: AbortSignal.timeout(300000) });
      if (!r.ok) return null;
      writeFileSync(mp3 + ".part", new Uint8Array(await r.arrayBuffer()));
      renameSync(mp3 + ".part", mp3);
    }
    const ok = await new Promise<boolean>((done) => execFile(FOUND_FFMPEG!,
      ["-v", "error", "-y", "-i", mp3, "-ac", "1", "-ar", "16000", "-f", "s16le", out + ".part"], { timeout: 120000 }, (e) => done(!e)));
    if (!ok) return null;
    renameSync(out + ".part", out);
    return out;
  }
}
