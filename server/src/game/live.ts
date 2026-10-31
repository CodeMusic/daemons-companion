// C-261 (the user, 2026-10-31: "why does the game have to restart midplay"): SYNC's writes put into the running game.
// The game keeps its save in memory and writes that over the cartridge's at its next save, so a SYNC that changed only
// the file would be undone -- which is why the app started the game again (CONTINUE) after one. Instead, what SYNC
// changed goes into the game's memory too: the app takes the running game as mGBA keeps it (EmulatorJS's getState),
// finds each stretch SYNC changed by the bytes around it as the save had them, writes the new bytes there and loads it
// back, and play goes on from the same frame. Nothing is assumed about where the game keeps its save: the save's own
// sectors say which bytes changed, and the game's memory is searched for them. Only when every stretch is found, in no
// more places than a save is kept, is anything written; otherwise the app starts the game again from the save, as before.
// No node: imports (it runs on the phone).
import { LAYOUT, newer, readSlot, sectionSize, type Layout } from "../save/reader.js";

// One stretch SYNC changed: windows of the save as it was to find it by (smallest first) and where the stretch sits from
// each -- around it, or for a stretch among empty bytes, elsewhere in its section -- the bytes it held, and the new ones.
// `twice`: in the party, which the game keeps twice (its save block and the party it plays with) -- found in both or none.
export interface Patch { windows: { before: Uint8Array; at: number }[]; was: Uint8Array; after: Uint8Array; twice: boolean }
// mGBA's GBA state (src/gba/serialize.h): its version in the top byte of the first word, then EWRAM's 256 KiB at
// 0x21000 -- where the game keeps its save blocks and the party it plays with
export const WRAM_AT = 0x21000, WRAM_SIZE = 0x40000;
// EmulatorJS is RetroArch, which keeps a core's state in its own wrapping: "RASTATE", a version byte, then blocks of a
// four-letter name and a little-endian length, each padded to 8 -- the core's own in "MEM ". The mGBA state, either way.
export function coreState(state: Uint8Array): Uint8Array | null {
  let core = state;
  if (String.fromCharCode(...state.subarray(0, 7)) === "RASTATE") {
    let at = 8, found: Uint8Array | null = null;
    while (at + 8 <= state.length) {
      const name = String.fromCharCode(...state.subarray(at, at + 4)), size = view(state, at + 4).getUint32(0, true);
      if (name === "MEM ") { found = state.subarray(at + 8, at + 8 + size); break; }
      if (name === "END " || !size) break;
      at += 8 + Math.ceil(size / 8) * 8;
    }
    if (!found) return null;
    core = found;
  }
  return core.length >= WRAM_AT + WRAM_SIZE && core[3] === 0x01 ? core : null;
}
const RADII = [24, 64, 160];
const MAX_HITS = 3;          // the save block, the party the game plays with, and a buffer the save was written through
const DISTINCT = 16;         // a window with fewer bytes that are not zero says too little to be found by
const ANCHOR = 32, ANCHORS = 16;

const view = (b: Uint8Array, at: number) => new DataView(b.buffer, b.byteOffset + at);
function slotOf(save: Uint8Array, l: Layout): 0 | 1 | null {
  const a = readSlot(save, 0, l), b = readSlot(save, 1, l);
  if (!a && !b) return null;
  return a && (!b || newer(a, b)) ? 0 : 1;
}

// What SYNC changed between the save the game has and the one SYNC wrote, or null when it is not a change SYNC makes
// (another slot, sectors moved, a different size) -- then the game is started again from the save instead
export function livePlan(before: Uint8Array, after: Uint8Array, l: Layout = LAYOUT): Patch[] | null {
  if (before.length !== after.length) return null;
  const i = slotOf(after, l);                              // SYNC writes the newest slot in place
  if (i === null || slotOf(before, l) !== i) return null;
  const lo = i * l.sectors_per_slot * l.sector_size, hi = lo + l.sectors_per_slot * l.sector_size;
  for (let k = 0; k < before.length; k++) if ((k < lo || k >= hi) && before[k] !== after[k]) return null;
  const patches: Patch[] = [];
  for (let s = 0; s < l.sectors_per_slot; s++) {
    const off = lo + s * l.sector_size, id = view(after, off).getUint16(0xff4, true);
    if (view(before, off).getUint16(0xff4, true) !== id) return null;
    const size = sectionSize(id, l);
    for (let k = size; k < 0xff4; k++) if (before[off + k] !== after[off + k]) return null;
    const differs = (k: number) => before[off + k] !== after[off + k];
    const distinct = (w: Uint8Array) => w.reduce((n, x) => n + (x ? 1 : 0), 0) >= DISTINCT;
    const changed: [number, number][] = [];
    for (let k = 0; k < size; ) {
      if (!differs(k)) { k++; continue; }
      let e = k + 1;                                       // near changes together: up to 8 unchanged bytes between
      for (let j = e; j < size && j - e <= 8; j++) if (differs(j)) e = j + 1;
      changed.push([k, e]);
      k = e;
    }
    for (const [k, e] of changed) {
      const windows: Patch["windows"] = [], add = (ws: number, we: number) => {
        ws = Math.max(0, ws); we = Math.min(size, we);
        if (we - ws < 8 || windows.some((w) => w.at === k - ws && w.before.length === we - ws)) return;
        const w = before.slice(off + ws, off + we);
        if (distinct(w)) windows.push({ before: w, at: k - ws });
      };
      for (const r of RADII) { add(k - r, e + r); add(k, e + 2 * r); add(k - 2 * r, e); }
      const twice = id === 1 && k < l.party_offset + 6 * l.pokemon_size && e > l.party_offset;
      if (!twice) {                                        // anchors: the nearest distinct stretches no change touches
        const free = (ws: number) => !changed.some(([a, b]) => a < ws + ANCHOR && b > ws);
        const starts: number[] = [];
        for (let ws = 0; ws + ANCHOR <= size; ws += ANCHOR / 2) if (free(ws)) starts.push(ws);
        starts.sort((a, b) => Math.abs(a - k) - Math.abs(b - k));
        let n = 0;
        for (const ws of starts) { if (n >= ANCHORS) break; const before0 = windows.length; add(ws, ws + ANCHOR); if (windows.length > before0) n++; }
      }
      patches.push({ windows, was: before.slice(off + k, off + e), after: after.slice(off + k, off + e), twice });
    }
  }
  return patches;
}

// Where `needle` is in `hay`, up to `limit` places
export function find(hay: Uint8Array, needle: Uint8Array, limit: number): number[] {
  const hits: number[] = [], n = needle.length, first = needle[0];
  outer: for (let i = 0; i + n <= hay.length; i++) {
    if (hay[i] !== first) continue;
    for (let j = 1; j < n; j++) if (hay[i + j] !== needle[j]) continue outer;
    hits.push(i);
    if (hits.length >= limit) break;
  }
  return hits;
}

// The plan written into a state, in place: every stretch found first, then all written -- or nothing, and why. The
// save mGBA keeps beside the state, when it is there, is given SYNC's too, so loading the state never brings back the old
export function applyPlan(state: Uint8Array, patches: Patch[], save?: { before: Uint8Array; after: Uint8Array }):
    { ok: true; places: number } | { ok: false; why: string } {
  const core = coreState(state);
  if (!core) return { ok: false, why: `not a state mGBA wrote (${[...state.subarray(0, 8)].map((b) => b.toString(16).padStart(2, "0")).join(" ")})` };
  const ram = core.subarray(WRAM_AT, WRAM_AT + WRAM_SIZE), writes: [number, Uint8Array][] = [];
  const holds = (a: number, b: Uint8Array) => a >= 0 && a + b.length <= ram.length && b.every((x, j) => ram[a + j] === x);
  for (const p of patches) {
    let at: number[] | null = null;
    for (const w of p.windows) {
      const places = [...new Set(find(ram, w.before, 8).map((h) => h + w.at))].filter((a) => holds(a, p.was));
      if (places.length >= (p.twice ? 2 : 1) && places.length <= MAX_HITS) { at = places; break; }
    }
    if (!at) return { ok: false, why: "a change SYNC made is not where the game keeps it -- the game moved on since its save" };
    for (const a of at) writes.push([a, p.after]);
  }
  for (const [a, b] of writes) ram.set(b, a);
  if (save) {
    const tail = core.subarray(WRAM_AT + WRAM_SIZE), n = save.before.length;
    for (const h of find(tail, save.before.subarray(0, 256), 2))
      if (h + n <= tail.length && find(tail.subarray(h, h + n), save.before, 1).length) { tail.set(save.after, h); break; }
  }
  return { ok: true, places: writes.length };
}
