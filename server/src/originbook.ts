// C-290: this file runs on the phone too (C-111) -- the app imports it, directly or through another file -- so keep it free of Node-only APIs (node:*, fs).
// DAEMONS T-533 (bible 9.35): THE ORIGIN OF A DAEMON -- a daemon telling, in its own words, how it came to be.
// Its text and its emblems are the game's (DAEMONS docs/origin-of-a-daemon.md, exported as data/origin.json and
// data/art/origin_<picture>_<frame>.png). Held once the save holds it (FLAG_GOT_ORIGIN_BOOK), and read only as far as the
// game has given it back: the first section comes with the book, each one after it with one more understanding held,
// whichever it is, and VII with SCORN's TRUE MARK as well; a section also waits for the one before it. A section not yet
// back is left out entirely -- never shown faint, and nothing counts it (the book never says how many). ?preview=1 shows
// the whole book, as the other books' previews do. Every word DRAFT. No node: imports.
import originJson from "../data/origin.json" with { type: "json" };
import { LAYOUT, type Layout } from "./save/reader.js";
import { readProfile } from "./save/profile.js";
import { savedFlag } from "./eudaimon.js";

type Para = { text: string; voice: "telling" };
type Entry = { short: string; title: string; picture: string; frames?: number; caption: string; paragraphs: Para[] };
type Opens = { understandings: number; trueMark: boolean };
export type Section = { label: string; heading: string; entries: Entry[] };
const O = originJson as unknown as { title: string; subtitle: string; draft: boolean; flag: number | null; cover?: string;
                                     sections: (Section & { opens: Opens })[] };
export const ORIGIN_FLAG: number | null = O.flag;
export const savedOrigin = (save: Uint8Array | null, l: Layout = LAYOUT) => savedFlag(save, ORIGIN_FLAG, l);

// a section as the reader sends it: when it comes back stays here, so nothing sent can count what is still to come
const bare = (s: Section): Section => ({ label: s.label, heading: s.heading, entries: s.entries });

// the sections back with this many understandings held, and SCORN's TRUE MARK or not: the longest run from the first in
// which every section's understandings are held and its TRUE MARK, where it asks for one, is
export function openSections(understandings: number, trueMark: boolean): Section[] {
  const out: Section[] = [];
  for (const s of O.sections) {
    if (s.opens.understandings > understandings || (s.opens.trueMark && !trueMark)) break;
    out.push(bare(s));
  }
  return out;
}

export interface Origin { held: boolean; how?: "game" | "preview"; title?: string; subtitle?: string; draft?: boolean; cover?: string; sections?: Section[] }
export function readOrigin(save: Uint8Array | null, preview = false, l: Layout = LAYOUT): Origin {
  const book = (how: "game" | "preview", sections: Section[]): Origin =>
    ({ held: true, how, title: O.title, subtitle: O.subtitle, draft: O.draft, cover: O.cover, sections });
  if (preview) return book("preview", O.sections.map(bare));                    // a bench check: the whole book
  if (!save || !savedOrigin(save, l)) return { held: false };
  const p = readProfile(save, l);                                               // the understandings, as the USER card has them
  return book("game", openSections(p.roots.filter(Boolean).length, p.marks[7] === true));   // the eighth MARK: SCORN's TRUE MARK
}
