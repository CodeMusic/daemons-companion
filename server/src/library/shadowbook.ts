// C-290: this file runs on the phone too (C-111) -- the app imports it, directly or through another file -- so keep it free of Node-only APIs (node:*, fs).
// C-474 (DAEMONS T-606): THE SPELL LEFT RUNNING, a book of shadows -- found in the game where INIT knelt on DAEMON TOWER's
// top floor, and read here once the save holds it (FLAG_GOT_SHADOW_BOOK), the whole book at once, as THE SUBTLE LAYER is.
// Its text and its plates are the game's (DAEMONS docs/shadow-book.md, exported as data/shadow.json and
// data/art/shadow_<picture>_<frame>.png; its cover shadow_cover.png, unlettered: the game's font is FireRed's). Before it
// is found nothing of it is shown. ?preview=1 shows it, as the other books' previews do. Every word DRAFT. No node: imports.
import shadowJson from "../../data/shadow.json" with { type: "json" };
import { LAYOUT, type Layout } from "../game/save/reader.js";
import { savedFlag } from "./eudaimon.js";

type Para = { text: string; voice: "telling" | "asking" };
type Entry = { short: string; title: string; picture: string; frames?: number; caption: string; paragraphs: Para[] };
export type Section = { label: string; heading: string; entries: Entry[] };
const B = shadowJson as unknown as { title: string; subtitle: string; draft: boolean; flag: number | null; cover?: string; sections: Section[] };
export const SHADOW_FLAG: number | null = B.flag;
export const savedShadow = (save: Uint8Array | null, l: Layout = LAYOUT) => savedFlag(save, SHADOW_FLAG, l);

export interface Shadow { held: boolean; how?: "game" | "preview"; title?: string; subtitle?: string; draft?: boolean; cover?: string; sections?: Section[] }
export function readShadow(save: Uint8Array | null, preview = false, l: Layout = LAYOUT): Shadow {
  const book = (how: "game" | "preview"): Shadow =>
    ({ held: true, how, title: B.title, subtitle: B.subtitle, draft: B.draft, cover: B.cover, sections: B.sections });
  if (preview) return book("preview");
  return save && savedShadow(save, l) ? book("game") : { held: false };
}

// C-488 (C-474's later work): the day's SPELL CHECK beside TODAY's word -- each of the seven brooms ends with one, and the
// broom is the day's (SUNDAY's PING .. SATURDAY's SUPERVISOR, the book's own order). Only once the save holds the book;
// ?preview=1 shows it as the book's preview does. Where it stands in the book (s, j) opens that page. Every word DRAFT.
const DAYS = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"] as const;
export type SpellCheck = { held: false } | { held: true; day: string; title: string; broom: string; check: string; picture: string; frames: number; s: number; j: number };
export function spellCheckOf(save: Uint8Array | null, now = new Date(), preview = false, l: Layout = LAYOUT): SpellCheck {
  if (!preview && !(save && savedShadow(save, l))) return { held: false };
  const want = DAYS[now.getDay()];
  for (let s = 0; s < B.sections.length; s++) {
    const j = B.sections[s].entries.findIndex((e) => e.short.toUpperCase() === want);
    if (j < 0) continue;
    const e = B.sections[s].entries[j];
    const line = e.paragraphs.map((p) => p.text).find((t) => /^Spell check:/i.test(t));
    if (!line) break;
    return { held: true, day: want, title: e.title, broom: e.caption, check: line.replace(/^Spell check:\s*/i, ""), picture: e.picture, frames: e.frames ?? 1, s, j };
  }
  return { held: false };
}
