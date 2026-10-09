// C-10: the app's half of AWAY (DAEMONS T-358, vision 9.25). The game only ASKS: its party menu sets ASKED on a daemon
// and saves. Opening that save, the app answers every request -- a daemon that is not AWAY goes AWAY (to the device),
// one that is AWAY comes home -- and clears ASKED. Both bits are in the daemon's flags byte, outside its own encrypted
// record and its checksum, but INSIDE the save sector's checksum, so the sector is re-signed. Only the newer valid
// slot is touched, in place; the API keeps a copy of the whole file before every write.
//
// C-15: meeting other companions nearby is written here too -- the INDEX sees their daemons, and the carried daemon's
// friendship grows a little (`met`).
//
// C-21 (the user, 2026-10-04): it is now one SYNC. syncSave answers the requests -- every one: C-80 (the user,
// 2026-10-08) put a daemon in each device, so any number may be AWAY; the game itself keeps the last one able to battle
// at home. `refused` holds the one exception: a SYNC that would leave nobody home keeps the last one there (T-397) -- and, on the save the app is married to
// (C-22), writes the companion's two flags in SaveBlock2 (DAEMONS T-370): LINKED, which shows SEND in the game, set;
// and RECALLED, the game's note that a daemon came home without the app, read and cleared.
import P from "../../data/profile_layout.json" with { type: "json" };
import speciesJson from "../../data/species.json" with { type: "json" };
import { expFor, levelFromExp } from "./growth.js";
import { calcStats, unpackIVs } from "./stats.js";

const SPECIES = speciesJson as unknown as Record<string, any>;
import { LAYOUT, type Layout, ORDERS, readSlot, newer, readDaemon, sectionChecksum, sectionSize } from "./reader.js";

export interface Answer { slot: number; nickname: string; name: string; now: "away" | "home" }
export interface SyncResult { save: Uint8Array; answered: Answer[]; refused: string[]; firstLink: boolean; recalledSeen: boolean;
                              changed: boolean; newlySeen: number[]; friendship: { nickname: string; from: number; to: number } | null;
                              grew: { nickname: string; personality: number; exp: number; from: number; to: number } | null }
// C-15: what the companion met nearby since the last SYNC -- species to mark SEEN (by national number), and how much
// friendship the carried daemon gained by it
export interface Meetings { seen: number[]; friendship: number }
// C-45: the experience a daemon gained on the device, for it by its personality, written when it is home
export interface Growth { personality: number; exp: number }


const FOOTER_ID = 0xff4, FOOTER_CHECKSUM = 0xff6;

export function answerRequests(save: Uint8Array, l: Layout = LAYOUT): { save: Uint8Array; answered: Answer[] } {
  const r = syncSave(save, { link: false }, l);
  return { save: r.save, answered: r.answered };
}

// grow: C-80 -- several daemons may have experience waiting; the first of them that is home after this SYNC is written
export function syncSave(save: Uint8Array, opts: { link: boolean; met?: Meetings; grow?: Growth | Growth[] }, l: Layout = LAYOUT): SyncResult {
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
  const party: { i: number; recStart: number; d: ReturnType<typeof readDaemon> }[] = [];
  for (let i = 0; i < count; i++) {
    const recStart = l.party_offset + i * l.pokemon_size;
    const rec = new Uint8Array(l.pokemon_size);
    for (let k = 0; k < l.pokemon_size; k++) rec[k] = out[at(recStart + k).byte];
    party.push({ i, recStart, d: readDaemon(rec, i, l) });   // checks each record is whole before anything is written
  }
  // T-397 (the user, 2026-10-09: "you always need one in your party for game purposes"): the game refuses to ask for the
  // last one here (DAEMONS T-358, T-396), and this is the same rule kept on this side -- a save edited elsewhere, or one
  // the game's checks missed, still never leaves the party empty. The last one asked stays asked, and is said so.
  const homeAfter = party.filter(({ d }) => d && (d.asked ? d.away : !d.away)).length;
  const keepHome = homeAfter === 0 ? [...party].reverse().find(({ d }) => d && d.asked && !d.away) : undefined;
  if (keepHome?.d) refused.push(`${keepHome.d.nickname || keepHome.d.name} stays: one daemon always stays in the party.`);   // DRAFT
  for (const { i, recStart, d } of party) {
    if (!d || !d.asked || keepHome?.i === i) continue;
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
  // C-15: the INDEX sees what was met -- the bit set in all three copies the game keeps, or it does not believe it
  const newlySeen: number[] = [];
  let friendship: SyncResult["friendship"] = null;
  if (opts.met) {
    const sb2 = where.get(0)!;
    for (const n of new Set(opts.met.seen)) {
      if (!n) continue;
      const i = (n - 1) >> 3, mask = 1 << ((n - 1) & 7);
      if (out[sb2 + P.sb2.index_seen + i] & mask) continue;
      out[sb2 + P.sb2.index_seen + i] |= mask; touched.add(0);
      for (const copy of [P.sb1.seen1, P.sb1.seen2]) { const c = at(copy + i); out[c.byte] |= mask; touched.add(c.id); }
      newlySeen.push(n);
    }
    // and the carried daemon's friendship grows: inside its encrypted record, so decrypted, changed, re-summed, sealed
    const carried = party.find((p) => p.d && p.d.away);
    if (carried && carried.d && opts.met.friendship > 0) {
      const rec = new Uint8Array(l.pokemon_size);
      for (let k = 0; k < l.pokemon_size; k++) rec[k] = out[at(carried.recStart + k).byte];
      const v = new DataView(rec.buffer);
      const personality = v.getUint32(0, true), key = (personality ^ v.getUint32(4, true)) >>> 0;
      const plain = new DataView(new ArrayBuffer(48));
      for (let k = 0; k < 48; k += 4) plain.setUint32(k, (v.getUint32(32 + k, true) ^ key) >>> 0, true);
      const growth = ORDERS[personality % 24].indexOf("G") * 12;
      const from = plain.getUint8(growth + 9), to = Math.min(255, from + opts.met.friendship);
      if (to !== from) {
        plain.setUint8(growth + 9, to);
        let sum = 0;
        for (let k = 0; k < 48; k += 2) sum = (sum + plain.getUint16(k, true)) & 0xffff;
        v.setUint16(28, sum, true);
        for (let k = 0; k < 48; k += 4) v.setUint32(32 + k, (plain.getUint32(k, true) ^ key) >>> 0, true);
        for (let k = 28; k < 80; k++) { const b = at(carried.recStart + k); out[b.byte] = rec[k]; touched.add(b.id); }
        friendship = { nickname: carried.d.nickname, from, to };
      }
    }
  }
  // C-45: the experience it gained on the device, written once it is HOME (answered home now, or brought home by the
  // game's emergency way) -- and where that is past a level, its level and stats as CalculateMonStats would give them.
  let grew: SyncResult["grew"] = null;
  const awayAfter = (p: (typeof party)[number]) => {               // where it is once this SYNC's answers are written
    const a = answered.find((x) => x.slot === p.i);
    return a ? a.now === "away" : !!p.d?.away;
  };
  const grows = opts.grow === undefined ? [] : Array.isArray(opts.grow) ? opts.grow : [opts.grow];
  const g = grows.find((x) => x.exp > 0 && party.some((p) => p.d && p.d.personality === x.personality && !awayAfter(p)));
  const home = g && party.find((p) => p.d && p.d.personality === g.personality && !awayAfter(p));
  if (g && g.exp > 0 && home && home.d) {
    const rec = new Uint8Array(l.pokemon_size);
    for (let k = 0; k < l.pokemon_size; k++) rec[k] = out[at(home.recStart + k).byte];
    const v = new DataView(rec.buffer);
    const key = (g.personality ^ v.getUint32(4, true)) >>> 0;
    const plain = new DataView(new ArrayBuffer(48));
    for (let k = 0; k < 48; k += 4) plain.setUint32(k, (v.getUint32(32 + k, true) ^ key) >>> 0, true);
    const order = ORDERS[g.personality % 24];
    const growth = order.indexOf("G") * 12, evAt = order.indexOf("E") * 12, misc = order.indexOf("M") * 12;
    const row = SPECIES[String(home.d.species)];
    const curve = row?.growth ?? 0;
    const was = plain.getUint32(growth + 4, true), from = rec[l.level_offset];
    // no base stats known (a species a macro hides): grow only up to its next level, never past what can be recomputed
    const ceiling = row?.base ? expFor(curve, 100) : Math.max(was, expFor(curve, from + 1) - 1);
    const exp = Math.min(ceiling, was + g.exp), to = Math.max(from, levelFromExp(curve, exp));
    plain.setUint32(growth + 4, exp, true);
    let sum = 0;
    for (let k = 0; k < 48; k += 2) sum = (sum + plain.getUint16(k, true)) & 0xffff;
    v.setUint16(28, sum, true);
    if (to !== from && row?.base) {
      const evs = [0, 1, 2, 3, 4, 5].map((k) => plain.getUint8(evAt + k));
      const s = calcStats(row.base, to, unpackIVs(plain.getUint32(misc + 4, true)), evs, g.personality);
      const oldMax = v.getUint16(88, true), hp = v.getUint16(86, true);
      rec[l.level_offset] = to;
      v.setUint16(86, hp === 0 ? 0 : Math.min(s.maxHP, Math.max(1, hp + s.maxHP - oldMax)), true);   // its damage kept
      [s.maxHP, s.atk, s.def, s.speed, s.spAtk, s.spDef].forEach((n, k) => v.setUint16(88 + 2 * k, n, true));
    }
    for (let k = 0; k < 48; k += 4) v.setUint32(32 + k, (plain.getUint32(k, true) ^ key) >>> 0, true);
    for (let k = 28; k < l.pokemon_size; k++) { const b = at(home.recStart + k); if (out[b.byte] !== rec[k]) { out[b.byte] = rec[k]; touched.add(b.id); } }
    grew = { nickname: home.d.nickname, personality: g.personality, exp: exp - was, from, to };
  }
  for (const id of touched) {
    const off = where.get(id)!;
    const sector = out.subarray(off, off + l.sector_size);
    new DataView(out.buffer, off).setUint16(FOOTER_CHECKSUM, sectionChecksum(sector, sectionSize(id, l)), true);
  }
  return { save: out, answered, refused, firstLink, recalledSeen, changed: touched.size > 0, newlySeen, friendship, grew };
}
