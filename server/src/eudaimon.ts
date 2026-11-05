// C-290: this file runs on the phone too (C-111) -- the app imports it, directly or through another file -- so keep it free of Node-only APIs (node:*, fs).
// C-297 (DAEMONS T-519, vision 4.40; the user approved the text 2026-11-04): THE EUDAIMON LAYER, the third book's dawn
// half -- the night half's ten sections read from the other side, in the light (solve, albedo), read by a LARK at dawn.
// The tear is the spine: the night half keeps the front cover, this one the back. Its text is the game's (DAEMONS
// docs/eudaimon-layer.md, exported as data/eudaimon.json by the Unity Book lane). One line in it is the observer's: three
// wordings, chosen by the lead daemon's SPIRITS (C-296) -- who looks changes what is read.
// Held once the save holds it (its flag, null until the game places the half), or as a preview. No book requires
// another, and no hour is a gate (the user, 2026-11-02). Every word DRAFT. No node: imports.
import eudaimonJson from "../data/eudaimon.json" with { type: "json" };
import { blocks, LAYOUT, type Layout, type SpiritsClass } from "./save/reader.js";
import { flagReader } from "./save/profile.js";

type Readings = { good: string; as_is: string; low: string };
type Para = { text: string; voice: "telling" | "asking" | "inscription" | "observer"; readings?: Readings };
type Entry = { short: string; title: string; picture: string; frames?: number; caption: string; paragraphs: Para[] };
type Section = { label: string; heading: string; entries: Entry[] };
const E = eudaimonJson as unknown as { title: string; subtitle: string; draft: boolean; flag: number | null; sections: Section[] };
export const EUDAIMON_FLAG: number | null = E.flag;

export const savedEudaimon = (save: Uint8Array | null, l: Layout = LAYOUT) => {
  if (!save || EUDAIMON_FLAG === null) return false;
  try { const { sb1, sb2 } = blocks(save, l); return flagReader(sb1, sb2)(EUDAIMON_FLAG); } catch { return false; }
};

// the observer's line as the lead daemon would read it: in good spirits, as it is, or in low spirits
const READING: Record<SpiritsClass, keyof Readings> = { good: "good", "as it is": "as_is", low: "low" };
export function observedSections(lead: SpiritsClass = "as it is"): Section[] {
  return E.sections.map((s) => ({ ...s, entries: s.entries.map((e) => ({ ...e, paragraphs: e.paragraphs.map((p) =>
    p.voice === "observer" && p.readings ? { text: p.readings[READING[lead]] ?? p.text, voice: p.voice } : { text: p.text, voice: p.voice }) })) }));
}

export interface Eudaimon { held: boolean; how?: "game" | "preview"; title?: string; subtitle?: string; draft?: boolean; observer?: SpiritsClass; sections?: Section[] }
export function readEudaimon(save: Uint8Array | null, preview = false, lead: SpiritsClass = "as it is"): Eudaimon {
  const how = savedEudaimon(save) ? "game" : preview ? "preview" : null;
  return how ? { held: true, how, title: E.title, subtitle: E.subtitle, draft: E.draft, observer: lead, sections: observedSections(lead) } : { held: false };
}
