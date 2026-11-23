// The hub's only (it runs ffmpeg and keeps files): never imported by core.ts or routes.ts.
// C-413 (found walking THE ENGINE ROOM for C-399, 2026-11-18): a cover is painted at 768px and kept as a PNG of 0.2 to
// 1.1 MB, and CREATIONS showed 35 of them as thumbnails -- about 38 MB a visit over the home Wi-Fi. A SMALL COVER is a
// 256px JPEG (about 15-30 KB) kept beside the picture as <name>-small.jpg (cover.png -> cover-small.jpg, a painting's
// <id>.png -> <id>-small.jpg, every painting sharing one folder): made the first time it is asked for, made
// again if the painting is newer, one at a time (the hub has one core, and a first visit asks for every one at once).
// It is made here, not given to THE MESH (C-360): a fraction of a second each, and a job in THE MESH is a task in THE
// MIND AT WORK -- a first visit would push the ledger's real work out of its last 120. When ffmpeg cannot make one,
// the caller sends the painting instead: a page is never left without its cover.
import { existsSync, renameSync, rmSync, statSync } from "node:fs";
import { runFfmpeg } from "./machine/procmesh.js";

export const SMALL_PX = 256;
export const smallOf = (full: string) => full.replace(/\.png$/i, "") + "-small.jpg";
// a picture let go takes its small copy with it
export const dropSmall = (full: string) => rmSync(smallOf(full), { force: true });

type Make = (argv: string[]) => Promise<void>;
const making = new Map<string, Promise<string | null>>();
let queue: Promise<unknown> = Promise.resolve();

// the small cover beside `full` (a cover.png), made if it is missing or older than the painting; null when it cannot be
export function smallCover(full: string, make: Make = runFfmpeg): Promise<string | null> {
  if (!existsSync(full)) return Promise.resolve(null);
  const small = smallOf(full);
  if (existsSync(small) && statSync(small).mtimeMs >= statSync(full).mtimeMs) return Promise.resolve(small);
  const was = making.get(small);
  if (was) return was;
  const part = `${small}.part.jpg`;
  const run = queue.then(async () => {
    try {
      await make(["-i", full, "-vf", `scale=${SMALL_PX}:${SMALL_PX}:force_original_aspect_ratio=decrease`, "-frames:v", "1", "-q:v", "5", part]);
      if (!existsSync(part)) return null;
      renameSync(part, small);
      return small;
    } catch {
      rmSync(part, { force: true });
      return null;
    }
  }).finally(() => making.delete(small));
  queue = run;
  making.set(small, run);
  return run;
}
