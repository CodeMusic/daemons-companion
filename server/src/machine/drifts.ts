// The hub's only (it reads files): never imported by core.ts or routes.ts.
// C-506 (the user, 2026-11-24): REVERIE's library of drifts -- PulseEntrain's programs carried into server/data/drifts/
// by server/tools/import_drifts.py (the PHARMACY renamed as TINCTURES, by how each feels), and THE LONG FALL, DRIFT DOWN
// as it always was, placed by the day (psyche/drift.ts). The drift a player chose is kept in the store, so the phone,
// the site and the watch play the same one. Every name and word DRAFT.
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import type { Store } from "../shared/store.js";
import { LONG_FALL, LONG_FALL_INFO, longFallFile, type DriftFile, type DriftInfo } from "../psyche/drift.js";

const DIR = fileURLToPath(new URL("../../data/drifts/", import.meta.url));
const CHOSEN = "reverie.drift";
const ID = /^[a-z0-9][a-z0-9-]{0,80}$/;

let index: DriftInfo[] | null = null;
/** Every drift: THE LONG FALL first, then the library by kind, its group and name. */
export function driftList(dir = DIR): DriftInfo[] {
  if (!index || dir !== DIR) {
    let lib: DriftInfo[] = [];
    try { lib = JSON.parse(readFileSync(join(dir, "index.json"), "utf8")); } catch { /* no library: THE LONG FALL alone */ }
    const all = [LONG_FALL_INFO, ...lib.filter((d) => d.id !== LONG_FALL)];
    if (dir !== DIR) return all;
    index = all;
  }
  return index;
}

/** One drift's file, or null when there is no such drift. */
export function driftFile(id: string, dir = DIR, now = new Date()): DriftFile | null {
  if (id === LONG_FALL) return longFallFile(now);
  if (!ID.test(id)) return null;
  const f = join(dir, `${id}.json`);
  if (!existsSync(f)) return null;
  try { return JSON.parse(readFileSync(f, "utf8")) as DriftFile; } catch { return null; }
}

/** The drift chosen to play under a reverie (THE LONG FALL until one is chosen, or when the chosen one is gone). */
export function chosenDrift(store: Store, dir = DIR): string {
  const id = store.getSetting(CHOSEN);
  return id && driftList(dir).some((d) => d.id === id) ? id : LONG_FALL;
}
export function chooseDrift(store: Store, id: string, dir = DIR): boolean {
  if (!driftList(dir).some((d) => d.id === id)) return false;
  store.setSetting(CHOSEN, id);
  return true;
}
