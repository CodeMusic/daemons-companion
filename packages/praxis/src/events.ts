// C-429: PRAXIS runs on the phone too (C-111) -- no node:*, no fs, and nothing imported from the companion.
// The event (PROJECTS.md 4.4): every change is one, append-only, and the tables are a fold of them. History is the log,
// undo is a compensating event, and sync is sending events. This file says what a well-formed event is; an event from
// another replica that is not one is refused before it is kept.

import { parseHlc } from "./hlc.js";
import { UUID } from "./ids.js";

export const OPS = ["make", "set", "move", "link", "unlink", "state", "note", "effort", "award", "spend",
  "propose", "accept", "decline", "archive"] as const;
export type Op = typeof OPS[number];

/** what an AI (or anyone) may propose: a change that counts only once it is accepted */
export const PROPOSABLE: readonly Op[] = ["make", "set", "move", "link", "unlink", "state", "note", "effort", "award", "archive"];

export interface PxEvent {
  id: string;          // a UUIDv7
  space: string;       // the SPACE it belongs to -- the unit of sharing and of sync
  item: string;        // the ITEM it changes (the space itself, for a change to the space)
  op: Op;
  field?: string;      // set: the field; award, spend: the entry's key
  value?: unknown;     // what the op carries (below)
  actor: string;       // who: a person, the daemon, a device, an agent
  replica: string;     // which copy wrote it
  hlc: string;         // when (hlc.ts)
}
//  make     { kind, ...the fields it starts with }          the space is made with kind "space"
//  set      the field's new value; a long body is { text, base } (base: the write it was made over)
//  move     { parent, position }
//  state    the state's name                                archive   true or false
//  link     { type, to }                                    unlink    { link }: the link event it takes away
//  note     { text }                                        effort    { seconds, note? }
//  award, spend   { points, reason? }, or { back: true } to take the entry with that key back
//  propose  { op, field?, value? }: the change proposed     accept, decline   { proposal }

/** a long body as a field holds it: its text, and the write it was made over (null for the first) */
export interface Long { text: string; base: string | null }
export const isLong = (v: unknown): v is Long => typeof v === "object" && v !== null && !Array.isArray(v) &&
  typeof (v as Long).text === "string" && "base" in v && Object.keys(v).length === 2 &&
  ((v as Long).base === null || typeof (v as Long).base === "string");

export const NAME = /^[\w.:@-]{1,64}$/;            // a replica, an actor, a field, a kind, a state, a key
export const POSITION = /^[0-9A-Za-z]{0,1023}[1-9A-Za-z]$/;   // position.ts's keys, which never end in "0"
const obj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown) => typeof v === "string";
const points = (v: unknown) => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 1e9;

/** what is wrong with a change's op, field and value, or null when nothing is */
export function checkChange(op: Op, field: unknown, value: unknown): string | null {
  switch (op) {
    case "make":
      if (!obj(value) || !str(value.kind) || !NAME.test(value.kind as string)) return "make needs { kind }";
      if (Object.keys(value).some((k) => !NAME.test(k))) return "make's fields are names";
      return value.position === undefined || (str(value.position) && POSITION.test(value.position as string))
        ? null : "make's position is a position";
    case "set": return str(field) && NAME.test(field as string) && value !== undefined ? null : "set needs a field and a value";
    case "move": return obj(value) && (value.parent === null || str(value.parent)) && str(value.position) &&
      POSITION.test(value.position as string) ? null : "move needs { parent, position }";
    case "state": return str(value) && NAME.test(value as string) ? null : "state needs a state's name";
    case "archive": return typeof value === "boolean" ? null : "archive needs true or false";
    case "link": return obj(value) && str(value.type) && NAME.test(value.type as string) && str(value.to) ? null : "link needs { type, to }";
    case "unlink": return obj(value) && str(value.link) ? null : "unlink needs { link }";
    case "note": return obj(value) && str(value.text) ? null : "note needs { text }";
    case "effort": return obj(value) && typeof value.seconds === "number" && Number.isFinite(value.seconds)
      ? null : "effort needs { seconds }";
    case "award": case "spend":
      if (!str(field) || !NAME.test(field as string)) return `${op} needs a key`;
      return obj(value) && (value.back === true || points(value.points)) ? null : `${op} needs { points } or { back: true }`;
    case "propose": {
      if (!obj(value) || !str(value.op) || !PROPOSABLE.includes(value.op as Op)) return "propose needs { op } of a change";
      return checkChange(value.op as Op, value.field, value.value);
    }
    case "accept": case "decline": return obj(value) && str(value.proposal) ? null : `${op} needs { proposal }`;
  }
}

/** what is wrong with an event, or null when nothing is */
export function checkEvent(e: unknown): string | null {
  if (!obj(e)) return "not an object";
  for (const k of ["id", "space", "item"] as const) if (!str(e[k]) || !UUID.test(e[k] as string)) return `${k} is not an id`;
  if (!OPS.includes(e.op as Op)) return "no such op";
  for (const k of ["actor", "replica"] as const) if (!str(e[k]) || !NAME.test(e[k] as string)) return `${k} is not a name`;
  const h = str(e.hlc) ? parseHlc(e.hlc as string) : null;
  if (!h || h.replica !== e.replica) return "hlc is not this replica's time";
  if (e.field !== undefined && (!str(e.field) || !NAME.test(e.field as string))) return "field is not a name";
  return checkChange(e.op as Op, e.field, e.value);
}
