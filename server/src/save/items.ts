// C-223: an ITEM given, nothing back. What a save may give: the bag's ITEMS, BALLS and BERRIES pockets and the PC's
// items -- never a key item or a PLUGIN (their pockets are not read here). The giver's SYNC takes the count out (the bag
// first, then the PC) and closes the pocket up behind an emptied slot, as the game's compaction does; the receiver's puts
// it in the PC, stacked onto the same item while it stays at or under 999, else in the first empty slot (AddPCItem's
// rule). Bag quantities are XOR the low 16 bits of SaveBlock2's encryption key; the PC's are plain (DAEMONS' engine,
// checked by the narrative lane 2026-10-29). The pockets' offsets come from profile_layout (companion_export); a layout
// without them gives nothing and takes nothing. No node: imports.
import profileJson from "../../data/profile_layout.json" with { type: "json" };
import itemsJson from "../../data/items.json" with { type: "json" };
import { blocks, LAYOUT, type Layout } from "./reader.js";

export type Pocket = "ITEMS" | "BALLS" | "BERRIES" | "PC";
export type Pockets = Partial<Record<Pocket, { at: number; count: number }>>;
export const PC_MAX = 999;
const ITEMS = itemsJson as unknown as Record<string, { name: string; pocket?: string; importance?: number }>;

export function pocketsOf(sb1: Record<string, number | undefined> = (profileJson as any).sb1): Pockets {
  const p: Pockets = {};
  const one = (k: Pocket, at?: number, count?: number) => { if (at != null && count) p[k] = { at, count }; };
  one("ITEMS", sb1.items_pocket, sb1.items_count);
  one("BALLS", sb1.balls_pocket, sb1.balls_count);
  one("BERRIES", sb1.berries_pocket, sb1.berries_count);
  one("PC", sb1.pc_items, sb1.pc_items_count);
  return p;
}
// an item the companion will offer: importance 0 where items.json says (when it does not, the pockets read are the rule)
export const giftable = (id: number) => id > 0 && (ITEMS[String(id)]?.importance ?? 0) === 0;
export const itemName = (id: number) => ITEMS[String(id)]?.name ?? `ITEM ${id}`;

// SaveBlock1's slots as 16-bit words, wherever they sit: the reader's copy, or the writer's sectors
export interface Words { get(off: number): number; set(off: number, v: number): void }
const BAG: Pocket[] = ["ITEMS", "BALLS", "BERRIES"];

function slots(w: Words, pk: Pockets, key: number, where: Pocket) {
  const p = pk[where]!, mask = where === "PC" ? 0 : key & 0xffff;
  return Array.from({ length: p.count }, (_, i) => ({ off: p.at + i * 4, id: w.get(p.at + i * 4), n: (w.get(p.at + i * 4 + 2) ^ mask) & 0xffff, mask }));
}

// what this save holds that it may give: each item once, its whole count across the bag and the PC
export function giftableItems(save: Uint8Array, pk: Pockets = pocketsOf(), l: Layout = LAYOUT): { item: number; count: number; name: string }[] {
  const { sb1, sb2 } = blocks(save, l), v1 = new DataView(sb1.buffer, sb1.byteOffset), v2 = new DataView(sb2.buffer, sb2.byteOffset);
  const key = (profileJson as any).sb2.encryption_key != null ? v2.getUint32((profileJson as any).sb2.encryption_key, true) : 0;
  const w: Words = { get: (o) => v1.getUint16(o, true), set: () => {} };
  const held = new Map<number, number>();
  for (const where of [...BAG, "PC" as Pocket]) if (pk[where]) for (const s of slots(w, pk, key, where)) if (s.id && s.n && giftable(s.id)) held.set(s.id, (held.get(s.id) ?? 0) + s.n);
  return [...held].map(([item, count]) => ({ item, count, name: itemName(item) })).sort((a, b) => a.name.localeCompare(b.name));
}

// close a pocket up behind its emptied slots (the game's compaction: the held first, in order, then the empty)
function compact(w: Words, pk: Pockets, where: Pocket) {
  const p = pk[where]!, kept: [number, number][] = [];
  for (let i = 0; i < p.count; i++) { const id = w.get(p.at + i * 4), raw = w.get(p.at + i * 4 + 2); if (id) kept.push([id, raw]); }
  for (let i = 0; i < p.count; i++) { const [id, raw] = kept[i] ?? [0, 0]; w.set(p.at + i * 4, id); w.set(p.at + i * 4 + 2, id ? raw : 0); }
}
// take `count` of an item out (the bag first, then the PC); false, and nothing changed, when the save holds fewer
export function takeItem(w: Words, pk: Pockets, key: number, item: number, count: number): boolean {
  const from = [...BAG, "PC" as Pocket].filter((k) => pk[k]);
  const all = from.flatMap((k) => slots(w, pk, key, k).filter((s) => s.id === item && s.n).map((s) => ({ ...s, where: k })));
  if (!giftable(item) || all.reduce((n, s) => n + s.n, 0) < count) return false;
  let left = count;
  const emptied = new Set<Pocket>();
  for (const s of all) {
    if (!left) break;
    const take = Math.min(left, s.n), n = s.n - take;
    left -= take;
    if (n) w.set(s.off + 2, (n ^ s.mask) & 0xffff);
    else { w.set(s.off, 0); w.set(s.off + 2, 0); emptied.add(s.where); }
  }
  for (const k of emptied) compact(w, pk, k);
  return true;
}
// put `count` of an item in the PC; false, and nothing changed, when there is no room
export function putItem(w: Words, pk: Pockets, item: number, count: number): boolean {
  if (!pk.PC || !giftable(item)) return false;
  const s = slots(w, pk, 0, "PC");
  const same = s.find((x) => x.id === item && x.n + count <= PC_MAX), empty = s.find((x) => !x.id);
  if (same) { w.set(same.off + 2, same.n + count); return true; }
  if (!empty) return false;
  w.set(empty.off, item); w.set(empty.off + 2, count);
  return true;
}
