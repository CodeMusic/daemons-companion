// C-191 (C-186 step 6): the planner, from the game lane's T-453 data (data/planner_*.json, DAEMONS
// tools/companion_export.py's planner_tables). Every record carries `step`: how many of the story's steps must be done
// before it is reachable. The save's done flags are counted, and only records at or under that count are shown -- the
// user's choice: up to the player's next step, nothing past it. What is next, where it is, the places open now, the
// levels there, the fights still ahead, and the wild daemons of one map at a time (asked for, never all at once). Words
// the data marks draft keep `draft`; the screen marks them DRAFT. No node: imports (it runs on the phone).
import storyJson from "../data/planner_story.json" with { type: "json" };
import mapsJson from "../data/planner_maps.json" with { type: "json" };
import trainersJson from "../data/planner_trainers.json" with { type: "json" };
import curveJson from "../data/planner_curve.json" with { type: "json" };
import wildJson from "../data/planner_wild.json" with { type: "json" };
import { blocks, LAYOUT, type Layout } from "./save/reader.js";
import { flagReader, readProfile } from "./save/profile.js";

type Step = { step: number; id: string; label: string; done_flag: number; map: string; place: string; spot: string; area?: string | null; draft?: boolean };
type MapRow = { place: string; type: string; step: number };
type Mon = { species: number; name: string; level: number };
type Trainer = { trainer: string; flag: number; class: string; name: string | null; party: Mon[]; boss: boolean; rival?: boolean;
                 map: string; place: string; area?: string | null; step: number };
type CurveRow = { step: number; wild: [number, number] | null; trainers: [number, number] | null };
type WildSlot = { species: number; name: string; min: number; max: number; rate: number };
type WildMap = { place: string; step: number } & Record<string, unknown>;

const STEPS = (storyJson as unknown as { steps: Step[] }).steps;
const MAPS = (mapsJson as unknown as { maps: Record<string, MapRow> }).maps;
const TRAINERS = (trainersJson as unknown as { trainers: Trainer[] }).trainers;
const CURVE = (curveJson as unknown as { curve: CurveRow[] }).curve;
const WILD = (wildJson as unknown as { maps: Record<string, WildMap> }).maps;

export interface Plan {
  done: number; total: number;
  next: { label: string; place: string; area: string | null; draft: boolean } | null;   // null: the story is done
  places: { place: string; type: string; maps: string[]; wild: boolean }[];             // open now, towns and routes first
  levels: { wild: [number, number] | null; trainers: [number, number] | null };         // the latest the curve gives so far
  fights: { who: string; class: string; place: string; level: number }[];               // the bosses open now, not yet beaten
  trainers: { place: string; count: number; levels: [number, number] }[];               // the rest not yet beaten, by place
}

const ORDER = ["town", "route", "underground", "indoor"];
const range = (xs: number[]): [number, number] => [Math.min(...xs), Math.max(...xs)];

export function readPlan(save: Uint8Array, l: Layout = LAYOUT): Plan {
  const { sb1, sb2 } = blocks(save, l);
  const flag = flagReader(sb1, sb2);
  const done = STEPS.filter((s) => flag(s.done_flag)).length;
  const ahead = STEPS.find((s) => !flag(s.done_flag));
  const open = <T extends { step: number }>(r: T) => r.step <= done;

  const byPlace = new Map<string, { place: string; type: string; maps: string[]; wild: boolean }>();
  for (const [id, m] of Object.entries(MAPS)) {
    if (!open(m)) continue;
    const p = byPlace.get(m.place) ?? { place: m.place, type: m.type, maps: [], wild: false };
    if (ORDER.indexOf(m.type) < ORDER.indexOf(p.type)) p.type = m.type;
    p.maps.push(id);
    if (WILD[id] && open(WILD[id])) p.wild = true;
    byPlace.set(m.place, p);
  }
  const places = [...byPlace.values()].sort((a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type) || a.place.localeCompare(b.place));

  // the curve so far: the latest row at or under the count that names a range
  const rows = CURVE.filter(open);
  const latest = (k: "wild" | "trainers") => [...rows].reverse().find((r) => r[k])?.[k] ?? null;

  // the fights: one rival per place and step (the rows differ only by the starter it took), named as the save names it
  const rival = readProfile(save, l).rival || "RIVAL";
  const fights = new Map<string, Plan["fights"][number]>(), rest = new Map<string, number[]>();
  const beaten = new Set<string>();
  for (const t of TRAINERS) if (t.rival && flag(t.flag)) beaten.add(`${t.map}/${t.step}`);
  for (const t of TRAINERS) {
    if (!open(t) || flag(t.flag)) continue;
    const top = Math.max(...t.party.map((p) => p.level));
    if (t.boss) {
      const key = t.rival ? `${t.map}/${t.step}` : t.trainer;
      if (t.rival && beaten.has(key)) continue;
      const was = fights.get(key);
      fights.set(key, { who: t.rival ? rival : t.name ?? t.class, class: t.class, place: t.place, level: Math.max(top, was?.level ?? 0) });
    } else rest.set(t.place, [...(rest.get(t.place) ?? []), ...t.party.map((p) => p.level)]);
  }
  return {
    done, total: STEPS.length,
    next: ahead ? { label: ahead.label, place: ahead.place, area: ahead.area ?? null, draft: !!ahead.draft } : null,
    places, levels: { wild: latest("wild"), trainers: latest("trainers") },
    fights: [...fights.values()].sort((a, b) => a.level - b.level),
    trainers: [...rest.entries()].map(([place, ls]) => ({ place, count: ls.length, levels: range(ls) }))
      .sort((a, b) => a.levels[0] - b.levels[0]),
  };
}

// One place's wild daemons, in this edition: each of its maps open now, each way to meet them (land, water, the rods),
// by time of day where the game keeps more than one. Null when the place is not open yet.
export function readWild(save: Uint8Array, place: string, edition: string, l: Layout = LAYOUT) {
  const { sb1, sb2 } = blocks(save, l);
  const flag = flagReader(sb1, sb2);
  const done = STEPS.filter((s) => flag(s.done_flag)).length;
  const maps = Object.entries(WILD).filter(([id, w]) => w.place === place && w.step <= done && (MAPS[id]?.step ?? 0) <= done);
  if (!maps.length) return null;
  const ways: Record<string, { name: string; species: number; levels: [number, number]; rate: number }[]> = {};
  for (const [, w] of maps) {
    const ed = w[edition === "CONTEXT" ? "CONTEXT" : "CONTENT"] as Record<string, Record<string, { mons: WildSlot[] }>> | undefined;
    for (const [time, kinds] of Object.entries(ed ?? {}))
      for (const [kind, table] of Object.entries(kinds)) {
        const key = time === "day" ? kind : `${kind} (${time})`, list = (ways[key] ??= []);
        for (const m of table.mons) {
          const had = list.find((x) => x.species === m.species);
          if (had) { had.levels = [Math.min(had.levels[0], m.min), Math.max(had.levels[1], m.max)]; had.rate += m.rate; }
          else list.push({ name: m.name, species: m.species, levels: [m.min, m.max], rate: m.rate });
        }
      }
  }
  for (const list of Object.values(ways)) list.sort((a, b) => b.rate - a.rate);
  return { place, ways };
}
