// C-290: this file runs on the phone too -- no node: imports.
// C-359 (the user, 2026-11-14, by multiple choice: "Its own gender ... but it as the pronous I am not sure ... what about
// they/them for those"): a daemon is spoken of as the game has it. The game gives each species a split (species.json
// `gender`, its genderRatio: 0 male only, 254 female only, 255 genderless) and each daemon its own gender by its
// personality, as GetBoxMonGender does: female when the split is above the personality's low byte. The summary screen
// shows it as a symbol; the companion says he or she, and they for a daemon with none -- never "it".
// Words written about every daemon (titles, WHAT'S NEW, manuals) stay neutral: "your daemon", "you both".
import speciesJson from "../../data/species.json" with { type: "json" };

const SPECIES = speciesJson as unknown as Record<string, { gender?: number }>;
export type Gender = "male" | "female" | "none";

// undefined: a species with a split, and no personality to read it by -- nothing is said rather than a guess
export function genderOf(species: number, personality: number | null | undefined): Gender | undefined {
  const ratio = SPECIES[String(species)]?.gender ?? 255;
  if (ratio === 0) return "male";
  if (ratio === 254) return "female";
  if (ratio === 255) return "none";
  if (personality === null || personality === undefined || !Number.isFinite(personality)) return undefined;
  return ratio > ((personality >>> 0) & 0xff) ? "female" : "male";
}

export const PRONOUNS: Record<Gender, { they: string; them: string; their: string }> = {
  male: { they: "he", them: "him", their: "his" },
  female: { they: "she", them: "her", their: "her" },
  none: { they: "they", them: "them", their: "their" },
};

// Said to a thinker in the second person, beside who it is (DRAFT: the companion's words to a model, never shown)
export function pronounLine(g: Gender | undefined): string {
  if (!g) return "";
  if (g === "none") return "You are neither male nor female: whoever speaks of you says they and them, never it.";
  const p = PRONOUNS[g];
  return `You are ${g}: whoever speaks of you says ${p.they} and ${p.them}.`;
}
