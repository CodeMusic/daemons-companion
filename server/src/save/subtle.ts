// T-423 (the user, 2026-10-18): THE SUBTLE LAYER, a trainer's handbook -- readable here once the save holds it, as the
// GUIDE is (C-145): the game's own text (DAEMONS docs/subtle-layer.md, exported as data/subtle.json: sections, entries,
// paragraphs each in its voice -- "telling", or "asking", the faint one) and its pictures (data/art/subtle_<picture>_
// <frame>.png, one per entry, a few with frames that turn; the cover subtle_cover.png). Before it is found nothing of it
// is shown. Every word DRAFT.
import subtleJson from "../../data/subtle.json" with { type: "json" };
import { blocks, LAYOUT, type Layout } from "./reader.js";
import { flagReader } from "./profile.js";

type Para = { text: string; voice: "telling" | "asking" };
type Entry = { short: string; title: string; picture: string; caption: string; frames?: number; paragraphs: Para[] };
type Section = { label: string; heading: string; entries: Entry[] };
const S = subtleJson as unknown as { flag: number; draft: boolean; title: string; subtitle: string; sections: Section[] };

export interface Subtle { held: boolean; title?: string; subtitle?: string; draft?: boolean; sections?: Section[] }

export function readSubtle(save: Uint8Array, l: Layout = LAYOUT, preview = false): Subtle {   // preview: a bench check, as if held
  const { sb1, sb2 } = blocks(save, l);
  return preview || flagReader(sb1, sb2)(S.flag)
    ? { held: true, title: S.title, subtitle: S.subtitle, draft: S.draft, sections: S.sections }
    : { held: false };
}
