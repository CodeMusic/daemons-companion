// C-10: the app's half of AWAY (DAEMONS T-358, vision 9.25). The game only ASKS: its party menu sets ASKED on a daemon
// and saves. Opening that save, the app answers every request -- a daemon that is not AWAY goes AWAY (to the device),
// one that is AWAY comes home -- and clears ASKED. Both bits are in the daemon's flags byte, outside its own encrypted
// record and its checksum, but INSIDE the save sector's checksum, so the sector is re-signed. Only the newer valid
// slot is touched, in place; the API keeps a copy of the whole file before every write.
//
// The friendship a daemon builds on the device belongs to C-13, whose rules are still open: nothing here changes it.
//
// C-21 (the user, 2026-10-04): it is now one SYNC. syncSave answers the requests -- ONE DAEMON AT A TIME: a request to
// send while another party daemon is already AWAY is left asked, and said so -- and, on the save the app is married to
// (C-22), writes the companion's two flags in SaveBlock2 (DAEMONS T-370): LINKED, which shows SEND in the game, set;
// and RECALLED, the game's note that a daemon came home without the app, read and cleared.
import P from "../../data/profile_layout.json" with { type: "json" };
import { LAYOUT, type Layout, readSlot, newer, readDaemon, sectionChecksum, sectionSize } from "./reader.js";

export interface Answer { slot: number; nickname: string; name: string; now: "away" | "home" }
export interface SyncResult { save: Uint8Array; answered: Answer[]; refused: string[]; firstLink: boolean; recalledSeen: boolean; changed: boolean }

const FOOTER_ID = 0xff4, FOOTER_CHECKSUM = 0xff6;

export function answerRequests(save: Uint8Array, l: Layout = LAYOUT): { save: Uint8Array; answered: Answer[] } {
  const r = syncSave(save, { link: false }, l);
  return { save: r.save, answered: r.answered };
}

export function syncSave(save: Uint8Array, opts: { link: boolean }, l: Layout = LAYOUT): SyncResult {
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
  const refused: string[] = [];
  const touched = new Set<number>();
  const party = [];
  for (let i = 0; i < count; i++) {
    const recStart = l.party_offset + i * l.pokemon_size;
    const rec = new Uint8Array(l.pokemon_size);
    for (let k = 0; k < l.pokemon_size; k++) rec[k] = out[at(recStart + k).byte];
    party.push({ i, recStart, d: readDaemon(rec, i, l) });   // checks each record is whole before anything is written
  }
  let away = party.filter((p) => p.d && p.d.away && !p.d.asked).length;   // carried, and staying carried
  for (const { i, recStart, d } of party) {
    if (!d || !d.asked) continue;
    if (!d.away && away > 0) { refused.push(d.nickname); continue; }      // one at a time: this one stays asked
    if (!d.away) away++;
    const f = at(recStart + l.flags_byte);
    let flags = out[f.byte] ^ (1 << l.away_bit);         // there if it was here, here if it was there
    flags &= ~(1 << l.asked_bit) & 0xff;
    out[f.byte] = flags;
    touched.add(f.id);
    answered.push({ slot: i, nickname: d.nickname, name: d.name, now: d.away ? "home" : "away" });
  }
  // The companion's flags, in SaveBlock2 (section 0): LINKED set, RECALLED read and cleared.
  let firstLink = false, recalledSeen = false;
  if (opts.link) {
    const start = P.flags.daemons_flags_start, sb2 = where.get(0)!;
    const bit = (f: number) => ({ byte: sb2 + P.sb2.daemons_flags + ((f - start) >> 3), mask: 1 << ((f - start) & 7) });
    const linked = bit(P.flags.companion_linked), recalled = bit(P.flags.companion_recalled);
    if (!(out[linked.byte] & linked.mask)) { out[linked.byte] |= linked.mask; firstLink = true; touched.add(0); }
    if (out[recalled.byte] & recalled.mask) { out[recalled.byte] &= ~recalled.mask & 0xff; recalledSeen = true; touched.add(0); }
  }
  for (const id of touched) {
    const off = where.get(id)!;
    const sector = out.subarray(off, off + l.sector_size);
    new DataView(out.buffer, off).setUint16(FOOTER_CHECKSUM, sectionChecksum(sector, sectionSize(id, l)), true);
  }
  return { save: out, answered, refused, firstLink, recalledSeen, changed: touched.size > 0 };
}
