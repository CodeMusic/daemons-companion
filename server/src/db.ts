// Goals, their sub-items, and each sub-item's steps (PLAN 2). Node's own SQLite -- nothing native to build. The Store
// itself is store.ts (C-111: a phone hosting on its own runs it over expo-sqlite); this opens it on a file.
import { DatabaseSync } from "node:sqlite";
import { Store as StoreOn, type Db } from "./store.js";

export type { Db, Statement, Step, SubItem, Goal, Plan } from "./store.js";

export class Store extends StoreOn {
  constructor(path: string) { super(new DatabaseSync(path) as unknown as Db); }
}
