// BRAIN: none -- a library of files
// The hub's only (it reads files): never imported by core.ts or routes.ts.
// C-506 (the user, 2026-11-24): REVERIE's library of drifts -- PulseEntrain's programs carried into server/data/drifts/
// by server/tools/import_drifts.py (the PHARMACY renamed as TINCTURES, by how each feels), and THE LONG FALL, DRIFT DOWN
// as it always was, placed by the day (psyche/drift.ts). The drift a player chose is kept in the store, so the phone,
// the site and the watch play the same one. Every name and word DRAFT.
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import type { Store } from "../shared/store.js";
import { LONG_FALL, LONG_FALL_INFO, longFallFile, type DriftFile, type DriftInfo } from "../psyche/drift.js";

const DIR = fileURLToPath(new URL("../../data/drifts/", import.meta.url));
const CHOSEN = "reverie.drift";
const ID = /^[a-z0-9][a-z0-9-]{0,80}$/;

let index: DriftInfo[] | null = null;
// C-554: the drifts made here (REVERIE's MAKE), kept in the hub's own data folder beside its store -- never in the repository
let MADE: string | null = null;
export function madeDriftsIn(dir: string | null) { MADE = dir; if (dir) mkdirSync(dir, { recursive: true }); }
const infoOf = (d: DriftFile): DriftInfo => ({ id: d.id, name: d.meta.name ?? d.id, kind: d.kind, group: d.meta.category ?? null,
  description: d.meta.description ?? "", durationSec: d.meta.durationSec ?? null, strength: d.meta.strength ?? null, side: d.side ?? "you" });
function made(): DriftInfo[] {
  if (!MADE || !existsSync(MADE)) return [];
  const out: [number, DriftInfo][] = [];
  for (const f of readdirSync(MADE)) if (f.endsWith(".json")) {
    try { out.push([statSync(join(MADE, f)).mtimeMs, infoOf(JSON.parse(readFileSync(join(MADE, f), "utf8")) as DriftFile)]); } catch { /* a broken one is skipped */ }
  }
  return out.sort((a, b) => b[0] - a[0]).map(([, d]) => ({ ...d, made: true }));
}
/** Every drift: THE LONG FALL first, then those made here (newest first), then the library by kind, its group and name. */
export function driftList(dir = DIR): DriftInfo[] {
  if (!index || dir !== DIR) {
    let lib: DriftInfo[] = [];
    try { lib = JSON.parse(readFileSync(join(dir, "index.json"), "utf8")); } catch { /* no library: THE LONG FALL alone */ }
    const all = lib.filter((d) => d.id !== LONG_FALL);
    if (dir !== DIR) return [LONG_FALL_INFO, ...made(), ...all];
    index = all;
  }
  return [LONG_FALL_INFO, ...made(), ...index];
}

/** One drift's file, or null when there is no such drift. */
export function driftFile(id: string, dir = DIR, now = new Date()): DriftFile | null {
  if (id === LONG_FALL) return longFallFile(now);
  if (!ID.test(id)) return null;
  for (const d of [MADE, dir]) {
    const f = d ? join(d, `${id}.json`) : null;
    if (f && existsSync(f)) try { return JSON.parse(readFileSync(f, "utf8")) as DriftFile; } catch { return null; }
  }
  return null;
}

/** C-554: keep a drift made here; its id is new each time. */
export function keepMadeDrift(d: DriftFile): string | null {
  if (!MADE || !ID.test(d.id)) return null;
  writeFileSync(join(MADE, `${d.id}.json`), JSON.stringify(d, null, 1) + "\n");
  return d.id;
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
