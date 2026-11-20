// C-429: PRAXIS runs on the phone too (C-111) -- no node:*, no fs, and nothing imported from the companion.
// FORMS (PROJECTS.md 4.2): a space is made from one, and a form is data, not code -- the KINDS a space holds, each with
// its FIELDS and STATES, and the views, rules and rewards (kept as they are here; C-430 and after read them). A space
// keeps its form as a field of its own, so taking a newer version is an event like any other.

export const PHASES = ["open", "doing", "done", "aside"] as const;   // a state is one of four -- never "failed"
export type Phase = typeof PHASES[number];

export const FIELD_TYPES = ["text", "long", "number", "date", "duration", "rating", "choice", "item", "blob",
  "virtue", "centre", "feeling"] as const;
export type FieldType = typeof FIELD_TYPES[number];

export interface FieldDef { type: FieldType; title?: string; choices?: string[] }
export interface StateDef { name: string; phase: Phase; title?: string }
export interface KindDef {
  title: string;
  points?: number;                    // ARETE for finishing one, unless the item carries its own
  virtue?: string;
  states: StateDef[];                 // the first is where a new item starts
  fields?: Record<string, FieldDef>;
}
export interface Form {
  name: string;
  version: number;
  kinds: Record<string, KindDef>;
  views?: unknown[];
  rules?: unknown[];
  rewards?: unknown;
}

/** the columns every item has, which the engine indexes; a kind's own fields are everything else */
export const CORE = ["title", "short", "state", "parent", "position", "points", "virtue", "due", "archived", "handle"] as const;
/** the most a device shows of a title */
export const SHORT = 40;
/** the ways one item names another (a parent is not one: it is a field, so an item has one) */
export const LINK_TYPES = ["blocks", "follows", "relates", "made-from", "tag", "check"] as const;

const NAME = /^[\w.:@-]{1,64}$/;

/** what is wrong with a form, or [] when nothing is */
export function checkForm(f: unknown): string[] {
  const out: string[] = [];
  const form = f as Form;
  if (typeof form !== "object" || form === null) return ["a form is an object"];
  if (typeof form.name !== "string" || !form.name) out.push("a form needs a name");
  if (!Number.isInteger(form.version)) out.push("a form needs a whole-number version");
  if (typeof form.kinds !== "object" || form.kinds === null || !Object.keys(form.kinds).length) return [...out, "a form needs kinds"];
  for (const [k, kind] of Object.entries(form.kinds)) {
    if (!NAME.test(k) || k === "space") out.push(`kind "${k}" cannot be a kind's name`);
    if (typeof kind.title !== "string") out.push(`kind ${k} needs a title`);
    if (kind.points !== undefined && !(Number.isInteger(kind.points) && kind.points >= 0)) out.push(`kind ${k}'s points are a whole number`);
    if (!Array.isArray(kind.states) || !kind.states.length) out.push(`kind ${k} needs states`);
    else {
      const names = new Set<string>();
      for (const s of kind.states) {
        if (!NAME.test(s.name) || names.has(s.name)) out.push(`kind ${k}: state "${s.name}" is not a name, or is twice`);
        names.add(s.name);
        if (!PHASES.includes(s.phase)) out.push(`kind ${k}: state ${s.name}'s phase is one of ${PHASES.join(", ")}`);
      }
    }
    for (const [name, fd] of Object.entries(kind.fields ?? {})) {
      if (!NAME.test(name) || (CORE as readonly string[]).includes(name) || name === "kind") out.push(`kind ${k}: "${name}" cannot be a field's name`);
      if (!FIELD_TYPES.includes(fd.type)) out.push(`kind ${k}: field ${name}'s type is one of ${FIELD_TYPES.join(", ")}`);
      if (fd.type === "choice" && !(Array.isArray(fd.choices) && fd.choices.length)) out.push(`kind ${k}: field ${name} needs choices`);
    }
  }
  return out;
}

/** what is wrong with a value for a field of this type, or null when nothing is */
export function checkValue(fd: FieldDef, v: unknown): string | null {
  if (v === null) return null;                                              // emptied
  switch (fd.type) {
    case "number": case "duration": return typeof v === "number" && Number.isFinite(v) ? null : "a number";
    case "rating": return typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 5 ? null : "a rating, 0 to 5";
    case "choice": return typeof v === "string" && fd.choices!.includes(v) ? null : `one of ${fd.choices!.join(", ")}`;
    case "date": return typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? null : "a date, YYYY-MM-DD";
    default: return typeof v === "string" ? null : "text";
  }
}
