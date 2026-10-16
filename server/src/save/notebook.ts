// C-125: the NOTEBOOK, readable on the phone -- every page the save holds, in the game's own order and sections, with
// its words. Which pages exist, the flags that file them and their words are data/notebook.json, which DAEMONS exports
// from src/notebook.c and the headers it includes; a page is held by notebook.c's own rule (flag, and flag2 if any).
// The names in a page are the save's. A page the game writes from the save when it is opened has no words here.
import notebookJson from "../../data/notebook.json" with { type: "json" };
import { blocks, decodeText, LAYOUT, type Layout } from "./reader.js";
import { flagReader } from "./profile.js";
import profileJson from "../../data/profile_layout.json" with { type: "json" };

interface Page { section: number; title: string; kind: string; flag: number; flag2: number; about: string | null; text: string | null;
                 seen?: number | null; place?: string | null;   // T-403: its SEEN flag, and where it was found
                 link?: string | null }                          // T-402: the song or post its QR code opens
const NB = notebookJson as { sections: string[]; pages: Page[] };

export interface Notebook {
  held: boolean;                                            // the NOTEBOOK itself is in the bag
  sections: { name: string; pages: { title: string; about: string | null; text: string | null; unread: boolean; place: string | null;
                                    link: string | null }[] }[];
}

export function readNotebook(save: Uint8Array, l: Layout = LAYOUT): Notebook {
  const { sb1, sb2 } = blocks(save, l);
  const P = profileJson;
  return notebookOf(flagReader(sb1, sb2), decodeText(sb2.subarray(P.sb2.player_name, P.sb2.player_name + 7)),
                    decodeText(sb1.subarray(P.sb1.rival_name, P.sb1.rival_name + 7)));
}

// The pages a set of flags holds -- apart from the save, so it can be tested with flags chosen by hand
export function notebookOf(flag: (f: number) => boolean, name: string, rival: string): Notebook {
  const P = profileJson;
  const named = (t: string | null) => t && t.replaceAll("{PLAYER}", name).replaceAll("{RIVAL}", rival);
  const sections = NB.sections.map((n) => ({ name: n, pages: [] as Notebook["sections"][number]["pages"] }));
  for (const p of NB.pages)
    if (flag(p.flag) && (!p.flag2 || flag(p.flag2))) sections[p.section].pages.push({ title: p.title, about: p.about, text: named(p.text),
        unread: p.seen != null && !flag(p.seen), place: p.place ?? null, link: p.link ?? null });   // T-403: unread until opened in the game
  return { held: flag(P.flags.notebook), sections: sections.filter((s) => s.pages.length) };
}
