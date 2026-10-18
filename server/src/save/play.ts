// T-426 (the user, 2026-10-18: "on the ios app, you should be able to go to the songbook, choose a song, choose a key, and
// ... play ... if u dont have the instrument yet, this routine is locked"): PLAY as the save has it -- the instrument the
// save's edition plays (the HARP for CONTENT, the FLUTE for CONTEXT), whether it is held yet (the game's got-instrument flag,
// or the item in the bag -- older saves), and each song: learned (its flag; O CHRISTMAS TREE always, once the instrument is
// held), or only heard. The songs, keys and colours are data/play.json, exported by DAEMONS. Read only. (The PC's items
// are not read: the save layout does not carry them yet.)
import playJson from "../../data/play.json" with { type: "json" };
import profileJson from "../../data/profile_layout.json" with { type: "json" };
import { blocks, LAYOUT, type Layout } from "./reader.js";
import { flagReader } from "./profile.js";

type Song = { id: string; title: string; key: string; notes: string[]; frames: number[]; learned_flag: number; heard_flag: number | null };
const PLAY = playJson as unknown as { got_instrument_flag: number; items: Record<string, number>; editions: Record<string, string>;
                                      keys: string[]; key_colours: string[]; outline: string; listen: unknown; songs: Song[] };
const P = profileJson as unknown as { sb1: Record<string, number> };
const ALWAYS = "FIR";                                // O CHRISTMAS TREE: known with the instrument

export interface Play {
  instrument: "harp" | "flute"; unlocked: boolean;
  keys: string[]; keyColours: string[]; outline: string;
  songs: { id: string; title: string; key: string; notes: string[]; frames: number[]; learned: boolean; heard: boolean }[];
}

export function readPlay(save: Uint8Array, edition: string, l: Layout = LAYOUT): Play {
  const instrument = (PLAY.editions[edition] ?? "harp") as Play["instrument"];
  const { sb1, sb2 } = blocks(save, l);
  const flag = flagReader(sb1, sb2);
  const v1 = new DataView(sb1.buffer, sb1.byteOffset, sb1.byteLength);
  const item = PLAY.items[instrument.toUpperCase()];
  let inBag = false;
  if (P.sb1.key_items != null) for (let i = 0; i < P.sb1.key_items_count; i++) if (v1.getUint16(P.sb1.key_items + i * 4, true) === item) inBag = true;
  const unlocked = flag(PLAY.got_instrument_flag) || inBag;
  return {
    instrument, unlocked, keys: PLAY.keys, keyColours: PLAY.key_colours, outline: PLAY.outline,
    songs: PLAY.songs.map((s) => {
      const learned = unlocked && (s.id === ALWAYS || flag(s.learned_flag));
      return { id: s.id, title: s.title, key: s.key, notes: s.notes, frames: s.frames, learned,
               heard: !learned && s.heard_flag != null && flag(s.heard_flag) };
    }),
  };
}
