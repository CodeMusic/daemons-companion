// C-364 (the user, 2026-11-14: "the user will just experience the seemless unified save, but still the trail could be
// adminstated from the engine room if they ever had to revert to a past event"): every time a save moves -- a device's
// game saving, a SYNC, the link cable bringing a seat home, a copy kept, a device's save refused or replaced because the
// companion's had moved on (C-365), going back to an old one -- the save is kept here, compressed, by SHA-1, with when,
// what moved it and who the game is. THE ENGINE ROOM's SAVES page reads it; the player never sees it.
// node:fs, so only api.ts reaches it (never core.ts or routes.ts).
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync, appendFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { deflateSync, inflateSync } from "node:zlib";
import { DEFAULTS, type Config } from "../config.js";
import { readProfile } from "./save/profile.js";

// game: a device's game saved (the phone's, or the computer's save file changing); sync: a SYNC wrote it; link: the link
// cable brought a seat home; kept: a copy kept by name; set-aside: a device's own save, replaced by the companion's
// (C-365) or refused because the companion's had moved on; back: the companion went back to an earlier save
export type SaveKind = "game" | "sync" | "link" | "kept" | "set-aside" | "back";
export type SaveEvent = { id: number; at: string; kind: SaveKind; from: string; sha1: string; game: string;
                          name: string; playTime: string; note: string };

export const KEEP = 400;                                   // ~128 KiB a save, compressed to a fraction: a few MB in all
const sha1 = (b: Uint8Array) => createHash("sha1").update(b).digest("hex");

type Trail = { events: SaveEvent[]; blobs: Map<string, Uint8Array> | null; dir: string | null };
const TRAILS = new Map<string, Trail>();

function trailOf(cfg: Config): Trail {
  const key = cfg.database;
  let t = TRAILS.get(key);
  if (t) return t;
  // in memory: an in-memory database, or a test that never named one (it would otherwise write beside the checkout's own)
  if (cfg.database === ":memory:" || (process.env.VITEST && cfg.database === DEFAULTS.database)) t = { events: [], blobs: new Map(), dir: null };
  else {
    const dir = join(dirname(cfg.database), "save-history"), index = join(dir, "trail.jsonl");
    const events: SaveEvent[] = [];
    if (existsSync(index)) for (const line of readFileSync(index, "utf8").split("\n")) {
      if (!line.trim()) continue;
      try { events.push(JSON.parse(line)); } catch { /* a torn last line: the rest is good */ }
    }
    t = { events, blobs: null, dir };
  }
  TRAILS.set(key, t);
  return t;
}

function who(bytes: Uint8Array): { game: string; name: string; playTime: string } {
  try {
    const p = readProfile(bytes), t = p.playTime;
    return { game: `${p.name}/${p.trainerId}/${p.secretId}`, name: p.name, playTime: `${t.hours}:${String(t.minutes).padStart(2, "0")}` };
  } catch { return { game: "", name: "?", playTime: "" }; }
}

// Keep a save in the trail. A save already there and unchanged since (the same SHA-1 as the newest of its game) is not
// kept twice -- the companion reading back what it just wrote is not an event -- except going back, which always is.
export function recordSave(cfg: Config, bytes: Uint8Array, kind: SaveKind, from: string, note = ""): SaveEvent | null {
  if (bytes.length < 0x10000) return null;
  const t = trailOf(cfg), id = sha1(bytes), w = who(bytes);
  const newest = [...t.events].reverse().find((e) => e.game === w.game);
  if (kind !== "back" && kind !== "set-aside" && newest?.sha1 === id) return null;
  const e: SaveEvent = { id: (t.events.at(-1)?.id ?? 0) + 1, at: new Date().toISOString(), kind, from: from.slice(0, 60), sha1: id, ...w, note: note.slice(0, 160) };
  try {
    if (t.blobs) t.blobs.set(id, bytes);
    else {
      mkdirSync(t.dir!, { recursive: true });
      const blob = join(t.dir!, `${id}.sav.z`);
      if (!existsSync(blob)) { writeFileSync(`${blob}.writing`, deflateSync(bytes)); renameSync(`${blob}.writing`, blob); }
      appendFileSync(join(t.dir!, "trail.jsonl"), JSON.stringify(e) + "\n");
    }
  } catch { return null; }                                 // the trail is a record, never a reason a save fails
  t.events.push(e);
  if (t.events.length > KEEP) prune(t);
  return e;
}

// the oldest dropped past KEEP, and every save no event still names
function prune(t: Trail) {
  t.events = t.events.slice(-KEEP);
  const named = new Set(t.events.map((e) => e.sha1));
  if (t.blobs) { for (const k of [...t.blobs.keys()]) if (!named.has(k)) t.blobs.delete(k); return; }
  try {
    const index = join(t.dir!, "trail.jsonl");
    writeFileSync(`${index}.writing`, t.events.map((e) => JSON.stringify(e)).join("\n") + "\n");
    renameSync(`${index}.writing`, index);
    for (const f of readdirSync(t.dir!)) if (f.endsWith(".sav.z") && !named.has(f.slice(0, -6))) unlinkSync(join(t.dir!, f));
  } catch { /* pruned next time */ }
}

export const trail = (cfg: Config): SaveEvent[] => [...trailOf(cfg).events].reverse();

export function savedBytes(cfg: Config, id: number): Uint8Array | null {
  const t = trailOf(cfg), e = t.events.find((x) => x.id === id);
  if (!e) return null;
  if (t.blobs) return t.blobs.get(e.sha1) ?? null;
  try { return new Uint8Array(inflateSync(readFileSync(join(t.dir!, `${e.sha1}.sav.z`)))); } catch { return null; }
}
