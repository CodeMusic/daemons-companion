// C-24: the save's own INDEX, as the game shows it -- a daemon SEEN shows its name and picture; one BOUND shows its
// kind, its types and its entry, in the save's edition's voice. And, when the save holds OPUS, OPUS's margin beside
// each entry it has, chosen exactly as the game chooses it (src/pokedex_screen.c, OpusMarginState):
//   carried   -- one in the party or a box has gained 5 levels or more since it was met;
//   neglected -- otherwise, if any is in a box (put away, never grown);
//   none      -- not yet: met, but nothing to say.
// INSTINCT's voice, where OPUS had a second thought, for a player who chose it (the save keeps it as playerGender 1).
import profileJson from "../../data/profile_layout.json" with { type: "json" };
import speciesJson from "../../data/species.json" with { type: "json" };
import marginsJson from "../../data/margins.json" with { type: "json" };
import cardsJson from "../../data/index_cards.json" with { type: "json" };
import { blocks, readBoxes, readSave, LAYOUT, type Layout } from "./reader.js";
import { readProfile } from "./profile.js";
import { levelFromExp } from "./growth.js";

const P = profileJson;
const SPECIES = speciesJson as unknown as Record<string, any>;
const M = marginsJson as unknown as { levels_carried: number; instinct_gender: number;
  margins: Record<string, { carried: string; neglected: string; instinctCarried?: string | null; instinctNeglected?: string | null }> };

export type IndexEntry = { national: number; species: number; name: string; seen: boolean; bound: boolean; art: string | null;
  category?: string; types?: string[]; entry?: string; margin?: { state: "carried" | "neglected"; text: string }; native?: string[];
  colour?: { hex: string; by: "understanding" | "bound"; understanding?: string } | null };

// C-186 (the user, 2026-10-24: "full INDEX cards with margins (coloured by understanding gleaned)"; their rule, through
// the game session: type match). A card stays grey until the save holds the understanding whose lobe shares one of the
// daemon's types, and then takes that understanding's colour; a daemon that shares no type with any understanding takes
// its own type's colour once BOUND. index_cards.json carries both; the understandings' flags are profile.roots, in order.
type Understanding = { name: string; flag: number; hex: string; lobe_type: string };
const UNDERSTANDINGS = (cardsJson as { understandings: Understanding[] }).understandings;
const TYPE_COLOURS = (cardsJson as { type_colours: Record<string, string> }).type_colours;
export function cardColour(types: string[], held: boolean[]): IndexEntry["colour"] {
  const sharing = UNDERSTANDINGS.map((u, i) => ({ u, held: !!held[i] })).filter(({ u }) => types.includes(u.lobe_type));
  const lit = sharing.find((s) => s.held);
  if (lit) return { hex: lit.u.hex, by: "understanding", understanding: lit.u.name };
  if (sharing.length) return null;                                  // its understanding not yet gleaned: grey
  const hex = types.map((t) => TYPE_COLOURS[t]).find(Boolean);
  return hex ? { hex, by: "bound" } : null;
}

// T-407: what a daemon is NATIVE to, in the game's own words and order (pokedex_screen.c DexScreen_PrintNative): its region
// or its grove's universe (without its THE; the INDEX lists only daemons seen, so never "A GROVE"), its edition, its hours, its seasons -- each only when it keeps to some. All DRAFT, as in the game.
type Native = { regions?: string[] | null; editions?: string[] | null; seasons?: string[] | null; hours?: string[] | null; grove?: string | null } | null | undefined;
const HOURS = ["DAY", "DUSK", "NIGHT", "DAWN"], SEASONS = ["WINTER", "SPRING", "SUMMER", "AUTUMN"];
function nativeList(some: string[] | null | undefined, all: string[], prep: string) {
  if (!some?.length || some.length >= all.length) return null;
  if (some.length === all.length - 1) return `NOT ${prep}${all.find((x) => !some.includes(x))}`;
  return all.filter((x) => some.includes(x)).join(", ");
}
export function nativeLines(n: Native): string[] {
  if (!n) return ["NOT IN THE WILD"];
  const r = n.regions ?? [];
  const out = [n.grove?.replace(/^THE /, "") ?? (r.length > 1 ? "GAMUT, MARGINS" : r[0] ?? "GAMUT")];
  if (n.editions?.length === 1) out.push(`${n.editions[0]} ONLY`);
  for (const line of [nativeList(n.hours, HOURS, "AT "), nativeList(n.seasons, SEASONS, "IN ")]) if (line) out.push(line);
  return out;
}

export function readIndex(save: Uint8Array, edition: "CONTENT" | "CONTEXT", l: Layout = LAYOUT) {
  const { sb2 } = blocks(save, l);
  const profile = readProfile(save, l);
  const bit = (at: number, n: number) => !!(sb2[at + ((n - 1) >> 3)] & (1 << ((n - 1) & 7)));
  const instinct = sb2[P.sb2.player_gender] === M.instinct_gender;
  // What has grown since it was met, by species: the party's levels as they are, a box's read from its experience.
  const grown = new Map<number, boolean>(), boxed = new Set<number>();
  if (profile.opus) {
    for (const d of readSave(save, l).party)
      if (d.level - d.metLevel >= M.levels_carried) grown.set(d.species, true);
    for (const d of readBoxes(save, l)) {
      boxed.add(d.species);
      if (levelFromExp(SPECIES[String(d.species)]?.growth ?? 0, d.exp) - d.metLevel >= M.levels_carried) grown.set(d.species, true);
    }
  }
  const entries: IndexEntry[] = [];
  for (const [id, row] of Object.entries(SPECIES)) {
    if (id.startsWith("_") || !row.national) continue;
    const seen = bit(P.sb2.index_seen, row.national), bound = bit(P.sb2.index_bound, row.national);
    if (!seen && !bound) continue;                          // the game shows nothing of a daemon not yet met
    const art = row.art?.front ? `/art/species/${id}.png` : null;
    const e: IndexEntry = { national: row.national, species: Number(id), name: row.name, seen: true, bound, art, native: nativeLines(row.native) };
    if (bound) {
      Object.assign(e, { category: row.category ?? "", types: row.types ?? [], entry: row.entry?.[edition] ?? "",
                         colour: cardColour(row.types ?? [], profile.roots) });
      const m = profile.opus ? M.margins[id] : undefined;
      const state = !m ? null : grown.get(Number(id)) ? "carried" : boxed.has(Number(id)) ? "neglected" : null;
      if (m && state) {
        const voice = instinct && m.instinctCarried ? (state === "carried" ? m.instinctCarried : m.instinctNeglected) : null;
        e.margin = { state, text: voice ?? (state === "carried" ? m.carried : m.neglected) };
      }
    }
    entries.push(e);
  }
  entries.sort((a, b) => a.national - b.national);
  return { held: profile.index.held, seen: profile.index.seen, bound: profile.index.bound, opus: profile.opus, entries };
}
