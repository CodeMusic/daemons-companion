// C-04: the companion's local HTTP API -- small on purpose. JSON in, JSON out, on this machine only.
//
//   GET  /api/today              the day (colour, note), the season of the daemon's edition, and the ONE next step
//   GET  /api/goals              every goal, its sub-items and steps
//   POST /api/goals              {title, breakdown?: true} -- a goal, broken down (C-06) when asked
//   POST /api/steps/:id/done     tick a step off
//   GET  /api/party              the party of the configured save COPY (C-02)
//   GET  /api/profile            C-23: the save's trainer, play time, INDEX counts, MARKS, progress and where it was saved
//   GET  /api/species/:id        one daemon's name, types, category and its edition's INDEX entry
//   GET  /api/index              C-24: the save's INDEX -- seen and bound, each entry in the edition's voice, OPUS's margins
//   POST /api/away/answer        answer the game's AWAY requests in the configured save (C-10), after a backup
//   POST /api/sync               C-21: the one SYNC -- read the save, receive or return a daemon if the game asked,
//                                link the save, settle a daemon brought home without the app; the married save only
//   GET  /art/<name>_front.png   a daemon's art, from DAEMONS' own gfx/daemons/
//   GET  /art/party/<slot>.png   a party daemon as the game draws it, its streaks painted for its routines (C-18)
//   GET  /api/device/state       C-09: what a device shows -- the day, the season, the one next step, its daemon
//   GET  /api/device/art         C-36: the carried daemon's front sprite, as sixteen colours and four bits a pixel
//   GET  /api/device/commands    C-32: the device takes what the site sent it; POST /api/device/results answers each,
//                                POST /api/device/routines says what routines it has
//   GET  /api/device/link        C-32 (this machine only): linked or not, by which way, its routines and results;
//                                POST /api/device/run {routine}, /api/device/wifi {ssid, password}, /api/device/ir {...}
//   POST /api/device/ticks       C-09: {steps: [ids]} -- the steps a device ticked off; answers with the new state
//   POST /api/device/interact    C-13: {kind, detail?} -- the device was used (a ROUTINE run); kept as tending the daemon
//   GET/POST /api/settings       C-29: the save path (this machine only, like everything but the device's endpoints)
import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { execFile, execFileSync } from "node:child_process";
import { platform } from "node:os";
import weekJson from "../data/week.json" with { type: "json" };
import speciesJson from "../data/species.json" with { type: "json" };
import irPowerJson from "../data/ir_power.json" with { type: "json" };
import { breakdown } from "./ai/breakdown.js";
import type { Config } from "./config.js";
import { Store } from "./db.js";
import { readSave } from "./save/reader.js";
import { readProfile } from "./save/profile.js";
import { readIndex } from "./save/index.js";
import { answerRequests, syncSave } from "./save/writer.js";
import { season } from "./seasons.js";
import { deviceArt, repaint, streakColours } from "./art.js";
import { deviceDay } from "./days.js";
import { DeviceHub, type Via } from "./device.js";
import { networkInterfaces } from "node:os";
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
// A party daemon's front sprite as the game draws it, its streaks painted for its routines (C-18); null if none.
function partyPng(cfg: Config, which: (p: any) => boolean): Buffer | null {
  if (!cfg.savePath || !existsSync(cfg.savePath)) return null;
  const d = readSave(new Uint8Array(readFileSync(cfg.savePath))).party.find(which);
  const row = d && SPECIES[String(d.species)];
  const file = row?.art?.front && join(ART_DIR, row.art.front.split("/").pop().replace("_front.png", ".png"));
  if (!d || !file || !existsSync(file)) return null;
  const png = readFileSync(file);
  return row.streaks ? repaint(png, (pal) => streakColours(pal, row.bodyType, d.moves)) : png;
}

export function deviceState(cfg: Config, store: Store, now = new Date()) {
  const t = today(cfg, store, now);
  let daemon = null;
  if (cfg.savePath && existsSync(cfg.savePath)) {
    const d = readSave(new Uint8Array(readFileSync(cfg.savePath))).party.find((p) => p.away);
    const row = d && SPECIES[String(d.species)];
    // C-36: its INDEX entry in the save's edition's voice, and `artKey`, which changes when its art would (another
    // daemon, or new routines painting its streaks), so a device fetches GET /api/device/art only then.
    if (d) daemon = { slot: d.slot, name: d.name, nickname: d.nickname, level: d.level, friendship: d.friendship,
                      holding: d.holding, art: `/art/party/${d.slot}.png`, mood: null,
                      types: row?.types ?? [], category: row?.category ?? "", entry: row?.entry?.[cfg.edition] ?? "",
                      artKey: `${d.species}-${d.moves.join(".")}` };
  }
  const dd = deviceDay(t.day.day);
  // C-33: where a device on the Wi-Fi finds this server -- only when it listens on the network at all
  const addr = cfg.host === "0.0.0.0" ? lanAddress() : null;
  return { date: t.date, edition: t.edition, season: t.season, server: addr ? `http://${addr}:${cfg.port}` : null,
           day: { name: t.day.day, colour: t.day.colour, note: t.day.note, virtue: t.day.virtue, menu: dd.menu, led: dd.led },
           step: t.next ? { id: t.next.step.id, text: t.next.step.text, goal: t.next.goal } : null, daemon };
}

// C-29: the save path and what the Settings screen shows about it. The effective path is the one Settings set, else
// config.json. `source` tells the user which, so "it just worked" never leaves them wondering where it read from.
function settingsView(cfg: Config, store: Store) {
  const set = store.getSetting("savePath");
  const savePath = set ?? cfg.savePath ?? null;
  const exists = !!(savePath && existsSync(savePath));
  // A file is only a save if one of its two slots checks out -- so a wrong pick is said at once, not at SYNC.
  let valid = false;
  if (exists) { try { readSave(new Uint8Array(readFileSync(savePath!))); valid = true; } catch { valid = false; } }
  return { savePath, dir: savePath ? dirname(savePath) : null, exists, valid,
           source: set ? "settings" : cfg.savePath ? "config.json" : "none", edition: cfg.edition,
           canPick: platform() === "darwin" };
}

// A native "choose file" dialog on the user's own Mac, so they get a real path (a browser file picker hides it). Only
// local, only on request. Returns null if the user cancels or this is not a Mac.
// Asynchronous, so the server keeps answering the device and the app while the dialog waits on the user.
function pickSaveFile(): Promise<string | null> {
  if (platform() !== "darwin") return Promise.resolve(null);
  const script = 'try\nPOSIX path of (choose file with prompt "Choose your DAEMONS save (.sav)")\nend try';
  return new Promise((resolve) =>
    execFile("osascript", ["-e", script], { encoding: "utf-8" }, (err, out) => resolve(err ? null : out.trim() || null)));
}

function revealInFinder(p: string | null) {
  if (!p || platform() !== "darwin") return;
  try {
    if (existsSync(p)) execFileSync("open", ["-R", p]);          // reveal the file
    else if (existsSync(dirname(p))) execFileSync("open", [dirname(p)]);   // or just open the folder it should go in
  } catch { /* best effort */ }
}

const isLoopback = (a?: string) => !a || a === "127.0.0.1" || a === "::1" || a === "::ffff:127.0.0.1";
const DEVICE_DOOR = [
  (m: string, p: string) => m === "GET" && ["/api/device/state", "/api/device/art", "/api/device/commands"].includes(p),
  (m: string, p: string) => m === "POST" &&
    ["/api/device/ticks", "/api/device/interact", "/api/device/results", "/api/device/routines"].includes(p),
  (m: string, p: string) => m === "GET" && p.startsWith("/art/"),
  (m: string) => m === "OPTIONS",
];

// C-33: where a device on the Wi-Fi finds this server -- this machine's address on the local network.
export function lanAddress(): string | null {
  for (const list of Object.values(networkInterfaces()))
    for (const a of list ?? []) if (a.family === "IPv4" && !a.internal) return a.address;
  return null;
}

export function makeServer(cfg: Config, store = new Store(cfg.database), hub = new DeviceHub()): Server {
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      const path = url.pathname;
      // C-32: "usb" is the bridge on this machine speaking for the device down its cable; anything from the network is
      // the device itself, on the Wi-Fi.
      const via: Via = url.searchParams.get("via") === "usb" && isLoopback(req.socket.remoteAddress) ? "usb" : "wifi";
      // C-29: the save path the user set in Settings (stored in the db) overrides config.json; everything that reads
      // or writes a save uses `ecfg`, so the user never edits a file by hand.
      const ecfg: Config = { ...cfg, savePath: store.getSetting("savePath") ?? cfg.savePath };
      // With "host": "0.0.0.0" the server is on the local network for a device -- and only the device's own door
      // answers it there. Settings, SYNC, the save and the goals stay this machine's, so nothing else on the network
      // can change the save path, write the save, or open a dialog on the Mac.
      if (!isLoopback(req.socket.remoteAddress) && !DEVICE_DOOR.some((d) => d(req.method ?? "", path)))
        return send(res, 403, { error: "only the device's endpoints answer the network" });
      if (req.method === "OPTIONS") {
        res.writeHead(204, { "access-control-allow-origin": "*", "access-control-allow-methods": "GET,POST",
                             "access-control-allow-headers": "content-type" });
        return res.end();
      }
      if (req.method === "GET" && path === "/api/today") return send(res, 200, today(ecfg, store));
      if (req.method === "POST" && path === "/api/away/answer") return send(res, 200, answerAway(ecfg));
      if (req.method === "POST" && path === "/api/sync") return send(res, 200, sync(ecfg, store));
      if (req.method === "GET" && path === "/api/device/state") { hub.seen(via); return send(res, 200, deviceState(ecfg, store)); }
      // ---- C-32: the link. The device's side: its commands, its results, its routines. ----
      if (req.method === "GET" && path === "/api/device/commands") { hub.seen(via); return send(res, 200, { commands: hub.take(via) }); }
      if (req.method === "POST" && path === "/api/device/results") {
        const b = await body(req);
        for (const r of Array.isArray(b.results) ? b.results : [b]) if (r && r.id != null) hub.answer(r);
        return send(res, 200, { ok: true });
      }
      if (req.method === "POST" && path === "/api/device/routines") {
        const b = await body(req);
        if (!Array.isArray(b.types)) return send(res, 400, { error: "routines need {types: [...]}" });
        hub.routines = b.types.map((t: any) => ({ name: String(t.name), radio: String(t.radio),
                                                   routines: (t.routines ?? []).map(String) }));
        hub.firmware = String(b.firmware ?? "");
        return send(res, 200, { ok: true });
      }
      // ---- the site's side (this machine only): what the link is, and the commands it sends ----
      if (req.method === "GET" && path === "/api/device/link")
        return send(res, 200, { ...hub.link(), lan: { address: lanAddress(), port: cfg.port, open: cfg.host === "0.0.0.0" } });
      if (req.method === "POST" && path === "/api/device/run") {
        const b = await body(req);
        if (typeof b.routine !== "string" || !hub.hasRoutine(b.routine))
          return send(res, 400, { error: "the device has no such routine" });
        return send(res, 200, { id: hub.send({ type: "run", routine: b.routine }) });
      }
      if (req.method === "POST" && path === "/api/device/wifi") {   // C-33: handed down the cable only
        const b = await body(req);
        if (typeof b.ssid !== "string" || !b.ssid || typeof b.password !== "string")
          return send(res, 400, { error: "Wi-Fi needs a network name and its password" });
        const addr = lanAddress();
        return send(res, 200, { id: hub.send({ type: "wifi", ssid: b.ssid, password: b.password,
                                               server: addr ? `http://${addr}:${cfg.port}` : "" }) });
      }
      if (req.method === "GET" && path === "/api/ir/brands") return send(res, 200, irPowerJson.brands);   // C-34
      if (req.method === "POST" && path === "/api/device/ir") {     // C-34: one IR code, sent (and kept if asked)
        const b = await body(req);
        if (typeof b.protocol !== "string" || typeof b.code !== "string" || !Number.isInteger(b.bits))
          return send(res, 400, { error: "an IR code needs {protocol, code, bits}" });
        return send(res, 200, { id: hub.send({ type: "ir", protocol: b.protocol, code: b.code, bits: b.bits,
                                               repeat: Number(b.repeat ?? 0), keep: !!b.keep, label: String(b.label ?? "") }) });
      }
      if (req.method === "POST" && path === "/api/device/ticks") {
        const b = await body(req);
        if (!Array.isArray(b.steps) || !b.steps.every((n: unknown) => Number.isInteger(n)))
          return send(res, 400, { error: "steps must be a list of step ids" });
        const done = b.steps.filter((id: number) => store.completeStep(id));
        return send(res, 200, { done, state: deviceState(ecfg, store) });
      }
      // C-13: the device reports each use -- a routine run, a step ticked -- as tending the daemon.
      if (req.method === "POST" && path === "/api/device/interact") {
        const b = await body(req);
        const kind = typeof b.kind === "string" ? b.kind.slice(0, 32) : "";
        if (!kind) return send(res, 400, { error: "an interaction needs a kind" });
        store.logInteraction(kind, typeof b.detail === "string" ? b.detail.slice(0, 80) : null);
        return send(res, 200, { last: store.lastInteraction() });
      }
      // C-29: the save path -- read it, set it, open a native file picker (Mac), or reveal the folder in Finder.
      if (req.method === "GET" && path === "/api/settings") return send(res, 200, settingsView(ecfg, store));
      if (req.method === "POST" && path === "/api/settings") {
        const b = await body(req);
        const p = typeof b.savePath === "string" ? b.savePath.trim() : "";
        store.setSetting("savePath", p || null);
        return send(res, 200, settingsView({ ...cfg, savePath: p || cfg.savePath }, store));
      }
      if (req.method === "POST" && path === "/api/settings/pick") {
        const picked = await pickSaveFile();
        if (picked) store.setSetting("savePath", picked);
        return send(res, 200, { picked, ...settingsView({ ...cfg, savePath: picked ?? ecfg.savePath }, store) });
      }
      if (req.method === "POST" && path === "/api/settings/reveal") {
        revealInFinder(ecfg.savePath);
        return send(res, 200, { ok: true });
      }
      const partyArt = path.match(/^\/art\/party\/(\d)\.png$/);
      if (req.method === "GET" && partyArt) {
        const body = partyPng(ecfg, (p) => p.slot === Number(partyArt[1]));
        if (!body) return send(res, 404, { error: "no art for that slot" });
        res.writeHead(200, { "content-type": "image/png", "access-control-allow-origin": "*" });
        return res.end(body);
      }
      const speciesArt = path.match(/^\/art\/species\/(\d+)\.png$/);   // C-24: as the INDEX draws it, in its type's colours
      if (req.method === "GET" && speciesArt) {
        const row = SPECIES[speciesArt[1]];
        const file = row?.art?.front && join(ART_DIR, row.art.front.split("/").pop().replace("_front.png", ".png"));
        if (!file || !existsSync(file)) return send(res, 404, { error: "no art for that species" });
        const png = readFileSync(file);   // no routines to paint: the streak slots take the body's mid tone
        const body = row.streaks ? repaint(png, (pal) => streakColours(pal, row.bodyType, [0, 0, 0, 0])) : png;
        res.writeHead(200, { "content-type": "image/png", "access-control-allow-origin": "*", "cache-control": "max-age=86400" });
        return res.end(body);
      }
      if (req.method === "GET" && path === "/api/device/art") {   // C-36: the carried daemon, as a device draws it
        const body = partyPng(ecfg, (p) => p.away);
        if (!body) return send(res, 404, { error: "no daemon is on the device" });
        return send(res, 200, deviceArt(body));
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
        if (!ecfg.savePath || !existsSync(ecfg.savePath)) return send(res, 404, { error: "no save named -- set it in Settings" });
        const prof = readProfile(new Uint8Array(readFileSync(ecfg.savePath)));
        const m = store.married();
        const thisGame = m ? m.name === prof.name && m.trainerId === prof.trainerId && m.secretId === prof.secretId : null;
        return send(res, 200, { ...prof, edition: ecfg.edition, thisGame, marriedTo: m ? m.name : null });
      }
      if (req.method === "GET" && path === "/api/index") {          // C-24: the save's own INDEX, OPUS's margins with it
        if (!ecfg.savePath || !existsSync(ecfg.savePath)) return send(res, 404, { error: "no save named -- set it in Settings" });
        return send(res, 200, readIndex(new Uint8Array(readFileSync(ecfg.savePath)), ecfg.edition));
      }
      if (req.method === "GET" && path === "/api/party") {
        if (!ecfg.savePath || !existsSync(ecfg.savePath)) return send(res, 404, { error: "no save named -- set it in Settings" });
        return send(res, 200, readSave(new Uint8Array(readFileSync(ecfg.savePath))));
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
