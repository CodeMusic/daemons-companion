// C-429: PRAXIS runs on the phone too (C-111) -- no node:*, no fs, and nothing imported from the companion.
// The tables. px_events is the log and the only truth; every other table but px_meta is a fold of it, and can be thrown
// away and folded again (Praxis.rebuild). They share a database with the companion's own tables, so every name begins
// px_. The SQL is plain SQLite, the same on Node's and Expo's.

export const SCHEMA = `
  -- this copy: its replica id (never sent anywhere)
  CREATE TABLE IF NOT EXISTS px_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

  -- THE LOG: every change, append-only
  CREATE TABLE IF NOT EXISTS px_events (id TEXT PRIMARY KEY, space TEXT NOT NULL, item TEXT NOT NULL, op TEXT NOT NULL,
    field TEXT, value TEXT, actor TEXT NOT NULL, replica TEXT NOT NULL, hlc TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS px_events_seen ON px_events (space, replica, hlc);
  CREATE INDEX IF NOT EXISTS px_events_item ON px_events (item, hlc);

  -- each item's (and space's) making: the earliest, if two ever share an id
  CREATE TABLE IF NOT EXISTS px_made (item TEXT PRIMARY KEY, space TEXT NOT NULL, kind TEXT NOT NULL, event TEXT NOT NULL,
    actor TEXT NOT NULL, hlc TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS px_made_space ON px_made (space, hlc);
  -- every write to a field, winners and losers both (the history a value can be taken back from); a long body's base
  CREATE TABLE IF NOT EXISTS px_writes (item TEXT NOT NULL, field TEXT NOT NULL, hlc TEXT NOT NULL, event TEXT NOT NULL,
    actor TEXT NOT NULL, value TEXT NOT NULL, is_long INTEGER NOT NULL, base TEXT, PRIMARY KEY (item, field, hlc));
  -- each field's value now: the latest write (the earliest, for a handle -- once given it is kept)
  CREATE TABLE IF NOT EXISTS px_values (item TEXT NOT NULL, field TEXT NOT NULL, value TEXT NOT NULL, hlc TEXT NOT NULL,
    event TEXT NOT NULL, PRIMARY KEY (item, field));

  -- SPACES, and the KINDS, STATES and FIELDS of the form each was made from
  CREATE TABLE IF NOT EXISTS px_spaces (id TEXT PRIMARY KEY, parent TEXT, title TEXT NOT NULL, prefix TEXT NOT NULL,
    keeper TEXT, reach TEXT NOT NULL, form_name TEXT, form_version INTEGER, form_hlc TEXT, archived INTEGER NOT NULL,
    made TEXT NOT NULL, maker TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS px_kinds (space TEXT NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL, points INTEGER,
    virtue TEXT, prefix TEXT, PRIMARY KEY (space, kind));
  CREATE TABLE IF NOT EXISTS px_states (space TEXT NOT NULL, kind TEXT NOT NULL, state TEXT NOT NULL, phase TEXT NOT NULL,
    position INTEGER NOT NULL, PRIMARY KEY (space, kind, state));
  CREATE TABLE IF NOT EXISTS px_fields (space TEXT NOT NULL, kind TEXT NOT NULL, field TEXT NOT NULL, type TEXT NOT NULL,
    def TEXT NOT NULL, PRIMARY KEY (space, kind, field));

  -- ITEMS: the columns the engine indexes; a kind's own fields stay in px_values
  CREATE TABLE IF NOT EXISTS px_items (id TEXT PRIMARY KEY, space TEXT NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL,
    short TEXT NOT NULL, state TEXT, phase TEXT, parent TEXT, position TEXT NOT NULL, points INTEGER NOT NULL, virtue TEXT,
    due TEXT, archived INTEGER NOT NULL, handle INTEGER, made TEXT NOT NULL, maker TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS px_items_space ON px_items (space, parent, position);
  CREATE INDEX IF NOT EXISTS px_items_handle ON px_items (space, handle);
  CREATE INDEX IF NOT EXISTS px_items_kind ON px_items (space, kind, phase);

  -- LINKS, added and taken away by event id: a link stands until an unlink names it
  CREATE TABLE IF NOT EXISTS px_links (id TEXT PRIMARY KEY, space TEXT NOT NULL, item TEXT NOT NULL, type TEXT NOT NULL,
    target TEXT NOT NULL, actor TEXT NOT NULL, hlc TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS px_links_item ON px_links (item);
  CREATE INDEX IF NOT EXISTS px_links_target ON px_links (target);
  CREATE TABLE IF NOT EXISTS px_unlinks (link TEXT PRIMARY KEY, event TEXT NOT NULL, actor TEXT NOT NULL, hlc TEXT NOT NULL);

  -- notes and EFFORT, add-only
  CREATE TABLE IF NOT EXISTS px_notes (id TEXT PRIMARY KEY, space TEXT NOT NULL, item TEXT NOT NULL, text TEXT NOT NULL,
    actor TEXT NOT NULL, hlc TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS px_notes_item ON px_notes (item);
  CREATE TABLE IF NOT EXISTS px_efforts (id TEXT PRIMARY KEY, space TEXT NOT NULL, item TEXT NOT NULL, seconds REAL NOT NULL,
    note TEXT, actor TEXT NOT NULL, hlc TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS px_efforts_item ON px_efforts (item);

  -- ARETE: awards and spends, add-only; an entry's id is made from its item, op and key, so a repeat is the same entry.
  -- Taking one back is an entry of its own, never a deletion.
  CREATE TABLE IF NOT EXISTS px_ledger (id TEXT PRIMARY KEY, space TEXT NOT NULL, item TEXT NOT NULL, op TEXT NOT NULL,
    key TEXT NOT NULL, points INTEGER NOT NULL, reason TEXT, event TEXT NOT NULL, actor TEXT NOT NULL, hlc TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS px_ledger_item ON px_ledger (item);
  CREATE INDEX IF NOT EXISTS px_ledger_hlc ON px_ledger (space, hlc);
  CREATE TABLE IF NOT EXISTS px_takebacks (id TEXT PRIMARY KEY, event TEXT NOT NULL, actor TEXT NOT NULL, hlc TEXT NOT NULL);

  -- proposals, and every accept and decline of one
  CREATE TABLE IF NOT EXISTS px_proposals (id TEXT PRIMARY KEY, space TEXT NOT NULL, item TEXT NOT NULL, change TEXT NOT NULL,
    actor TEXT NOT NULL, hlc TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS px_decisions (event TEXT PRIMARY KEY, proposal TEXT NOT NULL, accept INTEGER NOT NULL,
    actor TEXT NOT NULL, hlc TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS px_decisions_proposal ON px_decisions (proposal);
`;

/** every table folded from the log -- emptied and refilled by a rebuild, and compared by the convergence tests */
export const FOLDED = ["px_made", "px_writes", "px_values", "px_spaces", "px_kinds", "px_states", "px_fields", "px_items",
  "px_links", "px_unlinks", "px_notes", "px_efforts", "px_ledger", "px_takebacks", "px_proposals", "px_decisions"] as const;
