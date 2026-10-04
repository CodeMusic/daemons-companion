// C-04: the companion's local HTTP API -- small on purpose. JSON in, JSON out, on this machine only.
//
//   GET  /api/today              the day (colour, note), the season of the daemon's edition, and the ONE next step
//   GET  /api/goals              every goal, its sub-items and steps
//   POST /api/goals              {title, breakdown?: true} -- a goal, broken down (C-06) when asked
//   POST /api/steps/:id/done     tick a step off
//   GET  /api/party              the party of the configured save COPY (C-02)
//   GET  /api/profile            C-23: the save's trainer, play time, INDEX counts, MARKS, progress and where it was saved
//   GET  /api/species/:id        one daemon's name, types, category and its edition's INDEX entry
//   POST /api/away/answer        answer the game's AWAY requests in the configured save (C-10), after a backup
//   POST /api/sync               C-21: the one SYNC -- read the save, receive or return a daemon if the game asked,
//                                link the save, settle a daemon brought home without the app; the married save only
//   GET  /art/<name>_front.png   a daemon's art, from DAEMONS' own gfx/daemons/
//   GET  /art/party/<slot>.png   a party daemon as the game draws it, its streaks painted for its routines (C-18)
//   GET  /api/device/state       C-09: what a device shows -- the day, the season, the one next step, its daemon
//   POST /api/device/ticks       C-09: {steps: [ids]} -- the steps a device ticked off; answers with the new state
import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import weekJson from "../data/week.json" with { type: "json" };
import speciesJson from "../data/species.json" with { type: "json" };
import { breakdown } from "./ai/breakdown.js";
import type { Config } from "./config.js";
import { Store } from "./db.js";
import { readSave } from "./save/reader.js";
import { readProfile } from "./save/profile.js";
import { answerRequests, syncSave } from "./save/writer.js";
import { season } from "./seasons.js";
import { repaint, streakColours } from "./art.js";
import { fileURLToPath } from "node:url";

const ART_DIR = fileURLToPath(new URL("../data/art/", import.meta.url));

const SPECIES = speciesJson as unknown as Record<string, any>;

async function body(req: IncomingMessage): Promise<any> {
  let s = "";
  for await (const chunk of req) s += chunk;
  return s ? JSON.parse(s) : {};
}

function send(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { "content-type": "application/json", "access-control-allow-origin": "*" });
  res.end(JSON.stringify(data));
}

export function today(cfg: Config, store: Store, now = new Date()) {
  const day = weekJson.days[now.getDay()];               // Sunday first, as the game keeps it
  // the LOCAL date, as the day and the season are read: toISOString() is UTC, and west of Greenwich it names tomorrow by evening
  const date = [now.getFullYear(), now.getMonth() + 1, now.getDate()].map((n, i) => String(n).padStart(i ? 2 : 4, "0")).join("-");
  return { date, edition: cfg.edition, day, season: season(cfg.edition, now),
           next: store.nextStep() };
}

// C-10: answer the game's requests in the configured save. The game must be closed first -- an emulator that is still
// running writes its own copy back over this one. A backup of the whole file goes beside it every time, and the file is
// written only when something was asked.
export function answerAway(cfg: Config, now = new Date()) {
  if (!cfg.savePath || !existsSync(cfg.savePath)) throw new Error("no save is configured (savePath in config.json)");
  const { save, answered } = answerRequests(new Uint8Array(readFileSync(cfg.savePath)));
  let backup: string | null = null;
  if (answered.length) {
    const dir = join(dirname(cfg.savePath), "companion-backups");
    mkdirSync(dir, { recursive: true });
    backup = join(dir, `${basename(cfg.savePath)}.${now.toISOString().replace(/[:.]/g, "-")}`);
    copyFileSync(cfg.savePath, backup);
    writeFileSync(cfg.savePath, save);
  }
  return { answered, backup };
}

// C-21 / C-22: the one SYNC. The first save synced is the app's game (its trainer's name and full ID, which never
// change). On that save: answer the requests (one daemon at a time), set LINKED so the game shows SEND, and settle an
// emergency return -- written only if something changed, after a backup, with the game closed. On any other save:
// nothing is written; the app shows it, and says it belongs to a different game.
export function sync(cfg: Config, store: Store, now = new Date()) {
  if (!cfg.savePath || !existsSync(cfg.savePath)) throw new Error("no save is configured (savePath in config.json)");
  const file = new Uint8Array(readFileSync(cfg.savePath));
  const p = readProfile(file);
  const game = { name: p.name, trainerId: p.trainerId, secretId: p.secretId };
  let married = store.married();
  const firstSave = !married;
  if (!married) { store.marry(game); married = game; }
  const sameGame = married.name === game.name && married.trainerId === game.trainerId && married.secretId === game.secretId;
  if (!sameGame)
    return { sameGame, firstSave, married, received: [], returned: [], refused: [], firstLink: false, recalledSeen: false, backup: null };
  const r = syncSave(file, { link: true });
  let backup: string | null = null;
  if (r.changed) {
    const dir = join(dirname(cfg.savePath), "companion-backups");
    mkdirSync(dir, { recursive: true });
    backup = join(dir, `${basename(cfg.savePath)}.${now.toISOString().replace(/[:.]/g, "-")}`);
    copyFileSync(cfg.savePath, backup);
    writeFileSync(cfg.savePath, r.save);
  }
  return { sameGame, firstSave, married,
           received: r.answered.filter((a) => a.now === "away").map((a) => a.nickname),
           returned: r.answered.filter((a) => a.now === "home").map((a) => a.nickname),
           refused: r.refused, firstLink: r.firstLink, recalledSeen: r.recalledSeen, backup };
}

// C-09: THE SYNC PROTOCOL's server side (PLAN 4: HTTP + JSON over Wi-Fi, small enough for an ESP32). A device pulls
// one document and pushes the steps ticked off on it. Its daemon is the party's AWAY one -- sending a daemon in the game
// is what puts it on the device. Its mood is C-13's, whose rules are open, so it is null until they are written. This
// is on the local network only and carries no secret; accounts are C-11's.
export function deviceState(cfg: Config, store: Store, now = new Date()) {
  const t = today(cfg, store, now);
  let daemon = null;
  if (cfg.savePath && existsSync(cfg.savePath)) {
    const d = readSave(new Uint8Array(readFileSync(cfg.savePath))).party.find((p) => p.away);
    if (d) daemon = { slot: d.slot, name: d.name, nickname: d.nickname, level: d.level, friendship: d.friendship,
                      art: `/art/party/${d.slot}.png`, mood: null };
  }
  return { date: t.date, edition: t.edition, season: t.season,
           day: { name: t.day.day, colour: t.day.colour, note: t.day.note, virtue: t.day.virtue },
           step: t.next ? { id: t.next.step.id, text: t.next.step.text, goal: t.next.goal } : null, daemon };
}

export function makeServer(cfg: Config, store = new Store(cfg.database)): Server {
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      const path = url.pathname;
      if (req.method === "OPTIONS") {
        res.writeHead(204, { "access-control-allow-origin": "*", "access-control-allow-methods": "GET,POST",
                             "access-control-allow-headers": "content-type" });
        return res.end();
      }
      if (req.method === "GET" && path === "/api/today") return send(res, 200, today(cfg, store));
      if (req.method === "POST" && path === "/api/away/answer") return send(res, 200, answerAway(cfg));
      if (req.method === "POST" && path === "/api/sync") return send(res, 200, sync(cfg, store));
      if (req.method === "GET" && path === "/api/device/state") return send(res, 200, deviceState(cfg, store));
      if (req.method === "POST" && path === "/api/device/ticks") {
        const b = await body(req);
        if (!Array.isArray(b.steps) || !b.steps.every((n: unknown) => Number.isInteger(n)))
          return send(res, 400, { error: "steps must be a list of step ids" });
        const done = b.steps.filter((id: number) => store.completeStep(id));
        return send(res, 200, { done, state: deviceState(cfg, store) });
      }
      const partyArt = path.match(/^\/art\/party\/(\d)\.png$/);
      if (req.method === "GET" && partyArt) {
        if (!cfg.savePath || !existsSync(cfg.savePath)) return send(res, 404, { error: "no save is configured" });
        const d = readSave(new Uint8Array(readFileSync(cfg.savePath))).party.find((p) => p.slot === Number(partyArt[1]));
        const row = d && SPECIES[String(d.species)];
        const file = row?.art?.front && join(ART_DIR, row.art.front.split("/").pop().replace("_front.png", ".png"));
        if (!d || !file || !existsSync(file)) return send(res, 404, { error: "no art for that slot" });
        const png = readFileSync(file);
        const body = row.streaks ? repaint(png, (pal) => streakColours(pal, row.bodyType, d.moves)) : png;
        res.writeHead(200, { "content-type": "image/png", "access-control-allow-origin": "*" });
        return res.end(body);
      }
      if (req.method === "GET" && path === "/api/goals") return send(res, 200, store.goals());
      if (req.method === "POST" && path === "/api/goals") {
        const b = await body(req);
        if (!b.title || typeof b.title !== "string") return send(res, 400, { error: "a goal needs a title" });
        const bd = b.breakdown ? await breakdown(b.title, cfg) : null;
        const goal = store.addGoal(b.title, bd?.plan);
        return send(res, 201, { goal, breakdown: bd });
      }
      const step = path.match(/^\/api\/steps\/(\d+)\/done$/);
      if (req.method === "POST" && step) {
        return store.completeStep(Number(step[1])) ? send(res, 200, { next: store.nextStep() })
                                                   : send(res, 404, { error: "no such step" });
      }
      if (req.method === "GET" && path === "/api/profile") {
        if (!cfg.savePath || !existsSync(cfg.savePath)) return send(res, 404, { error: "no save named -- set savePath to a COPY of your save" });
        const prof = readProfile(new Uint8Array(readFileSync(cfg.savePath)));
        const m = store.married();
        const thisGame = m ? m.name === prof.name && m.trainerId === prof.trainerId && m.secretId === prof.secretId : null;
        return send(res, 200, { ...prof, edition: cfg.edition, thisGame, marriedTo: m ? m.name : null });
      }
      if (req.method === "GET" && path === "/api/party") {
        if (!cfg.savePath) return send(res, 404, { error: "no save named -- set savePath to a COPY of your save" });
        return send(res, 200, readSave(new Uint8Array(readFileSync(cfg.savePath))));
      }
      const sp = path.match(/^\/api\/species\/(\d+)$/);
      if (req.method === "GET" && sp) {
        const row = SPECIES[sp[1]];
        if (!row) return send(res, 404, { error: "no such species" });
        return send(res, 200, { ...row, entry: row.entry[cfg.edition] });
      }
      const art = path.match(/^\/art\/([a-z0-9_]+_(?:front|back)\.png)$/);   // a plain file name, never a path
      if (req.method === "GET" && art) {
        const file = join(cfg.artDir, art[1]);
        if (!existsSync(file)) return send(res, 404, { error: "no such art" });
        res.writeHead(200, { "content-type": "image/png", "access-control-allow-origin": "*", "cache-control": "max-age=86400" });
        return res.end(readFileSync(file));
      }
      send(res, 404, { error: "not found" });
    } catch (e) {
      send(res, 500, { error: (e as Error).message });
    }
  });
}
