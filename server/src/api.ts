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
//   POST /api/sync               C-21: the one SYNC -- read the save, receive or return a daemon if the game asked,
//                                link the save, settle a daemon brought home without the app; the married save only
//   GET  /art/<name>_front.png   a daemon's art, from DAEMONS' own gfx/daemons/
//   GET  /art/party/<slot>.png   a party daemon as the game draws it, its streaks painted for its routines (C-18)
//   GET  /api/device/state       C-09: what a device shows -- the day, the season, the one next step, its daemon
//   GET  /api/meetings           C-60: who the daemon met nearby, and whether a SYNC has written it in
//   GET  /api/device/art         C-36: the carried daemon's front sprite, as sixteen colours and four bits a pixel
//                                (?slot=0..5: a party daemon's, for the CASINO's reels, C-149)
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
import { cardOp, companionId, keepNote, noteWritten, validUid, type CardOp } from "./cards.js";
import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { execFile, execFileSync } from "node:child_process";
import { platform } from "node:os";
import speciesJson from "../data/species.json" with { type: "json" };
import irCodesJson from "../data/ir_codes.json" with { type: "json" };
import { breakdown } from "./ai/breakdown.js";
import { asWav, Conversations, toDevicePcm, VoiceShelf, DEVICE_RATE } from "./ai/voice.js";
import type { Config } from "./config.js";
import { Store } from "./db.js";
import { readAway, readSave } from "./save/reader.js";
import { deviceArt, repaint, streakColours } from "./art.js";
import { createConnection } from "node:net";
import { DeviceHub, type Via } from "./device.js";
import { Devices, validDeviceId } from "./devices.js";
import { assign, carryView } from "./carry.js";
import { SharedNetworks } from "./networks.js";
import { networkInterfaces } from "node:os";
import { randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";
import * as core from "./core.js";
import { handles, route, type Reply } from "./routes.js";
import { EXPRESSIONS, SHADED, faceOf, shadePalette } from "./expressions.js";
import { FRAMES, PHASES, faceRev, renderFace, type Phase } from "./face.js";
import { den as denOf } from "./dens.js";
import { Home } from "./home.js";
import { DEFAULT_MODEL, OLLAMA_VERSION, QUIET, chatReply, heard, modelOf, ollamaKey, pick, show, tags, type AgentDaemon } from "./ollama.js";
import { kindOf } from "./deviceid.js";
import { DEVICE_SETTINGS, type DeviceSettings, deviceSettings, checkSettings, WALK_GOAL, EXP_PER_WALK, ENTRY_LIMIT, EXP_PER_STEP, daemonLife, ownBeacons, type Host, type SaveFile } from "./core.js";

export { DEVICE_SETTINGS, deviceSettings, WALK_GOAL, EXP_PER_WALK, ENTRY_LIMIT, EXP_PER_STEP, daemonLife };
export type { DeviceSettings };

// C-111: the companion's rules live in core.ts; here they read the save on disk. Written only after a copy of the save
// as it was goes beside it, in companion-backups/ (C-10, C-21).
function fileSave(path: string | null | undefined): SaveFile {
  return {
    read: () => (path && existsSync(path) ? new Uint8Array(readFileSync(path)) : null),
    write: (bytes, now) => {
      if (!path) return null;
      const dir = join(dirname(path), "companion-backups");
      mkdirSync(dir, { recursive: true });
      const backup = join(dir, `${basename(path)}.${now.toISOString().replace(/[:.]/g, "-")}`);
      copyFileSync(path, backup);
      // the review, 2026-10-18: written beside it and renamed over it, so a crash mid-write never leaves half a save
      const tmp = `${path}.companion-writing`;
      writeFileSync(tmp, bytes);
      renameSync(tmp, path);
      return backup;
    },
  };
}
const hostOf = (cfg: Config): Host => ({ edition: cfg.edition, save: fileSave(cfg.savePath) });
export const today = (cfg: Config, store: Store, now = new Date()) => core.today(hostOf(cfg), store, now);
export const sync = (cfg: Config, store: Store, now = new Date()) => core.sync(hostOf(cfg), store, now);
export const doStep = (cfg: Config, store: Store, id: number, from: "site" | "device", deviceId = "") =>
  core.doStep(hostOf(cfg), store, id, from, deviceId);
const awayNow = (cfg: Config) => core.awayNow(hostOf(cfg));
const carriedDaemon = (cfg: Config, store: Store, deviceId = "") => core.carriedDaemon(hostOf(cfg), store, deviceId);
export const growFromStep = (cfg: Config, store: Store, stepId: number, deviceId = "") =>
  core.growFromStep(hostOf(cfg), store, stepId, deviceId);
// C-33: where a device on the Wi-Fi finds this server -- only when it listens on the network at all
export const deviceState = (cfg: Config, store: Store, now = new Date(), deviceId = "", as: string | null = null) => {
  const addr = cfg.host === "0.0.0.0" ? lanAddress() : null;
  return core.deviceState(hostOf(cfg), store, now, deviceId, addr ? `http://${addr}:${cfg.port}` : null, as);
};

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

// A JSON body, at most `most` bytes (the review, 2026-10-18: there was no limit, and the device door is open to the LAN);
// too big is 413 and not JSON is 400 -- the handler's catch answers with `status`
async function body(req: IncomingMessage, most = 4 * 1024 * 1024): Promise<any> {
  let s = "", n = 0;
  for await (const chunk of req) {
    n += (chunk as Buffer).length;
    if (n > most) throw Object.assign(new Error("that is too big"), { status: 413 });
    s += chunk;
  }
  try { return s ? JSON.parse(s) : {}; } catch { throw Object.assign(new Error("that is not JSON"), { status: 400 }); }
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
// Whether the voice server can be reached at all, asked with a bare connection (three seconds), kept twenty: a fetch to
// a host that is not there waits for the system's own connect timeout -- longer than the relay's minute -- so a phone
// away from home heard nothing, not even why (2026-10-08: the Mac was off the home network, the voice server on it).
const reach = new Map<string, { at: number; ok: boolean }>();
function reachable(base: string): Promise<boolean> {
  const u = new URL(base), key = `${u.hostname}:${u.port || (u.protocol === "https:" ? 443 : 80)}`;
  const was = reach.get(key);
  if (was && Date.now() - was.at < 20000) return Promise.resolve(was.ok);
  return new Promise((done) => {
    const sock = createConnection({ host: u.hostname, port: Number(u.port || (u.protocol === "https:" ? 443 : 80)) });
    const end = (ok: boolean) => { sock.destroy(); reach.set(key, { at: Date.now(), ok }); done(ok); };
    sock.setTimeout(3000, () => end(false));
    sock.once("connect", () => end(true));
    sock.once("error", () => end(false));
  });
}

async function n8n(cfg: Config, hook: string, payload: unknown): Promise<Record<string, unknown>> {
  if (!cfg.talk.url) return { error: "no voice server set: add \"talk\": {\"url\": \"http://<n8n>:5678/webhook\"} to server/config.json" };
  if (!(await reachable(cfg.talk.url)))
    return { error: `the voice server (${new URL(cfg.talk.url).host}) cannot be reached from the companion` };
  const secret = cfg.talk.secret ?? process.env[cfg.talk.secretEnv] ?? "";
  const stop = new AbortController(), t = setTimeout(() => stop.abort(), 180000);
  try {
    const r = await fetch(`${cfg.talk.url.replace(/\/$/, "")}/${hook}`, { method: "POST", signal: stop.signal,
      headers: { "content-type": "application/json", "x-dex-secret": secret }, body: JSON.stringify(payload) });
    const j = await r.json().catch(() => ({ error: `the voice server answered ${r.status}` }));
    return j as Record<string, unknown>;
  } catch { return { error: "the voice server did not answer" }; } finally { clearTimeout(t); }
}

// C-91: the companion's own commit, read once at start, and whether app/ has changed since a given commit (a phone's
// build) -- so the phone can say plainly that a newer app is ready. Null when git cannot say (no repo, an unknown commit).
const REPO = fileURLToPath(new URL("../..", import.meta.url));
const git = (...args: string[]) => execFileSync("git", ["-C", REPO, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
const REPO_COMMIT = (() => { try { return git("rev-parse", "--short", "HEAD"); } catch { return null; } })();
function appChangedSince(build: string): boolean | null {
  try { execFileSync("git", ["-C", REPO, "diff", "--quiet", build, "HEAD", "--", "app"], { stdio: "ignore" }); return false; }
  catch (e: any) { return e?.status === 1 ? true : null; }
}

const reply = (res: ServerResponse, r: Reply) => send(res, r.status, r.body);
function send(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { "content-type": "application/json", "access-control-allow-origin": "*" });
  res.end(JSON.stringify(data));
}

// C-10: answer the game's requests in the configured save. The game must be closed first -- an emulator that is still
// running writes its own copy back over this one. A backup of the whole file goes beside it every time, and the file is
// written only when something was asked.

// C-09: THE SYNC PROTOCOL's server side (PLAN 4: HTTP + JSON over Wi-Fi, small enough for an ESP32). A device pulls
// one document and pushes the steps ticked off on it. Its daemon is the party's AWAY one -- sending a daemon in the game
// is what puts it on the device. Its mood is C-13's, whose rules are open, so it is null until they are written. This
// is on the local network only and carries no secret; accounts are C-11's.
// A party daemon's front sprite as the game draws it, its streaks painted for its routines (C-18); null if none.
function partyPng(cfg: Config, which: (p: any) => boolean): Buffer | null {
  if (!cfg.savePath || !existsSync(cfg.savePath)) return null;
  const bytes = new Uint8Array(readFileSync(cfg.savePath));
  const d = [...readSave(bytes).party, ...readAway(bytes)].find(which);   // C-103: a daemon away in a box has its art too
  const row = d && SPECIES[String(d.species)];
  const file = row?.art?.front && join(ART_DIR, row.art.front.split("/").pop().replace("_front.png", ".png"));
  if (!d || !file || !existsSync(file)) return null;
  const png = readFileSync(file);
  return row.streaks ? repaint(png, (pal) => streakColours(pal, row.bodyType, d.moves)) : png;
}

// C-138: the face a device that only shows pictures is sent -- this device's daemon (C-80), its expression and its den,
// and `rev`, which changes when any picture would. `info` is all the board reads; the pictures are drawn on request.
function boxFace(cfg: Config, store: Store, deviceId: string) {
  const d = deviceState(cfg, store, new Date(), deviceId).daemon as any;
  const face = d ? faceOf(core.artName(d.species)) : null;
  const own = EXPRESSIONS[d?.expression?.name ?? "awake"] ?? EXPRESSIONS.awake;
  const den = d?.den ?? denOf([]);
  const rev = faceRev({ artKey: d?.artKey ?? null, expression: own.name, den, mouth: face?.mouth ?? null });
  return { d, face, own, den, rev,
           info: { rev, has: !!d, name: d ? String(d.nickname || d.name || "") : "", wall: den.wall, floor: den.floor, glow: den.glow } };
}
const facePngs = new Map<string, Buffer>();                      // a revision's pictures, drawn once each
function facePng(cfg: Config, f: ReturnType<typeof boxFace>, phase: Phase, frame: number): Buffer {
  const key = `${f.rev}:${f.d?.slot ?? "-"}:${phase}:${frame}`;
  let png = facePngs.get(key);
  if (!png) {
    const sprite = f.d ? partyPng(cfg, (p) => p.slot === f.d.slot) : null;
    png = renderFace(sprite, f.own, f.face, f.den, phase, frame);
    if (facePngs.size > 120) facePngs.clear();
    facePngs.set(key, png);
  }
  return png;
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
// The review (2026-10-18): a web page open in the user's browser could drive this server -- this machine is trusted, and
// every answer says access-control-allow-origin: *. Now a browser's request must come from a page of ours (an Origin
// whose host is this machine, an address, a .local or .ts.net name, or a bare name on the LAN), and the Host it asked
// for must be one of those too, so a look-alike name pointed at this machine (DNS rebinding) is refused. The phone app,
// the boards, n8n and Home Assistant send no Origin.
export function ourHost(hostOrUrl: string): boolean {
  let name = hostOrUrl.trim().toLowerCase();
  if (!name) return true;
  if (name === "null") return false;                                            // a sandboxed page's Origin
  try { name = new URL(name.includes("://") ? name : `http://${name}`).hostname; } catch { return false; }
  name = name.replace(/^\[|\]$/g, "");
  if (!name) return false;
  if (/^[0-9.]+$/.test(name) || name.includes(":")) return true;               // an address, v4 or v6
  return name === "localhost" || name === "host.docker.internal" || name.endsWith(".local") || name.endsWith(".ts.net") || !name.includes(".");
}
// What a board may log about itself over the network (INTERACT): its routines, the CASINO's coins and seat, and its cares.
// SYNC writes `exp` and `met` into the save, so only the companion itself writes those (the review, 2026-10-18).
export const NETWORK_KINDS = ["routine", "casino", "table", "feed", "water", "train", "sleep", "wake"];
// C-53: what only this machine may do, even for a paired phone -- make a pairing code, list or forget phones, open the
// network, or open a dialog or a Finder window on the Mac
const LOCAL_ONLY = ["/api/pair/code", "/api/pair/phones", "/api/pair/forget", "/api/settings/network",
                    "/api/settings/pick", "/api/settings/reveal", "/api/settings/relay", "/api/settings/home"];
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
export const DEVICE_DOOR = [
  (m: string, p: string) => m === "GET" && ["/api/device/state", "/api/device/art", "/api/device/commands", "/api/device/face"].includes(p),
  (m: string, p: string) => m === "POST" &&
    ["/api/device/ticks", "/api/device/untick", "/api/device/interact", "/api/device/results", "/api/device/routines",
     "/api/device/remotes", "/api/device/networks", "/api/device/beacon", "/api/device/met", "/api/device/message", "/api/device/listen",
     "/api/device/battery", "/api/ai/talk", "/api/ai/speak", "/api/device/talk", "/api/device/speak",
     "/api/device/hello", "/api/device/card", "/api/device/note", "/api/device/note/written",
     "/api/device/broadcast"].includes(p),   // C-134: a board's own broadcast, over Wi-Fi or the relay (only the cable's loopback reached it)
  (m: string, p: string) => m === "GET" && (p.startsWith("/art/") || p.startsWith("/api/device/voice/")),
  (m: string) => m === "OPTIONS",
];

// C-33: where a device on the Wi-Fi finds this server -- this machine's address on the local network.
// The name this computer answers to on whatever network it is on (Bonjour: M2cBook.local), so a phone paired by it finds
// the companion at home and away alike -- the address above changes with the network (seen 2026-10-17: paired at home,
// the phone lost the companion at another house on the same Wi-Fi as the computer). Null where there is no such name.
let bonjour: string | null | undefined;
export function bonjourName(): string | null {
  if (bonjour !== undefined) return bonjour;
  try {
    const n = process.platform === "darwin" ? execFileSync("/usr/sbin/scutil", ["--get", "LocalHostName"], { encoding: "utf8" }).trim() : "";
    bonjour = /^[A-Za-z0-9-]+$/.test(n) ? `${n}.local` : null;
  } catch { bonjour = null; }
  return bonjour;
}
export function lanAddress(): string | null {
  for (const list of Object.values(networkInterfaces()))
    for (const a of list ?? []) if (a.family === "IPv4" && !a.internal) return a.address;
  return null;
}

// C-15: the beacon tags our own companions have used lately -- never a meeting
const OWN_KEEP_MS = 48 * 3600000;
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
  const nets = new SharedNetworks(store);                      // C-93: one list of networks for every device
  const voices = new VoiceShelf();                             // C-66: answers a handheld streams (ai/voice.ts)
  const talks = new Conversations();                           // C-66: the last few things said, per device
  const home = new Home({ get: (k) => store.getSetting(k), set: (k, v) => store.setSetting(k, v) });   // C-139: Home Assistant
  const agentKey = (renew = false) => ollamaKey((k) => store.getSetting(k), (k, v) => store.setSetting(k, v), renew);   // C-142
  // C-142: the address Home Assistant's Ollama integration is given -- this machine on the network, and the key
  const agentView = (cfg: Config) => {
    const addr = cfg.host === "0.0.0.0" ? lanAddress() : null;
    const path = `/ollama/${agentKey()}`;
    return { path, url: addr ? `http://${addr}:${cfg.port}${path}` : null, open: !!addr };   // url: null until it is on the network
  };
  // C-142: the daemons Home Assistant can take as its agent, each by its own name, and the one `daemon` means -- the one a
  // BOX-3 carries (the voice assistant's own), else the first away. Read only: asking never puts a daemon in a device.
  const agentDaemons = (cfg: Config): { byName: AgentDaemon[]; fallback: AgentDaemon | null } => {
    const away = awayNow(cfg), used = new Set<string>();
    const as = (d: (typeof away)[number]): AgentDaemon => {
      const row = SPECIES[String(d.species)], nickname = String(d.nickname || d.name || "daemon");
      let model = modelOf(nickname);
      for (let n = 2; used.has(model); n++) model = modelOf(`${nickname} ${n}`);
      used.add(model);
      return { model, nickname, name: String(d.name ?? ""), types: (row?.types ?? []).join("/"), category: row?.category ?? "",
               entry: row?.entry?.[cfg.edition] ?? "" };
    };
    const byName = away.map(as);
    const box = devices.list().find((r) => kindOf(r.id) === "esp32-s3-box-3");
    const carried = box ? carryView(store, away).byDevice[box.id] : null;
    return { byName, fallback: carried ? byName[away.indexOf(carried)] : byName[0] ?? null };
  };
  // C-142: Ollama's API, as much of it as Home Assistant's integration asks for (ollama.ts)
  async function answerOllama(req: IncomingMessage, res: ServerResponse, sub: string, cfg: Config) {
    const method = req.method ?? "GET";
    const plain = (status: number, text: string, type: string) => { res.writeHead(status, { "content-type": type }); res.end(text); };
    if (sub === "/" || sub === "") return plain(200, "Ollama is running", "text/plain");
    if (method === "GET" && sub === "/api/version") return send(res, 200, { version: OLLAMA_VERSION });
    if (method === "GET" && sub === "/api/tags") return send(res, 200, tags(agentDaemons(cfg).byName));
    if (method === "GET" && sub === "/api/ps") return send(res, 200, { models: [] });
    if (method === "POST" && sub === "/api/show") {
      const b = await body(req), a = agentDaemons(cfg);
      return send(res, 200, show(pick(String(b.model ?? b.name ?? ""), a.byName, a.fallback)));
    }
    if (method === "POST" && sub === "/api/pull") { await body(req); return plain(200, JSON.stringify({ status: "success" }) + "\n", "application/x-ndjson"); }
    if (method === "POST" && sub === "/api/chat") {
      const b = await body(req), a = agentDaemons(cfg), d = pick(String(b.model ?? ""), a.byName, a.fallback);
      const { text, history } = heard(Array.isArray(b.messages) ? b.messages : []), stream = b.stream !== false;
      let answer = QUIET;
      if (text) {
        const st = deviceState(cfg, store, new Date(), "");
        // The companion's own talk, as the app and the handhelds have it; `place` says it is the home asking
        const r = await n8n(cfg, "daemon/talk", {
          text, history, provider: store.getSetting("talk.provider") ?? "auto", speak: false, voice: "index", localModel: cfg.talk.localModel,
          place: "home",
          daemon: d ? { nickname: d.nickname, name: d.name, types: d.types, category: d.category, entry: d.entry } : { nickname: "your daemon" },
          day: { day: st.day.name, theme: st.day.theme, cue: st.day.virtue },
          goal: st.step ? { goal: st.step.goal, step: st.step.text, milestone: st.step.milestone?.title ?? "" } : null });
        if (typeof r.answer === "string" && r.answer.trim()) answer = r.answer.trim();
      }
      res.writeHead(200, { "content-type": stream ? "application/x-ndjson" : "application/json" });
      return res.end(chatReply(String(b.model ?? DEFAULT_MODEL), answer, stream));
    }
    return send(res, 404, { error: `not here: ${method} ${sub}` });
  }
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      const path = url.pathname;
      if (req.headers.origin !== undefined && !ourHost(String(req.headers.origin)))
        return send(res, 403, { error: "not from a page of the companion's" });
      if (!ourHost(String(req.headers.host ?? ""))) return send(res, 403, { error: "not an address of the companion's" });
      // C-32: "usb" is the bridge on this machine speaking for the device down its cable; anything from the network is
      // the device itself, on the Wi-Fi.

      // C-29: the save path the user set in Settings (stored in the db) overrides config.json; everything that reads
      // or writes a save uses `ecfg`, so the user never edits a file by hand.
      const ecfg: Config = { ...cfg, savePath: store.getSetting("savePath") ?? cfg.savePath };
      // C-80: every device heard, each with the daemon it carries; every daemon away; and those away in no device yet
      const devicesView = () => {
        const away = awayNow(ecfg), { byDevice, unplaced } = carryView(store, away);
        const brief = (d: (typeof away)[number]) => ({ personality: d.personality, slot: d.slot, species: d.species,
          nickname: d.nickname, name: d.name, level: d.level, art: `/art/party/${d.slot}.png` });
        return { devices: devices.list().map((r) => ({ ...r, daemon: byDevice[r.id] ? brief(byDevice[r.id]) : null })),
                 away: away.map(brief), unplaced: unplaced.map(brief) };
      };
      // ---- C-142: Home Assistant's way in, by the key in its address (never through the relay) ----
      const ol = path.match(/^\/ollama\/([A-Za-z0-9_-]{16,64})(\/.*)?$/);
      if (ol) {
        if (req.headers[RELAY_HEADER] !== undefined || !same(ol[1], agentKey())) return send(res, 404, { error: "not found" });
        return await answerOllama(req, res, ol[2] ?? "/", ecfg);
      }
      // With "host": "0.0.0.0" the server is on the local network for a device -- and only the device's own door
      // answers it there. Settings, SYNC, the save and the goals stay this machine's, so nothing else on the network
      // can change the save path, write the save, or open a dialog on the Mac.
      const bearer = /^Bearer (.+)$/.exec(String(req.headers.authorization ?? ""))?.[1];
      const phone = bearer ? store.phoneFor(bearer) : null;              // C-53: a paired phone has the whole API
      const board = !phone && bearer ? devices.deviceFor(bearer) : null;  // C-82: a board's own key: its own door only
      const relayed = req.headers[RELAY_HEADER] !== undefined;
      if (relayed) {                                                     // C-56
        if (!same(String(req.headers[RELAY_HEADER]), relaySecret(store)))
          return send(res, 403, { error: "that is not the companion's relay" });
        if (board && !DEVICE_DOOR.some((d) => d(req.method ?? "", path)))
          return send(res, 403, { error: "a board's key opens the device's own door, nothing else" });
        if (!phone && !board) return send(res, 401, { error: "away from home, only a paired phone or a linked board -- link it at home first" });
        if (LOCAL_ONLY.includes(path) || path.startsWith("/api/pair"))
          return send(res, 403, { error: "that is done at home, on the computer the companion runs on" });
      }
      // C-55: "phone" is the companion app carrying the device's link over Bluetooth -- a paired phone speaking for it.
      const asked = url.searchParams.get("via");
      // C-77: a device away through the relay -- a board by its key, or the Tab5 by its paired key -- is "relay"; a phone
      // carrying a board's link says ?via=phone and stays that
      const via: Via = asked === "usb" && isLoopback(req.socket.remoteAddress) ? "usb" : asked === "phone" && phone ? "phone"
                     : relayed ? "relay" : "wifi";
      // C-80: which device is asking -- its x-device header (a bridge passes on the board's), or ?device= for the phone's;
      // C-82: a board through the relay is known by its key, whatever it says
      const deviceId = board ?? String(req.headers["x-device"] ?? url.searchParams.get("device") ?? "");
      // Seen, and how: a bridge says ?via= on the requests that carry the link; another request from this machine is
      // the same bridge passing something on, and must not turn a cable into Wi-Fi.
      if (validDeviceId(deviceId) && (path.startsWith("/api/device/") || path.startsWith("/api/ai/")) &&
          (asked || relayed || !isLoopback(req.socket.remoteAddress))) devices.seen(deviceId, via);
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
      // ---- C-139: HOME -- Home Assistant through this server (home.ts). Its address and token are set on this machine
      // only (LOCAL_ONLY); a paired phone, the Tab5 and the site see rooms and states, and ask for actions by name. ----
      if (req.method === "GET" && path === "/api/settings/home")
        return send(res, 200, { ...home.settings(), ...(await home.check()), agent: agentView(ecfg) });
      if (req.method === "POST" && path === "/api/settings/home") {
        const b = await body(req);
        try { home.set(b.url, b.token); } catch (e) { return send(res, 400, { error: (e as Error).message }); }
        if (b.renewAgentKey === true) agentKey(true);               // C-142: Home Assistant must be given the new address
        return send(res, 200, { ...home.settings(), ...(await home.check()), agent: agentView(ecfg) });
      }
      if (req.method === "GET" && path === "/api/home") return send(res, 200, await home.view());
      if (req.method === "POST" && path === "/api/home/act") {
        const b = await body(req);
        return send(res, 200, await home.act(String(b.id ?? ""), String(b.action ?? "")));
      }
      if (req.method === "POST" && path === "/api/home/ask") {
        const b = await body(req);
        return send(res, 200, await home.ask(String(b.text ?? ""), typeof b.conversationId === "string" ? b.conversationId : null));
      }
      // C-56: where a paired phone goes when home does not answer
      if (req.method === "GET" && path === "/api/settings/away") return send(res, 200, { url: store.getSetting("relay.url") });
      // the server listens on the network (for the phone and the board) -- kept here, read at the next start
      if (req.method === "GET" && path === "/api/settings/network")
        return send(res, 200, { open: store.getSetting("host") === "0.0.0.0", now: cfg.host === "0.0.0.0", address: lanAddress(), name: bonjourName(), port: cfg.port });
      if (req.method === "POST" && path === "/api/settings/network") {
        const b = await body(req);
        store.setSetting("host", b.open ? "0.0.0.0" : "127.0.0.1");
        return send(res, 200, { open: b.open === true, now: cfg.host === "0.0.0.0", restart: (b.open === true) !== (cfg.host === "0.0.0.0") });
      }
      // C-111: what a phone hosting on its own answers too -- the same answers, from routes.ts
      if (handles(req.method ?? "", path))
        return reply(res, route(hostOf(ecfg), store, { method: req.method ?? "", path, deviceId, query: Object.fromEntries(url.searchParams),
                                                       body: req.method === "POST" ? await body(req) : {} }));
      if (req.method === "GET" && path === "/api/device/state") {
        hub.seen(via);
        const st = deviceState(ecfg, store, new Date(), deviceId, url.searchParams.get("expression"));   // C-121: ?expression= for bench.py
        // C-82: down the cable only, the relay's address and the board's own key, for when it is away on its own Wi-Fi
        const relay = store.getSetting("relay.url");
        if (via === "usb" && relay && validDeviceId(deviceId)) return send(res, 200, { ...st, away: { url: relay, key: devices.keyFor(deviceId) } });
        return send(res, 200, st);
      }
      // C-138: a device that shows only pictures (the BOX-3, on ESPHome): its face's revision, and each phase's picture
      if (req.method === "GET" && path === "/api/device/face") return send(res, 200, boxFace(ecfg, store, deviceId).info);
      const facePic = path.match(/^\/art\/face\/([a-z]+)-(\d)\.png$/);
      if (req.method === "GET" && facePic) {
        const phase = facePic[1] as Phase, frame = Number(facePic[2]);
        if (!PHASES.includes(phase) || frame >= FRAMES) return send(res, 404, { error: `a face is ${PHASES.join(", ")}, frames 0..${FRAMES - 1}` });
        // Its length, said: ESPHome's online_image (2026.9) never finishes a chunked picture -- seen on the BOX-3, each
        // download waited out its timeout
        const png = facePng(ecfg, boxFace(ecfg, store, deviceId), phase, frame);
        res.writeHead(200, { "content-type": "image/png", "content-length": png.length, "cache-control": "no-cache" });
        return res.end(png);
      }
      // ---- C-32: the link. The device's side: its commands, its results, its routines. ----
      if (req.method === "GET" && path === "/api/device/commands") { hub.seen(via); return send(res, 200, { commands: hub.take(via) }); }
      if (req.method === "POST" && path === "/api/device/results") {
        const b = await body(req);
        for (const r of Array.isArray(b.results) ? b.results : [b]) if (r && r.id != null) hub.answer(r);
        return send(res, 200, { ok: true });
      }
      if (req.method === "POST" && path === "/api/device/hello") {      // C-91: a device's build, without routines (the Tab5)
        const b = await body(req);
        if (!validDeviceId(deviceId) || typeof b.firmware !== "string") return send(res, 400, { error: "hello {firmware}, from a device" });
        devices.note(deviceId, { firmware: b.firmware.slice(0, 60) });
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
      if (req.method === "GET" && path === "/api/device/link") {
        const v = devicesView();                                                                     // C-80
        return send(res, 200, { ...hub.link(), shared: nets.names().networks, lan: { address: lanAddress(), port: cfg.port, open: cfg.host === "0.0.0.0" },
                                battery: JSON.parse(store.getSetting("device.battery") ?? "null"),   // C-63
                                devices: v.devices, away: v.away });
      }
      if (req.method === "GET" && path === "/api/devices") return send(res, 200, devicesView());   // C-80
      // C-91: which build the companion is, and -- given the phone's build -- whether the app has changed since it
      if (req.method === "GET" && path === "/api/version") {
        const build = url.searchParams.get("build") ?? "";
        return send(res, 200, { server: REPO_COMMIT, appChanged: /^[0-9a-f]{7,40}$/.test(build) ? appChangedSince(build) : null });
      }
      if (req.method === "POST" && path === "/api/devices/carry") {     // C-80: put this daemon in that device (null: none)
        const b = await body(req);
        const p = b.personality === null ? null : Number(b.personality);
        if (!validDeviceId(b.id) || (p !== null && !awayNow(ecfg).some((d) => d.personality === p)))
          return send(res, 400, { error: "carry {id, personality}: a device to host it, and a daemon that is away (SEND it in the game, then SYNC)" });
        assign(store, b.id, p);
        return send(res, 200, devicesView());
      }
      if (req.method === "POST" && path === "/api/devices/forget") {
        const b = await body(req);
        if (!validDeviceId(b.id)) return send(res, 400, { error: "forget {id}" });
        devices.forget(b.id); assign(store, b.id, null); return send(res, 200, devicesView());
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
        nets.learn(b.ssid, b.password);                           // C-93: and every other device, when next in touch
        return send(res, 200, { id: hub.send({ type: "wifi", ssid: b.ssid, password: b.password,
                                               server: addr ? `http://${addr}:${cfg.port}` : "" }) });
      }
      // C-66: who answers when you talk -- "auto" (this computer's model, OpenRouter when it is busy), "local" only (the
      // words never leave home), or "openrouter". Only the words heard go to a model, never the recording.
      if (req.method === "GET" && path === "/api/talk/settings")
        return send(res, 200, { provider: store.getSetting("talk.provider") ?? "auto", connected: !!ecfg.talk.url });
      if (req.method === "POST" && path === "/api/talk/settings") {
        const b = await body(req);
        if (!["auto", "local", "openrouter"].includes(b.provider)) return send(res, 400, { error: "provider is auto, local or openrouter" });
        store.setSetting("talk.provider", b.provider);
        return send(res, 200, { provider: b.provider, connected: !!ecfg.talk.url });
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
      // C-52: the networks the board has learned (names), and forgetting one. C-93: a device that has proved itself --
      // down the cable (the bridge, on this machine), by a board's own key, or a paired key (the Tab5) -- also reports
      // what it knows with the passwords, and what it forgot, and is handed back the whole shared list to learn. Over the
      // phone's Bluetooth, or from a device with no key, names only, both ways.
      if (req.method === "POST" && path === "/api/device/networks") {
        const b = await body(req);
        hub.networks = Array.isArray(b.networks) ? b.networks.map(String) : [];
        hub.currentNetwork = typeof b.current === "string" ? b.current : "";
        const proved = via !== "phone" && ((isLoopback(req.socket.remoteAddress) && !relayed) || !!board || !!phone);
        if (!proved) return send(res, 200, { ok: true, rev: nets.rev() });
        nets.merge(Array.isArray(b.known) ? b.known : [], Array.isArray(b.forgot) ? b.forgot.map(String) : []);
        return send(res, 200, { ok: true, ...nets.full() });
      }
      if (req.method === "POST" && path === "/api/device/network") {
        const b = await body(req);
        if (b.op === "forget" && typeof b.ssid === "string" && b.ssid) {   // C-93: forgotten everywhere
          nets.forget(b.ssid);
          return send(res, 200, { id: hub.send({ type: "network", op: "forget", ssid: b.ssid }) });
        }
        if (b.op !== "forget" || !Number.isInteger(b.index)) return send(res, 400, { error: "forget a network: {op: forget, ssid}" });
        return send(res, 200, { id: hub.send({ type: "network", op: "forget", index: b.index }) });
      }
      // C-93: the shared list, for the site and the app -- names only -- and a network added to it for every device
      if (req.method === "GET" && path === "/api/networks") return send(res, 200, { ...nets.names(), current: hub.currentNetwork });
      if (req.method === "POST" && path === "/api/networks") {
        const b = await body(req);
        if (b.op === "forget") return send(res, nets.forget(String(b.ssid ?? "")) ? 200 : 404, nets.names());
        if (typeof b.ssid !== "string" || !b.ssid.trim() || typeof b.password !== "string")
          return send(res, 400, { error: "a network needs its name and its password" });
        nets.learn(b.ssid.trim(), b.password);
        return send(res, 200, nets.names());
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
        return send(res, 200, { undone: b.step, state: deviceState(ecfg, store, new Date(), deviceId) });
      }
      if (req.method === "POST" && path === "/api/device/ticks") {
        const b = await body(req);
        if (!Array.isArray(b.steps) || !b.steps.every((n: unknown) => Number.isInteger(n)))
          return send(res, 400, { error: "steps must be a list of step ids" });
        const results = b.steps.map((id: number) => ({ id, ...doStep(ecfg, store, id, "device", deviceId) }));
        const done = results.filter((r: any) => r.ok).map((r: any) => r.id);
        // C-50: what the board celebrates -- the biggest thing these ticks finished
        const celebrate = results.some((r: any) => r.goal) ? "goal" : results.some((r: any) => r.milestone) ? "milestone"
                        : results.some((r: any) => r.fresh) ? "step" : null;
        return send(res, 200, { done, celebrate, state: deviceState(ecfg, store, new Date(), deviceId) });
      }
      // C-13: the device reports each use -- a routine run, a step ticked -- as tending the daemon.
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
        const carried = carriedDaemon(ecfg, store, deviceId);
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
          const t = (m.detail ?? "").split(" "), species = t[0], row = SPECIES[species];
          return { at: m.at, species: Number(species), name: row?.name ?? "?",
                   art: row?.art?.front ? `/art/species/${species}.png` : null, written: m.id <= applied,
                   how: t[2] === "lora" ? "lora" : "ble", hops: Number(t[3]) || 0 };   // C-72
        });
        // C-72: the waves and words over LoRa, newest first -- heard, or sent from one of our boards
        const messages = store.interactionsSince(new Date(Date.now() - 14 * 86400000)).filter((i) => i.kind === "msg").reverse().slice(0, 20)
          .map((i) => { const m = /^(in|out) (wave|say) (\d+) ([0-9a-f]{8}) (\d) ?(.*)$/.exec(i.detail ?? "");
                        const row = m ? SPECIES[m[3]] : undefined;
                        return m ? { at: i.at, dir: m[1], kind: m[2], species: Number(m[3]), name: row?.name ?? "?", peer: m[4],
                                     hops: Number(m[5]), text: m[6], ours: ownBeacons(store).some((x) => x.peer === m[4]) } : null; })
          .filter(Boolean);
        return send(res, 200, { meetings, messages,
                                heardOurs: JSON.parse(store.getSetting("beacons.heardOurs") ?? "null"),
                                lastListen: JSON.parse(store.getSetting("beacons.lastListen") ?? "null") });
      }
      // C-66: push to talk -- text or audio in, an answer and its voice out. The daemon carried and the day go with it.
      const talkPayload = (b: Record<string, any>) => {
        const st = deviceState(ecfg, store, new Date(), deviceId), d = st.daemon;
        return {
          text: typeof b.text === "string" ? b.text.slice(0, 1000) : undefined,
          audioBase64: typeof b.audioBase64 === "string" ? b.audioBase64 : undefined, audioMime: b.audioMime,
          history: Array.isArray(b.history) ? b.history.slice(-6) : talks.history(who),
          provider: b.provider ?? store.getSetting("talk.provider") ?? "auto", speak: b.speak !== false, voice: "index",
          localModel: ecfg.talk.localModel,
          daemon: d ? { nickname: d.nickname, name: d.name, types: (d.types as string[]).join("/"), category: d.category, entry: d.entry }
                    : { nickname: "your daemon" },
          day: { day: st.day.name, theme: st.day.theme, cue: st.day.virtue },
          goal: st.step ? { goal: st.step.goal, step: st.step.text, milestone: st.step.milestone?.title ?? "" } : null,
        };
      };
      // who is talking: the device by its own name (C-80), else the phone, else this machine
      const who = validDeviceId(deviceId) ? deviceId : phone ? "phone" : "here";
      const remember = (b: Record<string, any>, r: Record<string, unknown>) => {
        const said = typeof r.heard === "string" && r.heard ? r.heard : typeof b.text === "string" ? b.text : "";
        if (typeof r.answer === "string") talks.add(who, said, r.answer);
        return r;
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
        return send(res, 200, remember(b, await n8n(ecfg, "daemon/talk", talkPayload(b))));
      }
      if (req.method === "POST" && path === "/api/device/talk") {     // C-66: a handheld's recording, raw
        const audio = await rawBody(req);
        if (!audio || audio.length < 44) return send(res, 400, { error: "talk takes a recording (up to 2 MB)" });
        return send(res, 200, await forDevice(remember({}, await n8n(ecfg, "daemon/talk",
          talkPayload(await heardAs(audio, String(req.headers["content-type"] ?? "audio/wav")))))));
      }
      if (req.method === "POST" && path === "/api/device/speak") {    // C-65: the carried daemon's INDEX entry, aloud
        // C-99: or any species' entry, {species} -- the Tab5's INDEX reads each one aloud as the phone's LISTEN does
        const b = await body(req);
        const row = b.species !== undefined ? SPECIES[String(b.species)] : null;
        const text = row ? row.entry?.[ecfg.edition] : deviceState(ecfg, store, new Date(), deviceId).daemon?.entry;
        if (!text) return send(res, 400, { error: b.species !== undefined ? "no entry for that species" : "host a daemon to hear its entry" });
        const r = await n8n(ecfg, "daemon/voice", { text: String(text).replace(/\n/g, " ").slice(0, 600), voice: "index" });
        return send(res, 200, await forDevice({ ...r, answer: text }));
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
        const carried = b.species === undefined && b.text === undefined ? deviceState(ecfg, store, new Date(), deviceId).daemon : null;
        const text = typeof b.text === "string" ? b.text : row ? row.entry?.[ecfg.edition] : carried?.entry;
        if (!text) return send(res, 400, { error: "speak {species} or {text}, or host a daemon" });
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
        if (store.interactionsSince(hour).some((i) => i.kind === "met" && i.detail?.split(" ")[1] === peer))
          return send(res, 200, { counted: false, why: "already met this hour" });
        // C-72: over LoRa the frame says how many boards passed it on (0: heard directly); Bluetooth is always direct
        const lora = b.how === "lora", hops = lora ? Math.min(2, Math.max(0, Number(b.hops) || 0)) : 0;
        const card = b.how === "card";                            // C-124: a stranger's daemon, on a card held to the board
        store.logInteraction("met", `${species} ${peer}${lora ? ` lora ${hops}` : card ? " card" : ""}`);
        return send(res, 200, { counted: true, name: SPECIES[species].name, how: lora ? "lora" : card ? "card" : "ble", hops });
      }
      // C-72: a wave or a word over LoRa -- heard ("in") from a daemon nearby, or sent ("out") to one (or to everyone,
      // peer 00000000). Kept as the daemon's life is kept, and shown under MET NEARBY. A word is forty letters at most.
      if (req.method === "POST" && path === "/api/device/message") {
        const b = await body(req);
        const dir = b.dir === "out" ? "out" : b.dir === "in" ? "in" : "", kind = b.kind === "wave" ? "wave" : b.kind === "say" ? "say" : "";
        const species = String(b.species ?? ""), peer = String(b.peer ?? "");
        if (!dir || !kind || !SPECIES[species] || !/^[0-9a-f]{8}$/.test(peer)) return send(res, 400, { error: "message {dir in|out, kind wave|say, species, peer}" });
        const hops = Math.min(2, Math.max(0, Number(b.hops) || 0));
        const text = typeof b.text === "string" ? b.text.replace(/[^\x20-\x7e]/g, "").slice(0, 80) : "";   // C-123: eighty
        store.logInteraction("msg", `${dir} ${kind} ${species} ${peer} ${hops} ${text}`);
        return send(res, 200, { ok: true, name: SPECIES[species].name });
      }
      // C-124: a card held to a board -- read what each holds, PUT the board's daemon onto it, TAKE the card's, or SWAP.
      // A card is a host (cards.ts); the answer carries what the card now holds, for the board to write onto it, this
      // companion's id, and the board's own new state.
      if (req.method === "POST" && path === "/api/device/card") {
        const b = await body(req);
        const op = ["read", "put", "take", "swap"].includes(b.op) ? b.op as CardOp : null;
        if (!validUid(b.uid) || !op || !validDeviceId(deviceId)) return send(res, 400, { error: "card {uid: hex, op: read|put|take|swap}" });
        const r = cardOp(store, awayNow(ecfg), deviceId, b.uid, op);
        const brief = (d: (typeof r)["card"]) => d && { personality: d.personality, species: d.species, name: d.name,
                                                        nickname: d.nickname || d.name, level: d.level };
        if (!r.error && op !== "read") store.logInteraction("card", `${op} ${b.uid}`);
        return send(res, r.error ? 409 : 200, { ok: !r.error, error: r.error ?? null, card: brief(r.card), board: brief(r.board),
                                                companion: companionId(store), state: deviceState(ecfg, store, new Date(), deviceId) });
      }
      // C-124: a note for a card, typed on the T-Deck; kept until a reader has written it (and says so)
      if (req.method === "POST" && path === "/api/device/note") {
        const b = await body(req);
        const t = keepNote(store, typeof b.text === "string" ? b.text : "", deviceId || "board");
        return send(res, t ? 200 : 400, t ? { ok: true, note: t } : { error: "note {text}" });
      }
      if (req.method === "POST" && path === "/api/device/note/written") { noteWritten(store); return send(res, 200, { ok: true }); }
      if (req.method === "POST" && path === "/api/device/interact") {
        const b = await body(req);
        const kind = typeof b.kind === "string" ? b.kind.slice(0, 32) : "";
        if (!kind) return send(res, 400, { error: "an interaction needs a kind" });
        if (!phone && !isLoopback(req.socket.remoteAddress) && !NETWORK_KINDS.includes(kind))
          return send(res, 403, { error: "a board does not log that" });
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
          // C-119: in an expression's shade -- the body's colours only, so it is the same daemon, feeling something
          const e = EXPRESSIONS[q.get("expression") ?? ""], raw = partyPng(ecfg, (p) => p.slot === Number(q.get("party")));
          const png = b64(raw && e ? repaint(raw, (pal) => shadePalette(pal, e), SHADED.first) : raw);
          return png ? send(res, 200, { png }) : send(res, 404, { error: "no art for that slot" });
        }
        if (q.has("species")) {
          const png = b64(speciesPng(String(q.get("species"))));
          return png ? send(res, 200, { png }) : send(res, 404, { error: "no art for that species" });
        }
        // C-131: the player as the game draws them (REASON, INSTINCT; the card's picture or the walking frame) and the
        // trainer card's MARK badges -- for the Tab5, which keeps no copy of the app's bundled pictures
        if (q.has("player") || q.has("mark") || q.has("guide")) {   // C-145: ?guide=cover, the GUIDE's 8-bit cover
          const name = q.has("guide") ? "guide_cover.png" : q.has("player")
            ? `player_${q.get("player") === "instinct" ? "instinct" : "reason"}${q.get("walk") ? "_walk" : ""}.png`
            : `mark_${Math.max(1, Math.min(8, Number(q.get("mark")) || 1))}.png`;
          const file = join(ART_DIR, name);
          return existsSync(file) ? send(res, 200, { png: readFileSync(file).toString("base64") }) : send(res, 404, { error: "no such picture" });
        }
        if (q.get("all") === "species") {
          const all: Record<string, string> = {};
          for (const n of Object.keys(SPECIES)) { const png = b64(speciesPng(n)); if (png) all[n] = png; }
          return send(res, 200, { species: all });
        }
        return send(res, 400, { error: "art for ?party=<slot>, ?species=<id> or ?all=species" });
      }
      const partyArt = path.match(/^\/art\/party\/(\d{1,3})\.png$/);   // C-103: a box's away daemon is 100 on
      if (req.method === "GET" && partyArt) {
        const raw = partyPng(ecfg, (p) => p.slot === Number(partyArt[1])), e = EXPRESSIONS[url.searchParams.get("expression") ?? ""];
        const body = raw && e ? repaint(raw, (pal) => shadePalette(pal, e), SHADED.first) : raw;   // C-119: in its shade
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
        const slot = url.searchParams.get("slot");                          // C-149: or a party daemon, for the CASINO's reels
        if (slot !== null) {
          const n = Number(slot);
          const body = /^[0-5]$/.test(slot) ? partyPng(ecfg, (p) => p.slot === n) : null;
          if (!body) return send(res, 404, { error: "no daemon in that party slot" });
          return send(res, 200, { slot: n, ...deviceArt(body) });
        }
        const mine = carriedDaemon(ecfg, store, deviceId);                  // C-80: this device's own
        const body = mine && partyPng(ecfg, (p) => p.away && p.personality === mine.personality);
        if (!body) return send(res, 404, { error: "no daemon is on the device" });
        return send(res, 200, deviceArt(body));
      }
      if (req.method === "POST" && path === "/api/goals") {
        const b = await body(req);
        if (!b.title || typeof b.title !== "string") return send(res, 400, { error: "a goal needs a title" });
        const bd = b.breakdown ? await breakdown(b.title, cfg) : null;
        const goal = store.addGoal(b.title, bd?.plan);
        return send(res, 201, { goal, breakdown: bd });
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
      const status = (e as { status?: number }).status;
      send(res, status === 413 || status === 400 ? status : 500, { error: (e as Error).message });
    }
  });
}
