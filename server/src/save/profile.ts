// C-23: the PROFILE -- who this save belongs to and how far it has gone, as the trainer card and the INDEX would say.
// Read only. Every offset comes from data/profile_layout.json, which DAEMONS exports from the built game's own headers
// (global.h's struct comments, flags.h through the preprocessor); the place names from data/maps.json.
import profileJson from "../../data/profile_layout.json" with { type: "json" };
import mapsJson from "../../data/maps.json" with { type: "json" };
import regionsJson from "../../data/regions.json" with { type: "json" };
import { blocks, decodeText, LAYOUT, type Layout } from "./reader.js";

const P = profileJson;
const MAPS = mapsJson as unknown as Record<string, { map: string; place: string }>;

export interface Profile {
  name: string;
  trainerId: number;         // the ID No. the trainer card shows (the low half)
  secretId: number;          // the half the game never shows; with trainerId and name, which game this is (C-22)
  playTime: { hours: number; minutes: number; seconds: number };
  index: { held: boolean; seen: number; bound: number };
  marks: boolean[];          // the eight MARKS, in order
  diploma: boolean;
  opus: boolean;             // OPUS in the KEY ITEMS: the app may show its margins (C-24)
  gameClear: boolean;
  savedIn: { map: string; place: string } | null;
  slot: "A" | "B";
  counter: number;
  // C-125: the PROFILE's more
  choice: "REASON" | "INSTINCT";   // who they chose to be at the title (sb2.playerGender: 0, 1)
  rival: string;                   // the name they gave the rival
  money: number;
  shoes: "MOM" | "DAD" | null;     // whose RUNNING SHOES, if any (T-256)
  notebook: boolean;               // CAIRN has handed it over
  roots: boolean[];                // the seven understandings, as the USER card's brain shows them -- never a count
  visited: string[];               // C-127: every MAPSEC the save keeps a visited flag for and has set (towns, a few places)
}

const SECTIONS = (regionsJson as unknown as { regions: { sections: Record<string, { visited_flag: number | null }> }[] }).regions
  .flatMap((r) => Object.entries(r.sections)).filter(([, s]) => s.visited_flag != null) as [string, { visited_flag: number }][];

// A flag below DAEMONS' own start is a bit in SaveBlock1's flags; DAEMONS' flags live in SaveBlock2.
export function flagReader(sb1: Uint8Array, sb2: Uint8Array) {
  return (f: number) => f < P.flags.daemons_flags_start
    ? !!(sb1[P.sb1.flags + (f >> 3)] & (1 << (f & 7)))
    : !!(sb2[P.sb2.daemons_flags + ((f - P.flags.daemons_flags_start) >> 3)] & (1 << ((f - P.flags.daemons_flags_start) & 7)));
}

function bits(bytes: Uint8Array): number {
  let n = 0;
  for (const b of bytes) for (let v = b; v; v &= v - 1) n++;
  return n;
}

export function readProfile(save: Uint8Array, l: Layout = LAYOUT): Profile {
  const { useA, slot, sb1, sb2 } = blocks(save, l);
  const v2 = new DataView(sb2.buffer, sb2.byteOffset, sb2.byteLength);
  const v1 = new DataView(sb1.buffer, sb1.byteOffset, sb1.byteLength);
  const flag = flagReader(sb1, sb2);
  const id = v2.getUint32(P.sb2.trainer_id, true);
  const marks: boolean[] = [];
  for (let f = P.flags.marks_first; f <= P.flags.marks_last; f++) marks.push(flag(f));
  let opus = false;
  for (let i = 0; i < P.sb1.key_items_count; i++) if (v1.getUint16(P.sb1.key_items + i * 4, true) === P.items.opus) opus = true;
  const group = v1.getInt8(P.sb1.location), num = v1.getInt8(P.sb1.location + 1);
  return {
    name: decodeText(sb2.subarray(P.sb2.player_name, P.sb2.player_name + 7)),   // PLAYER_NAME_LENGTH, as readSave
    trainerId: id & 0xffff,
    secretId: id >>> 16,
    playTime: { hours: v2.getUint16(P.sb2.play_time_hours, true), minutes: sb2[P.sb2.play_time_minutes],
                seconds: sb2[P.sb2.play_time_seconds] },
    index: { held: flag(P.flags.index), seen: bits(sb2.subarray(P.sb2.index_seen, P.sb2.index_seen + P.sb2.index_bytes)),
             bound: bits(sb2.subarray(P.sb2.index_bound, P.sb2.index_bound + P.sb2.index_bytes)) },
    marks,
    diploma: flag(P.flags.diploma),
    opus,
    gameClear: flag(P.flags.game_clear),
    savedIn: MAPS[`${group}.${num}`] ?? null,
    slot: useA ? "A" : "B",
    counter: slot.counter,
    choice: sb2[P.sb2.player_gender] ? "INSTINCT" : "REASON",
    rival: decodeText(sb1.subarray(P.sb1.rival_name, P.sb1.rival_name + 7)),
    money: (v1.getUint32(P.sb1.money, true) ^ v2.getUint32(P.sb2.encryption_key, true)) >>> 0,
    shoes: !flag(P.flags.shoes) ? null : flag(P.flags.shoes_from_dad) ? "DAD" : "MOM",
    notebook: flag(P.flags.notebook),
    roots: P.flags.understandings.map(flag),
    visited: SECTIONS.filter(([, s]) => flag(s.visited_flag)).map(([m]) => m),
  };
}
