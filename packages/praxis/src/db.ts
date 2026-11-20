// C-429: PRAXIS runs on the phone too (C-111) -- no node:*, no fs, and nothing imported from the companion.
// What the engine asks of a database: the companion's own Db (server/src/store.ts), restated here so the package stands
// alone. Node's DatabaseSync has it as it is; expo-sqlite's synchronous calls are wrapped by fromExpo(). The SQL is the
// same on both, and only ever binds strings, numbers and null.

export interface Statement {
  get(...args: unknown[]): unknown;
  all(...args: unknown[]): unknown[];
  run(...args: unknown[]): { lastInsertRowid: number | bigint; changes: number | bigint };
}
export interface Db { exec(sql: string): void; prepare(sql: string): Statement }

/** expo-sqlite's SQLiteDatabase, as much of it as the engine uses -- named by shape, so Expo is never imported here */
export interface ExpoDatabase {
  execSync(source: string): void;
  getFirstSync(source: string, params: any[]): unknown;
  getAllSync(source: string, params: any[]): unknown[];
  runSync(source: string, params: any[]): { lastInsertRowId: number; changes: number };
}

/** The phone's database as a Db: the wrapper app/platform/local.ts already makes for the Store, kept here as well */
export function fromExpo(d: ExpoDatabase): Db {
  return {
    exec: (sql) => d.execSync(sql),
    prepare: (sql) => ({
      get: (...a) => d.getFirstSync(sql, a) ?? undefined,
      all: (...a) => d.getAllSync(sql, a),
      run: (...a) => { const r = d.runSync(sql, a); return { lastInsertRowid: r.lastInsertRowId, changes: r.changes }; },
    }),
  };
}
