// C-10: the app's half of AWAY (DAEMONS T-358, vision 9.25). The game only ASKS: its party menu sets ASKED on a daemon
// and saves. Opening that save, the app answers every request -- a daemon that is not AWAY goes AWAY (to the device),
// one that is AWAY comes home -- and clears ASKED. Both bits are in the daemon's flags byte, outside its own encrypted
// record and its checksum, but INSIDE the save sector's checksum, so the sector is re-signed. Only the newer valid
// slot is touched, in place; the API keeps a copy of the whole file before every write.
//
// The friendship a daemon builds on the device belongs to C-13, whose rules are still open: nothing here changes it.
import { LAYOUT, type Layout, readSlot, newer, readDaemon, sectionChecksum, sectionSize } from "./reader.js";

export interface Answer { slot: number; nickname: string; name: string; now: "away" | "home" }

const FOOTER_ID = 0xff4, FOOTER_CHECKSUM = 0xff6;

export function answerRequests(save: Uint8Array, l: Layout = LAYOUT): { save: Uint8Array; answered: Answer[] } {
  const a = readSlot(save, 0, l), b = readSlot(save, 1, l);
  if (!a && !b) throw new Error("neither save slot is valid -- not a DAEMONS save, or a damaged one");
  const index: 0 | 1 = a && (!b || newer(a, b)) ? 0 : 1;
  const out = save.slice();
  // where each section of that slot physically sits (the game rotates them within a slot)
  const where = new Map<number, number>();
  for (let s = 0; s < l.sectors_per_slot; s++) {
    const off = (index * l.sectors_per_slot + s) * l.sector_size;
    where.set(new DataView(out.buffer, off).getUint16(FOOTER_ID, true), off);
  }
  const at = (sb1Offset: number) => {
    const id = 1 + Math.floor(sb1Offset / l.sector_data_size);
    return { id, byte: where.get(id)! + (sb1Offset % l.sector_data_size) };
  };
  const count = Math.min(out[at(l.party_count_offset).byte], 6);
  const answered: Answer[] = [];
  const touched = new Set<number>();
  for (let i = 0; i < count; i++) {
    const recStart = l.party_offset + i * l.pokemon_size;
    const rec = new Uint8Array(l.pokemon_size);
    for (let k = 0; k < l.pokemon_size; k++) rec[k] = out[at(recStart + k).byte];
    const d = readDaemon(rec, i, l);                     // checks the record is whole before anything is written
    if (!d || !d.asked) continue;
    const f = at(recStart + l.flags_byte);
    let flags = out[f.byte] ^ (1 << l.away_bit);         // there if it was here, here if it was there
    flags &= ~(1 << l.asked_bit) & 0xff;
    out[f.byte] = flags;
    touched.add(f.id);
    answered.push({ slot: i, nickname: d.nickname, name: d.name, now: d.away ? "home" : "away" });
  }
  for (const id of touched) {
    const off = where.get(id)!;
    const sector = out.subarray(off, off + l.sector_size);
    new DataView(out.buffer, off).setUint16(FOOTER_CHECKSUM, sectionChecksum(sector, sectionSize(id, l)), true);
  }
  return { save: out, answered };
}
