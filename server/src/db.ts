// Goals, their sub-items, and each sub-item's steps (PLAN 2). Node's own SQLite -- nothing native to build.
import { DatabaseSync } from "node:sqlite";

export interface Step { id: number; text: string; done: boolean }
export interface SubItem { id: number; title: string; done: boolean; steps: Step[] }
export interface Goal { id: number; title: string; done: boolean; subitems: SubItem[] }
export interface Plan { subitems: { title: string; steps: string[] }[] }

export class Store {
  db: DatabaseSync;

  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS goals (id INTEGER PRIMARY KEY, title TEXT NOT NULL, created TEXT NOT NULL, done TEXT);
      CREATE TABLE IF NOT EXISTS subitems (id INTEGER PRIMARY KEY, goal INTEGER NOT NULL REFERENCES goals(id),
        title TEXT NOT NULL, position INTEGER NOT NULL, done TEXT);
      CREATE TABLE IF NOT EXISTS steps (id INTEGER PRIMARY KEY, subitem INTEGER NOT NULL REFERENCES subitems(id),
        text TEXT NOT NULL, position INTEGER NOT NULL, done TEXT);
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS interactions (id INTEGER PRIMARY KEY, at TEXT NOT NULL, kind TEXT NOT NULL, detail TEXT);`);
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
  logInteraction(kind: string, detail: string | null, at = new Date()) {
    this.db.prepare("INSERT INTO interactions (at, kind, detail) VALUES (?, ?, ?)").run(at.toISOString(), kind, detail);
  }

  // C-13: everything since a moment, oldest first -- the daemon's life reads two weeks of it
  interactionsSince(since: Date): { at: string; kind: string; detail: string | null }[] {
    return this.db.prepare("SELECT at, kind, detail FROM interactions WHERE at >= ? ORDER BY id").all(since.toISOString()) as any;
  }

  // C-45: the experience a daemon gained on the device and not yet written into the save (by its personality)
  expAfter(personality: number, id: number): { id: number; gain: number }[] {
    return (this.db.prepare("SELECT id, detail FROM interactions WHERE kind = 'exp' AND id > ? AND detail LIKE ? ORDER BY id")
      .all(id, `${personality} %`) as { id: number; detail: string }[]).map((r) => ({ id: r.id, gain: Number(r.detail.split(" ")[1]) || 0 }));
  }

  // C-15: the meetings not yet written into the save (after the last one a SYNC wrote)
  meetingsAfter(id: number): { id: number; at: string; detail: string | null }[] {
    return this.db.prepare("SELECT id, at, detail FROM interactions WHERE kind = 'met' AND id > ? ORDER BY id").all(id) as any;
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

  setSetting(key: string, value: string | null) {
    if (value === null) this.db.prepare("DELETE FROM settings WHERE key = ?").run(key);
    else this.db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, value);
  }

  addGoal(title: string, plan?: Plan): Goal {
    const now = new Date().toISOString();
    const g = Number(this.db.prepare("INSERT INTO goals (title, created) VALUES (?, ?)").run(title, now).lastInsertRowid);
    (plan?.subitems ?? []).forEach((s, i) => {
      const sid = Number(this.db.prepare("INSERT INTO subitems (goal, title, position) VALUES (?, ?, ?)").run(g, s.title, i).lastInsertRowid);
      s.steps.forEach((text, j) => this.db.prepare("INSERT INTO steps (subitem, text, position) VALUES (?, ?, ?)").run(sid, text, j));
    });
    return this.goal(g)!;
  }

  goal(id: number): Goal | null {
    const g = this.db.prepare("SELECT id, title, done FROM goals WHERE id = ?").get(id) as any;
    if (!g) return null;
    const subitems = (this.db.prepare("SELECT id, title, done FROM subitems WHERE goal = ? ORDER BY position").all(id) as any[])
      .map((s) => ({ id: s.id, title: s.title, done: !!s.done,
        steps: (this.db.prepare("SELECT id, text, done FROM steps WHERE subitem = ? ORDER BY position").all(s.id) as any[])
          .map((t) => ({ id: t.id, text: t.text, done: !!t.done })) }));
    return { id: g.id, title: g.title, done: !!g.done, subitems };
  }

  goals(): Goal[] {
    return (this.db.prepare("SELECT id FROM goals ORDER BY id").all() as any[]).map((r) => this.goal(r.id)!);
  }

  // Tick a step off; a sub-item whose steps are all done is done, and a goal whose sub-items are all done is done.
  // C-50: and say what that finished -- a milestone (a named sub-item), the whole goal -- so it can be celebrated.
  completeStep(id: number): { ok: boolean; fresh: boolean; milestone: string | null; goal: string | null } {
    const now = new Date().toISOString();
    const row = this.db.prepare("SELECT subitem, done FROM steps WHERE id = ?").get(id) as any;
    if (!row) return { ok: false, fresh: false, milestone: null, goal: null };
    if (row.done) return { ok: true, fresh: false, milestone: null, goal: null };   // already done: nothing new to celebrate
    this.db.prepare("UPDATE steps SET done = ? WHERE id = ?").run(now, id);
    let milestone: string | null = null, goal: string | null = null;
    const open = (this.db.prepare("SELECT COUNT(*) AS n FROM steps WHERE subitem = ? AND done IS NULL").get(row.subitem) as any).n;
    if (open === 0) {
      this.db.prepare("UPDATE subitems SET done = ? WHERE id = ? AND done IS NULL").run(now, row.subitem);
      const s = this.db.prepare("SELECT goal, title FROM subitems WHERE id = ?").get(row.subitem) as any;
      if (s.title) milestone = s.title;
      const left = (this.db.prepare("SELECT COUNT(*) AS n FROM subitems WHERE goal = ? AND done IS NULL").get(s.goal) as any).n;
      if (left === 0) {
        this.db.prepare("UPDATE goals SET done = ? WHERE id = ? AND done IS NULL").run(now, s.goal);
        goal = (this.db.prepare("SELECT title FROM goals WHERE id = ?").get(s.goal) as any).title;
      }
    }
    return { ok: true, fresh: true, milestone, goal };
  }

  // C-49: undo a step ticked by accident -- it, its milestone and its goal are open again.
  undoStep(id: number): boolean {
    const row = this.db.prepare("SELECT subitem FROM steps WHERE id = ?").get(id) as any;
    if (!row) return false;
    this.db.prepare("UPDATE steps SET done = NULL WHERE id = ?").run(id);
    this.db.prepare("UPDATE subitems SET done = NULL WHERE id = ?").run(row.subitem);
    this.db.prepare("UPDATE goals SET done = NULL WHERE id = (SELECT goal FROM subitems WHERE id = ?)").run(row.subitem);
    // and what it gave the daemon goes back with it: its meal (C-44) and its experience (C-47), if not yet written home
    this.db.prepare("DELETE FROM interactions WHERE (kind = 'step' AND detail IN (?, ?)) OR (kind = 'exp' AND detail LIKE ?)")
      .run(`site ${id}`, `device ${id}`, `% step ${id}`);
    return true;
  }

  // ---- C-46: ONE goal, built from milestones and steps. A milestone is a named sub-item; a step added straight to the
  // goal lives in an unnamed one (consecutive loose steps share it), so the store keeps its one shape.
  currentGoal(): Goal | null {
    const r = this.db.prepare("SELECT id FROM goals WHERE done IS NULL ORDER BY id LIMIT 1").get() as any;
    return r ? this.goal(r.id) : null;
  }

  private reopen(goal: number) { this.db.prepare("UPDATE goals SET done = NULL WHERE id = ?").run(goal); }
  private nextPosition(table: "subitems" | "steps", col: "goal" | "subitem", id: number): number {
    return ((this.db.prepare(`SELECT MAX(position) AS p FROM ${table} WHERE ${col} = ?`).get(id) as any).p ?? -1) + 1;
  }

  addMilestone(goal: number, title: string): number {
    this.reopen(goal);
    return Number(this.db.prepare("INSERT INTO subitems (goal, title, position) VALUES (?, ?, ?)")
      .run(goal, title, this.nextPosition("subitems", "goal", goal)).lastInsertRowid);
  }

  addStep(goal: number, text: string, milestone?: number): number | null {
    let sub = milestone;
    if (sub != null) {
      const m = this.db.prepare("SELECT goal FROM subitems WHERE id = ? AND title != ''").get(sub) as any;
      if (!m || m.goal !== goal) return null;
    } else {
      const last = this.db.prepare("SELECT id, title FROM subitems WHERE goal = ? ORDER BY position DESC LIMIT 1").get(goal) as any;
      sub = last && last.title === "" ? last.id : this.addMilestone(goal, "");
    }
    this.db.prepare("UPDATE subitems SET done = NULL WHERE id = ?").run(sub!);
    this.reopen(goal);
    return Number(this.db.prepare("INSERT INTO steps (subitem, text, position) VALUES (?, ?, ?)")
      .run(sub!, text, this.nextPosition("steps", "subitem", sub!)).lastInsertRowid);
  }

  removeStep(id: number) {
    const row = this.db.prepare("SELECT subitem FROM steps WHERE id = ?").get(id) as any;
    if (!row) return;
    this.db.prepare("DELETE FROM steps WHERE id = ?").run(id);
    const s = this.db.prepare("SELECT title, (SELECT COUNT(*) FROM steps WHERE subitem = ?) AS n FROM subitems WHERE id = ?").get(row.subitem, row.subitem) as any;
    if (s && s.title === "" && s.n === 0) this.db.prepare("DELETE FROM subitems WHERE id = ?").run(row.subitem);
  }

  removeMilestone(id: number) {
    this.db.prepare("DELETE FROM steps WHERE subitem = ?").run(id);
    this.db.prepare("DELETE FROM subitems WHERE id = ?").run(id);
  }

  // THE ONE THING (PLAN 2): the first open step of the first open sub-item of the oldest open goal.
  // C-49: and where it sits in its milestone, so the board can show that subtly ("BATHROOM 2/3"); null when loose.
  nextStep(): { goal: string; subitem: string; step: Step; milestone: { title: string; at: number; of: number } | null } | null {
    const r = this.db.prepare(`
      SELECT g.title AS goal, s.title AS subitem, s.id AS sid, t.id AS id, t.text AS text, t.position AS pos
      FROM steps t JOIN subitems s ON t.subitem = s.id JOIN goals g ON s.goal = g.id
      WHERE t.done IS NULL AND s.done IS NULL AND g.done IS NULL
      ORDER BY g.id, s.position, t.position LIMIT 1`).get() as any;
    if (!r) return null;
    let milestone = null;
    if (r.subitem) {
      const all = this.db.prepare("SELECT id FROM steps WHERE subitem = ? ORDER BY position").all(r.sid) as any[];
      milestone = { title: r.subitem, at: all.findIndex((x) => x.id === r.id) + 1, of: all.length };
    }
    return { goal: r.goal, subitem: r.subitem, step: { id: r.id, text: r.text, done: false }, milestone };
  }
}
