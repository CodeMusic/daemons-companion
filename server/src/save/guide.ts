// C-145: THE PROGRAMMER'S GUIDE TO THE HUMAN MIND, readable here once the save holds it -- the game's own text (DAEMONS
// docs/guide.md, exported as data/guide.json in the game's order: sections, then entries, then paragraphs) and its 8-bit
// cover (data/art/guide_cover.png). Before the GUIDE is found nothing of it is shown: a find stays findable blind (T-297).
// Every word is DRAFT in the game until the user approves it, and the book says so.
import guideJson from "../../data/guide.json" with { type: "json" };
import { blocks, LAYOUT, type Layout } from "./reader.js";
import { flagReader } from "./profile.js";

type Entry = { short: string; title: string; paragraphs: string[] };
type Section = { key: string; label: string; heading: string; entries: Entry[] };
const G = guideJson as { flag: number; draft: boolean; title: string; sections: Section[] };

export interface Guide { held: boolean; title?: string; draft?: boolean; sections?: Section[] }

export function guideOf(flag: (f: number) => boolean): Guide {
  return flag(G.flag) ? { held: true, title: G.title, draft: G.draft, sections: G.sections } : { held: false };
}

export function readGuide(save: Uint8Array, l: Layout = LAYOUT): Guide {
  const { sb1, sb2 } = blocks(save, l);
  return guideOf(flagReader(sb1, sb2));
}
