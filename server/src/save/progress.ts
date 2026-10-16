// C-128, C-129: the save's progress, finer than the PROFILE -- GAME EVENTS, the debug page's story-ordered list (data/
// events.json, exported by DAEMONS), each row held or not; and CALLOW SCHOOL as the save has it (data/school.json): which
// floors were stood on, the DIPLOMA, and the paper's best and last marks. Read only. A row the save cannot answer yet
// (a DRIVER, if profile_layout had no PLUGIN pocket) is held: null, never guessed.
import eventsJson from "../../data/events.json" with { type: "json" };
import schoolJson from "../../data/school.json" with { type: "json" };
import profileJson from "../../data/profile_layout.json" with { type: "json" };
import { blocks, LAYOUT, type Layout } from "./reader.js";
import { flagReader } from "./profile.js";

type Held = { all_flags: number[]; var?: { number: number; op: string; value: number } } | null;
type EventRow = { n: number; name: string; section: string; held: Held; items?: { id: number }[] };
const EV = eventsJson as unknown as { sb1_vars: number; vars_start: number; events: EventRow[] };
const SC = schoolJson as unknown as {
  floors: { floor: string; subject: string; visited_flag: number }[]; pass_mark: number; grades: { from: number; letter: string }[];
  flags: { diploma: number; textbook: number; paper_marked: number }; vars: { best: number; last: number; attempts: number };
  sb1_vars: number; vars_start: number };
const P = profileJson as unknown as { sb1: Record<string, number> };

export interface Progress {
  events: { n: number; name: string; section: string; held: boolean | null }[];
  school: { textbook: boolean; floors: boolean[]; diploma: boolean; best: number | null; last: number | null; attempts: number;
            grade: string | null; passMark: number };
}

function compare(a: number, op: string, b: number) {
  return op === ">=" ? a >= b : op === ">" ? a > b : op === "==" ? a === b : op === "!=" ? a !== b : op === "<=" ? a <= b : a < b;
}
export const gradeOf = (mark: number) => SC.grades.find((g) => mark >= g.from)?.letter ?? null;

export function readProgress(save: Uint8Array, l: Layout = LAYOUT): Progress {
  const { sb1, sb2 } = blocks(save, l);
  const flag = flagReader(sb1, sb2);
  const v1 = new DataView(sb1.buffer, sb1.byteOffset, sb1.byteLength);
  const varOf = (n: number) => v1.getUint16(EV.sb1_vars + 2 * (n - EV.vars_start), true);
  // what the bag holds: the KEY ITEMS pocket, and the PLUGIN pocket (tmhm), where the eight DRIVERS live
  const pockets: [number | undefined, number | undefined][] = [[P.sb1.key_items, P.sb1.key_items_count], [P.sb1.tmhm, P.sb1.tmhm_count]];
  const bag = new Set<number>();
  for (const [at, count] of pockets) if (at != null && count) for (let i = 0; i < count; i++) bag.add(v1.getUint16(at + i * 4, true));
  const tmCase = P.sb1.tmhm != null;
  const events = EV.events.map((e) => {
    let held: boolean | null;
    if (e.held) held = e.held.all_flags.every(flag) && (!e.held.var || compare(varOf(e.held.var.number), e.held.var.op, e.held.var.value));
    else if (e.items?.length) held = e.section === "DRIVERS" && !tmCase ? null : e.items.every((it) => bag.has(it.id));
    else held = null;
    return { n: e.n, name: e.name, section: e.section, held };
  });
  const best = varOf(SC.vars.best), last = varOf(SC.vars.last), attempts = varOf(SC.vars.attempts);
  return {
    events,
    school: { textbook: flag(SC.flags.textbook), floors: SC.floors.map((f) => flag(f.visited_flag)), diploma: flag(SC.flags.diploma),
              best: attempts ? best : null, last: attempts ? last : null, attempts,
              grade: attempts ? gradeOf(best) : null, passMark: SC.pass_mark },
  };
}
