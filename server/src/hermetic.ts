// C-238 (the user, 2026-10-29): THE HERMETIC LAYER, the third book -- SPELLCRAFT. A grimoire that takes from both the
// others (the GUIDE's reason, THE SUBTLE LAYER's instinct), in the tablet's emerald on the breathing purple; the one book
// that may say what the others never would (the user: "it is the one exception"). Its text is the game's (DAEMONS
// docs/hermetic-layer.md, exported as data/hermetic.json, as THE SUBTLE LAYER's is).
// Found two ways (the user, by multiple choice): in the game, the first witching-hour routine with the GUIDE and THE
// SUBTLE LAYER both held; and here, with no other book -- the first time the hour is seen in the app or on a device a
// message says what is happening, and acknowledging it opens the book here and writes the game's flag at the next SYNC
// (FLAG_GOT_HERMETIC_LAYER, DAEMONS T-483). A preview, as the other two have. Every word DRAFT. No node: imports.
import hermeticJson from "../data/hermetic.json" with { type: "json" };
import layoutJson from "../data/profile_layout.json" with { type: "json" };
import { blocks, LAYOUT, type Layout } from "./save/reader.js";
import { flagReader } from "./save/profile.js";
import type { Store } from "./store.js";
import { witchingNow } from "./witching.js";

type Para = { text: string; voice: "telling" | "asking"; inscription?: boolean };
type Entry = { short: string; title: string; picture: string; caption: string; frames?: number; paragraphs: Para[] };
type Section = { label: string; heading: string; entries: Entry[] };
const H = hermeticJson as unknown as { title: string; subtitle: string; draft: boolean; sections: Section[] };
// the game's flag (engine fe8df1f55): DAEMONS_FLAGS_START + 0x3F3, until the export carries it by name
export const HERMETIC_FLAG: number = (layoutJson as unknown as { flags: Record<string, unknown> }).flags.hermetic_layer as number ?? 0xCF3;

// what the companion knows on its own: when the hour was first seen here, and when its message was acknowledged
export interface Spellcraft { seenAt?: string; ackAt?: string; by?: string }
export const spellcraftOf = (store: Store): Spellcraft => {
  try { return (JSON.parse(store.getSetting("spellcraft") ?? "null") as Spellcraft) ?? {}; } catch { return {}; }
};
const keep = (store: Store, s: Spellcraft) => store.setSetting("spellcraft", JSON.stringify(s));

export const savedHermetic = (save: Uint8Array | null, l: Layout = LAYOUT) => {
  if (!save) return false;
  try { const { sb1, sb2 } = blocks(save, l); return flagReader(sb1, sb2)(HERMETIC_FLAG); } catch { return false; }
};

// the first time the hour is seen, the message -- what is happening, and the way in (DRAFT)
export const FIRST_SIGHT = {
  title: "THE HOUR IS THIN",
  lines: [
    "It is between three and four in the morning, and the fold is thin.",
    "Your daemon shimmers and casts no shadow. It does, only now.",
    "A book has found you that is not from the ordinary world: THE HERMETIC LAYER. In it, words are spells.",
    "Say so, and SPELLCRAFT is yours -- here now, and in the game when it next syncs.",
  ],
  ack: "SO MOTE IT BE",
};
export function firstSight(store: Store, save: Uint8Array | null, now = new Date()) {
  const s = spellcraftOf(store);
  if (s.ackAt || savedHermetic(save) || !witchingNow(now)) return null;
  if (!s.seenAt) keep(store, { ...s, seenAt: now.toISOString() });
  return FIRST_SIGHT;
}
// acknowledged (from the app, or a device's report): the book is open here; the save hears of it at the next SYNC
export function ackSpellcraft(store: Store, by: string, now = new Date()): Spellcraft {
  const s = spellcraftOf(store);
  if (s.ackAt) return s;
  const n = { ...s, seenAt: s.seenAt ?? now.toISOString(), ackAt: now.toISOString(), by };
  keep(store, n);
  return n;
}
// for the SYNC: true while the companion holds the book and the save does not yet
export const spellcraftToWrite = (store: Store, save: Uint8Array | null) => !!spellcraftOf(store).ackAt && !savedHermetic(save);

export interface Hermetic { held: boolean; how?: "game" | "companion" | "preview"; title?: string; subtitle?: string; draft?: boolean; sections?: Section[] }
export function readHermetic(save: Uint8Array | null, store: Store | null, preview = false): Hermetic {
  const how = savedHermetic(save) ? "game" : store && spellcraftOf(store).ackAt ? "companion" : preview ? "preview" : null;
  return how ? { held: true, how, title: H.title, subtitle: H.subtitle, draft: H.draft, sections: H.sections } : { held: false };
}
