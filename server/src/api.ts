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
//   GET  /api/meetings           C-60: who the daemon met nearby, and whether a SYNC has written it in
//   GET  /api/device/art         C-36: the carried daemon's front sprite, as sixteen colours and four bits a pixel
//   GET  /api/device/commands    C-32: the device takes what the site sent it; POST /api/device/results answers each,
//                                POST /api/device/routines says what routines it has
//   GET  /api/device/link        C-32 (this machine only): linked or not, by which way, its routines and results;
//                                POST /api/device/run {routine}, /api/device/wifi {ssid, password}, /api/device/ir {...}
//   POST /api/device/ticks       C-09: {steps: [ids]} -- the steps a device ticked off; answers with the new state and
//                                what to celebrate (C-50); POST /api/device/untick {step} undoes one (C-49)
//   GET  /api/goal               C-46: the one goal; POST /api/goal {title, replace?}, /api/goal/step {text, milestone?},
//                                /api/goal/milestone {title}, /api/goal/remove {step | milestone}; /api/steps/:id/undo
//   POST /api/device/interact    C-13: {kind, detail?} -- the device was used (a ROUTINE run); kept as tending the daemon
//   GET/POST /api/settings       C-29: the save path (this machine only, like everything but the device's endpoints)
import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { execFile, execFileSync } from "node:child_process";
import { platform } from "node:os";
import weekJson from "../data/week.json" with { type: "json" };
import speciesJson from "../data/species.json" with { type: "json" };
import irCodesJson from "../data/ir_codes.json" with { type: "json" };
import { breakdown } from "./ai/breakdown.js";
import { asWav, toDevicePcm, VoiceShelf, DEVICE_RATE } from "./ai/voice.js";
import type { Config } from "./config.js";
import { Store } from "./db.js";
import { readSave } from "./save/reader.js";
import { readProfile } from "./save/profile.js";
import { readIndex } from "./save/index.js";
import { answerRequests, syncSave } from "./save/writer.js";
import { season } from "./seasons.js";
import { deviceArt, gameRoutines, repaint, streakColours } from "./art.js";
import { deviceDay } from "./days.js";
import { life } from "./life.js";
import { levelFromExp } from "./save/growth.js";
import { DeviceHub, type Via } from "./device.js";
import { Devices, validDeviceId } from "./devices.js";
import { networkInterfaces } from "node:os";
import { randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";

const ART_DIR = fileURLToPath(new URL("../data/art/", import.meta.url));
// C-24: a species as the INDEX draws it, in its type's colours (no routines to paint: the streak slots take the body's
// mid tone) -- or null when the species has no art
const speciesPngCache = new Map<string, Buffer | null>();
function speciesPng(species: string): Buffer | null {
  if (speciesPngCache.has(species)) return speciesPngCache.get(species)!;
  const row = SPECIES[species];
  const file = row?.art?.front && join(ART_DIR, row.art.front.split("/").pop().replace("_front.png", ".png"));
  const png = file && existsSync(file) ? readFileSync(file) : null;
  const body = png && row.streaks ? repaint(png, (pal) => streakColours(pal, row.bodyType, [0, 0, 0, 0])) : png;
  speciesPngCache.set(species, body);
  return body;
}

const SPECIES = speciesJson as unknown as Record<string, any>;

async function body(req: IncomingMessage): Promise<any> {
  let s = "";
  for await (const chunk of req) s += chunk;
  return s ? JSON.parse(s) : {};
}

// The bytes of a request, up to a limit (a handheld's recording: C-66). null when it was larger.
async function rawBody(req: IncomingMessage, most = 2 * 1024 * 1024): Promise<Buffer | null> {
  const parts: Buffer[] = []; let n = 0;
  for await (const chunk of req) { n += chunk.length; if (n > most) return null; parts.push(chunk as Buffer); }
  return Buffer.concat(parts);
}

// C-64, C-65, C-66: the daemon's voice and its answers come from the user's n8n (DAEMONS ai/n8n: daemon/talk, and
// daemon/voice for the INDEX entry read aloud). The server calls it, never a device: the secret stays here, and the
// server knows which daemon is carried and what day it is.
async function n8n(cfg: Config, hook: string, payload: unknown): Promise<Record<string, unknown>> {
  if (!cfg.talk.url) return { error: "no voice server set: add \"talk\": {\"url\": \"http://<n8n>:5678/webhook\"} to server/config.json" };
  const secret = cfg.talk.secret ?? process.env[cfg.talk.secretEnv] ?? "";
  const stop = new AbortController(), t = setTimeout(() => stop.abort(), 180000);
  try {
    const r = await fetch(`${cfg.talk.url.replace(/\/$/, "")}/${hook}`, { method: "POST", signal: stop.signal,
      headers: { "content-type": "application/json", "x-dex-secret": secret }, body: JSON.stringify(payload) });
    const j = await r.json().catch(() => ({ error: `the voice server answered ${r.status}` }));
    return j as Record<string, unknown>;
  } catch { return { error: "the voice server did not answer" }; } finally { clearTimeout(t); }
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
    return { sameGame, firstSave, married, received: [], returned: [], refused: [], firstLink: false, recalledSeen: false, backup: null,
             met: { companions: 0, newlySeen: 0, friendship: null }, grew: null };
  // C-15: what was met nearby since the last SYNC -- each species seen; +1 friendship for each companion met in a day
  // (the beacon's id changes hourly, so it is counted per hour seen), at most +5 a day. Small, as everything is (PLAN 7).
  const applied = Number(store.getSetting("met.applied") ?? 0);
  const meetings = store.meetingsAfter(applied);
  const perDay = new Map<string, Set<string>>();
  const seen: number[] = [];
  for (const m of meetings) {
    const [species, peer] = (m.detail ?? "").split(" ");
    const nat = SPECIES[species]?.national;
    if (nat) seen.push(nat);
    const day = m.at.slice(0, 10);
    if (!perDay.has(day)) perDay.set(day, new Set());
    perDay.get(day)!.add(peer ?? m.at);
  }
  const friendshipGain = [...perDay.values()].reduce((n, peers) => n + Math.min(5, peers.size), 0);
  // C-45: the experience a daemon gained here, written when it is home -- for whichever party daemon has some waiting
  let grow: { personality: number; exp: number } | undefined, growLast = 0;
  for (const d of readSave(file).party) {
    const p = pendingExp(store, d.personality);
    if (p.exp > 0) { grow = { personality: d.personality, exp: p.exp }; growLast = p.last; break; }
  }
  const r = syncSave(file, { link: true, met: { seen, friendship: friendshipGain }, grow });
  let backup: string | null = null;
  if (r.changed) {
    const dir = join(dirname(cfg.savePath), "companion-backups");
    mkdirSync(dir, { recursive: true });
    backup = join(dir, `${basename(cfg.savePath)}.${now.toISOString().replace(/[:.]/g, "-")}`);
    copyFileSync(cfg.savePath, backup);
    writeFileSync(cfg.savePath, r.save);
  }
  // only once the save holds them: what was met, and what was grown, are written
  if (meetings.length) store.setSetting("met.applied", String(meetings[meetings.length - 1].id));
  if (r.grew) store.setSetting(`exp.applied.${r.grew.personality}`, String(growLast));
  return { sameGame, firstSave, married,
           received: r.answered.filter((a) => a.now === "away").map((a) => a.nickname),
           returned: r.answered.filter((a) => a.now === "home").map((a) => a.nickname),
           refused: r.refused, firstLink: r.firstLink, recalledSeen: r.recalledSeen, backup,
           met: { companions: meetings.length, newlySeen: r.newlySeen.length, friendship: r.friendship },
           grew: r.grew ? { nickname: r.grew.nickname, exp: r.grew.exp, from: r.grew.from, to: r.grew.to } : null };
}

// C-43: the board's settings -- set on the site, never on the board -- carried to it in every state, so a board
// that links picks them up whichever way it links. Kept by the server; the board keeps its own copy in flash.
export const DEVICE_SETTINGS = { home: "daemon", sleepAfter: 120, sound: true, volume: 40, ring: 33, meet: true };   // meet: C-15
export type DeviceSettings = typeof DEVICE_SETTINGS;
export function deviceSettings(store: Store): DeviceSettings {
  try { return { ...DEVICE_SETTINGS, ...JSON.parse(store.getSetting("device") ?? "{}") }; }
  catch { return { ...DEVICE_SETTINGS }; }
}
function checkSettings(b: any): DeviceSettings | string {
  const s = { ...DEVICE_SETTINGS, ...b };
  if (!["daemon", "today"].includes(s.home)) return "home is daemon or today";
  if (!Number.isInteger(s.sleepAfter) || s.sleepAfter < 0 || s.sleepAfter > 3600) return "sleepAfter is 0 (never) to 3600 seconds";
  if (typeof s.sound !== "boolean") return "sound is on or off";
  if (!Number.isInteger(s.volume) || s.volume < 0 || s.volume > 100) return "volume is 0 to 100";
  if (!Number.isInteger(s.ring) || s.ring < 0 || s.ring > 100) return "ring is 0 to 100";
  if (typeof s.meet !== "boolean") return "meet is on or off";
  return { home: s.home, sleepAfter: s.sleepAfter, sound: s.sound, volume: s.volume, ring: s.ring, meet: s.meet };
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

// C-48: a walking goal -- steps a day, 10,000 unless the site says otherwise. The phone will count them (C-27,
// HealthKit); until then they are typed on the site. Reaching it, once a day, is activity for the daemon (PLAN 7:
// "satisfies it as training does") and gives it experience.
export const WALK_GOAL = 10000, EXP_PER_WALK = 1;
function walk(cfg: Config, store: Store, now = new Date()) {
  const date = today(cfg, store, now).date;
  const goal = Number(store.getSetting("walk.goal") ?? WALK_GOAL);
  const steps = Number(store.getSetting(`walk.${date}`) ?? 0);
  return { date, goal, steps, reached: steps >= goal };
}
function setWalk(cfg: Config, store: Store, b: { goal?: unknown; steps?: unknown }) {
  if (b.goal !== undefined) {
    if (!Number.isInteger(b.goal) || (b.goal as number) < 1000 || (b.goal as number) > 50000) return "a walking goal is 1,000 to 50,000 steps";
    store.setSetting("walk.goal", String(b.goal));
  }
  const before = walk(cfg, store);
  if (b.steps !== undefined) {
    if (!Number.isInteger(b.steps) || (b.steps as number) < 0 || (b.steps as number) > 200000) return "steps are a whole number";
    store.setSetting(`walk.${before.date}`, String(b.steps));
  }
  const after = walk(cfg, store);
  if (after.reached && !store.interactionsSince(new Date(Date.now() - 86400000)).some((e) => e.kind === "walk" && e.detail === after.date)) {
    store.logInteraction("walk", after.date);
    const d = carriedDaemon(cfg);
    if (d) store.logInteraction("exp", `${d.personality} ${EXP_PER_WALK} walk ${after.date}`);
  }
  return after;
}

// C-46: an entry is short on purpose -- simpler is better (the user) -- and the site says so.
export const ENTRY_LIMIT = 40;
const entry = (v: unknown) => typeof v === "string" && v.trim() && v.trim().length <= ENTRY_LIMIT ? v.trim() : null;

// A step done, from the site or the board: kept as time together (C-13), a meal (C-44), and experience (C-47).
export function doStep(cfg: Config, store: Store, id: number, from: "site" | "device") {
  const r = store.completeStep(id);
  if (r.fresh) { store.logInteraction("step", `${from} ${id}`); growFromStep(cfg, store, id); }
  return r;
}

// C-45, C-47: experience gained on the device. LIMITED LEVELING (the user, 2026-10-04): one step completed is one
// experience point -- a variable to tune later. Kept by its personality until it is home, when SYNC writes it.
export const EXP_PER_STEP = 1;
function pendingExp(store: Store, personality: number) {
  const rows = store.expAfter(personality, Number(store.getSetting(`exp.applied.${personality}`) ?? 0));
  return { exp: rows.reduce((n, r) => n + r.gain, 0), last: rows.length ? rows[rows.length - 1].id : 0 };
}
function carriedDaemon(cfg: Config) {
  if (!cfg.savePath || !existsSync(cfg.savePath)) return null;
  try { return readSave(new Uint8Array(readFileSync(cfg.savePath))).party.find((p) => p.away) ?? null; } catch { return null; }
}
export function growFromStep(cfg: Config, store: Store, stepId: number) {
  const d = carriedDaemon(cfg);
  if (!d) return;
  const curve = SPECIES[String(d.species)]?.growth ?? 0;
  if (levelFromExp(curve, d.exp + pendingExp(store, d.personality).exp) >= 100) return;
  store.logInteraction("exp", `${d.personality} ${EXP_PER_STEP} step ${stepId}`);   // the step's id, so an undo takes it back
}

// C-13: the carried daemon's life, read from two weeks of what was done together.
export function daemonLife(store: Store, now = new Date()) {
  return life(store.interactionsSince(new Date(now.getTime() - 14 * 86400000)), now);
}

// C-45: what it has grown here, to show on the device and the site: the experience, and the level it would be at home
function grown(d: { species: number; exp: number; level: number; personality: number }, store: Store) {
  const exp = pendingExp(store, d.personality).exp;
  return { exp, level: Math.max(d.level, levelFromExp(SPECIES[String(d.species)]?.growth ?? 0, d.exp + exp)) };
}

export function deviceState(cfg: Config, store: Store, now = new Date()) {
  const t = today(cfg, store, now);
  let daemon = null, party: unknown[] = [];
  if (cfg.savePath && existsSync(cfg.savePath)) {
    const save = readSave(new Uint8Array(readFileSync(cfg.savePath)));
    const d = save.party.find((p) => p.away);
    // C-68: the party and their routines, for GAME ROUTINES
    party = save.party.map((p) => ({ name: p.nickname || p.name, level: p.level, types: SPECIES[String(p.species)]?.types ?? [],
                                     routines: gameRoutines(SPECIES[String(p.species)]?.bodyType ?? null, p.moves) }));
    const row = d && SPECIES[String(d.species)];
    // C-36: its INDEX entry in the save's edition's voice, and `artKey`, which changes when its art would (another
    // daemon, or new routines painting its streaks), so a device fetches GET /api/device/art only then.
    if (d) daemon = { slot: d.slot, species: d.species, name: d.name, nickname: d.nickname, level: d.level, friendship: d.friendship,
                      holding: d.holding, art: `/art/party/${d.slot}.png`, mood: null,
                      types: row?.types ?? [], category: row?.category ?? "", entry: row?.entry?.[cfg.edition] ?? "",
                      artKey: `${d.species}-${d.moves.join(".")}`, life: daemonLife(store, now),
                      grown: grown(d, store) };
  }
  const dd = deviceDay(t.day.day);
  // C-33: where a device on the Wi-Fi finds this server -- only when it listens on the network at all
  const addr = cfg.host === "0.0.0.0" ? lanAddress() : null;
  return { date: t.date, edition: t.edition, season: t.season, server: addr ? `http://${addr}:${cfg.port}` : null,
           // C-71: the time, for a device with a clock to set (the watch): seconds since 1970, and the local offset in minutes
           clock: { epoch: Math.floor(now.getTime() / 1000), offset: -now.getTimezoneOffset() },
           settings: deviceSettings(store),
           beacons: ownBeacons(store).map((b) => b.peer).join(","),     // C-15: our companions' tags, never a meeting
           // C-73: the Xenith day -- the virtue over its shadow, the chakra and the day's theme
           day: { name: t.day.day, colour: t.day.colour, note: t.day.note, virtue: t.day.cue, chakra: t.day.chakra,
                  theme: t.day.theme, menu: dd.menu, led: dd.led },
           step: t.next ? { id: t.next.step.id, text: t.next.step.text, goal: t.next.goal, milestone: t.next.milestone } : null, daemon, party };
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
// C-53: what only this machine may do, even for a paired phone -- make a pairing code, list or forget phones, open the
// network, or open a dialog or a Finder window on the Mac
const LOCAL_ONLY = ["/api/pair/code", "/api/pair/phones", "/api/pair/forget", "/api/settings/network",
                    "/api/settings/pick", "/api/settings/reveal", "/api/settings/relay"];
// C-56: the user's n8n carries a phone's requests here from anywhere, marking each with the relay's secret. A relayed
// request is an INTERNET request: a paired phone's key for everything (the device's own door included), no pairing,
// nothing that is this machine's alone.
const RELAY_HEADER = "x-companion-relay";
const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
export function relaySecret(store: Store): string {
  let s = store.getSetting("relay.secret");
  if (!s) { s = randomBytes(24).toString("base64url"); store.setSetting("relay.secret", s); }
  return s;
}
const DEVICE_DOOR = [
  (m: string, p: string) => m === "GET" && ["/api/device/state", "/api/device/art", "/api/device/commands"].includes(p),
  (m: string, p: string) => m === "POST" &&
    ["/api/device/ticks", "/api/device/untick", "/api/device/interact", "/api/device/results", "/api/device/routines",
     "/api/device/remotes", "/api/device/networks", "/api/device/beacon", "/api/device/met", "/api/device/listen",
     "/api/device/battery", "/api/ai/talk", "/api/ai/speak", "/api/device/talk", "/api/device/speak"].includes(p),
  (m: string, p: string) => m === "GET" && (p.startsWith("/art/") || p.startsWith("/api/device/voice/")),
  (m: string) => m === "OPTIONS",
];

// C-33: where a device on the Wi-Fi finds this server -- this machine's address on the local network.
export function lanAddress(): string | null {
  for (const list of Object.values(networkInterfaces()))
    for (const a of list ?? []) if (a.family === "IPv4" && !a.internal) return a.address;
  return null;
}

// C-15: the beacon tags our own companions have used lately -- never a meeting
const OWN_KEEP_MS = 48 * 3600000;
function ownBeacons(store: Store): { peer: string; at: number }[] {
  try { return JSON.parse(store.getSetting("beacons.own") ?? "[]"); } catch { return []; }
}

// ---- C-53: pairing a phone. The site asks for a code (this machine only); the phone sends it back once, with a name,
// and is given its own key. With the key, the whole API answers it across the network -- without one, only the board's
// routes do. A code lasts ten minutes, is used once, and is retired after five wrong guesses.
const PAIR_MS = 10 * 60 * 1000;
class Pairing {
  code: string | null = null; until = 0; misses = 0;
  start(now = Date.now()) { this.code = String(randomInt(0, 1000000)).padStart(6, "0"); this.until = now + PAIR_MS; this.misses = 0; return this.code; }
  take(code: unknown, now = Date.now()): boolean {
    if (!this.code || now > this.until) return false;
    if (String(code) !== this.code) { if (++this.misses >= 5) this.code = null; return false; }
    this.code = null;
    return true;
  }
}

export function makeServer(cfg: Config, store = new Store(cfg.database), hub = new DeviceHub(), pairing = new Pairing()): Server {
  const devices = new Devices(store);                          // C-80: every device by its own name (devices.ts)
  const voices = new VoiceShelf();                              // C-66: answers a handheld streams (ai/voice.ts)
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      const path = url.pathname;
      // C-32: "usb" is the bridge on this machine speaking for the device down its cable; anything from the network is
      // the device itself, on the Wi-Fi.

      // C-29: the save path the user set in Settings (stored in the db) overrides config.json; everything that reads
      // or writes a save uses `ecfg`, so the user never edits a file by hand.
      const ecfg: Config = { ...cfg, savePath: store.getSetting("savePath") ?? cfg.savePath };
      // With "host": "0.0.0.0" the server is on the local network for a device -- and only the device's own door
      // answers it there. Settings, SYNC, the save and the goals stay this machine's, so nothing else on the network
      // can change the save path, write the save, or open a dialog on the Mac.
      const bearer = /^Bearer (.+)$/.exec(String(req.headers.authorization ?? ""))?.[1];
      const phone = bearer ? store.phoneFor(bearer) : null;              // C-53: a paired phone has the whole API
      if (req.headers[RELAY_HEADER] !== undefined) {                     // C-56
        if (!same(String(req.headers[RELAY_HEADER]), relaySecret(store)))
          return send(res, 403, { error: "that is not the companion's relay" });
        if (!phone) return send(res, 401, { error: "away from home, only a paired phone -- pair it at home first" });
        if (LOCAL_ONLY.includes(path) || path.startsWith("/api/pair"))
          return send(res, 403, { error: "that is done at home, on the computer the companion runs on" });
      }
      // C-55: "phone" is the companion app carrying the device's link over Bluetooth -- a paired phone speaking for it.
      const asked = url.searchParams.get("via");
      const via: Via = asked === "usb" && isLoopback(req.socket.remoteAddress) ? "usb" : asked === "phone" && phone ? "phone" : "wifi";
      // C-80: which device is asking -- its x-device header (a bridge passes on the board's), or ?device= for the phone's
      const deviceId = String(req.headers["x-device"] ?? url.searchParams.get("device") ?? "");
      // Seen, and how: a bridge says ?via= on the requests that carry the link; another request from this machine is
      // the same bridge passing something on, and must not turn a cable into Wi-Fi.
      if (validDeviceId(deviceId) && (path.startsWith("/api/device/") || path.startsWith("/api/ai/")) &&
          (asked || !isLoopback(req.socket.remoteAddress))) devices.seen(deviceId, via);
      if (!isLoopback(req.socket.remoteAddress) && !phone && !(req.method === "POST" && path === "/api/pair") &&
          !DEVICE_DOOR.some((d) => d(req.method ?? "", path)))
        return send(res, 403, { error: "only the device's endpoints answer the network -- pair this phone first" });
      if (!isLoopback(req.socket.remoteAddress) && LOCAL_ONLY.includes(path))
        return send(res, 403, { error: "that is done on the computer the companion runs on" });
      if (req.method === "OPTIONS") {
        res.writeHead(204, { "access-control-allow-origin": "*", "access-control-allow-methods": "GET,POST",
                             "access-control-allow-headers": "content-type, authorization" });
        return res.end();
      }
      // ---- C-53: pairing ----
      if (req.method === "POST" && path === "/api/pair/code") {         // this machine only (the door above)
        const code = pairing.start();
        return send(res, 200, { code, minutes: PAIR_MS / 60000, lan: { address: lanAddress(), port: cfg.port, open: cfg.host === "0.0.0.0" } });
      }
      if (req.method === "POST" && path === "/api/pair") {
        const b = await body(req);
        const name = typeof b.name === "string" && b.name.trim() ? b.name.trim().slice(0, 40) : "a phone";
        if (!pairing.take(b.code)) return send(res, 403, { error: "that code is not right, or has run out -- show a new one on the site" });
        const token = randomBytes(24).toString("base64url");
        store.addPhone(token, name);
        return send(res, 200, { token, name, away: store.getSetting("relay.url") });   // C-56: the way back from anywhere
      }
      if (req.method === "GET" && path === "/api/pair/phones") return send(res, 200, store.phones());
      if (req.method === "POST" && path === "/api/pair/forget") {
        const b = await body(req);
        if (typeof b.name !== "string") return send(res, 400, { error: "forget {name}" });
        store.forgetPhone(b.name);
        return send(res, 200, store.phones());
      }
      // C-56: the relay -- its public address (for the phones) and the secret n8n marks each request with (this machine only)
      if (req.method === "GET" && path === "/api/settings/relay")
        return send(res, 200, { url: store.getSetting("relay.url"), secret: relaySecret(store) });
      if (req.method === "POST" && path === "/api/settings/relay") {
        const b = await body(req);
        if (b.url !== undefined) {
          const url = typeof b.url === "string" ? b.url.trim() : "";
          if (url && !/^https:\/\/[^\s]+$/.test(url)) return send(res, 400, { error: "the relay's address starts with https://" });
          store.setSetting("relay.url", url || null);
        }
        if (b.renew === true) store.setSetting("relay.secret", null);
        return send(res, 200, { url: store.getSetting("relay.url"), secret: relaySecret(store) });
      }
      // C-56: where a paired phone goes when home does not answer
      if (req.method === "GET" && path === "/api/settings/away") return send(res, 200, { url: store.getSetting("relay.url") });
      // the server listens on the network (for the phone and the board) -- kept here, read at the next start
      if (req.method === "GET" && path === "/api/settings/network")
        return send(res, 200, { open: store.getSetting("host") === "0.0.0.0", now: cfg.host === "0.0.0.0", address: lanAddress(), port: cfg.port });
      if (req.method === "POST" && path === "/api/settings/network") {
        const b = await body(req);
        store.setSetting("host", b.open ? "0.0.0.0" : "127.0.0.1");
        return send(res, 200, { open: b.open === true, now: cfg.host === "0.0.0.0", restart: (b.open === true) !== (cfg.host === "0.0.0.0") });
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
        if (validDeviceId(deviceId) && b.firmware) devices.note(deviceId, { firmware: String(b.firmware) });
        return send(res, 200, { ok: true });
      }
      // ---- the site's side (this machine only): what the link is, and the commands it sends ----
      if (req.method === "GET" && path === "/api/device/link")
        return send(res, 200, { ...hub.link(), lan: { address: lanAddress(), port: cfg.port, open: cfg.host === "0.0.0.0" },
                                battery: JSON.parse(store.getSetting("device.battery") ?? "null"),   // C-63
                                devices: devices.list() });                                            // C-80
      if (req.method === "GET" && path === "/api/devices") return send(res, 200, { devices: devices.list() });   // C-80
      if (req.method === "POST" && path === "/api/devices/forget") {
        const b = await body(req);
        if (!validDeviceId(b.id)) return send(res, 400, { error: "forget {id}" });
        devices.forget(b.id); return send(res, 200, { devices: devices.list() });
      }
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
      if (req.method === "GET" && path === "/api/device/settings") return send(res, 200, deviceSettings(store));   // C-43
      if (req.method === "POST" && path === "/api/device/settings") {
        const s = checkSettings({ ...deviceSettings(store), ...(await body(req)) });
        if (typeof s === "string") return send(res, 400, { error: s });
        store.setSetting("device", JSON.stringify(s));
        return send(res, 200, s);
      }
      if (req.method === "GET" && path === "/api/ir/brands") return send(res, 200, irCodesJson.brands);   // C-34, C-51
      // C-51: the board's remotes -- what it reports, and what the site asks of it
      if (req.method === "POST" && path === "/api/device/remotes") {
        const b = await body(req);
        hub.remotes = { active: Number(b.active ?? 0), remotes: Array.isArray(b.remotes) ? b.remotes : [] };
        return send(res, 200, { ok: true });
      }
      // C-52: the networks the board has learned (names only), and forgetting one
      if (req.method === "POST" && path === "/api/device/networks") {
        const b = await body(req);
        hub.networks = Array.isArray(b.networks) ? b.networks.map(String) : [];
        hub.currentNetwork = typeof b.current === "string" ? b.current : "";
        return send(res, 200, { ok: true });
      }
      if (req.method === "POST" && path === "/api/device/network") {
        const b = await body(req);
        if (b.op !== "forget" || !Number.isInteger(b.index)) return send(res, 400, { error: "forget a network: {op: forget, index}" });
        return send(res, 200, { id: hub.send({ type: "network", op: "forget", index: b.index }) });
      }
      if (req.method === "POST" && path === "/api/device/remote") {
        const b = await body(req);
        if (b.op === "activate" || b.op === "remove") {
          if (!Number.isInteger(b.index)) return send(res, 400, { error: "which remote: {index}" });
          return send(res, 200, { id: hub.send({ type: "remote", op: b.op, index: b.index }) });
        }
        if (b.op === "rename") {                   // C-59: the user's own name for it, as the board's font can draw it
          const name = typeof b.name === "string" ? b.name.replace(/[^\x20-\x7e]/g, "").trim().slice(0, 16).trim() : "";
          if (!Number.isInteger(b.index) || !name) return send(res, 400, { error: "rename {index, name}: a name of 1-16 plain letters" });
          return send(res, 200, { id: hub.send({ type: "remote", op: "rename", index: b.index, name }) });
        }
        if (b.op === "add") {                      // a brand's whole remote, from the code table
          const set = irCodesJson.brands.find((x) => x.brand === b.brand)?.sets.find((x) => x.label === b.label);
          if (!set) return send(res, 400, { error: "no such remote in the table" });
          const button = (code: string) => ({ protocol: set.protocol, code, bits: set.bits, repeat: set.repeat });
          return send(res, 200, { id: hub.send({ type: "remote", op: "add", name: set.label,
                                                 buttons: [button(set.power), button(set.volumeUp), button(set.volumeDown)] }) });
        }
        return send(res, 400, { error: "op is activate, remove, rename or add" });
      }
      if (req.method === "POST" && path === "/api/device/ir") {     // C-34: one IR code, sent (and kept if asked)
        const b = await body(req);
        if (typeof b.protocol !== "string" || typeof b.code !== "string" || !Number.isInteger(b.bits))
          return send(res, 400, { error: "an IR code needs {protocol, code, bits}" });
        return send(res, 200, { id: hub.send({ type: "ir", protocol: b.protocol, code: b.code, bits: b.bits,
                                               repeat: Number(b.repeat ?? 0), keep: !!b.keep, label: String(b.label ?? "") }) });
      }
      if (req.method === "POST" && path === "/api/device/untick") {   // C-49: a step ticked on the board by accident
        const b = await body(req);
        if (!Number.isInteger(b.step) || !store.undoStep(b.step)) return send(res, 404, { error: "no such step" });
        return send(res, 200, { undone: b.step, state: deviceState(ecfg, store) });
      }
      if (req.method === "POST" && path === "/api/device/ticks") {
        const b = await body(req);
        if (!Array.isArray(b.steps) || !b.steps.every((n: unknown) => Number.isInteger(n)))
          return send(res, 400, { error: "steps must be a list of step ids" });
        const results = b.steps.map((id: number) => ({ id, ...doStep(ecfg, store, id, "device") }));
        const done = results.filter((r: any) => r.ok).map((r: any) => r.id);
        // C-50: what the board celebrates -- the biggest thing these ticks finished
        const celebrate = results.some((r: any) => r.goal) ? "goal" : results.some((r: any) => r.milestone) ? "milestone"
                        : results.some((r: any) => r.fresh) ? "step" : null;
        return send(res, 200, { done, celebrate, state: deviceState(ecfg, store) });
      }
      // C-13: the device reports each use -- a routine run, a step ticked -- as tending the daemon.
      // C-13: the site's own care -- feed, water, train -- kept as the device's are
      const care = path.match(/^\/api\/daemon\/(feed|water|train)$/);
      const lifeNow = () => { const d = carriedDaemon(ecfg); return { ...daemonLife(store), grown: d ? grown(d, store) : null,
                                                                       level: d?.level ?? null }; };
      if (req.method === "POST" && care) { store.logInteraction(care[1], "site"); return send(res, 200, lifeNow()); }
      if (req.method === "GET" && path === "/api/daemon/life") return send(res, 200, lifeNow());
      // ---- C-15: meeting others nearby. A companion's beacon carries only its daemon's species and a tag of four random
      // bytes that changes every hour (firmware/esp32/src/meet.cpp, app/beacon.ts). Each of OUR companions says which tag
      // is its own (beacon), so the board and the phone, which hear each other all day, never count as a meeting. A
      // meeting is then kept once per tag (so once an hour per companion), and the next SYNC writes it into the save.
      if (req.method === "POST" && path === "/api/device/beacon") {
        const b = await body(req);
        if (typeof b.peer !== "string" || !/^[0-9a-f]{8}$/.test(b.peer)) return send(res, 400, { error: "beacon {peer}: eight hex digits" });
        const own = ownBeacons(store).filter((x) => Date.now() - x.at < OWN_KEEP_MS && x.peer !== b.peer);
        // who it is: a paired phone carries its key; the board comes through a bridge or over Wi-Fi without one
        store.setSetting("beacons.own", JSON.stringify([...own, { peer: b.peer, at: Date.now(), by: phone ? "phone" : "board" }].slice(-24)));
        return send(res, 200, { ok: true });
      }
      // C-15: what the phone needs for its own beacon -- the carried daemon's species, our companions' tags, the setting
      if (req.method === "GET" && path === "/api/beacons") {
        const carried = carriedDaemon(ecfg);
        return send(res, 200, { meet: deviceSettings(store).meet, species: carried?.species ?? null,
                                ours: ownBeacons(store).map((b) => b.peer),
                                beacons: ownBeacons(store),                    // with who sent each, for the check
                                heardOurs: JSON.parse(store.getSetting("beacons.heardOurs") ?? "null"),
                                lastListen: JSON.parse(store.getSetting("beacons.lastListen") ?? "null") });
      }
      // C-60: who the daemon has met nearby -- the species, when, and whether a SYNC has written it into the save yet;
      // and, for the user's own check, the last listen and when our two companions last heard each other.
      if (req.method === "GET" && path === "/api/meetings") {
        const applied = Number(store.getSetting("met.applied") ?? 0);
        const meetings = store.meetings().map((m) => {
          const species = (m.detail ?? "").split(" ")[0], row = SPECIES[species];
          return { at: m.at, species: Number(species), name: row?.name ?? "?",
                   art: row?.art?.front ? `/art/species/${species}.png` : null, written: m.id <= applied };
        });
        return send(res, 200, { meetings,
                                heardOurs: JSON.parse(store.getSetting("beacons.heardOurs") ?? "null"),
                                lastListen: JSON.parse(store.getSetting("beacons.lastListen") ?? "null") });
      }
      // C-66: push to talk -- text or audio in, an answer and its voice out. The daemon carried and the day go with it.
      const talkPayload = (b: Record<string, any>) => {
        const st = deviceState(ecfg, store), d = st.daemon;
        return {
          text: typeof b.text === "string" ? b.text.slice(0, 1000) : undefined,
          audioBase64: typeof b.audioBase64 === "string" ? b.audioBase64 : undefined, audioMime: b.audioMime,
          history: Array.isArray(b.history) ? b.history.slice(-6) : [],
          provider: b.provider ?? store.getSetting("talk.provider") ?? "auto", speak: b.speak !== false, voice: "index",
          localModel: ecfg.talk.localModel,
          daemon: d ? { nickname: d.nickname, name: d.name, types: (d.types as string[]).join("/"), category: d.category, entry: d.entry }
                    : { nickname: "your daemon" },
          day: { day: st.day.name, theme: st.day.theme, cue: st.day.virtue },
        };
      };
      // A handheld's answer: the words, and its voice as a link to 16 kHz PCM it streams into its speaker (ai/voice.ts).
      const forDevice = async (r: Record<string, unknown>) => {
        let audio: string | null = null, ms = 0;
        if (typeof r.audioBase64 === "string" && r.audioBase64) {
          const pcm = await toDevicePcm(Buffer.from(r.audioBase64, "base64"));
          if (pcm) { audio = `/api/device/voice/${voices.put(pcm)}`; ms = Math.round(pcm.length / 2 / DEVICE_RATE * 1000); }
        }
        return { answer: r.answer ?? null, heard: r.heard ?? null, provider: r.provider ?? null, error: r.error ?? null, audio, ms };
      };
      // Whatever was recorded (the phone's AAC, the handheld's WAV) goes on as a 16 kHz WAV, so speech to text is sent one kind.
      const heardAs = async (audio: Buffer, mime: string) => {
        const w = await asWav(audio);
        return w ? { audioBase64: w.audio.toString("base64"), audioMime: w.mime } : { audioBase64: audio.toString("base64"), audioMime: mime };
      };
      if (req.method === "POST" && path === "/api/ai/talk") {
        const b = await body(req);
        if (typeof b.audioBase64 === "string" && b.audioBase64)
          Object.assign(b, await heardAs(Buffer.from(b.audioBase64, "base64"), String(b.audioMime ?? "audio/mp4")));
        return send(res, 200, await n8n(ecfg, "daemon/talk", talkPayload(b)));
      }
      if (req.method === "POST" && path === "/api/device/talk") {     // C-66: a handheld's recording, raw
        const audio = await rawBody(req);
        if (!audio || audio.length < 44) return send(res, 400, { error: "talk takes a recording (up to 2 MB)" });
        return send(res, 200, await forDevice(await n8n(ecfg, "daemon/talk",
          talkPayload(await heardAs(audio, String(req.headers["content-type"] ?? "audio/wav"))))));
      }
      if (req.method === "POST" && path === "/api/device/speak") {    // C-65: the carried daemon's INDEX entry, aloud
        const d = deviceState(ecfg, store).daemon;
        if (!d?.entry) return send(res, 400, { error: "carry a daemon to hear its entry" });
        const r = await n8n(ecfg, "daemon/voice", { text: String(d.entry).replace(/\n/g, " ").slice(0, 600), voice: "index" });
        return send(res, 200, await forDevice({ ...r, answer: d.entry }));
      }
      if (req.method === "GET" && path.startsWith("/api/device/voice/")) {
        const pcm = voices.get(path.slice("/api/device/voice/".length));
        if (!pcm) return send(res, 404, { error: "that voice is gone; ask again" });
        res.writeHead(200, { "content-type": "application/octet-stream", "content-length": pcm.length,
                             "x-sample-rate": String(DEVICE_RATE) });
        return res.end(pcm);
      }
      if (req.method === "POST" && path === "/api/ai/speak") {       // C-65: an INDEX entry (or a line) in the INDEX voice
        const b = await body(req);
        const row = b.species !== undefined ? SPECIES[String(b.species)] : null;
        const carried = b.species === undefined && b.text === undefined ? deviceState(ecfg, store).daemon : null;
        const text = typeof b.text === "string" ? b.text : row ? row.entry?.[ecfg.edition] : carried?.entry;
        if (!text) return send(res, 400, { error: "speak {species} or {text}, or carry a daemon" });
        return send(res, 200, await n8n(ecfg, "daemon/voice", { text: String(text).replace(/\n/g, " ").slice(0, 600), voice: "index" }));
      }
      if (req.method === "POST" && path === "/api/device/battery") {   // C-63: the handheld's charge, when it changes
        const b = await body(req);
        const pct = Number(b.percent);
        if (!Number.isFinite(pct) || pct < 0 || pct > 100) return send(res, 400, { error: "battery {percent 0-100}" });
        const battery = { percent: Math.round(pct), mv: Number(b.mv) || null,
                          charging: !!b.charging, full: !!b.full, usb: !!b.usb, at: new Date().toISOString() };
        store.setSetting("device.battery", JSON.stringify(battery));
        if (validDeviceId(deviceId)) devices.note(deviceId, { battery });                   // C-80: and the device's own
        return send(res, 200, { ok: true });
      }
      if (req.method === "POST" && path === "/api/device/listen") {   // C-15: the board's last listen, for the check
        const b = await body(req);
        store.setSetting("beacons.lastListen", JSON.stringify({ at: new Date().toISOString(), started: !!b.started,
                                                               devices: Number(b.devices) || 0, beacons: Number(b.beacons) || 0,
                                                               mode: Number(b.mode) || 0 }));
        const log = JSON.parse(store.getSetting("beacons.listens") ?? "[]");
        store.setSetting("beacons.listens", JSON.stringify([...log, { at: new Date().toISOString(), started: !!b.started,
          devices: Number(b.devices) || 0, beacons: Number(b.beacons) || 0, mode: Number(b.mode) || 0 }].slice(-12)));
        return send(res, 200, { ok: true });
      }
      if (req.method === "POST" && path === "/api/device/met") {
        const b = await body(req);
        const species = String(b.species ?? ""), peer = String(b.peer ?? "");
        if (!SPECIES[species] || !/^[0-9a-f]{8}$/.test(peer)) return send(res, 400, { error: "met {species, peer}" });
        if (ownBeacons(store).some((x) => x.peer === peer)) {     // never counted; noted, as proof both radios work
          const whose = ownBeacons(store).find((x) => x.peer === peer) as { by?: string } | undefined;
          store.setSetting("beacons.heardOurs", JSON.stringify({ at: new Date().toISOString(), peer, heard: whose?.by ?? "?",
                                                                 by: phone ? "phone" : "board" }));
          return send(res, 200, { counted: false, why: "one of yours" });
        }
        const hour = new Date(Date.now() - 3600000);
        if (store.interactionsSince(hour).some((i) => i.kind === "met" && i.detail?.endsWith(" " + peer)))
          return send(res, 200, { counted: false, why: "already met this hour" });
        store.logInteraction("met", `${species} ${peer}`);
        return send(res, 200, { counted: true, name: SPECIES[species].name });
      }
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
      // C-59: the same pictures as JSON, so they cross the user's n8n relay (which carries /api/ and JSON only) -- one
      // party daemon, one species, or every species the INDEX draws in a single request, so a phone away from home
      // runs the relay once for the whole INDEX rather than once a picture.
      if (req.method === "GET" && path === "/api/art") {
        const q = url.searchParams, b64 = (b: Buffer | null) => b?.toString("base64");
        if (q.has("party")) {
          const png = b64(partyPng(ecfg, (p) => p.slot === Number(q.get("party"))));
          return png ? send(res, 200, { png }) : send(res, 404, { error: "no art for that slot" });
        }
        if (q.has("species")) {
          const png = b64(speciesPng(String(q.get("species"))));
          return png ? send(res, 200, { png }) : send(res, 404, { error: "no art for that species" });
        }
        if (q.get("all") === "species") {
          const all: Record<string, string> = {};
          for (const n of Object.keys(SPECIES)) { const png = b64(speciesPng(n)); if (png) all[n] = png; }
          return send(res, 200, { species: all });
        }
        return send(res, 400, { error: "art for ?party=<slot>, ?species=<id> or ?all=species" });
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
        const body = speciesPng(speciesArt[1]);
        if (!body) return send(res, 404, { error: "no art for that species" });
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
      const step = path.match(/^\/api\/steps\/(\d+)\/(done|undo)$/);
      if (req.method === "POST" && step) {
        if (step[2] === "undo") return store.undoStep(Number(step[1])) ? send(res, 200, { next: store.nextStep() })
                                                                      : send(res, 404, { error: "no such step" });
        const r = doStep(ecfg, store, Number(step[1]), "site");
        return r.ok ? send(res, 200, { ...r, next: store.nextStep() }) : send(res, 404, { error: "no such step" });
      }
      if (req.method === "GET" && path === "/api/walk") return send(res, 200, walk(ecfg, store));   // C-48
      if (req.method === "POST" && path === "/api/walk") {
        const r = setWalk(ecfg, store, await body(req));
        return typeof r === "string" ? send(res, 400, { error: r }) : send(res, 200, r);
      }
      // ---- C-46: ONE goal, built from milestones and steps, each entry short on purpose ----
      if (req.method === "GET" && path === "/api/goal") return send(res, 200, { goal: store.currentGoal(), limit: ENTRY_LIMIT });
      if (req.method === "POST" && path === "/api/goal") {
        const b = await body(req);
        const title = entry(b.title);
        if (!title) return send(res, 400, { error: `a goal is a few words, at most ${ENTRY_LIMIT} letters` });
        const open = store.currentGoal();
        if (open && !b.replace) return send(res, 409, { error: "one goal at a time: finish this one, or replace it", goal: open });
        if (open) store.db.prepare("UPDATE goals SET done = ? WHERE id = ?").run(`set aside ${new Date().toISOString()}`, open.id);
        const g = store.addGoal(title);
        return send(res, 201, { goal: g, limit: ENTRY_LIMIT });
      }
      if (req.method === "POST" && (path === "/api/goal/step" || path === "/api/goal/milestone")) {
        const b = await body(req), g = store.currentGoal();
        if (!g) return send(res, 400, { error: "set a goal first" });
        const text = entry(b.text ?? b.title);
        if (!text) return send(res, 400, { error: `keep it short: at most ${ENTRY_LIMIT} letters` });
        const ok = path.endsWith("milestone") ? store.addMilestone(g.id, text)
                 : store.addStep(g.id, text, Number.isInteger(b.milestone) ? b.milestone : undefined);
        if (ok == null) return send(res, 400, { error: "no such milestone in this goal" });
        return send(res, 200, { goal: store.currentGoal(), limit: ENTRY_LIMIT });
      }
      if (req.method === "POST" && path === "/api/goal/remove") {
        const b = await body(req);
        if (Number.isInteger(b.step)) store.removeStep(b.step);
        else if (Number.isInteger(b.milestone)) store.removeMilestone(b.milestone);
        else return send(res, 400, { error: "remove {step} or {milestone}" });
        return send(res, 200, { goal: store.currentGoal(), limit: ENTRY_LIMIT });
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
