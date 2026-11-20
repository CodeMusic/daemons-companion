// The engine under test on both of the companion's SQLite engines (C-111): Node's own, and the phone's expo-sqlite --
// played here by Node's SQLite behind expo-sqlite's synchronous calls, so every query goes through fromExpo() exactly
// as the phone's would (params as an array, null for no row, lastInsertRowId). The real native engine needs a phone.
import { DatabaseSync } from "node:sqlite";
import { fromExpo, Praxis, type Db, type ExpoDatabase, type Form, type Random } from "../src/index.js";

function expoShaped(): ExpoDatabase {
  const d = new DatabaseSync(":memory:");
  return {
    execSync: (s) => { d.exec(s); },
    getFirstSync: (s, p) => d.prepare(s).get(...p) ?? null,
    getAllSync: (s, p) => d.prepare(s).all(...p),
    runSync: (s, p) => { const r = d.prepare(s).run(...p); return { lastInsertRowId: Number(r.lastInsertRowid), changes: Number(r.changes) }; },
  };
}

export const ENGINES: [string, () => Db][] = [
  ["node:sqlite", () => new DatabaseSync(":memory:") as unknown as Db],
  ["expo-sqlite's calls", () => fromExpo(expoShaped())],
];

/** a seeded generator, so a failing shuffle can be run again */
export function seeded(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (n: number) => Math.floor(next() * n),
    pick: <T>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)],
    shuffle: <T>(xs: readonly T[]): T[] => {
      const out = [...xs];
      for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
      return out;
    },
    bytes: ((b: Uint8Array) => { for (let i = 0; i < b.length; i++) b[i] = Math.floor(next() * 256); }) as Random,
  };
}

const STATES = [{ name: "open", phase: "open" }, { name: "doing", phase: "doing" }, { name: "done", phase: "done" },
  { name: "aside", phase: "aside" }] as const;

/** a LIFE-like form for the tests (the real one, with today's numbers, is C-430's) */
export const LIFE: Form = {
  name: "life-test",
  version: 1,
  kinds: {
    goal: { title: "Goal", points: 20, states: [...STATES], fields: { notes: { type: "long" }, size: { type: "choice", choices: ["small", "large"] } } },
    milestone: { title: "Milestone", points: 5, states: [...STATES] },
    step: { title: "Step", points: 1, states: [...STATES], fields: { minutes: { type: "number" } } },
    page: { title: "Page", states: [{ name: "draft", phase: "open" }, { name: "kept", phase: "done" }], fields: { body: { type: "long" } } },
  },
};

/** a shared wall clock the replicas read, each with its own skew */
export class Wall { t = 1_763_500_000_000; tick(ms = 1) { this.t += ms; } }

export function replica(make: () => Db, name: string, wall: Wall, skew = 0, actor = "me") {
  let h = 0;
  for (const c of name) h = Math.imul(h ^ c.charCodeAt(0), 2654435761);
  return new Praxis(make(), { replica: name, actor, now: () => wall.t + skew, random: seeded(h).bytes });
}
