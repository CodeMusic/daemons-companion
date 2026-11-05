// C-290: this file runs on the phone too (C-111) -- the app imports it, directly or through another file -- so keep it free of Node-only APIs (node:*, fs).
// C-299 (DAEMONS T-519 item 3, vision 4.40): THE UNITY BOOK, the two halves mended at DAEMON TOWER -- the night half's
// ten sections and the dawn half's, read by the player with both, BALANCE written at the crease between them (eleven
// sections). An Attestation opens it, and its one observer's line is chosen by the lead daemon's SPIRITS, as the dawn
// half's is. Its text is the game's (DAEMONS docs/unity-book.md, exported as data/unity.json). In the game the halves
// leave the bag as it comes, and both their flags stay set; held here once the save holds FLAG_UNITY_MENDED, or as a
// preview. No hour is a gate ("It was written for no hour"). Every word DRAFT. No node: imports.
import unityJson from "../data/unity.json" with { type: "json" };
import { LAYOUT, type Layout, type SpiritsClass } from "./save/reader.js";
import { observe, savedFlag, type Section } from "./eudaimon.js";

const U = unityJson as unknown as { title: string; subtitle: string; draft: boolean; flag: number | null; sections: Section[] };
export const UNITY_FLAG: number | null = U.flag;
export const savedUnity = (save: Uint8Array | null, l: Layout = LAYOUT) => savedFlag(save, UNITY_FLAG, l);

export interface Unity { held: boolean; how?: "game" | "preview"; title?: string; subtitle?: string; draft?: boolean; observer?: SpiritsClass; sections?: Section[] }
export function readUnity(save: Uint8Array | null, preview = false, lead: SpiritsClass = "as it is"): Unity {
  const how = savedUnity(save) ? "game" : preview ? "preview" : null;
  return how ? { held: true, how, title: U.title, subtitle: U.subtitle, draft: U.draft, observer: lead, sections: observe(U.sections, lead) } : { held: false };
}
