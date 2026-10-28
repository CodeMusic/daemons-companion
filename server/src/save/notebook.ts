// C-125: the NOTEBOOK, readable on the phone -- every page the save holds, in the game's own order and sections, with
// its words. Which pages exist, the flags that file them and their words are data/notebook.json, which DAEMONS exports
// from src/notebook.c and the headers it includes; a page is held by notebook.c's own rule (flag, and flag2 if any).
// The names in a page are the save's. A page the game writes from the save when it is opened has no words here --
// but THE LOG (C-203, DAEMONS T-459 B and C), which is written here as the game writes it, from the save's vars.
import notebookJson from "../../data/notebook.json" with { type: "json" };
import { blocks, decodeText, LAYOUT, type Layout } from "./reader.js";
import { flagReader } from "./profile.js";
import profileJson from "../../data/profile_layout.json" with { type: "json" };

interface Page { section: number; title: string; kind: string; flag: number; flag2: number; about: string | null; text: string | null;
                 seen?: number | null; place?: string | null;   // T-403: its SEEN flag, and where it was found
                 link?: string | null;                           // T-402: the song or post its QR code opens
                 key?: string | null; notes?: string[] | null;   // T-417: a SONGBOOK page's key and motif
                 frames?: number[] | null }                      // and each note's length, 60 a second
const NB = notebookJson as { sections: string[]; pages: Page[]; key_colours?: string[]; outline?: string };

export interface Notebook {
  held: boolean;                                            // the NOTEBOOK itself is in the bag
  sections: { name: string; pages: { title: string; kind: string; about: string | null; text: string | null; unread: boolean; place: string | null;
                                    link: string | null; key?: string | null; notes?: string[] | null; frames?: number[] | null }[] }[];
  keyColours?: string[];                                    // T-417: the twelve key colours, C..B, the staff's heads
  outline?: string;                                         // and the heads' outline
}

export function readNotebook(save: Uint8Array, l: Layout = LAYOUT): Notebook {
  const { sb1, sb2 } = blocks(save, l);
  const P = profileJson;
  return notebookOf(flagReader(sb1, sb2), decodeText(sb2.subarray(P.sb2.player_name, P.sb2.player_name + 7)),
                    decodeText(sb1.subarray(P.sb1.rival_name, P.sb1.rival_name + 7)), varReader(sb1));
}

// C-203: a var as the game keeps it, a u16 in SaveBlock1's vars
export function varReader(sb1: Uint8Array) {
  const R = profileJson.reads, v = new DataView(sb1.buffer, sb1.byteOffset, sb1.byteLength);
  return (id: number) => v.getUint16(R.vars + (id - R.vars_start) * 2, true);
}

// C-203: THE LOG, as daemons_reads.c writes it when the page is opened -- the counts, then the last reads, newest first,
// each landed once its thing is found (here as soon as the flag is set; the game marks and counts it the next time)
export function readsLog(flag: (f: number) => boolean, v: (id: number) => number): string[] {
  const R = profileJson.reads, P = profileJson;
  const places = P.sb1.first_met_places as Record<string, string>;
  const rows: { where: number; landed: boolean }[] = [];
  for (let i = 0; i < R.log; i++) {
    const where = v(R.where + i), thing = v(R.thing + i);
    if (!where) break;
    rows.push({ where, landed: !!(where & (1 << R.landed_bit)) || (thing !== 0 && flag(thing)) });
  }
  const late = rows.filter((r, i) => r.landed && !(v(R.where + i) & (1 << R.landed_bit))).length;   // landed, not yet counted
  const fill = (w: string, a: number, b: number) => w.replace("{1}", String(a)).replace("{2}", String(b));
  return [fill(R.words.reads, v(R.given), Math.min(v(R.given), v(R.landed) + late)), fill(R.words.leans, v(R.leans_told), v(R.leans_landed)),
          ...rows.map((r) => (places[String(r.where & 0xff)] ?? "") + R.words.colon + (R.phrases[(r.where >> R.phrase_shift) & R.phrase_mask] ?? "")
                             + (r.landed ? R.words.landed : ""))];
}

// The pages a set of flags holds -- apart from the save, so it can be tested with flags chosen by hand
export function notebookOf(flag: (f: number) => boolean, name: string, rival: string, vars?: (id: number) => number): Notebook {
  const P = profileJson;
  const named = (t: string | null) => t && t.replaceAll("{PLAYER}", name).replaceAll("{RIVAL}", rival);
  const sections = NB.sections.map((n) => ({ name: n, pages: [] as Notebook["sections"][number]["pages"] }));
  for (const p of NB.pages)
    if (flag(p.flag) && (!p.flag2 || flag(p.flag2))) sections[p.section].pages.push({ title: p.title, about: p.about,
        text: p.kind === "reads" && vars ? readsLog(flag, vars).join("\n") : named(p.text),   // C-203: THE LOG, one line a row
        unread: p.seen != null && !flag(p.seen), place: p.place ?? null, link: p.link ?? null, kind: p.kind,
        ...(p.kind === "song" ? { key: p.key ?? null, notes: p.notes ?? null, frames: p.frames ?? null } : {}) });   // T-403: unread until opened in the game
  return { held: flag(P.flags.notebook), sections: sections.filter((s) => s.pages.length), ...(NB.key_colours ? { keyColours: NB.key_colours } : {}), ...(NB.outline ? { outline: NB.outline } : {}) };
}
