// C-111: the requests a phone hosting on its own answers itself -- the day, the goal and its steps, the walk, the save's
// party, profile and INDEX, a species, the daemon's life and care, and SYNC. The server answers the same ones here
// (api.ts hands them over), so the phone and the computer can never disagree about what a request means. Nothing here
// may import Node: it runs in the app too (app/local.ts).
import speciesJson from "../data/species.json" with { type: "json" };
import type { Store } from "./store.js";
import { readSave } from "./save/reader.js";
import { readProfile } from "./save/profile.js";
import { readIndex } from "./save/index.js";
import { carriedDaemon, daemonLife, doStep, ENTRY_LIMIT, entry, grown, setWalk, sync, today, walk, type Host } from "./core.js";

const SPECIES = speciesJson as unknown as Record<string, any>;

export type Ask = { method: string; path: string; body: any; deviceId: string };
export type Reply = { status: number; body: unknown };

const STEP = /^\/api\/steps\/(\d+)\/(done|undo)$/, SPECIES_ID = /^\/api\/species\/(\d+)$/, CARE = /^\/api\/daemon\/(feed|water|train|sleep)$/;
const GETS = ["/api/today", "/api/goals", "/api/walk", "/api/goal", "/api/profile", "/api/index", "/api/party", "/api/daemon/life"];
const POSTS = ["/api/sync", "/api/walk", "/api/goal", "/api/goal/step", "/api/goal/milestone", "/api/goal/remove"];

// Whether route() answers this request -- asked before the body is read, so a request is never read twice
export function handles(method: string, path: string): boolean {
  if (method === "GET") return GETS.includes(path) || SPECIES_ID.test(path);
  if (method === "POST") return POSTS.includes(path) || STEP.test(path) || CARE.test(path);
  return false;
}

const ok = (body: unknown, status = 200): Reply => ({ status, body });
const no = (status: number, error: string, more: object = {}): Reply => ({ status, body: { error, ...more } });
const NO_SAVE = "no save named -- set it in Settings";

export function route(h: Host, store: Store, a: Ask, now = new Date()): Reply {
  const { method, path, body: b, deviceId } = a;
  if (method === "GET") {
    if (path === "/api/today") return ok(today(h, store, now));
    if (path === "/api/goals") return ok(store.goals());
    if (path === "/api/walk") return ok(walk(h, store, now));   // C-48
    if (path === "/api/goal") return ok({ goal: store.currentGoal(), limit: ENTRY_LIMIT });   // C-46: ONE goal
    if (path === "/api/daemon/life") return lifeNow(h, store, deviceId, now);
    const sp = path.match(SPECIES_ID);
    if (sp) {
      const row = SPECIES[sp[1]];
      return row ? ok({ ...row, entry: row.entry[h.edition] }) : no(404, "no such species");
    }
    const save = h.save.read();
    if (!save) return no(404, NO_SAVE);
    if (path === "/api/profile") {
      const prof = readProfile(save);
      const m = store.married();
      const thisGame = m ? m.name === prof.name && m.trainerId === prof.trainerId && m.secretId === prof.secretId : null;
      return ok({ ...prof, edition: h.edition, thisGame, marriedTo: m ? m.name : null });
    }
    if (path === "/api/index") return ok(readIndex(save, h.edition));   // C-24: the save's own INDEX, OPUS's margins with it
    if (path === "/api/party") return ok(readSave(save));
  }
  if (method === "POST") {
    if (path === "/api/sync") return ok(sync(h, store, now));
    const care = path.match(CARE);                      // C-13: care -- feed, water, train, and SLEEP (C-114) -- kept as the device's are
    if (care) { store.logInteraction(care[1], "site"); return lifeNow(h, store, deviceId, now); }
    const step = path.match(STEP);
    if (step) {
      if (step[2] === "undo") return store.undoStep(Number(step[1])) ? ok({ next: store.nextStep() }) : no(404, "no such step");
      const r = doStep(h, store, Number(step[1]), "site");
      return r.ok ? ok({ ...r, next: store.nextStep() }) : no(404, "no such step");
    }
    if (path === "/api/walk") {
      const r = setWalk(h, store, b);
      return typeof r === "string" ? no(400, r) : ok(r);
    }
    if (path === "/api/goal") {
      const title = entry(b.title);
      if (!title) return no(400, `a goal is a few words, at most ${ENTRY_LIMIT} letters`);
      const open = store.currentGoal();
      if (open && !b.replace) return no(409, "one goal at a time: finish this one, or replace it", { goal: open });
      if (open) store.db.prepare("UPDATE goals SET done = ? WHERE id = ?").run(`set aside ${now.toISOString()}`, open.id);
      return ok({ goal: store.addGoal(title), limit: ENTRY_LIMIT }, 201);
    }
    if (path === "/api/goal/step" || path === "/api/goal/milestone") {
      const g = store.currentGoal();
      if (!g) return no(400, "set a goal first");
      const text = entry(b.text ?? b.title);
      if (!text) return no(400, `keep it short: at most ${ENTRY_LIMIT} letters`);
      const done = path.endsWith("milestone") ? store.addMilestone(g.id, text)
                 : store.addStep(g.id, text, Number.isInteger(b.milestone) ? b.milestone : undefined);
      if (done == null) return no(400, "no such milestone in this goal");
      return ok({ goal: store.currentGoal(), limit: ENTRY_LIMIT });
    }
    if (path === "/api/goal/remove") {
      if (Number.isInteger(b.step)) store.removeStep(b.step);
      else if (Number.isInteger(b.milestone)) store.removeMilestone(b.milestone);
      else return no(400, "remove {step} or {milestone}");
      return ok({ goal: store.currentGoal(), limit: ENTRY_LIMIT });
    }
  }
  return no(404, "not found");
}

function lifeNow(h: Host, store: Store, deviceId: string, now: Date): Reply {
  const d = carriedDaemon(h, store, deviceId);
  return ok({ ...daemonLife(store, now), grown: d ? grown(d, store) : null, level: d?.level ?? null });
}
