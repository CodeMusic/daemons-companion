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
  completeStep(id: number): boolean {
    const now = new Date().toISOString();
    const row = this.db.prepare("SELECT subitem FROM steps WHERE id = ?").get(id) as any;
    if (!row) return false;
    this.db.prepare("UPDATE steps SET done = ? WHERE id = ? AND done IS NULL").run(now, id);
    const open = (this.db.prepare("SELECT COUNT(*) AS n FROM steps WHERE subitem = ? AND done IS NULL").get(row.subitem) as any).n;
    if (open === 0) {
      this.db.prepare("UPDATE subitems SET done = ? WHERE id = ? AND done IS NULL").run(now, row.subitem);
      const goal = (this.db.prepare("SELECT goal FROM subitems WHERE id = ?").get(row.subitem) as any).goal;
      const left = (this.db.prepare("SELECT COUNT(*) AS n FROM subitems WHERE goal = ? AND done IS NULL").get(goal) as any).n;
      if (left === 0) this.db.prepare("UPDATE goals SET done = ? WHERE id = ? AND done IS NULL").run(now, goal);
    }
    return true;
  }

  // THE ONE THING (PLAN 2): the first open step of the first open sub-item of the oldest open goal.
  nextStep(): { goal: string; subitem: string; step: Step } | null {
    const r = this.db.prepare(`
      SELECT g.title AS goal, s.title AS subitem, t.id AS id, t.text AS text
      FROM steps t JOIN subitems s ON t.subitem = s.id JOIN goals g ON s.goal = g.id
      WHERE t.done IS NULL AND s.done IS NULL AND g.done IS NULL
      ORDER BY g.id, s.position, t.position LIMIT 1`).get() as any;
    return r ? { goal: r.goal, subitem: r.subitem, step: { id: r.id, text: r.text, done: false } } : null;
  }
}
