// Builds synthetic DAEMONS saves for the tests -- the repository holds no real save, and development never touches
// the user's own. The builder writes exactly what the reader expects, as the game does: encrypted records with their
// checksums, and two slots of checksummed sectors.
import { LAYOUT as l, sectionSize, sectionChecksum } from "../src/save/reader.js";
import charmapJson from "../data/charmap.json" with { type: "json" };

const ORDERS = ["GAEM", "GAME", "GEAM", "GEMA", "GMAE", "GMEA", "AGEM", "AGME", "AEGM", "AEMG", "AMGE", "AMEG",
                "EGAM", "EGMA", "EAGM", "EAMG", "EMGA", "EMAG", "MGAE", "MGEA", "MAGE", "MAEG", "MEGA", "MEAG"];
const ENCODE: Record<string, number> = {};
for (const [hex, ch] of Object.entries((charmapJson as { bytes: Record<string, string> }).bytes)) ENCODE[ch] ??= parseInt(hex, 16);

export function encodeText(s: string, len: number): Uint8Array {
  const out = new Uint8Array(len).fill(0xff);
  [...s].slice(0, len).forEach((c, i) => (out[i] = ENCODE[c]));
  return out;
}

export interface DaemonSpec { personality: number; otId: number; species: number; nickname: string; level: number;
                              friendship?: number; away?: boolean; asked?: boolean; held?: number }

export function buildDaemon(d: DaemonSpec): Uint8Array {
  const rec = new Uint8Array(l.pokemon_size);
  const v = new DataView(rec.buffer);
  v.setUint32(0, d.personality >>> 0, true);
  v.setUint32(4, d.otId >>> 0, true);
  rec.set(encodeText(d.nickname, 10), 8);
  rec[18] = 2;                                              // language
  rec[l.flags_byte] = 0b10 | (d.away ? 1 << l.away_bit : 0) | (d.asked ? 1 << l.asked_bit : 0);
  const secure = new Uint8Array(48);
  const sv = new DataView(secure.buffer);
  const growth = ORDERS[d.personality % 24].indexOf("G") * 12;
  sv.setUint16(growth, d.species, true);
  sv.setUint8(growth + 9, d.friendship ?? 70);
  sv.setUint16(growth + 2, d.held ?? 0, true);
  let sum = 0;
  for (let i = 0; i < 48; i += 2) sum = (sum + sv.getUint16(i, true)) & 0xffff;
  v.setUint16(28, sum, true);
  const key = (d.personality ^ d.otId) >>> 0;
  for (let i = 0; i < 48; i += 4) v.setUint32(32 + i, (sv.getUint32(i, true) ^ key) >>> 0, true);
  rec[l.level_offset] = d.level;
  return rec;
}

// A whole save: both slots written, slot A with counterA and slot B with counterB, each holding its own party.
export function buildSave(opts: { player: string; trainerId: number; slots: { counter: number; party: DaemonSpec[] }[];
                                  edit?: (sb2: Uint8Array, sb1: Uint8Array) => void }): Uint8Array {
  const save = new Uint8Array(0x20000);
  opts.slots.forEach((slot, index) => {
    const sb2 = new Uint8Array(l.saveblock2_size);
    sb2.set(encodeText(opts.player, 7), 0);
    new DataView(sb2.buffer).setUint32(0x0a, opts.trainerId >>> 0, true);
    const sb1 = new Uint8Array(l.saveblock1_size);
    sb1[l.party_count_offset] = slot.party.length;
    slot.party.forEach((d, i) => sb1.set(buildDaemon(d), l.party_offset + i * l.pokemon_size));
    opts.edit?.(sb2, sb1);
    for (let id = 0; id < l.sectors_per_slot; id++) {
      const data = new Uint8Array(l.sector_size);
      const size = sectionSize(id);
      if (id === 0) data.set(sb2.subarray(0, size));
      else if (id <= 4) data.set(sb1.subarray((id - 1) * l.sector_data_size, (id - 1) * l.sector_data_size + size));
      const v = new DataView(data.buffer);
      v.setUint16(0xff4, id, true);
      v.setUint16(0xff6, sectionChecksum(data, size), true);
      v.setUint32(0xff8, l.signature, true);
      v.setUint32(0xffc, slot.counter >>> 0, true);
      // the game rotates sectors within a slot; write them rotated to prove the reader goes by id
      const physical = (id + slot.counter) % l.sectors_per_slot;
      save.set(data, (index * l.sectors_per_slot + physical) * l.sector_size);
    }
  });
  return save;
}
