// C-429: PRAXIS runs on the phone too (C-111) -- no node:*, no fs, and nothing imported from the companion.
// THE ENGINE (PROJECTS.md 4). Every change is an event in one append-only log; the tables are a fold of it. The fold
// gives the same tables whatever order the events arrive in, which is the whole of merging (4.6):
//
//   a field        the latest write by hybrid logical clock wins; every write is kept (px_writes) and can be taken back
//   a long body    the same, and a write that lost to one it never saw is SET ASIDE beside it as a version -- never lost
//   links          added and taken away by event id: an unlink names the link it saw, so a concurrent add stands
//   ARETE          awards and spends are entries, summed, never merged. An award's id is made from its item and its
//                  finish, so two phones that finish one step offline make the same award, and it is paid once
//   a handle       numbered by the space's keeper; once given, kept (the first write wins, not the last)
//   a proposal     counts only once accepted; an accept anywhere takes it
//
// Sync is the exchange at the end of this file: "here is what I have seen; send me the rest" (exchange.ts runs it).

import type { Db, Statement } from "./db.js";
import { checkChange, checkEvent, isLong, NAME, PROPOSABLE, type Op, type PxEvent } from "./events.js";
import { checkForm, checkValue, CORE, LINK_TYPES, SHORT, type Form, type Phase } from "./form.js";
import { Clock, hlcIso, parseHlc } from "./hlc.js";
import { cryptoRandom, derivedId, uuidv7, type Random } from "./ids.js";
import { between } from "./position.js";
import { FOLDED, SCHEMA } from "./schema.js";

export interface Options {
  replica?: string;     // this copy's id: made once and kept in the database when not given
  actor?: string;       // who writes, unless a call says otherwise (a person, the daemon, a device, an agent)
  now?: () => number;   // the wall clock, in ms
  random?: Random;      // random bytes, for ids
}
export interface By { actor?: string }

/** who a space reaches (PROJECTS.md 5): THIS PHONE never leaves it */
export type Reach = "phone" | "home" | "shared" | "public";
export const REACHES: readonly Reach[] = ["phone", "home", "shared", "public"];

export interface Space {
  id: string; title: string; prefix: string; parent: string | null; keeper: string | null; reach: Reach;
  form: Form | null; archived: boolean; made: string; maker: string;
}
export interface Item {
  id: string; space: string; kind: string; title: string; short: string; state: string | null; phase: Phase | null;
  parent: string | null; position: string; points: number; virtue: string | null; due: string | null; archived: boolean;
  number: number | null;   // the keeper's number, once given
  handle: string;          // LIFE-12, or LIFE-~a3f2 until the keeper numbers it
  made: string; maker: string;
  fields: Record<string, unknown>;   // the kind's own
}
export interface Node { item: Item; children: Node[] }
export interface Link { id: string; item: string; type: string; to: string; actor: string; hlc: string }
export interface Write { value: unknown; hlc: string; event: string; actor: string; won: boolean }
export interface Version { text: string; hlc: string; event: string; actor: string }
export interface Note { id: string; text: string; actor: string; hlc: string }
export interface Effort { id: string; seconds: number; note: string | null; actor: string; hlc: string }
export interface Entry {
  id: string; space: string; item: string; op: "award" | "spend"; key: string; points: number; reason: string | null;
  actor: string; hlc: string; back: boolean;
}
export interface Proposal {
  id: string; space: string; item: string; op: Op; field?: string; value?: unknown; actor: string; hlc: string;
  status: "open" | "accepted" | "declined";
}
/** what a replica has seen: for each space, the latest time it holds from each replica */
export type Have = Record<string, Record<string, string>>;
export interface Received { applied: number; known: number; rejected: number }

type Made = { space: string; kind: string; hlc: string; actor: string };
type Row = Record<string, any>;

/** the id of the ledger entry an award or spend makes: the same item, op and key make the same entry everywhere */
export const ledgerId = (item: string, op: "award" | "spend", key: string) => derivedId("ledger", item, op, key);
const byHlc = (a: { hlc: string } | Row, b: { hlc: string } | Row) => (a.hlc < b.hlc ? -1 : a.hlc > b.hlc ? 1 : 0);
const cut = (s: string, n: number) => Array.from(s).slice(0, n).join("");
const str = (v: unknown) => (typeof v === "string" ? v : null);
const eventOf = (r: Row): PxEvent => {
  const e: PxEvent = { id: r.id, space: r.space, item: r.item, op: r.op, actor: r.actor, replica: r.replica, hlc: r.hlc };
  if (r.field !== null) e.field = r.field;
  if (r.value !== null) e.value = JSON.parse(r.value);
  return e;
};

export class Praxis {
  readonly replica: string;
  actor: string;
  private readonly clock: Clock;
  private readonly newId: () => string;
  private readonly statements = new Map<string, Statement>();
  private depth = 0;

  constructor(readonly db: Db, opts: Options = {}) {
    db.exec(SCHEMA);
    const now = opts.now ?? Date.now;
    this.newId = uuidv7(now, opts.random ?? cryptoRandom);
    const kept = this.one("SELECT value FROM px_meta WHERE key = 'replica'")?.value as string | undefined;
    if (opts.replica !== undefined && kept !== undefined && opts.replica !== kept)
      throw new Error(`this database is replica ${kept}, not ${opts.replica}`);
    this.replica = kept ?? opts.replica ?? this.newId();
    if (!NAME.test(this.replica)) throw new Error(`"${this.replica}" cannot be a replica's name`);
    if (kept === undefined) this.run("INSERT INTO px_meta (key, value) VALUES ('replica', ?)", this.replica);
    this.actor = opts.actor ?? "me";
    this.clock = new Clock(this.replica, now);
    const last = this.one("SELECT MAX(hlc) AS h FROM px_events")?.h as string | null | undefined;
    if (last) this.clock.observe(last);
  }

  // ---- the database --------------------------------------------------------------------------------------------------

  private st(sql: string) {
    let s = this.statements.get(sql);
    if (!s) this.statements.set(sql, (s = this.db.prepare(sql)));
    return s;
  }
  private one(sql: string, ...a: unknown[]) { return this.st(sql).get(...a) as Row | undefined; }
  private all(sql: string, ...a: unknown[]) { return this.st(sql).all(...a) as Row[]; }
  private run(sql: string, ...a: unknown[]) { return this.st(sql).run(...a); }

  /** fn in one transaction -- a savepoint, so it nests inside the companion's own transactions as well as ours */
  transaction<T>(fn: () => T): T {
    const name = `praxis${this.depth}`;
    this.db.exec(`SAVEPOINT ${name}`);
    this.depth++;
    try { const r = fn(); this.db.exec(`RELEASE ${name}`); return r; }
    catch (e) { this.db.exec(`ROLLBACK TO ${name}`); this.db.exec(`RELEASE ${name}`); throw e; }
    finally { this.depth--; }
  }

  // ---- the log and the fold ------------------------------------------------------------------------------------------

  /** a change made here: a new event, kept and folded */
  private emit(space: string, item: string, op: Op, field: string | undefined, value: unknown, actor = this.actor): PxEvent {
    const e: PxEvent = { id: this.newId(), space, item, op, actor, replica: this.replica, hlc: this.clock.tick() };
    if (field !== undefined) e.field = field;
    if (value !== undefined) e.value = value;
    const bad = checkEvent(e);
    if (bad) throw new Error(bad);
    this.keep(e);
    return e;
  }

  /** an event into the log, and folded into the tables; false when the log holds it already */
  private keep(e: PxEvent): boolean {
    const r = this.run("INSERT OR IGNORE INTO px_events (id, space, item, op, field, value, actor, replica, hlc) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", e.id, e.space, e.item, e.op, e.field ?? null,
      e.value === undefined ? null : JSON.stringify(e.value), e.actor, e.replica, e.hlc);
    if (Number(r.changes) === 0) return false;
    this.fold(e);
    return true;
  }

  /** one event into the tables. Every rule here gives the same tables whichever order the events come in. */
  private fold(e: PxEvent) {
    const v = e.value as Row;
    switch (e.op) {
      case "make":
        this.first("px_made", ["item", "space", "kind", "event", "actor", "hlc"], [e.item, e.space, v.kind, e.id, e.actor, e.hlc]);
        for (const [f, x] of Object.entries(v)) if (f !== "kind") this.write(e, f, x);
        break;
      case "set": this.write(e, e.field!, e.value); break;
      case "move": this.write(e, "parent", v.parent); this.write(e, "position", v.position); break;
      case "state": this.write(e, "state", e.value); break;
      case "archive": this.write(e, "archived", e.value); break;
      case "link":
        this.first("px_links", ["id", "space", "item", "type", "target", "actor", "hlc"], [e.id, e.space, e.item, v.type, v.to, e.actor, e.hlc]);
        return;
      case "unlink": this.first("px_unlinks", ["link", "event", "actor", "hlc"], [v.link, e.id, e.actor, e.hlc]); return;
      case "note": this.first("px_notes", ["id", "space", "item", "text", "actor", "hlc"], [e.id, e.space, e.item, v.text, e.actor, e.hlc]); return;
      case "effort":
        this.first("px_efforts", ["id", "space", "item", "seconds", "note", "actor", "hlc"],
          [e.id, e.space, e.item, v.seconds, str(v.note), e.actor, e.hlc]);
        return;
      case "award": case "spend": {
        const id = ledgerId(e.item, e.op, e.field!);
        if (v.back === true) this.first("px_takebacks", ["id", "event", "actor", "hlc"], [id, e.id, e.actor, e.hlc]);
        else this.first("px_ledger", ["id", "space", "item", "op", "key", "points", "reason", "event", "actor", "hlc"],
          [id, e.space, e.item, e.op, e.field, v.points, str(v.reason), e.id, e.actor, e.hlc]);
        return;
      }
      case "propose":
        this.first("px_proposals", ["id", "space", "item", "change", "actor", "hlc"], [e.id, e.space, e.item, JSON.stringify(v), e.actor, e.hlc]);
        // accepted before it arrived here: taken now, once for each accept, as if it had come first
        for (const a of this.all("SELECT hlc FROM px_decisions WHERE proposal = ? AND accept = 1", e.id)) this.take(e.id, a.hlc);
        return;
      case "accept": case "decline":
        this.run("INSERT OR IGNORE INTO px_decisions (event, proposal, accept, actor, hlc) VALUES (?, ?, ?, ?, ?)",
          e.id, v.proposal, e.op === "accept" ? 1 : 0, e.actor, e.hlc);
        if (e.op === "accept") this.take(v.proposal, e.hlc);
        return;
    }
    this.project(e.item);
  }

  /** a row keyed by its first column, where the earliest event to name that key is the one kept */
  private first(table: string, cols: string[], vals: unknown[]) {
    const set = cols.slice(1).map((c) => `${c} = excluded.${c}`).join(", ");
    this.run(`INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")}) ` +
      `ON CONFLICT (${cols[0]}) DO UPDATE SET ${set} WHERE excluded.hlc < ${table}.hlc`, ...vals);
  }

  /** a write to a field: kept in its history, and its value if it is the latest (the earliest, for a handle) */
  private write(e: PxEvent, field: string, value: unknown) {
    if (!NAME.test(field)) return;
    const json = JSON.stringify(value === undefined ? null : value);
    const long = isLong(value);
    this.run("INSERT OR IGNORE INTO px_writes (item, field, hlc, event, actor, value, is_long, base) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      e.item, field, e.hlc, e.id, e.actor, json, long ? 1 : 0, long ? value.base : null);
    const now = this.one("SELECT hlc FROM px_values WHERE item = ? AND field = ?", e.item, field)?.hlc as string | undefined;
    if (now === undefined || (field === "handle" ? e.hlc < now : e.hlc > now))
      this.run("INSERT OR REPLACE INTO px_values (item, field, value, hlc, event) VALUES (?, ?, ?, ?, ?)", e.item, field, json, e.hlc, e.id);
  }

  /** an accepted proposal's change, folded as an event of its own: its id made from the proposal (so two accepts are one
   *  change), the proposer its actor, and the accept's time its time */
  private take(proposal: string, hlc: string) {
    const p = this.one("SELECT space, item, change, actor FROM px_proposals WHERE id = ?", proposal);
    if (!p) return;                                         // it has not arrived yet: it is taken when it does
    const c = JSON.parse(p.change) as { op: Op; field?: string; value?: unknown };
    const e: PxEvent = { id: derivedId("accepted", proposal), space: p.space, item: p.item, op: c.op, actor: p.actor,
      replica: parseHlc(hlc)!.replica, hlc };
    if (c.field !== undefined) e.field = c.field;
    if (c.value !== undefined) e.value = c.value;
    this.fold(e);
  }

  /** the field values an item (or space) holds now, a long body as its text */
  private values(id: string): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const r of this.all("SELECT field, value FROM px_values WHERE item = ?", id)) {
      const v = JSON.parse(r.value);
      out[r.field] = isLong(v) ? v.text : v;
    }
    return out;
  }

  /** an item's (or space's) row, from its making, its fields and its space's form -- redone whenever any of them moves */
  private project(id: string) {
    const made = this.one("SELECT space, kind, hlc, actor FROM px_made WHERE item = ?", id) as Made | undefined;
    if (!made) return;                                      // written to before its making arrived: projected then
    if (made.kind === "space") return this.projectSpace(id, made);
    const r = this.values(id);
    const kind = this.one("SELECT points, virtue FROM px_kinds WHERE space = ? AND kind = ?", made.space, made.kind);
    const state = str(r.state);
    const phase = state === null ? null
      : (this.one("SELECT phase FROM px_states WHERE space = ? AND kind = ? AND state = ?", made.space, made.kind, state)?.phase ?? null);
    const title = str(r.title) ?? "";
    this.run("INSERT OR REPLACE INTO px_items (id, space, kind, title, short, state, phase, parent, position, points, virtue, " +
      "due, archived, handle, made, maker) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      id, made.space, made.kind, title, cut(str(r.short) || title, SHORT), state, phase, str(r.parent), str(r.position) ?? "",
      typeof r.points === "number" ? r.points : (kind?.points ?? 0), str(r.virtue) ?? kind?.virtue ?? null, str(r.due),
      r.archived === true ? 1 : 0, Number.isInteger(r.handle) ? r.handle : null, hlcIso(made.hlc), made.actor);
  }

  private projectSpace(id: string, made: Made) {
    const r = this.values(id);
    const formAt = this.one("SELECT hlc FROM px_values WHERE item = ? AND field = 'form'", id)?.hlc as string | undefined;
    const before = this.one("SELECT form_hlc FROM px_spaces WHERE id = ?", id);
    const form = r.form && !checkForm(r.form).length ? (r.form as Form) : null;
    const reach = REACHES.includes(r.reach as Reach) ? r.reach : "phone";
    this.run("INSERT OR REPLACE INTO px_spaces (id, parent, title, prefix, keeper, reach, form_name, form_version, form_hlc, " +
      "archived, made, maker) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      id, str(r.parent), str(r.title) ?? "", str(r.prefix) ?? "PX", str(r.keeper), reach, form?.name ?? null,
      form?.version ?? null, formAt ?? null, r.archived === true ? 1 : 0, hlcIso(made.hlc), made.actor);
    if ((before?.form_hlc ?? null) === (formAt ?? null)) return;
    // a form taken (or arrived): its kinds, states and fields, and every item of the space projected against them again
    for (const t of ["px_kinds", "px_states", "px_fields"]) this.run(`DELETE FROM ${t} WHERE space = ?`, id);
    for (const [k, kind] of Object.entries(form?.kinds ?? {})) {
      this.run("INSERT INTO px_kinds (space, kind, title, points, virtue) VALUES (?, ?, ?, ?, ?)", id, k, kind.title,
        kind.points ?? null, kind.virtue ?? null);
      kind.states.forEach((s, i) => this.run("INSERT INTO px_states (space, kind, state, phase, position) VALUES (?, ?, ?, ?, ?)",
        id, k, s.name, s.phase, i));
      for (const [f, fd] of Object.entries(kind.fields ?? {}))
        this.run("INSERT INTO px_fields (space, kind, field, type, def) VALUES (?, ?, ?, ?, ?)", id, k, f, fd.type, JSON.stringify(fd));
    }
    for (const it of this.all("SELECT item FROM px_made WHERE space = ? AND kind != 'space'", id)) this.project(it.item);
  }

  /** throw the tables away and fold them again from the log */
  rebuild() {
    this.transaction(() => {
      for (const t of FOLDED) this.db.exec(`DELETE FROM ${t}`);
      for (const r of this.all("SELECT * FROM px_events ORDER BY hlc")) this.fold(eventOf(r));
    });
  }

  /** every table, row by row, sorted -- two replicas that have seen the same events give the same */
  tables(): Record<string, string[]> {
    const out: Record<string, string[]> = {};
    for (const t of ["px_events", ...FOLDED]) out[t] = this.all(`SELECT * FROM ${t}`).map((r) => JSON.stringify(r)).sort();
    return out;
  }

  // ---- reading -------------------------------------------------------------------------------------------------------

  space(id: string): Space | null {
    const s = this.one("SELECT * FROM px_spaces WHERE id = ?", id);
    if (!s) return null;
    const f = this.one("SELECT value FROM px_values WHERE item = ? AND field = 'form'", id);
    return { id, title: s.title, prefix: s.prefix, parent: s.parent, keeper: s.keeper, reach: s.reach,
      form: s.form_name === null ? null : JSON.parse(f!.value), archived: !!s.archived, made: s.made, maker: s.maker };
  }

  spaces(): Space[] { return this.all("SELECT id FROM px_spaces ORDER BY made, id").map((r) => this.space(r.id)!); }

  item(id: string): Item | null {
    const r = this.one("SELECT * FROM px_items WHERE id = ?", id);
    return r ? this.itemOf(r) : null;
  }

  private itemOf(r: Row): Item {
    const prefix = this.one("SELECT prefix FROM px_spaces WHERE id = ?", r.space)?.prefix ?? "PX";
    const fields: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(this.values(r.id))) if (!(CORE as readonly string[]).includes(k)) fields[k] = v;
    return { id: r.id, space: r.space, kind: r.kind, title: r.title, short: r.short, state: r.state, phase: r.phase,
      parent: r.parent, position: r.position, points: r.points, virtue: r.virtue, due: r.due, archived: !!r.archived,
      number: r.handle, handle: r.handle === null ? `${prefix}-~${r.id.slice(-4)}` : `${prefix}-${r.handle}`,
      made: r.made, maker: r.maker, fields };
  }

  /** a space's items in their order; `parent: null` for the top level */
  items(space: string, f: { kind?: string; phase?: Phase; parent?: string | null; archived?: boolean } = {}): Item[] {
    return this.all("SELECT * FROM px_items WHERE space = ? ORDER BY position, id", space)
      .filter((r) => (f.kind === undefined || r.kind === f.kind) && (f.phase === undefined || r.phase === f.phase) &&
        (f.parent === undefined || r.parent === f.parent) && (f.archived === undefined || !!r.archived === f.archived))
      .map((r) => this.itemOf(r));
  }

  /** the item a handle names (LIFE-12 -> 12) */
  numbered(space: string, n: number): Item | null {
    const r = this.one("SELECT * FROM px_items WHERE space = ? AND handle = ?", space, n);
    return r ? this.itemOf(r) : null;
  }

  /** a space's items as a tree. Two moves that never saw each other can make a loop (A under B here, B under A there):
   *  the later of the loop's moves is set aside and its item shown at the top, the same on every replica. */
  tree(space: string): Node[] {
    const items = this.items(space);
    const ids = new Set(items.map((i) => i.id));
    const movedAt = new Map(this.all("SELECT v.item, v.hlc FROM px_values v JOIN px_items i ON i.id = v.item " +
      "WHERE i.space = ? AND v.field = 'parent'", space).map((r) => [r.item as string, r.hlc as string]));
    const parent = new Map(items.map((i) => [i.id, i.parent !== null && ids.has(i.parent) ? i.parent : null]));
    for (const start of parent.keys()) {
      const path: string[] = [], on = new Set<string>();
      let at: string | null = start;
      while (at !== null && !on.has(at)) { on.add(at); path.push(at); at = parent.get(at) ?? null; }
      if (at === null) continue;
      const loop = path.slice(path.indexOf(at));
      parent.set(loop.reduce((a, b) => ((movedAt.get(a) ?? "") >= (movedAt.get(b) ?? "") ? a : b)), null);
    }
    const nodes = new Map(items.map((i) => [i.id, { item: i, children: [] as Node[] }]));
    const top: Node[] = [];
    for (const i of items) (parent.get(i.id) === null ? top : nodes.get(parent.get(i.id)!)!.children).push(nodes.get(i.id)!);
    return top;
  }

  /** an item's events, oldest first: its history (Redmine's journal) */
  log(item: string): PxEvent[] { return this.all("SELECT * FROM px_events WHERE item = ? ORDER BY hlc", item).map(eventOf); }

  /** every write to one field, oldest first, the losers with the winner -- any of them can be set again */
  writes(item: string, field: string): Write[] {
    const won = this.one("SELECT hlc FROM px_values WHERE item = ? AND field = ?", item, field)?.hlc;
    return this.all("SELECT * FROM px_writes WHERE item = ? AND field = ? ORDER BY hlc", item, field).map((r) => {
      const v = JSON.parse(r.value);
      return { value: isLong(v) ? v.text : v, hlc: r.hlc, event: r.event, actor: r.actor, won: r.hlc === won };
    });
  }

  /** a long body's versions SET ASIDE: writes that lost to one that never saw them, newest first. A write made over
   *  another (its base) supersedes it; one that nothing was written over, and that is not the body now, was set aside. */
  versions(item: string, field: string): Version[] {
    const rows = this.all("SELECT * FROM px_writes WHERE item = ? AND field = ? AND is_long = 1", item, field);
    const won = this.one("SELECT hlc FROM px_values WHERE item = ? AND field = ?", item, field)?.hlc;
    const over = new Set(rows.map((r) => r.base).filter((b) => b !== null));
    return rows.filter((r) => r.hlc !== won && !over.has(r.event)).sort(byHlc).reverse()
      .map((r) => ({ text: JSON.parse(r.value).text, hlc: r.hlc, event: r.event, actor: r.actor }));
  }

  /** the links from an item that stand (every one, or of one type) */
  links(item: string, type?: string): Link[] {
    return this.all("SELECT * FROM px_links l WHERE item = ? AND NOT EXISTS (SELECT 1 FROM px_unlinks u WHERE u.link = l.id) " +
      "ORDER BY hlc, id", item).filter((r) => type === undefined || r.type === type)
      .map((r) => ({ id: r.id, item: r.item, type: r.type, to: r.target, actor: r.actor, hlc: r.hlc }));
  }

  /** the links to an item that stand */
  linksTo(target: string): Link[] {
    return this.all("SELECT * FROM px_links l WHERE target = ? AND NOT EXISTS (SELECT 1 FROM px_unlinks u WHERE u.link = l.id) " +
      "ORDER BY hlc, id", target).map((r) => ({ id: r.id, item: r.item, type: r.type, to: r.target, actor: r.actor, hlc: r.hlc }));
  }

  /** an item's checklist: its "check" links, each ticked or not (a tick is a field of the link) */
  checklist(item: string): { id: string; text: string; done: boolean }[] {
    return this.links(item, "check").map((l) => ({ id: l.id, text: l.to, done: this.values(l.id).done === true }));
  }

  notes(item: string): Note[] {
    return this.all("SELECT * FROM px_notes WHERE item = ? ORDER BY hlc, id", item)
      .map((r) => ({ id: r.id, text: r.text, actor: r.actor, hlc: r.hlc }));
  }

  efforts(item: string): Effort[] {
    return this.all("SELECT * FROM px_efforts WHERE item = ? ORDER BY hlc, id", item)
      .map((r) => ({ id: r.id, seconds: r.seconds, note: r.note, actor: r.actor, hlc: r.hlc }));
  }

  /** ARETE's ledger, oldest first: every award and spend, and whether it was taken back */
  ledger(space?: string): Entry[] {
    return this.all("SELECT l.*, t.id IS NOT NULL AS back FROM px_ledger l LEFT JOIN px_takebacks t ON t.id = l.id ORDER BY l.hlc, l.id")
      .filter((r) => space === undefined || r.space === space)
      .map((r) => ({ id: r.id, space: r.space, item: r.item, op: r.op, key: r.key, points: r.points, reason: r.reason,
        actor: r.actor, hlc: r.hlc, back: !!r.back }));
  }

  /** ARETE held: every award less every spend, leaving out what was taken back (one space's, or all of them) */
  arete(space?: string): number {
    const r = this.one("SELECT COALESCE(SUM(CASE op WHEN 'award' THEN points ELSE -points END), 0) AS n FROM px_ledger l " +
      "WHERE NOT EXISTS (SELECT 1 FROM px_takebacks t WHERE t.id = l.id) AND (? IS NULL OR space = ?)", space ?? null, space ?? null);
    return Number(r?.n ?? 0);
  }

  proposal(id: string): Proposal | null {
    const p = this.one("SELECT * FROM px_proposals WHERE id = ?", id);
    if (!p) return null;
    const c = JSON.parse(p.change) as { op: Op; field?: string; value?: unknown };
    const d = this.all("SELECT accept FROM px_decisions WHERE proposal = ?", id).map((r) => r.accept);
    const out: Proposal = { id, space: p.space, item: p.item, op: c.op, actor: p.actor, hlc: p.hlc,
      status: d.includes(1) ? "accepted" : d.length ? "declined" : "open" };
    if (c.field !== undefined) out.field = c.field;
    if (c.value !== undefined) out.value = c.value;
    return out;
  }

  proposals(space: string, status?: Proposal["status"]): Proposal[] {
    return this.all("SELECT id FROM px_proposals WHERE space = ? ORDER BY hlc, id", space).map((r) => this.proposal(r.id)!)
      .filter((p) => status === undefined || p.status === status);
  }

  // ---- changing ------------------------------------------------------------------------------------------------------

  private must(id: string): Item {
    const it = this.item(id);
    if (!it) throw new Error(`no item ${id}`);
    return it;
  }

  private mustSpace(id: string): Space & { form: Form } {
    const s = this.space(id);
    if (!s) throw new Error(`no space ${id}`);
    if (!s.form) throw new Error(`space ${s.title} has no form`);
    return s as Space & { form: Form };
  }

  /** a value for a field, checked against the item's kind (a long body becomes { text, base }) */
  private checked(space: Space & { form: Form }, kind: string, field: string, value: unknown, base: string | null): unknown {
    const bad = (why: string) => new Error(`${field}: ${why}`);
    switch (field) {
      case "title": if (typeof value !== "string" || !value.trim() || value.length > 400) throw bad("a title, up to 400 characters"); return value;
      case "short": if (value !== null && (typeof value !== "string" || Array.from(value).length > SHORT)) throw bad(`at most ${SHORT} characters`); return value;
      case "points": if (value !== null && !(Number.isInteger(value) && (value as number) >= 0)) throw bad("a whole number"); return value;
      case "virtue": if (value !== null && typeof value !== "string") throw bad("a virtue's name"); return value;
      case "due": if (value !== null && !(typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value))) throw bad("a date, YYYY-MM-DD"); return value;
      case "state": case "parent": case "position": case "archived": case "handle": case "kind":
        throw bad("is changed by its own call (state, move, archive), not set");
    }
    const fd = space.form.kinds[kind]?.fields?.[field];
    if (!fd) throw bad(`a ${kind} has no such field`);
    if (fd.type === "long") {
      if (value !== null && typeof value !== "string") throw bad("text");
      return { text: value ?? "", base };
    }
    const why = checkValue(fd, value);
    if (why) throw bad(why);
    return value;
  }

  /** a position for an item among its siblings: at the end, at the start (after: null) or after one of them */
  private slot(space: string, parent: string | null, after?: string | null, skip?: string): string {
    const sibs = this.all("SELECT id, position FROM px_items WHERE space = ? AND parent IS ? AND id IS NOT ? AND position != '' " +
      "ORDER BY position, id", space, parent, skip ?? null);
    if (after === undefined) return between(sibs.at(-1)?.position ?? null, null);
    if (after === null) return between(null, sibs[0]?.position ?? null);
    const i = sibs.findIndex((s) => s.id === after);
    if (i < 0) throw new Error(`${after} is not beside it`);
    return between(sibs[i].position, sibs.slice(i + 1).find((s) => s.position > sibs[i].position)?.position ?? null);
  }

  /** a SPACE, made from a form. Its keeper numbers its handles: this replica, unless another is named. */
  makeSpace(o: { title: string; form: Form; prefix?: string; reach?: Reach; parent?: string | null; keeper?: string | null } & By): string {
    const problems = checkForm(o.form);
    if (problems.length) throw new Error(`the form: ${problems.join("; ")}`);
    const prefix = o.prefix ?? (o.title.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4) || "PX");
    if (!/^[A-Z][A-Z0-9]{0,9}$/.test(prefix)) throw new Error(`"${prefix}" cannot be a handle's prefix`);
    if (o.reach !== undefined && !REACHES.includes(o.reach)) throw new Error(`reach is one of ${REACHES.join(", ")}`);
    const id = this.newId();
    this.transaction(() => this.emit(id, id, "make", undefined, { kind: "space", title: o.title, prefix,
      reach: o.reach ?? "phone", keeper: o.keeper === undefined ? this.replica : o.keeper, form: o.form, parent: o.parent ?? null }, o.actor));
    return id;
  }

  /** a space's title, prefix, reach, keeper or parent */
  setSpace(space: string, field: "title" | "prefix" | "reach" | "keeper" | "parent", value: string | null, o: By = {}) {
    this.mustSpace(space);
    if (field === "reach" && !REACHES.includes(value as Reach)) throw new Error(`reach is one of ${REACHES.join(", ")}`);
    if (field === "prefix" && !/^[A-Z][A-Z0-9]{0,9}$/.test(value ?? "")) throw new Error(`"${value}" cannot be a handle's prefix`);
    if (field === "title" && !value?.trim()) throw new Error("a space needs a title");
    this.transaction(() => { this.emit(space, space, "set", field, value, o.actor); this.number(); });
  }

  /** take a form -- a newer version of its own, or another -- for a space */
  adopt(space: string, form: Form, o: By = {}) {
    const problems = checkForm(form);
    if (problems.length) throw new Error(`the form: ${problems.join("; ")}`);
    this.mustSpace(space);
    this.transaction(() => this.emit(space, space, "set", "form", form, o.actor));
  }

  /** an ITEM of a kind the space's form has, with its fields; at the end of its parent's items unless `after` says */
  make(space: string, kind: string, fields: { title: string } & Record<string, unknown>,
    o: { parent?: string | null; after?: string | null } & By = {}): string {
    return this.transaction(() => {
      const id = this.newId();
      this.emit(space, id, "make", undefined, this.making(space, kind, fields, o), o.actor);
      this.number();
      return id;
    });
  }

  private making(space: string, kind: string, fields: Record<string, unknown>, o: { parent?: string | null; after?: string | null }) {
    const s = this.mustSpace(space);
    const k = s.form.kinds[kind];
    if (!k) throw new Error(`${s.title} has no kind ${kind}`);
    const { state, ...rest } = fields;
    if (state !== undefined && !k.states.some((x) => x.name === state)) throw new Error(`a ${kind} has no state ${state}`);
    const value: Record<string, unknown> = { kind, state: state ?? k.states[0].name };
    for (const [f, x] of Object.entries(rest)) value[f] = this.checked(s, kind, f, x, null);
    if (typeof value.title !== "string") throw new Error("an item needs a title");
    const parent = o.parent ?? null;
    if (parent !== null && this.must(parent).space !== space) throw new Error("a parent is in the same space");
    value.parent = parent;
    value.position = this.slot(space, parent, o.after);
    return value;
  }

  /** a field of an item: its title, short, points, virtue, due, or one its kind defines */
  set(item: string, field: string, value: unknown, o: By = {}) {
    this.transaction(() => {
      const it = this.must(item);
      const base = this.one("SELECT event FROM px_values WHERE item = ? AND field = ?", item, field)?.event ?? null;
      this.emit(it.space, item, "set", field, this.checked(this.mustSpace(it.space), it.kind, field, value, base), o.actor);
    });
  }

  /** an item under another (or to the top), at the end of its new siblings unless `after` says */
  move(item: string, parent: string | null, o: { after?: string | null } & By = {}) {
    this.transaction(() => {
      const it = this.must(item);
      // up from the new parent (a loop two replicas made already is walked once, not forever)
      for (let at = parent, seen = new Set<string>(); at !== null && !seen.has(at); seen.add(at), at = this.must(at).parent) {
        if (at === item) throw new Error("an item cannot go under itself");
        if (this.must(at).space !== it.space) throw new Error("a parent is in the same space");
      }
      this.emit(it.space, item, "move", undefined, { parent, position: this.slot(it.space, parent, o.after, item) }, o.actor);
    });
  }

  /** an item into a state. Into a done phase it earns its points; out of one, they are taken back. */
  state(item: string, state: string, o: By = {}) {
    this.transaction(() => {
      const it = this.must(item);
      if (!this.mustSpace(it.space).form.kinds[it.kind]?.states.some((s) => s.name === state)) throw new Error(`a ${it.kind} has no state ${state}`);
      this.emit(it.space, item, "state", undefined, state, o.actor);
      this.settle(item, it.phase, o.actor);
    });
  }

  /** finishing pays once per finish (PROJECTS.md 6): the award's key is the finish's round, so a phone and a hub that both
   *  finish one step make the same award; undoing takes it back and opens the next round, so doing it again pays once */
  private settle(item: string, before: Phase | null, actor?: string) {
    const it = this.must(item);
    if ((it.phase === "done") === (before === "done")) return;
    const round = 1 + Number(this.one("SELECT COUNT(*) AS n FROM px_takebacks t JOIN px_ledger l ON l.id = t.id " +
      "WHERE l.item = ? AND l.op = 'award' AND l.key LIKE 'finish:%'", item)?.n ?? 0);
    const key = `finish:${round}`, id = ledgerId(item, "award", key);
    const paid = !!this.one("SELECT 1 FROM px_ledger WHERE id = ?", id);
    if (it.phase === "done" && !paid && it.points > 0) this.emit(it.space, item, "award", key, { points: it.points, reason: "finish" }, actor);
    if (it.phase !== "done" && paid) this.emit(it.space, item, "award", key, { back: true }, actor);
  }

  /** archive an item or a space (or bring it back) */
  archive(id: string, on = true, o: By = {}) {
    this.transaction(() => {
      const space = this.item(id)?.space ?? (this.space(id) ? id : null);
      if (space === null) throw new Error(`no item or space ${id}`);
      this.emit(space, id, "archive", undefined, on, o.actor);
    });
  }

  /** a link from an item: to another item (blocks, follows, relates, made-from) or a word (tag, check); its id */
  link(item: string, type: typeof LINK_TYPES[number], to: string, o: By = {}): string {
    if (!LINK_TYPES.includes(type)) throw new Error(`a link is one of ${LINK_TYPES.join(", ")}`);
    return this.transaction(() => {
      const it = this.must(item);
      if (type !== "tag" && type !== "check") this.must(to);
      else if (!to.trim()) throw new Error(`a ${type} needs words`);
      return this.emit(it.space, item, "link", undefined, { type, to }, o.actor).id;
    });
  }

  /** a link taken away -- that link, by its id: one added elsewhere that this replica never saw stands */
  unlink(link: string, o: By = {}) {
    this.transaction(() => {
      const l = this.one("SELECT space, item FROM px_links WHERE id = ?", link);
      if (!l) throw new Error(`no link ${link}`);
      this.emit(l.space, l.item, "unlink", undefined, { link }, o.actor);
    });
  }

  /** a line on an item's checklist; its id */
  check(item: string, text: string, o: By = {}) { return this.link(item, "check", text, o); }

  /** a checklist line ticked (or not) */
  tick(line: string, done = true, o: By = {}) {
    this.transaction(() => {
      const l = this.one("SELECT space FROM px_links WHERE id = ? AND type = 'check'", line);
      if (!l) throw new Error(`no checklist line ${line}`);
      this.emit(l.space, line, "set", "done", done, o.actor);
    });
  }

  note(item: string, text: string, o: By = {}): string {
    if (!text.trim()) throw new Error("a note needs words");
    return this.transaction(() => this.emit(this.must(item).space, item, "note", undefined, { text }, o.actor).id);
  }

  /** EFFORT: time given to an item */
  effort(item: string, seconds: number, o: { note?: string } & By = {}): string {
    if (!Number.isFinite(seconds)) throw new Error("effort is in seconds");
    return this.transaction(() => this.emit(this.must(item).space, item, "effort", undefined,
      o.note === undefined ? { seconds } : { seconds, note: o.note }, o.actor).id);
  }

  /** ARETE awarded for an item under a key (a rule's: "finish:1", "virtue:2026-11-19"). The same item and key are one
   *  award wherever it is made, so a rule that runs twice, or on two replicas, pays once. Null if it is paid already. */
  award(item: string, key: string, points: number, o: { reason?: string } & By = {}): string | null {
    return this.transaction(() => {
      const it = this.must(item);
      if (this.one("SELECT 1 FROM px_ledger WHERE id = ?", ledgerId(item, "award", key))) return null;
      return this.emit(it.space, item, "award", key, o.reason === undefined ? { points } : { points, reason: o.reason }, o.actor).id;
    });
  }

  /** ARETE spent (the REWARD SHELF): from a space, for an item there if one is named; its key */
  spend(space: string, points: number, o: { item?: string; reason?: string; key?: string } & By = {}): string {
    return this.transaction(() => {
      this.mustSpace(space);
      if (points > this.arete()) throw new Error(`${points} ARETE is more than is held (${this.arete()})`);
      const key = o.key ?? this.newId();
      const item = o.item ?? space;
      if (item !== space && this.must(item).space !== space) throw new Error("a spend's item is in its space");
      this.emit(space, item, "spend", key, o.reason === undefined ? { points } : { points, reason: o.reason }, o.actor);
      return key;
    });
  }

  /** an award or spend taken back -- undo, as an entry of its own */
  takeBack(item: string, op: "award" | "spend", key: string, o: By = {}) {
    this.transaction(() => {
      const e = this.one("SELECT space FROM px_ledger WHERE id = ?", ledgerId(item, op, key));
      if (!e) throw new Error(`no ${op} ${key} for ${item}`);
      if (this.one("SELECT 1 FROM px_takebacks WHERE id = ?", ledgerId(item, op, key))) return;
      this.emit(e.space, item, op, key, { back: true }, o.actor);
    });
  }

  /** a PROPOSAL: a change to an item that counts only once it is accepted. Its id. */
  propose(item: string, change: { op: Op; field?: string; value?: unknown }, o: By = {}): string {
    if (!PROPOSABLE.includes(change.op) || change.op === "make") throw new Error(`${change.op} cannot be proposed this way`);
    const bad = checkChange(change.op, change.field, change.value);
    if (bad) throw new Error(bad);
    return this.transaction(() => this.emit(this.must(item).space, item, "propose", undefined, change, o.actor).id);
  }

  /** a new item, proposed: it is made only once the proposal is accepted (its parent may be another proposed item) */
  proposeMake(space: string, kind: string, fields: { title: string } & Record<string, unknown>,
    o: { parent?: string | null } & By = {}): { proposal: string; item: string } {
    return this.transaction(() => {
      const s = this.mustSpace(space), k = s.form.kinds[kind];
      if (!k) throw new Error(`${s.title} has no kind ${kind}`);
      const parent = o.parent ?? null;
      const value: Record<string, unknown> = { kind, state: k.states[0].name, parent, position: this.slot(space, parent) };
      for (const [f, x] of Object.entries(fields)) value[f] = this.checked(s, kind, f, x, null);
      const item = this.newId();
      return { proposal: this.emit(space, item, "propose", undefined, { op: "make", value }, o.actor).id, item };
    });
  }

  accept(proposal: string, o: By = {}) {
    this.transaction(() => {
      const p = this.proposal(proposal);
      if (!p) throw new Error(`no proposal ${proposal}`);
      if (p.status === "accepted") return;
      const before = this.item(p.item)?.phase ?? null;
      this.emit(p.space, p.item, "accept", undefined, { proposal }, o.actor);
      if (p.op === "state") this.settle(p.item, before, o.actor);
      this.number();
    });
  }

  decline(proposal: string, o: By = {}) {
    this.transaction(() => {
      const p = this.proposal(proposal);
      if (!p) throw new Error(`no proposal ${proposal}`);
      if (p.status !== "open") return;
      this.emit(p.space, p.item, "decline", undefined, { proposal }, o.actor);
    });
  }

  /** HANDLES: in every space this replica keeps, each item without a number given the next, in the order they were
   *  made. Runs after every change made here and every exchange; returns how many it numbered. */
  number(): number {
    let n = 0;
    for (const s of this.all("SELECT id FROM px_spaces WHERE keeper = ?", this.replica)) {
      let next = 1 + Number(this.one("SELECT COALESCE(MAX(handle), 0) AS n FROM px_items WHERE space = ?", s.id)?.n ?? 0);
      for (const it of this.all("SELECT i.id FROM px_items i JOIN px_made m ON m.item = i.id WHERE i.space = ? AND i.handle IS NULL " +
        "ORDER BY m.hlc, i.id", s.id)) {
        this.emit(s.id, it.id, "set", "handle", next++, "keeper");
        n++;
      }
    }
    return n;
  }

  // ---- the exchange (PROJECTS.md 5): it knows nothing of how the events travel ---------------------------------------

  /** what this replica has seen: for each space, the latest time it holds from each replica */
  have(spaces?: string[]): Have {
    const out: Have = {};
    for (const r of this.all("SELECT space, replica, MAX(hlc) AS hlc FROM px_events GROUP BY space, replica"))
      if (!spaces || spaces.includes(r.space)) (out[r.space] ??= {})[r.replica] = r.hlc;
    return out;
  }

  /** the events another replica has not seen, oldest first -- never a space whose reach is THIS PHONE. A replica's
   *  events are always sent from its oldest unseen on, so what a replica holds of each other is never missing a middle,
   *  and its `have` stays a true account of it; `limit` keeps that true too. */
  missing(have: Have, o: { spaces?: string[]; limit?: number } = {}): PxEvent[] {
    const limit = o.limit ?? Number.MAX_SAFE_INTEGER;
    const out: PxEvent[] = [];
    for (const { space, replica } of this.all("SELECT DISTINCT space, replica FROM px_events")) {
      if (o.spaces && !o.spaces.includes(space)) continue;
      if (this.one("SELECT reach FROM px_spaces WHERE id = ?", space)?.reach === "phone") continue;
      out.push(...this.all("SELECT * FROM px_events WHERE space = ? AND replica = ? AND hlc > ? ORDER BY hlc LIMIT ?",
        space, replica, have[space]?.[replica] ?? "", limit).map(eventOf));
    }
    return out.sort(byHlc).slice(0, limit);
  }

  /** events from another replica: each checked, kept and folded, oldest first, in one transaction. A malformed one is
   *  refused and counted; one already held is counted as known. */
  receive(events: PxEvent[]): Received {
    const out: Received = { applied: 0, known: 0, rejected: 0 };
    this.transaction(() => {
      for (const e of [...events].sort(byHlc)) {
        if (checkEvent(e)) { out.rejected++; continue; }
        this.clock.observe(e.hlc);
        if (this.keep(e)) out.applied++; else out.known++;
      }
      if (out.applied) this.number();
    });
    return out;
  }
}
