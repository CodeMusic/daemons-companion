// C-219 (the user, 2026-10-28: "a trading mechanism ... we send one daemon out to the app and another user can trade
// with"; decided by multiple choice): the save's half of a trade. A daemon is traded only while it is AWAY -- it is the
// companion's then, not the game's -- so what goes to the exchange is its whole BoxPokemon as the save keeps it (80
// bytes: its own trainer, its own encryption), and what comes back is written by syncSave (writer.ts, `trade`) into the
// slot the one traded for it left. Read only here. No node: imports (the phone hosting alone runs it).
import { blocks, LAYOUT, type Layout, ORDERS, readDaemon, sectionSize, soundingShift, tradeBits } from "./reader.js";
import { readProfile } from "./profile.js";
import { levelFromExp } from "./growth.js";
import speciesJson from "../../data/species.json" with { type: "json" };

const SPECIES = speciesJson as unknown as Record<string, { name: string; growth?: number }>;

// Who a save is: the game's own identity, as C-22's marriage and C-188's mirror know it -- never a file path, so a trade
// follows the game whichever save the companion is reading now (C-215)
export interface GameKey { name: string; trainerId: number; secretId: number }
export const gameOf = (save: Uint8Array): GameKey => { const p = readProfile(save); return { name: p.name, trainerId: p.trainerId, secretId: p.secretId }; };
export const gameId = (g: GameKey) => `${g.name}/${g.trainerId >>> 0}/${g.secretId >>> 0}`;
export const sameGame = (a: GameKey, b: GameKey) => gameId(a) === gameId(b);

export interface Traded { personality: number; species: number; name: string; nickname: string; level: number; otId: number; record: Uint8Array }

// What the record says, for the exchange's listing (and to check one that came from elsewhere is whole)
export function describe(record: Uint8Array, l: Layout = LAYOUT): Omit<Traded, "record"> | null {
  if (record.length !== l.box_pokemon_size) return null;
  let d;
  try { d = readDaemon(record, 0, l); } catch { return null; }   // its checksum fails
  if (!d || !SPECIES[String(d.species)]) return null;
  return { personality: d.personality >>> 0, species: d.species, name: d.name, nickname: d.nickname, otId: d.otId >>> 0,
           level: levelFromExp(SPECIES[String(d.species)]?.growth ?? 0, d.exp) };
}

// An AWAY daemon's record, from the party or the boxes, by its personality -- or why it cannot be traded
export function tradeRecord(save: Uint8Array, personality: number, l: Layout = LAYOUT): Traded | string {
  const { slot, sb1 } = blocks(save, l);
  const count = Math.min(sb1[l.party_count_offset], 6);
  const records: Uint8Array[] = [];
  for (let i = 0; i < count; i++) records.push(sb1.subarray(l.party_offset + i * l.pokemon_size, l.party_offset + i * l.pokemon_size + l.box_pokemon_size));
  const storage = new Uint8Array(l.storage_size);
  for (let id = 5; id <= 13; id++) { const sec = slot.sections.get(id); if (sec) storage.set(sec.subarray(0, sectionSize(id, l)), (id - 5) * l.sector_data_size); }
  for (let i = 0; i < 14 * 30; i++) records.push(storage.subarray(4 + i * l.box_pokemon_size, 4 + (i + 1) * l.box_pokemon_size));
  const rec = records.find((r) => r[l.flags_byte] & 0b10 && new DataView(r.buffer, r.byteOffset).getUint32(0, true) === personality >>> 0);
  if (!rec) return "that daemon is not in this save";                                     // DRAFT
  if (!(rec[l.flags_byte] & (1 << l.away_bit))) return "only a daemon AWAY can be traded -- SEND it from the game first";   // DRAFT
  const record = rec.slice();
  const tb = tradeBits(l);
  record[l.flags_byte] &= ~((1 << l.away_bit) | (1 << l.asked_bit) | (3 << soundingShift(l)) | tb.trading) & 0xff;   // the companion's bits are this save's, not the daemon's
  const v = new DataView(record.buffer);
  v.setUint16(tb.at, v.getUint16(tb.at, true) & ~(tb.loan | tb.tradedIn | tb.partnerMask) & 0xffff, true);
  const d = describe(record, l);
  return d ? { ...d, record } : "that daemon's record is damaged";                        // DRAFT
}

// A record arriving: whole, or null -- AWAY set (it arrives on the companion, as HANDSHAKE does), ASKED, its sounding and
// TRADING cleared. A SWAP is marked for the game to finish on load (DAEMONS T-473): the marker (unusedRibbons bit 2, the
// u32 at Misc+8, bit 29, as C-184) re-summed and sealed under its own key, TRADED_IN set, and LOAN for a loan -- so the
// INDEX takes it and it trade-evolves, unless it is borrowed. A loan's RETURN is the player's own coming home: nothing to
// finish, LOAN cleared.
export function arriving(record: Uint8Array, l: Layout = LAYOUT, how: { loan?: boolean; phase?: "swap" | "return"; partner?: number } = {}): Uint8Array | null {
  if (!describe(record, l)) return null;
  const tb = tradeBits(l), r = record.slice(), v = new DataView(r.buffer);
  r[l.flags_byte] = (r[l.flags_byte] & ~((1 << l.asked_bit) | (3 << soundingShift(l)) | tb.trading) & 0xff) | (1 << l.away_bit);
  const swap = how.phase !== "return";
  // T-474: on a swap, the species given for it (the engine's id) beside TRADED_IN, for a pair evolution
  const partner = swap ? ((how.partner ?? 0) << tb.partnerShift) & tb.partnerMask : 0;
  const flags = v.getUint16(tb.at, true) & ~(tb.loan | tb.tradedIn | tb.partnerMask) & 0xffff;
  v.setUint16(tb.at, swap ? flags | tb.tradedIn | (how.loan ? tb.loan : 0) | partner : flags, true);
  const personality = v.getUint32(0, true), key = (personality ^ v.getUint32(4, true)) >>> 0;
  const plain = new DataView(new ArrayBuffer(48));
  for (let k = 0; k < 48; k += 4) plain.setUint32(k, (v.getUint32(32 + k, true) ^ key) >>> 0, true);
  const misc = ORDERS[personality % 24].indexOf("M") * 12;
  const ribbons = plain.getUint32(misc + 8, true);           // a return clears a marker the borrower's game never finished
  plain.setUint32(misc + 8, (swap ? ribbons | (1 << 29) : ribbons & ~(1 << 29)) >>> 0, true);
  let sum = 0;
  for (let k = 0; k < 48; k += 2) sum = (sum + plain.getUint16(k, true)) & 0xffff;
  v.setUint16(28, sum, true);
  for (let k = 0; k < 48; k += 4) v.setUint32(32 + k, (plain.getUint32(k, true) ^ key) >>> 0, true);
  return r;
}

// base64, both ways, without Buffer (the phone has none)
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
export function toB64(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i += 3) {
    const n = (b[i] << 16) | ((b[i + 1] ?? 0) << 8) | (b[i + 2] ?? 0);
    s += B64[n >> 18] + B64[(n >> 12) & 63] + (i + 1 < b.length ? B64[(n >> 6) & 63] : "=") + (i + 2 < b.length ? B64[n & 63] : "=");
  }
  return s;
}
export function fromB64(s: string): Uint8Array | null {
  if (typeof s !== "string" || !/^[A-Za-z0-9+/]*={0,2}$/.test(s) || s.length % 4) return null;
  const out: number[] = [];
  for (let i = 0; i < s.length; i += 4) {
    const n = [0, 1, 2, 3].map((k) => (s[i + k] === "=" ? 0 : B64.indexOf(s[i + k])));
    const v = (n[0] << 18) | (n[1] << 12) | (n[2] << 6) | n[3];
    out.push(v >> 16);
    if (s[i + 2] !== "=") out.push((v >> 8) & 255);
    if (s[i + 3] !== "=") out.push(v & 255);
  }
  return Uint8Array.from(out);
}
