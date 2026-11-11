// C-290: this file runs on the phone too (C-111) -- the app imports it, directly or through another file -- so keep it free of Node-only APIs (node:*, fs).
// C-328: a daemon AWAY as it would stand in a battle -- its card (battle.ts), read from its own record: its species and
// types, its level (what the save holds, or higher with the experience grown on the companion), its six stats exactly as
// the game's CalculateMonStats gives them from its IVs, EVs and nature (save/stats.ts), and its four routines with their
// MP (the routine's base MP and the PP Ups the record holds). Only a daemon AWAY fights: one at home is in the game.
import speciesJson from "../../data/species.json" with { type: "json" };
import { LAYOUT, ORDERS, type Layout, readDaemon } from "./reader.js";
import { describe, tradeRecord } from "./trade.js";
import { calcStats, unpackIVs } from "./stats.js";
import { moveRow, type Card } from "../battle.js";
import routinesJson from "../../data/routines.json" with { type: "json" };

const SPECIES = speciesJson as unknown as Record<string, { name: string; types: string[]; base?: number[]; art?: { front?: string } }>;
const TYPE_NAMES = (routinesJson as { types: string[] }).types;

export function battleCard(save: Uint8Array, personality: number, level: number | null = null, l: Layout = LAYOUT): Card | string {
  const t = tradeRecord(save, personality, l);
  if (typeof t === "string") return t.replace("can be traded", "can fight");   // DRAFT: "only a daemon AWAY can fight ..."
  return cardOfRecord(t.record, level, l);
}

// The card from a daemon's 80-byte record alone -- so the exchange builds each player's from the record it is sent and
// trusts no numbers it did not work out itself. The level may be the record's or higher (experience grown on a companion,
// not yet written), never lower.
export function cardOfRecord(rec: Uint8Array, level: number | null = null, l: Layout = LAYOUT): Card | string {
  const t = describe(rec, l);
  if (!t) return "that daemon's record is damaged";                                   // DRAFT
  const v = new DataView(rec.buffer, rec.byteOffset, rec.byteLength);
  const d = readDaemon(rec, 0, l);
  if (!d || d.egg) return "an egg cannot fight";                                // DRAFT
  const row = SPECIES[String(d.species)];
  if (!row?.base) return "that daemon's species is not known here";              // DRAFT
  const key = (d.personality ^ d.otId) >>> 0, plain = new DataView(new ArrayBuffer(48));
  for (let i = 0; i < 48; i += 4) plain.setUint32(i, (v.getUint32(32 + i, true) ^ key) >>> 0, true);
  const order = ORDERS[d.personality % 24];
  const growth = order.indexOf("G") * 12, attacks = order.indexOf("A") * 12, evAt = order.indexOf("E") * 12, misc = order.indexOf("M") * 12;
  const ppBonuses = plain.getUint8(growth + 8);
  const ivs = unpackIVs(plain.getUint32(misc + 4, true)), evs = [0, 1, 2, 3, 4, 5].map((k) => plain.getUint8(evAt + k));
  const lv = Math.max(1, t.level, Math.min(100, level ?? t.level));
  const moves = [0, 1, 2, 3].map((k) => ({ id: plain.getUint16(attacks + 2 * k, true), k }))
    .filter((m) => m.id && moveRow(m.id))
    .map(({ id, k }) => { const base = moveRow(id)!.pp; return { id, pp: base + Math.trunc((base * ((ppBonuses >> (2 * k)) & 3)) / 5) }; });
  return {
    personality: d.personality >>> 0, species: d.species, name: row.name, nickname: d.nickname || row.name, level: lv,
    types: row.types.map((n) => TYPE_NAMES.indexOf(n)).filter((x) => x >= 0),
    stats: calcStats(row.base, lv, ivs, evs, d.personality), moves,
    art: row.art?.front?.split("/").pop()?.replace("_front.png", "") ?? null,
  };
}
