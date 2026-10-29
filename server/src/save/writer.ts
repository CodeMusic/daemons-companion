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
//
// C-149: and the CASINO's winnings and losses (`money`, a change): the money SaveBlock1 keeps, XOR SaveBlock2's
// encryption key as the game keeps it, never below 0 or above 999999.
//
// C-167: and what the house kept (`house`, a change) into the save's own count of it (DAEMONS T-427, P.sb2.house_take,
// SaveBlock2.houseTake): a plain little-endian int32 in SaveBlock2, which the game's GAME CORNER adds to as well -- only
// ever added to, never overwritten. Without the layout's entry, nothing is written.
import P from "../../data/profile_layout.json" with { type: "json" };
import speciesJson from "../../data/species.json" with { type: "json" };
import { expFor, levelFromExp } from "./growth.js";
import { calcStats, unpackIVs } from "./stats.js";
import { arriving } from "./trade.js";

const SPECIES = speciesJson as unknown as Record<string, any>;
import eventsJson from "../../data/events.json" with { type: "json" };
import { LAYOUT, type Layout, soundingShift, tradeBits, type Sounding, ORDERS, readSlot, newer, readDaemon, sectionChecksum, sectionSize, encodeText } from "./reader.js";

export interface Answer { slot: number; nickname: string; name: string; now: "away" | "home" }
export interface SyncResult { save: Uint8Array; answered: Answer[]; refused: string[]; firstLink: boolean; recalledSeen: boolean;
                              changed: boolean; newlySeen: number[]; friendship: { nickname: string; from: number; to: number } | null;
                              grew: { nickname: string; personality: number; exp: number; from: number; to: number } | null;
                              money: { from: number; to: number } | null; house: { from: number; to: number } | null;
                              evolved: { nickname: string; personality: number; from: number; to: number }[];
                              gifted: { box: number; pos: number; personality: number; species: number } | null;
                              sounded: { personality: number; level: Sounding }[];   // C-195: each carried daemon given a level
                              traded: { id: string; out: number; in: number; species: number; nickname: string; where: "party" | "box"; gave?: boolean }[];   // C-219; gave: C-223
                              tradeWaits: { id: string; why: string }[] }
// C-15: what the companion met nearby since the last SYNC -- species to mark SEEN (by national number), and how much
// friendship the carried daemon gained by it
export interface Meetings { seen: number[]; friendship: number }
// C-45: the experience a daemon gained on the device, for it by its personality, written when it is home
export interface Growth { personality: number; exp: number }
// C-184: a daemon that evolved on the device -- its new species, written when it is home (with the game's marker)
export interface Evolve { personality: number; species: number; from?: number }   // from: what it was when it evolved here
// C-185: a daemon the companion gives (HANDSHAKE, DAEMONS T-450) -- written into the PC's first empty box slot, already
// AWAY, so it is carried from the moment it arrives
export interface Gift { species: number; name: string; level: number; personality: number; ivs: number; game: number }
// C-219: a trade -- the daemon going (by its personality, AWAY here) and the whole record of the one coming in its place
// C-223: a GIFT -- `give` on the giver's side (the daemon leaves: no record comes in), and on the receiver's an `out` of 0
// (nothing leaves: it arrives in the first empty box slot)
export interface TradeIn { id: string; out: number; record: Uint8Array | null; loan?: boolean; phase?: "swap" | "return"; give?: boolean }


const EV = eventsJson as unknown as { sb1_vars: number; vars_start: number };
const FOOTER_ID = 0xff4, FOOTER_CHECKSUM = 0xff6;
// C-167: where SaveBlock2 keeps the house's take (DAEMONS T-427: 3740, four bytes, signed), or null in a layout without it
const HOUSE = (P.sb2 as Record<string, unknown>).house_take;
export const HOUSE_AT: number | null = typeof HOUSE === "number" ? HOUSE : null;

export function answerRequests(save: Uint8Array, l: Layout = LAYOUT): { save: Uint8Array; answered: Answer[] } {
  const r = syncSave(save, { link: false }, l);
  return { save: r.save, answered: r.answered };
}

// grow: C-80 -- several daemons may have experience waiting; the first of them that is home after this SYNC is written
export function syncSave(save: Uint8Array, opts: { link: boolean; met?: Meetings; grow?: Growth | Growth[]; money?: number;
                                             house?: number; houseAt?: number | null; evolve?: Evolve[]; gift?: Gift;
                                             sounding?: Sounding; vars?: Record<number, number>; trade?: TradeIn[];
                                             locks?: number[]; spellcraft?: number }, l: Layout = LAYOUT): SyncResult {
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
  // C-219 / DAEMONS T-473: a daemon in a trade stays AWAY -- asked home, it is told so and the ask taken back
  const locked = new Set((opts.locks ?? []).map((p) => p >>> 0));
  for (const { i, recStart, d } of party) {
    if (!d || !d.asked || keepHome?.i === i) continue;
    if (d.away && locked.has(d.personality >>> 0)) {
      const f = at(recStart + l.flags_byte);
      out[f.byte] &= ~(1 << l.asked_bit) & 0xff; touched.add(f.id);
      refused.push(`${d.nickname || d.name} is in a trade. It stays AWAY until the trade is done.`);   // DRAFT
      continue;
    }
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
  // C-238: SPELLCRAFT, found here first -- the game's flag set (FLAG_GOT_HERMETIC_LAYER, in the same DAEMONS block)
  if (opts.spellcraft) {
    const start = P.flags.daemons_flags_start, sb2 = where.get(0)!, n = opts.spellcraft - start;
    const byte = sb2 + P.sb2.daemons_flags + (n >> 3), mask = 1 << (n & 7);
    if (n >= 0 && !(out[byte] & mask)) { out[byte] |= mask; touched.add(0); }
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
  // C-184: what evolved on the device, once it is HOME -- the species only, in its growth substruct; its nickname renamed
  // if it was its old species' own name (as the evolution scene does); the game's marker set -- unusedRibbons bit 2 (the
  // u32 at Misc+8, bit 29; feelings keep bits 0 and 1) -- for the game to finish it on load (DAEMONS T-448: its stats, the
  // INDEX, its moves, its ability) and clear. Its stats are not recomputed here.
  const evolved: SyncResult["evolved"] = [];
  for (const ev of opts.evolve ?? []) {
    const home = party.find((p) => p.d && p.d.personality === ev.personality && !awayAfter(p));
    if (!home || !home.d || !SPECIES[String(ev.species)]) continue;
    // already that species, or the game has made it something else since (evolved it further): nothing written -- and
    // told as written, so the companion lets it go and never writes the older species back over it (the review)
    if (home.d.species === ev.species || (ev.from !== undefined && home.d.species !== ev.from)) {
      evolved.push({ nickname: home.d.nickname, personality: ev.personality, from: home.d.species, to: home.d.species }); continue;
    }
    const rec = new Uint8Array(l.pokemon_size);
    for (let k = 0; k < l.pokemon_size; k++) rec[k] = out[at(home.recStart + k).byte];
    const v = new DataView(rec.buffer);
    const key = (ev.personality ^ v.getUint32(4, true)) >>> 0;
    const plain = new DataView(new ArrayBuffer(48));
    for (let k = 0; k < 48; k += 4) plain.setUint32(k, (v.getUint32(32 + k, true) ^ key) >>> 0, true);
    const order = ORDERS[ev.personality % 24];
    const growth = order.indexOf("G") * 12, misc = order.indexOf("M") * 12;
    const from = plain.getUint16(growth, true);
    plain.setUint16(growth, ev.species, true);
    plain.setUint32(misc + 8, (plain.getUint32(misc + 8, true) | (1 << 29)) >>> 0, true);
    let sum = 0;
    for (let k = 0; k < 48; k += 2) sum = (sum + plain.getUint16(k, true)) & 0xffff;
    v.setUint16(28, sum, true);
    for (let k = 0; k < 48; k += 4) v.setUint32(32 + k, (plain.getUint32(k, true) ^ key) >>> 0, true);
    const oldName = SPECIES[String(from)]?.name ?? "", newName = SPECIES[String(ev.species)]?.name ?? "";
    if (home.d.nickname === oldName && newName) rec.set(encodeText(newName, 10), 8);   // its own name, not one given it
    for (let k = 0; k < l.pokemon_size; k++) { const b = at(home.recStart + k); if (out[b.byte] !== rec[k]) { out[b.byte] = rec[k]; touched.add(b.id); } }
    evolved.push({ nickname: home.d.nickname, personality: ev.personality, from, to: ev.species });
  }
  // C-185: a gift, into the first empty box slot -- a whole BoxPokemon made here: the player's own trainer (name, id,
  // gender), its species' own name, the level's experience, its IVs; AWAY set in the flags byte, and the game's marker
  // (unusedRibbons bit 2, as C-184) for the game to finish it on load: its moves, its ability, the INDEX (DAEMONS T-450).
  // A full PC, or a personality already in the save, writes nothing -- the gift waits for the next SYNC.
  let gifted: SyncResult["gifted"] = null;
  if (opts.gift) {
    const g = opts.gift, sb2 = where.get(0)!;
    const box = (off: number) => { const id = 5 + Math.floor(off / l.sector_data_size); return { id, byte: where.get(id)! + (off % l.sector_data_size) }; };
    let free = -1, clash = party.some((p) => p.d?.personality === g.personality);
    for (let i = 0; i < 14 * 30 && !clash; i++) {
      const start = 4 + i * l.box_pokemon_size;
      const flags = out[box(start + l.flags_byte).byte];
      if (flags & 0b10) { if (new DataView(Uint8Array.from([0, 1, 2, 3].map((k) => out[box(start + k).byte])).buffer).getUint32(0, true) === g.personality >>> 0) clash = true; }
      else if (free < 0) free = i;
    }
    if (free >= 0 && !clash) {
      const rec = new Uint8Array(l.box_pokemon_size), v = new DataView(rec.buffer);
      const otId = new DataView(out.buffer, sb2 + P.sb2.trainer_id).getUint32(0, true);
      v.setUint32(0, g.personality >>> 0, true); v.setUint32(4, otId, true);
      rec.set(encodeText(g.name, 10), 8);
      rec[18] = 2;                                                  // its language: English, as the game's own
      rec[l.flags_byte] = 0b10 | (1 << l.away_bit);                 // hasSpecies, and AWAY
      rec.set(out.subarray(sb2 + P.sb2.player_name, sb2 + P.sb2.player_name + 7), 20);   // its trainer's name, as the save keeps it
      const plain = new DataView(new ArrayBuffer(48)), order = ORDERS[(g.personality >>> 0) % 24];
      const growth = order.indexOf("G") * 12, misc = order.indexOf("M") * 12;
      plain.setUint16(growth, g.species, true);
      plain.setUint32(growth + 4, expFor(SPECIES[String(g.species)]?.growth ?? 0, g.level), true);
      plain.setUint8(growth + 9, 70);                               // the friendship a daemon is met with
      const female = out[sb2 + P.sb2.player_gender] & 1;
      plain.setUint16(misc + 2, (g.level & 0x7f) | ((g.game & 0xf) << 7) | (4 << 11) | (female << 15), true);   // met at its level, in this edition, in a ball
      plain.setUint8(misc + 1, 0xff);                               // met: no map (the companion's, for the game to name)
      plain.setUint32(misc + 4, (g.ivs & 0x3fffffff) >>> 0, true);
      plain.setUint32(misc + 8, (1 << 29) >>> 0, true);            // the marker: the game finishes it
      let sum = 0;
      for (let k = 0; k < 48; k += 2) sum = (sum + plain.getUint16(k, true)) & 0xffff;
      v.setUint16(28, sum, true);
      const key = ((g.personality >>> 0) ^ otId) >>> 0;
      for (let k = 0; k < 48; k += 4) v.setUint32(32 + k, (plain.getUint32(k, true) ^ key) >>> 0, true);
      const start = 4 + free * l.box_pokemon_size;
      for (let k = 0; k < l.box_pokemon_size; k++) { const b = box(start + k); out[b.byte] = rec[k]; touched.add(b.id); }
      gifted = { box: Math.floor(free / 30), pos: free % 30, personality: g.personality >>> 0, species: g.species };
    }
  }
  // C-219: TRADES -- the daemon another player sent, into the slot the one traded for it left. The one going must still
  // be here and AWAY after this SYNC's answers (one the game brought home is the game's again: the trade waits); the
  // one coming is written whole -- its own trainer, its own record -- AWAY, and marked for the game to finish on load
  // (save/trade.ts arriving). In the party it is given its level and stats as CalculateMonStats would, at full health.
  // A personality already in the save writes nothing.
  const traded: SyncResult["traded"] = [], tradeWaits: SyncResult["tradeWaits"] = [];
  if (opts.trade?.length) {
    const box = (off: number) => { const id = 5 + Math.floor(off / l.sector_data_size); return { id, byte: where.get(id)! + (off % l.sector_data_size) }; };
    const boxPersonality = (i: number) => [0, 1, 2, 3].reduce((n, k) => n | (out[box(4 + i * l.box_pokemon_size + k).byte] << (8 * k)), 0) >>> 0;
    const boxFlags = (i: number) => out[box(4 + i * l.box_pokemon_size + l.flags_byte).byte];
    const present = (personality: number) => party.some((p) => p.d?.personality === personality) ||
      Array.from({ length: 14 * 30 }, (_, i) => i).some((i) => boxFlags(i) & 0b10 && boxPersonality(i) === personality);
    const free = () => Array.from({ length: 14 * 30 }, (_, i) => i).find((i) => !(boxFlags(i) & 0b10)) ?? -1;
    for (const t of opts.trade) {
      // C-223: a gift given -- the daemon leaves this save: its box slot emptied, or the party closed up behind it
      if (t.give) {
        const pi = party.findIndex((p) => p.d?.personality === t.out >>> 0);
        const bi = pi >= 0 ? -1 : Array.from({ length: 14 * 30 }, (_, i) => i).find((i) => boxFlags(i) & 0b10 && boxPersonality(i) === t.out >>> 0) ?? -1;
        if (pi < 0 && bi < 0) { tradeWaits.push({ id: t.id, why: "the daemon given is not in this save" }); continue; }   // DRAFT
        if (pi >= 0 ? !awayAfter(party[pi]) : !(boxFlags(bi) & (1 << l.away_bit))) { tradeWaits.push({ id: t.id, why: "the daemon given is home in the game -- SEND it again" }); continue; }   // DRAFT
        if (pi >= 0 && party.length <= 1) { tradeWaits.push({ id: t.id, why: "the daemon given is the last in the party" }); continue; }   // DRAFT
        const gone = pi >= 0 ? party[pi].d! : null;
        if (pi >= 0) {
          const n = party.length, size = l.pokemon_size, read = (j: number) => Uint8Array.from({ length: size }, (_, k) => out[at(l.party_offset + j * size + k).byte]);
          for (let j = pi; j < n; j++) {
            const next = j + 1 < n ? read(j + 1) : new Uint8Array(size);
            for (let k = 0; k < size; k++) { const b = at(l.party_offset + j * size + k); out[b.byte] = next[k]; touched.add(b.id); }
          }
          const c = at(l.party_count_offset); out[c.byte] = n - 1; touched.add(c.id);
          party.splice(pi, 1);
          party.forEach((p, j) => { p.i = j; p.recStart = l.party_offset + j * size; });
          traded.push({ id: t.id, out: t.out >>> 0, in: 0, species: gone!.species, nickname: gone!.nickname, where: "party", gave: true });
        } else {
          const d = readDaemon(Uint8Array.from({ length: l.box_pokemon_size }, (_, k) => out[box(4 + bi * l.box_pokemon_size + k).byte]), 0, l);
          for (let k = 0; k < l.box_pokemon_size; k++) { const b = box(4 + bi * l.box_pokemon_size + k); out[b.byte] = 0; touched.add(b.id); }
          traded.push({ id: t.id, out: t.out >>> 0, in: 0, species: d?.species ?? 0, nickname: d?.nickname ?? "", where: "box", gave: true });
        }
        continue;
      }
      // C-223: a gift received -- nothing leaves; it arrives in the first empty box slot, as a trade's arrives
      if (!t.out) {
        const rec = t.record && arriving(t.record, l, { phase: "swap" }), incoming = rec && new DataView(rec.buffer).getUint32(0, true);
        if (!rec || incoming == null) { tradeWaits.push({ id: t.id, why: "the daemon sent is damaged" }); continue; }   // DRAFT
        if (present(incoming)) { tradeWaits.push({ id: t.id, why: "that daemon is already in this save" }); continue; }   // DRAFT
        const at0 = free();
        if (at0 < 0) { tradeWaits.push({ id: t.id, why: "the PC is full -- make room in a box" }); continue; }   // DRAFT
        for (let k = 0; k < l.box_pokemon_size; k++) { const b = box(4 + at0 * l.box_pokemon_size + k); out[b.byte] = rec[k]; touched.add(b.id); }
        const d = readDaemon(rec, 0, l)!;
        traded.push({ id: t.id, out: 0, in: incoming >>> 0, species: d.species, nickname: d.nickname, where: "box" });
        continue;
      }
      if (!t.record) { tradeWaits.push({ id: t.id, why: "the daemon sent is damaged" }); continue; }
      const inParty = party.find((p) => p.d?.personality === t.out >>> 0);
      const inBox = inParty ? -1 : Array.from({ length: 14 * 30 }, (_, i) => i).find((i) => boxFlags(i) & 0b10 && boxPersonality(i) === t.out >>> 0) ?? -1;
      // T-474: the species given for it -- the one leaving this slot
      const leaving = inParty?.d ?? (inBox >= 0 ? (() => {
        try { return readDaemon(Uint8Array.from({ length: l.box_pokemon_size }, (_, k) => out[box(4 + inBox * l.box_pokemon_size + k).byte]), 0, l); }
        catch { return null; }                                   // a damaged record: no partner named
      })() : null);
      const rec = arriving(t.record, l, { loan: t.loan, phase: t.phase, partner: leaving?.species }), incoming = rec && new DataView(rec.buffer).getUint32(0, true);
      if (!rec || incoming == null) { tradeWaits.push({ id: t.id, why: "the daemon sent is damaged" }); continue; }   // DRAFT
      if (present(incoming)) { tradeWaits.push({ id: t.id, why: "that daemon is already in this save" }); continue; }   // DRAFT
      const away = inParty ? awayAfter(inParty) : inBox >= 0 && !!(boxFlags(inBox) & (1 << l.away_bit));
      if (!inParty && inBox < 0) { tradeWaits.push({ id: t.id, why: "the daemon traded is not in this save" }); continue; }   // DRAFT
      if (!away) { tradeWaits.push({ id: t.id, why: "the daemon traded is home in the game -- SEND it again" }); continue; }   // DRAFT
      const d = readDaemon(rec, 0, l)!;
      if (inParty) {
        const full = new Uint8Array(l.pokemon_size), v = new DataView(full.buffer);
        full.set(rec, 0);
        const row = SPECIES[String(d.species)], level = Math.max(1, levelFromExp(row?.growth ?? 0, d.exp));
        full[l.level_offset] = level;
        full[l.box_pokemon_size + 5] = 0xff;                                     // no mail
        if (row?.base) {
          const key = (d.personality ^ d.otId) >>> 0, plain = new DataView(new ArrayBuffer(48));
          for (let k = 0; k < 48; k += 4) plain.setUint32(k, (v.getUint32(32 + k, true) ^ key) >>> 0, true);
          const order = ORDERS[d.personality % 24], evAt = order.indexOf("E") * 12, misc = order.indexOf("M") * 12;
          const s = calcStats(row.base, level, unpackIVs(plain.getUint32(misc + 4, true)), [0, 1, 2, 3, 4, 5].map((k) => plain.getUint8(evAt + k)), d.personality);
          v.setUint16(86, s.maxHP, true);
          [s.maxHP, s.atk, s.def, s.speed, s.spAtk, s.spDef].forEach((n, k) => v.setUint16(88 + 2 * k, n, true));
        }
        for (let k = 0; k < l.pokemon_size; k++) { const b = at(inParty.recStart + k); out[b.byte] = full[k]; touched.add(b.id); }
        inParty.d = readDaemon(full, inParty.i, l);                              // so SOUNDINGS below sees who is there now
      } else {
        for (let k = 0; k < l.box_pokemon_size; k++) { const b = box(4 + inBox * l.box_pokemon_size + k); out[b.byte] = rec[k]; touched.add(b.id); }
      }
      traded.push({ id: t.id, out: t.out >>> 0, in: incoming >>> 0, species: d.species, nickname: d.nickname, where: inParty ? "party" : "box" });
    }
  }
  // C-219 / DAEMONS T-473: TRADING, the game's lock -- set on every daemon of this game in a trade now, cleared on the
  // rest (only when the exchange was asked: `locks` undefined leaves the bits as they are)
  if (opts.locks) {
    const bit = tradeBits(l).trading;
    const lockAt = (f: { id: number; byte: number }, personality: number) => {
      const next = locked.has(personality >>> 0) ? out[f.byte] | bit : out[f.byte] & ~bit & 0xff;
      if (next !== out[f.byte]) { out[f.byte] = next; touched.add(f.id); }
    };
    for (const p of party) if (p.d) lockAt(at(p.recStart + l.flags_byte), p.d.personality);
    const box = (off: number) => { const id = 5 + Math.floor(off / l.sector_data_size); return { id, byte: where.get(id)! + (off % l.sector_data_size) }; };
    for (let i = 0; i < 14 * 30; i++) {
      const start = 4 + i * l.box_pokemon_size, f = box(start + l.flags_byte);
      if (!(out[f.byte] & 0b10)) continue;
      lockAt(f, [0, 1, 2, 3].reduce((n, k) => n | (out[box(start + k).byte] << (8 * k)), 0));
    }
  }
  // C-195: SOUNDINGS -- each carried daemon's level, in the party and the boxes; home, or just gone, it is 0
  const sounded: SyncResult["sounded"] = [];
  if (opts.sounding !== undefined) {
    const shift = soundingShift(l), mask = 3 << shift;
    const put = (f: { id: number; byte: number }, level: Sounding, personality: number) => {
      const next = (out[f.byte] & ~mask & 0xff) | (level << shift);
      if (level) sounded.push({ personality: personality >>> 0, level });
      if (next !== out[f.byte]) { out[f.byte] = next; touched.add(f.id); }
    };
    for (const p of party) {
      if (!p.d) continue;
      const left = answered.some((a) => a.slot === p.i && a.now === "away");
      put(at(p.recStart + l.flags_byte), awayAfter(p) && !left ? opts.sounding : 0, p.d.personality);
    }
    const box = (off: number) => { const id = 5 + Math.floor(off / l.sector_data_size); return { id, byte: where.get(id)! + (off % l.sector_data_size) }; };
    const giftAt = gifted ? gifted.box * 30 + gifted.pos : -1;
    for (let i = 0; i < 14 * 30; i++) {
      const start = 4 + i * l.box_pokemon_size, f = box(start + l.flags_byte);
      if (!(out[f.byte] & 0b10)) continue;                        // an empty slot
      const away = !!(out[f.byte] & (1 << l.away_bit));
      const personality = [0, 1, 2, 3].reduce((n, k) => n | (out[box(start + k).byte] << (8 * k)), 0);
      if (away || out[f.byte] & mask) put(f, away && i !== giftAt ? opts.sounding : 0, personality);   // a gift has only just arrived
    }
  }
  // C-149: the CASINO's change to the money -- the key is SaveBlock2's, the money SaveBlock1's (each where its sector sits)
  let money: SyncResult["money"] = null;
  if (opts.money) {
    const key = new DataView(out.buffer, where.get(0)! + P.sb2.encryption_key).getUint32(0, true);
    const bytes = [0, 1, 2, 3].map((k) => at(P.sb1.money + k));
    const read = () => bytes.reduce((n, b, k) => n | (out[b.byte] << (8 * k)), 0) >>> 0;
    const from = (read() ^ key) >>> 0, to = Math.max(0, Math.min(999999, from + Math.round(opts.money)));
    if (to !== from) {
      const sealed = (to ^ key) >>> 0;
      bytes.forEach((b, k) => { out[b.byte] = (sealed >>> (8 * k)) & 0xff; touched.add(b.id); });
      money = { from, to };
    }
  }
  // C-167: the house's take, added to the save's count -- plain, signed, little-endian, in SaveBlock2 (sector 0, re-signed
  // below as the flags are); kept inside an int32, as the game's own adds are
  let house: SyncResult["house"] = null;
  const houseAt = opts.houseAt === undefined ? HOUSE_AT : opts.houseAt;
  if (opts.house && houseAt != null && houseAt + 4 <= l.saveblock2_size) {
    const v = new DataView(out.buffer, where.get(0)! + houseAt, 4);
    const from = v.getInt32(0, true);
    const to = Math.max(-2147483648, Math.min(2147483647, from + Math.round(opts.house)));
    if (to !== from) { v.setInt32(0, to, true); touched.add(0); house = { from, to }; }
  }
  // C-200: the game's vars the companion owns (DAEMONS T-462's dream), u16s in SaveBlock1 at sb1_vars + 2 * (var - vars_start)
  for (const [n, value] of Object.entries(opts.vars ?? {})) {
    const o = EV.sb1_vars + 2 * (Number(n) - EV.vars_start), lo = at(o), hi = at(o + 1), v = value & 0xffff;
    if (out[lo.byte] === (v & 0xff) && out[hi.byte] === v >> 8) continue;
    out[lo.byte] = v & 0xff; out[hi.byte] = v >> 8; touched.add(lo.id); touched.add(hi.id);
  }
  for (const id of touched) {
    const off = where.get(id)!;
    const sector = out.subarray(off, off + l.sector_size);
    new DataView(out.buffer, off).setUint16(FOOTER_CHECKSUM, sectionChecksum(sector, sectionSize(id, l)), true);
  }
  return { save: out, answered, refused, firstLink, recalledSeen, changed: touched.size > 0, newlySeen, friendship, grew, money, house, evolved, gifted, sounded, traded, tradeWaits };
}
