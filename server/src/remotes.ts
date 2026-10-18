// C-165: the remotes every device knows (the user, 2026-10-18: "remotes learned on one device should be shared to other
// devices (eg cc1101 learned remotes but they dont show on the watch)"). One list, kept here as the networks are
// (networks.ts, C-93): a remote taught on any board (FLARE, TEACH A REMOTE) or added from the site is taken by every board
// with IR out the next time it is in touch, and one removed anywhere is removed by all of them.
//
// The codes travel, not only the names: each of a remote's three buttons (POWER, VOLUME UP, VOLUME DOWN) as the board's
// IR library names it -- its protocol, value, bits and repeat. A button the library could not name (kept as raw timings)
// stays on the board that heard it. A remove is remembered by name, so a board that has not heard yet cannot bring the
// remote back by reporting it; only a board that taught it again itself (`fresh`) can.
import type { Store } from "./store.js";

const KEY = "remotes.shared";
export type Button = { p: string; v: string; b: number; r: number } | null;   // protocol, value (hex), bits, repeat
export type Remote = { name: string; buttons: Button[] };
type Kept = Remote & { at: string };
type Shared = { rev: number; remotes: Kept[]; forgot: Record<string, string> };
export type Reported = { name?: unknown; buttons?: unknown; fresh?: boolean };

const MAX = 6;                                   // as a board keeps (radios.cpp MAX_REMOTES)
// a name as the board's font can draw it (api.ts's rename: 1-16 plain letters)
const cleanName = (s: unknown) => (typeof s === "string" ? s.replace(/[^\x20-\x7e]/g, "").trim().slice(0, 16).trim() : "");
function cleanButton(x: unknown): Button {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const p = typeof o.p === "string" ? o.p.toUpperCase() : "", v = typeof o.v === "string" ? o.v.toLowerCase() : "";
  if (!/^[A-Z0-9_]{1,24}$/.test(p) || p === "UNKNOWN" || !/^[0-9a-f]{1,16}$/.test(v)) return null;
  const b = Number(o.b), r = Number(o.r ?? 0);
  if (!Number.isInteger(b) || b < 1 || b > 64 || !Number.isInteger(r) || r < 0 || r > 20) return null;
  return { p, v, b, r };
}
export function cleanRemote(x: Reported | Remote | null | undefined): Remote | null {
  const name = cleanName(x?.name);
  const raw = Array.isArray(x?.buttons) ? (x!.buttons as unknown[]) : [];
  const buttons = [0, 1, 2].map((i) => cleanButton(raw[i]));
  return name && buttons.some(Boolean) ? { name, buttons } : null;
}

export class SharedRemotes {
  constructor(private store: Store) {}

  private read(): Shared {
    try { const s = JSON.parse(this.store.getSetting(KEY) ?? ""); if (Array.isArray(s.remotes)) return s; } catch { /* none yet */ }
    return { rev: 0, remotes: [], forgot: {} };
  }
  private write(s: Shared) { s.rev++; this.store.setSetting(KEY, JSON.stringify(s)); }

  rev() { return this.read().rev; }
  names() { const s = this.read(); return { rev: s.rev, remotes: s.remotes.map((r) => r.name) }; }
  // What a board is handed: every remote with its codes, and every one removed
  full() { const s = this.read(); return { rev: s.rev, shared: s.remotes.map(({ name, buttons }) => ({ name, buttons })),
                                           forget: Object.keys(s.forgot) }; }

  learn(remote: Remote | Reported, now = new Date()): boolean {
    const r = cleanRemote(remote);
    if (!r) return false;
    const s = this.read();
    const had = s.remotes.find((k) => k.name === r.name);
    if (had && JSON.stringify(had.buttons) === JSON.stringify(r.buttons) && !s.forgot[r.name]) return true;
    delete s.forgot[r.name];
    s.remotes = [...s.remotes.filter((k) => k.name !== r.name), { ...r, at: now.toISOString() }].slice(-MAX);
    this.write(s);
    return true;
  }

  forget(name: unknown, now = new Date()): boolean {
    const n = cleanName(name);
    const s = this.read();
    if (!n || (!s.remotes.some((k) => k.name === n) && s.forgot[n])) return false;
    s.remotes = s.remotes.filter((k) => k.name !== n);
    s.forgot[n] = now.toISOString();
    this.write(s);
    return true;
  }

  // renamed on the site (C-59): the old name removed everywhere, the codes kept under the new one
  rename(from: unknown, to: unknown, now = new Date()): boolean {
    const was = this.read().remotes.find((k) => k.name === cleanName(from)), name = cleanName(to);
    if (!was || !name || was.name === name) return false;
    this.forget(was.name, now);
    return this.learn({ name, buttons: was.buttons }, now);
  }

  // What a board reports it knows. New to the list: added, unless removed here and not taught again on the board.
  // Known with other codes: the board's win only if it taught it again itself. Removed on the board: removed.
  merge(known: Reported[], forgot: unknown[], now = new Date()) {
    for (const f of forgot) this.forget(f, now);
    for (const k of known) {
      const r = cleanRemote(k);
      if (!r) continue;
      const s = this.read(), had = s.remotes.find((x) => x.name === r.name);
      if (k.fresh) this.learn(r, now);
      else if (!had && !s.forgot[r.name]) this.learn(r, now);
    }
  }
}
