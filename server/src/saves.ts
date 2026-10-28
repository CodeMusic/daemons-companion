// C-215 (the user, 2026-10-28: "we will need a future way to manage multiple saves ... maybe profiles in the app or even
// just a save selector"): every save the companion knows -- the one it was given (SETTINGS' path, or config.json's), the
// mirror of a device's game (C-188), and saves kept here by name (saves/, beside the database) -- each read for who it
// is, and one chosen as the save the companion reads, syncs and mirrors. Never the user's own file written: choosing only
// points at a save; keeping writes a new copy. node:fs, so only api.ts reaches it (never core.ts or routes.ts).
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { Config } from "./config.js";
import type { Store } from "./store.js";
import { readSave } from "./save/reader.js";
import { readProfile } from "./save/profile.js";

export type SaveKind = "given" | "mirror" | "kept";
export type SaveEntry = { id: string; kind: SaveKind; label: string; current: boolean; at: string;
                          name: string; trainerId: number; playTime: string; marks: number; seen: number; place: string | null };

const home = (cfg: Config) => cfg.database === ":memory:" ? tmpdir() : dirname(cfg.database);
export const savesDir = (cfg: Config) => join(home(cfg), "saves");
const idOf = (path: string) => createHash("sha1").update(resolve(path)).digest("hex").slice(0, 12);
const labels = (store: Store): Record<string, string> => { try { return JSON.parse(store.getSetting("saves.labels") ?? "{}"); } catch { return {}; } };

function entry(path: string, kind: SaveKind, label: string, current: string | null): SaveEntry | null {
  if (!existsSync(path)) return null;
  try {
    const bytes = new Uint8Array(readFileSync(path)), p = readProfile(bytes);
    const t = p.playTime;
    return { id: idOf(path), kind, label, current: !!current && resolve(current) === resolve(path), at: statSync(path).mtime.toISOString(),
             name: p.name, trainerId: p.trainerId, playTime: `${t.hours}:${String(t.minutes).padStart(2, "0")}`,
             marks: (p.marks ?? []).filter(Boolean).length, seen: p.index?.seen ?? 0, place: p.savedIn?.place ?? null };
  } catch { return null; }                                // not a save, or a damaged one: not offered
}

// Every save known, the current one marked; `paths` is how a chosen id is found again (never sent to a client)
export function listSaves(cfg: Config, store: Store, current: string | null, mirror: string) {
  const kept = labels(store), dir = savesDir(cfg), seen = new Set<string>(), out: SaveEntry[] = [], paths = new Map<string, string>();
  const add = (path: string | null | undefined, kind: SaveKind, label: string) => {
    if (!path || seen.has(resolve(path))) return;
    const e = entry(path, kind, label, current);
    if (e) { seen.add(resolve(path)); out.push(e); paths.set(e.id, path); }
  };
  add(store.getSetting("savePath"), "given", "The save given in SETTINGS");
  add(cfg.savePath, "given", "The companion's own save");
  add(mirror, "mirror", "This device's game (the mirror)");
  if (existsSync(dir)) for (const f of readdirSync(dir).filter((x) => x.endsWith(".sav")).sort()) add(join(dir, f), "kept", kept[f] ?? f.replace(/\.sav$/, ""));
  return { saves: out, paths };
}

// A save kept here by name -- a copy, written whole (temp, then renamed); its file is named for the game (trainer, ids),
// so the same game kept again replaces its own copy rather than piling up beside it
export function keepSave(cfg: Config, store: Store, bytes: Uint8Array, label: string): string {
  readSave(bytes);                                         // a whole save, or it throws
  const dir = savesDir(cfg);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const p = readProfile(bytes), game = `${p.name}/${p.trainerId}/${p.secretId}`;
  const file = `${createHash("sha1").update(game).digest("hex").slice(0, 12)}.sav`, path = join(dir, file);
  writeFileSync(`${path}.companion-writing`, bytes); renameSync(`${path}.companion-writing`, path);
  const l = labels(store); l[file] = label.trim().slice(0, 40) || l[file] || p.name;
  store.setSetting("saves.labels", JSON.stringify(l));
  return idOf(path);
}
