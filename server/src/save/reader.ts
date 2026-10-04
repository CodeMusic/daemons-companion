// C-02: reading a DAEMONS save. Read only -- writing (AWAY, C-10) is save/writer.ts, behind a backup.
//
// A Gen 3 save holds two slots of 14 sectors; each sector is 4 KiB: 3968 bytes of data and a footer (its section id,
// its checksum, a signature, and the save counter). The game writes the two slots in turn, so the newer slot whose
// every section checks out is the save. Everything about the layout comes from data/save_layout.json, which DAEMONS
// exports from the built game -- nothing here is guessed.
import layoutJson from "../../data/save_layout.json" with { type: "json" };
import speciesJson from "../../data/species.json" with { type: "json" };
import charmapJson from "../../data/charmap.json" with { type: "json" };
import itemsJson from "../../data/items.json" with { type: "json" };

export type Layout = typeof layoutJson;
export const LAYOUT: Layout = layoutJson;

type SpeciesRow = { constant: string; national: number | null; name: string; types: string[]; category: string | null };
const SPECIES = speciesJson as unknown as Record<string, SpeciesRow>;
const CHARS = (charmapJson as { bytes: Record<string, string> }).bytes;
const ITEMS = itemsJson as unknown as Record<string, { name: string; description: string }>;

export interface PartyDaemon {
  slot: number;            // 0-5 in the party
  personality: number;     // with otId, the daemon's identity -- never the slot
  otId: number;
  species: number;         // the game's internal species id
  name: string;            // our name for the species
  nickname: string;
  level: number;
  friendship: number;
  moves: number[];         // its four routines' move ids, 0 for an empty slot (C-18: the streaks)
  heldItem: number;        // C-31: the item it holds, 0 for none -- it goes with it to the device
  holding: string | null;  // that item's name, as the game names it
  away: boolean;           // on the companion's device (T-358)
  asked: boolean;          // the game's half of a send or return, waiting for the app
}

export interface SaveRead {
  slot: "A" | "B";
  counter: number;
  playerName: string;
  trainerId: number;
  party: PartyDaemon[];
}

const FOOTER_ID = 0xff4, FOOTER_CHECKSUM = 0xff6, FOOTER_SIGNATURE = 0xff8, FOOTER_COUNTER = 0xffc;

// How many bytes of each section's data the game checksums (and stores).
export function sectionSize(id: number, l: Layout = LAYOUT): number {
  const d = l.sector_data_size;
  if (id === 0) return l.saveblock2_size;
  if (id >= 1 && id <= 4) return Math.min(d, l.saveblock1_size - (id - 1) * d);
  if (id >= 5 && id <= 13) return Math.min(d, l.storage_size - (id - 5) * d);
  throw new Error(`no section ${id}`);
}

// The game's checksum: the u32 sum of the data, folded into 16 bits.
export function sectionChecksum(data: Uint8Array, size: number): number {
  const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let sum = 0;
  for (let i = 0; i + 4 <= size; i += 4) sum = (sum + v.getUint32(i, true)) >>> 0;
  return ((sum >>> 16) + sum) & 0xffff;
}

export interface Slot { counter: number; sections: Map<number, Uint8Array> }

export function readSlot(save: Uint8Array, index: 0 | 1, l: Layout = LAYOUT): Slot | null {
  const sections = new Map<number, Uint8Array>();
  let counter = -1;
  for (let s = 0; s < l.sectors_per_slot; s++) {
    const off = (index * l.sectors_per_slot + s) * l.sector_size;
    if (off + l.sector_size > save.length) return null;
    const sector = save.subarray(off, off + l.sector_size);
    const v = new DataView(sector.buffer, sector.byteOffset, sector.byteLength);
    if (v.getUint32(FOOTER_SIGNATURE, true) !== l.signature) return null;
    const id = v.getUint16(FOOTER_ID, true);
    if (id >= l.sectors_per_slot || sections.has(id)) return null;
    const size = sectionSize(id, l);
    if (sectionChecksum(sector, size) !== v.getUint16(FOOTER_CHECKSUM, true)) return null;
    sections.set(id, sector.subarray(0, l.sector_data_size));
    counter = v.getUint32(FOOTER_COUNTER, true);
  }
  return sections.size === l.sectors_per_slot ? { counter, sections } : null;
}

// The newer of two valid slots; a counter that wrapped (0xFFFFFFFF then 0) still reads as newer.
export function newer(a: Slot, b: Slot): boolean {
  if (a.counter === 0xffffffff && b.counter === 0) return false;
  if (b.counter === 0xffffffff && a.counter === 0) return true;
  return a.counter >= b.counter;
}

export function decodeText(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) {
    if (b === 0xff) break;
    s += CHARS[b.toString(16).toUpperCase().padStart(2, "0")] ?? "?";
  }
  return s;
}

// The four 12-byte substructs come in one of 24 orders, chosen by personality % 24 (G growth, A attacks, E EVs, M misc).
const ORDERS = ["GAEM", "GAME", "GEAM", "GEMA", "GMAE", "GMEA", "AGEM", "AGME", "AEGM", "AEMG", "AMGE", "AMEG",
                "EGAM", "EGMA", "EAGM", "EAMG", "EMGA", "EMAG", "MGAE", "MGEA", "MAGE", "MAEG", "MEGA", "MEAG"];

// One daemon's record: null for an empty slot, an error for a record whose own checksum fails (a bad egg).
export function readDaemon(rec: Uint8Array, slot: number, l: Layout = LAYOUT): PartyDaemon | null {
  const v = new DataView(rec.buffer, rec.byteOffset, rec.byteLength);
  const personality = v.getUint32(0, true), otId = v.getUint32(4, true);
  const flags = rec[l.flags_byte];
  if (!(flags & 0b10)) return null;                         // hasSpecies clear: an empty slot
  const key = (personality ^ otId) >>> 0;
  const secure = new Uint8Array(48);
  const sv = new DataView(secure.buffer);
  for (let i = 0; i < 48; i += 4) sv.setUint32(i, (v.getUint32(32 + i, true) ^ key) >>> 0, true);
  let sum = 0;
  for (let i = 0; i < 48; i += 2) sum = (sum + sv.getUint16(i, true)) & 0xffff;
  if (sum !== v.getUint16(28, true)) throw new Error(`party slot ${slot}: the record's checksum fails`);
  const growth = ORDERS[personality % 24].indexOf("G") * 12;
  const species = sv.getUint16(growth, true);
  const heldItem = sv.getUint16(growth + 2, true);
  const attacks = ORDERS[personality % 24].indexOf("A") * 12;
  const moves = [0, 1, 2, 3].map((k) => sv.getUint16(attacks + 2 * k, true));
  return {
    slot, personality, otId, species,
    name: SPECIES[String(species)]?.name ?? `#${species}`,
    nickname: decodeText(rec.subarray(8, 18)),
    level: rec.length > l.level_offset ? rec[l.level_offset] : 0,
    friendship: sv.getUint8(growth + 9),
    moves,
    heldItem,
    holding: heldItem ? ITEMS[String(heldItem)]?.name ?? `item #${heldItem}` : null,
    away: !!(flags & (1 << l.away_bit)),
    asked: !!(flags & (1 << l.asked_bit)),
  };
}

// The save as the game would load it: the newer valid slot, SaveBlock2 (section 0) and SaveBlock1 (sections 1-4, end
// to end). The party reader and the PROFILE (save/profile.ts) both read from here.
export function blocks(save: Uint8Array, l: Layout = LAYOUT) {
  const a = readSlot(save, 0, l), b = readSlot(save, 1, l);
  if (!a && !b) throw new Error("neither save slot is valid -- not a DAEMONS save, or a damaged one");
  const useA = !!a && (!b || newer(a, b));
  const slot = (useA ? a : b)!;
  const sb2 = slot.sections.get(0)!;
  const sb1 = new Uint8Array(l.saveblock1_size);
  for (let id = 1; id <= 4; id++) sb1.set(slot.sections.get(id)!.subarray(0, sectionSize(id, l)), (id - 1) * l.sector_data_size);
  return { useA, slot, sb1, sb2 };
}

export function readSave(save: Uint8Array, l: Layout = LAYOUT): SaveRead {
  const { useA, slot, sb1, sb2 } = blocks(save, l);
  const count = Math.min(sb1[l.party_count_offset], 6);
  const party: PartyDaemon[] = [];
  for (let i = 0; i < count; i++) {
    const off = l.party_offset + i * l.pokemon_size;
    const d = readDaemon(sb1.subarray(off, off + l.pokemon_size), i, l);
    if (d) party.push(d);
  }
  return {
    slot: useA ? "A" : "B",
    counter: slot.counter,
    playerName: decodeText(sb2.subarray(0, 7)),
    trainerId: new DataView(sb2.buffer, sb2.byteOffset).getUint32(0x0a, true),
    party,
  };
}
