// C-290: this file runs on the phone too (C-111) -- the app imports it, directly or through another file -- so keep it free of Node-only APIs (node:*, fs).
// Goals, their sub-items, and each sub-item's steps (PLAN 2). The SQL is the same wherever it runs: Node's own SQLite on
// the computer (db.ts), Expo's on a phone that hosts on its own (C-111, app/platform/local.ts) -- each hands the Store a Db.
// C-430: the goals are PRAXIS's items now (goals.ts), in the same database; the Store's goal calls answer from there, in
// the shapes they always had. The tables goals, subitems and steps are kept as they were, read once into events.
import { Goals } from "./goals.js";

// C-111: what the Store asks of a database -- Node's DatabaseSync has it, and so does a thin wrapper over expo-sqlite
export interface Statement {
  get(...args: unknown[]): unknown;
  all(...args: unknown[]): unknown[];
  run(...args: unknown[]): { lastInsertRowid: number | bigint; changes: number | bigint };
}
export interface Db { exec(sql: string): void; prepare(sql: string): Statement }

export interface Step { id: number; text: string; done: boolean }
export interface SubItem { id: number; title: string; done: boolean; steps: Step[] }
export interface Goal { id: number; title: string; done: boolean; subitems: SubItem[] }
export interface Plan { subitems: { title: string; steps: string[] }[] }

type LogRow = { at: string; kind: string; detail: string | null; daemon: string | null };   // C-415
export class Store {
  db: Db;
  /** C-430: the wall clock GOALS' events are stamped by (a test sets its own) */
  readonly now: () => number;

  constructor(db: Db, o: { now?: () => number } = {}) {
    this.db = db;
    this.now = o.now ?? (() => Date.now());
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS goals (id INTEGER PRIMARY KEY, title TEXT NOT NULL, created TEXT NOT NULL, done TEXT);
      CREATE TABLE IF NOT EXISTS subitems (id INTEGER PRIMARY KEY, goal INTEGER NOT NULL REFERENCES goals(id),
        title TEXT NOT NULL, position INTEGER NOT NULL, done TEXT);
      CREATE TABLE IF NOT EXISTS steps (id INTEGER PRIMARY KEY, subitem INTEGER NOT NULL REFERENCES subitems(id),
        text TEXT NOT NULL, position INTEGER NOT NULL, done TEXT);
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS interactions (id INTEGER PRIMARY KEY, at TEXT NOT NULL, kind TEXT NOT NULL, detail TEXT);
      CREATE TABLE IF NOT EXISTS phones (token TEXT PRIMARY KEY, name TEXT NOT NULL, paired TEXT NOT NULL, seen TEXT);
      -- the daemon's log is read by when (its life, its feelings, its spirits): by when it is found, not by every row
      CREATE INDEX IF NOT EXISTS interactions_at ON interactions (at);
      CREATE INDEX IF NOT EXISTS interactions_kind_at ON interactions (kind, at);`);
    // C-415: whose care it was -- the daemon's personality, or null for the household's (and every row from before)
    const cols = this.db.prepare("PRAGMA table_info(interactions)").all() as { name: string }[];
    if (!cols.some((c) => c.name === "daemon")) this.db.exec("ALTER TABLE interactions ADD COLUMN daemon TEXT");
  }

  // C-22: the save the app is married to -- the game it carries daemons for. Unset until the first SYNC.
  married(): { name: string; trainerId: number; secretId: number } | null {
    const row = this.db.prepare("SELECT value FROM settings WHERE key = 'married'").get() as { value: string } | undefined;
    return row ? JSON.parse(row.value) : null;
  }

  marry(game: { name: string; trainerId: number; secretId: number }) {
    this.db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('married', ?)").run(JSON.stringify(game));
  }

  // C-13 (the user, 2026-10-04): using the companion at all -- a radio ROUTINE included -- is tending the daemon.
  // Each use is kept; the daemon's life (C-13, still to build) reads from here.
  // C-415: `daemon`, the personality of the daemon it was for -- a care, given by a device that carries one
  logInteraction(kind: string, detail: string | null, at = new Date(), daemon: number | null = null) {
    this.db.prepare("INSERT INTO interactions (at, kind, detail, daemon) VALUES (?, ?, ?, ?)")
      .run(at.toISOString(), kind, detail, daemon === null ? null : String(daemon >>> 0));
    this.recent = null; this.interactionsRev++;
  }

  // C-13: everything since a moment, oldest first -- the daemon's life reads two weeks of it
  // One answer (THE MIND's portal, a talk's self) reads its life, feelings and spirits from the log a dozen times over,
  // each a window back from now: on the hub's one slow core that was 13 s (2026-11-14). So the last five weeks are read
  // once and kept for two seconds, or until the log is written, and every window inside them is cut from that.
  // counts every write to the log, so a reading of it can be kept until the log moves (core.ts lifeOf)
  interactionsRev = 0;
  private recent: { from: string; made: number; rows: LogRow[] } | null = null;
  // C-415: `daemon` given, only the household's rows and that daemon's own -- another daemon's cares are left out
  interactionsSince(since: Date, daemon: number | null = null): { at: string; kind: string; detail: string | null }[] {
    const s = since.toISOString(), now = Date.now();
    const own = daemon === null ? null : String(daemon >>> 0);
    const cut = (rows: LogRow[]) =>
      rows.filter((r) => r.at >= s && (own === null || r.daemon === null || r.daemon === own)).map(({ at, kind, detail }) => ({ at, kind, detail }));
    if (this.recent && now - this.recent.made < 2000 && this.recent.from <= s) return cut(this.recent.rows);
    const wide = new Date(Math.min(since.getTime(), now - 35 * 86400000)).toISOString();
    const rows = this.db.prepare("SELECT at, kind, detail, daemon FROM interactions WHERE at >= ? ORDER BY id").all(wide) as LogRow[];
    this.recent = { from: wide, made: now, rows };
    return cut(rows);
  }

  // C-45: the experience a daemon gained on the device and not yet written into the save (by its personality)
  expAfter(personality: number, id: number): { id: number; gain: number }[] {
    return (this.db.prepare("SELECT id, detail FROM interactions WHERE kind = 'exp' AND id > ? AND detail LIKE ? ORDER BY id")
      .all(id, `${personality} %`) as { id: number; detail: string }[]).map((r) => ({ id: r.id, gain: Number(r.detail.split(" ")[1]) || 0 }));
  }

  // C-151: one kind since a moment, oldest first (who sat at the CASINO lately)
  kindSince(kind: string, since: Date): { id: number; at: string; detail: string | null }[] {
    return this.db.prepare("SELECT id, at, detail FROM interactions WHERE kind = ? AND at >= ? ORDER BY id").all(kind, since.toISOString()) as any;
  }

  // C-149: every interaction of one kind, oldest first (the CASINO's results)
  kindAll(kind: string): { id: number; at: string; detail: string | null }[] {
    return this.db.prepare("SELECT id, at, detail FROM interactions WHERE kind = ? ORDER BY id").all(kind) as any;
  }

  // C-53: phones paired with this companion, each with its own key
  addPhone(token: string, name: string) { this.db.prepare("INSERT INTO phones (token, name, paired) VALUES (?, ?, ?)").run(token, name, new Date().toISOString()); }
  phoneFor(token: string): { name: string } | null {
    const r = this.db.prepare("SELECT name FROM phones WHERE token = ?").get(token) as { name: string } | undefined;
    if (r) this.db.prepare("UPDATE phones SET seen = ? WHERE token = ?").run(new Date().toISOString(), token);
    return r ?? null;
  }
  phones(): { name: string; paired: string; seen: string | null }[] {
    return this.db.prepare("SELECT name, paired, seen FROM phones ORDER BY paired").all() as any;
  }
  forgetPhone(name: string) { this.db.prepare("DELETE FROM phones WHERE name = ?").run(name); }
  // C-337: a paired phone renames itself -- by its own key, so it can name nothing but itself
  renamePhone(token: string, name: string): boolean { return this.db.prepare("UPDATE phones SET name = ? WHERE token = ?").run(name, token).changes > 0; }

  // C-15: the meetings not yet written into the save (after the last one a SYNC wrote)
  meetingsAfter(id: number): { id: number; at: string; detail: string | null }[] {
    return this.db.prepare("SELECT id, at, detail FROM interactions WHERE kind = 'met' AND id > ? ORDER BY id").all(id) as any;
  }

  // C-60: the latest meetings, newest first, for the DAEMON tab
  meetings(limit = 20): { id: number; at: string; detail: string | null }[] {
    return this.db.prepare("SELECT id, at, detail FROM interactions WHERE kind = 'met' ORDER BY id DESC LIMIT ?").all(limit) as any;
  }

  // C-430: the log's last row, so THRIVE knows where the log's count of goals stops and ARETE's begins
  lastInteractionId(): number {
    return Number((this.db.prepare("SELECT MAX(id) AS n FROM interactions").get() as { n: number | null } | undefined)?.n ?? 0);
  }

  lastInteraction(): { at: string; kind: string; detail: string | null } | null {
    return (this.db.prepare("SELECT at, kind, detail FROM interactions ORDER BY id DESC LIMIT 1").get() as
      { at: string; kind: string; detail: string | null } | undefined) ?? null;
  }

  // C-29: a plain string setting. The save path the user chose lives here, overriding config.json, so it survives
  // without editing a file by hand.
  getSetting(key: string): string | null {
    const row = this.db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
    return row ? row.value : null;
  }

  // C-157 (the review): several writes as one -- all of them, or (if one throws) none
  together<T>(fn: () => T): T {
    this.db.exec("BEGIN");
    try { const r = fn(); this.db.exec("COMMIT"); return r; }
    catch (e) { this.db.exec("ROLLBACK"); throw e; }
  }

  setSetting(key: string, value: string | null) {
    if (value === null) this.db.prepare("DELETE FROM settings WHERE key = ?").run(key);
    else this.db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, value);
  }

  // ---- C-430: GOALS, on PRAXIS (goals.ts) -- made the first time anything asks, reading the old tables in once --------
  private goalsOn: Goals | null = null;
  get life(): Goals { return (this.goalsOn ??= new Goals(this)); }

  addGoal(title: string, plan?: Plan): Goal { return this.life.addGoal(title, plan); }
  goal(id: number): Goal | null { return this.life.goal(id); }
  goals(): Goal[] { return this.life.goals(); }
  /** the goals still open, oldest first */
  openGoals(): Goal[] { return this.life.openGoals(); }
  currentGoal(): Goal | null { return this.life.currentGoal(); }
  /** a goal set aside for a new one (POST /api/goal with replace) */
  setAside(goal: number) { this.life.setAside(goal); }

  // Tick a step off; a sub-item whose steps are all done is done, and a goal whose sub-items are all done is done.
  // C-50: and say what that finished -- a milestone (a named sub-item), the whole goal -- so it can be celebrated.
  completeStep(id: number): { ok: boolean; fresh: boolean; milestone: string | null; goal: string | null } { return this.life.completeStep(id); }

  // C-49: undo a step ticked by accident -- it, its milestone and its goal are open again.
  undoStep(id: number): boolean {
    if (!this.life.undoStep(id)) return false;
    // and what it gave the daemon goes back with it: its meal (C-44) and its experience (C-47), if not yet written home
    this.db.prepare("DELETE FROM interactions WHERE (kind = 'step' AND detail IN (?, ?)) OR (kind = 'exp' AND detail LIKE ?)")
      .run(`site ${id}`, `device ${id}`, `% step ${id}`);
    this.recent = null; this.interactionsRev++;
    return true;
  }

  // ---- C-46: ONE goal, built from milestones and steps. A milestone is a named sub-item; a step added straight to the
  // goal lives in an unnamed one (consecutive loose steps share it), so the store keeps its one shape.
  // C-357 (4): when each of a goal's done steps was ticked (ISO times), for SLOW WRITES
  stepTimes(goal: number): string[] { return this.life.stepTimes(goal); }
  // C-253: what was done toward goals in a span, for the daemon's memory
  goalsDoneBetween(from: Date, to: Date) { return this.life.doneBetween(from, to); }
  // C-207, C-430: the goals (or steps) finished since a time, for THRIVE
  finishedSince(kind: "goal" | "step", since: Date): number { return this.life.finishedSince(kind, since); }
  // C-455: the ARETE earned in a span, for MENTIONS FROM YOUR DAEMON
  areteBetween(from: Date, to: Date): number { return this.life.earnedBetween(from, to); }
  addMilestone(goal: number, title: string): number { return this.life.addMilestone(goal, title); }
  addStep(goal: number, text: string, milestone?: number): number | null { return this.life.addStep(goal, text, milestone); }
  removeStep(id: number) { this.life.removeStep(id); }
  removeMilestone(id: number) { this.life.removeMilestone(id); }

  // THE ONE THING (PLAN 2): the first open step of the first open sub-item of the oldest open goal.
  // C-49: and where it sits in its milestone, so the board can show that subtly ("BATHROOM 2/3"); null when loose.
  nextStep(): { goal: string; subitem: string; step: Step; milestone: { title: string; at: number; of: number } | null } | null {
    return this.life.nextStep();
  }
}
