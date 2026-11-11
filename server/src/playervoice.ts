// C-323 (the user, 2026-11-10: "the note should be read in the voice that represents you, and that representation is
// based on everything you have done in the game, the daemons you keep, your choices"): the player's context, read from
// their save, for ai/voiceof.ts's playerVoice. Pure reading -- no node: imports (the save readers run on the phone too).
import speciesJson from "../data/species.json" with { type: "json" };
import type { PlayerContext } from "./ai/voiceof.js";
import { readPlay } from "./save/play.js";
import { readProfile } from "./save/profile.js";
import { readSave } from "./save/reader.js";

const SPECIES = speciesJson as unknown as Record<string, { types?: string[] }>;

// What the save says they have done; whatever cannot be read is left out, so a voice is still made
export function playerContextOf(save: Uint8Array | null | undefined, edition?: string): PlayerContext | null {
  if (!save) return null;
  const c: PlayerContext = { edition };
  try {
    const p = readProfile(save);
    c.choice = p.choice;
    c.marks = p.marks.filter(Boolean).length;
    c.roots = p.roots.filter(Boolean).length;
    c.hours = p.playTime.hours;
    c.groves = p.groves.length;
  } catch { /* a save the profile cannot read: the rest still may */ }
  try { c.partyTypes = readSave(save).party.flatMap((d) => SPECIES[String(d.species)]?.types ?? []); } catch { /* none */ }
  try { const pl = readPlay(save, edition ?? "CONTENT"); c.instrument = pl.unlocked ? pl.instrument : null; } catch { /* none */ }
  return c;
}
