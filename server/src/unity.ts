// C-290: this file runs on the phone too (C-111) -- the app imports it, directly or through another file -- so keep it free of Node-only APIs (node:*, fs).
// C-299 (DAEMONS T-519 item 3, vision 4.40): THE UNITY BOOK, the two halves mended at DAEMON TOWER -- the night half's
// ten sections and the dawn half's, read by the player with both, BALANCE written at the crease between them (eleven
// sections). An Attestation opens it, and its one observer's line is chosen by the lead daemon's SPIRITS, as the dawn
// half's is. Its text is the game's (DAEMONS docs/unity-book.md, exported as data/unity.json). In the game the halves
// leave the bag as it comes, and both their flags stay set; held here once the save holds FLAG_UNITY_MENDED, or as a
// preview. No hour is a gate ("It was written for no hour"). Every word DRAFT. No node: imports.
// C-304 (DAEMONS T-529, vision 4.40; the user, 2026-11-07: "you should be able to use a lens to see the passages from
// either of their two forms"): the mended book keeps both halves inside it -- each of its sections can be re-read in
// place as the night half words it (THE HERMETIC LAYER) or the dawn half (THE EUDAIMON LAYER). The lens below pairs
// them: a section only the whole has (BALANCE, written at the crease) has no other reading; the rest pair in order.
import unityJson from "../data/unity.json" with { type: "json" };
import hermeticJson from "../data/hermetic.json" with { type: "json" };
import eudaimonJson from "../data/eudaimon.json" with { type: "json" };
import { LAYOUT, type Layout, type SpiritsClass } from "./save/reader.js";
import { observe, savedFlag, type Section } from "./eudaimon.js";

const U = unityJson as unknown as { title: string; subtitle: string; draft: boolean; flag: number | null; cover?: string; sections: Section[] };
export const UNITY_FLAG: number | null = U.flag;
export const savedUnity = (save: Uint8Array | null, l: Layout = LAYOUT) => savedFlag(save, UNITY_FLAG, l);

// the lens: for each of the mended book's sections, the night half's and the dawn half's reading of it, or null where
// only the whole has it (a section the night half does not name). The halves' sections pair with the rest in order.
type Half = { sections: Section[] };
const NIGHT = (hermeticJson as unknown as Half).sections, DAWN = (eudaimonJson as unknown as Half).sections;
export const wholeOnly = (s: Section) => !NIGHT.some((n) => n.label === s.label);
function pair(half: Section[]): (Section | null)[] {
  let k = 0;
  return U.sections.map((s) => wholeOnly(s) ? null : half[k++] ?? null);
}
export const LENS_NIGHT = pair(NIGHT), LENS_DAWN = pair(DAWN);
export type Lens = { night: (Section | null)[]; dawn: (Section | null)[] };
const lensOf = (lead: SpiritsClass): Lens => ({
  night: LENS_NIGHT.map((s) => s && observe([s], lead)[0]),
  dawn: LENS_DAWN.map((s) => s && observe([s], lead)[0]),
});

export interface Unity { held: boolean; how?: "game" | "preview"; title?: string; subtitle?: string; draft?: boolean; cover?: string; observer?: SpiritsClass; sections?: Section[]; lens?: Lens }
export function readUnity(save: Uint8Array | null, preview = false, lead: SpiritsClass = "as it is"): Unity {
  const how = savedUnity(save) ? "game" : preview ? "preview" : null;
  return how ? { held: true, how, title: U.title, subtitle: U.subtitle, draft: U.draft, cover: U.cover, observer: lead, sections: observe(U.sections, lead), lens: lensOf(lead) } : { held: false };
}
