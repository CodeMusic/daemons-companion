// BRAIN: none -- a door: a piece of music asked of the always-on machine's music maker, and fetched
// C-604 (C-596): THE MUSIC DOOR, asked for one piece and nothing more -- music without words to play under voices, or a
// song that carries its lyrics. The same door the sleep sounds (sleeptracks.ts) and the daemon's songs (songs.ts) ask,
// by the same three requests (make, the job, its file), for a caller that keeps no shelf of its own: THE HOARD's
// magic videos (hoard/makings.ts). MACHINE: what is asked for is the mind's to word (psyche/photovoice.ts).
import { renameSync, rmSync, writeFileSync } from "node:fs";
import type { SleepDoor } from "./sleeptracks.js";

export type Piece = { song: boolean; caption: string; lyrics?: string; seconds: number };
export const MUSIC_WAIT_MS = 30 * 60_000;

/** ask the door for one piece and write it (a FLAC) to `to`; nothing is left at the door */
export async function musicPiece(door: SleepDoor, p: Piece, to: string, o: { signal?: AbortSignal; pollMs?: number; waitMs?: number; f?: typeof fetch } = {}): Promise<void> {
  const f = o.f ?? fetch, h = { authorization: `Bearer ${door.key}`, "content-type": "application/json" };
  const stopped = () => { if (o.signal?.aborted) throw new Error("stopped"); };
  const asked = await f(`${door.base}/v1/sleep/make`, { method: "POST", headers: h, signal: o.signal,
    body: JSON.stringify(p.song ? { song: true, caption: p.caption, lyrics: p.lyrics ?? "", seconds: p.seconds } : { caption: p.caption, seconds: p.seconds }) });
  if (!asked.ok) throw new Error(`the music maker said ${asked.status}`);
  const { job } = (await asked.json()) as { job: string };
  try {
    const until = Date.now() + (o.waitMs ?? MUSIC_WAIT_MS);
    let st: { state: string; error?: string } = { state: "queued" };
    while (Date.now() < until) {
      await new Promise((r) => setTimeout(r, o.pollMs ?? 5000));
      stopped();
      const q = await f(`${door.base}/v1/sleep/job/${job}`, { headers: h, signal: o.signal });
      if (!q.ok) throw new Error(`the music maker lost the piece (${q.status})`);
      st = (await q.json()) as typeof st;
      if (st.state === "done" || st.state === "failed") break;
    }
    if (st.state !== "done") throw new Error(st.error ?? "the music took too long");
    const got = await f(`${door.base}/v1/sleep/file/${job}.flac`, { headers: h, signal: o.signal });
    if (!got.ok) throw new Error(`the music maker kept no file (${got.status})`);
    writeFileSync(`${to}.part`, Buffer.from(await got.arrayBuffer()));
    renameSync(`${to}.part`, to);
  } catch (e) { rmSync(`${to}.part`, { force: true }); throw e; }
  finally { await f(`${door.base}/v1/sleep/file/${job}`, { method: "DELETE", headers: h }).catch(() => {}); }
}
