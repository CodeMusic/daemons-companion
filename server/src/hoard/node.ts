// BRAIN: none -- storage: a folder of files by their hash, a door that hands them out, a node that dials the hub
// C-599, C-575 (C-596; the user, 2026-11-27): A NODE OF THE HOARD, whole, in one file that needs nothing but Node itself
// -- so the hub, a node started by hand (hoard_node_main.ts) and the standalone server (CodeMusic/daemons-server keeps
// this same file as src/hoardnode.ts, byte for byte below this header) are one piece of code, as THE MESH's worker is.
// It is written in the plain TypeScript Node runs without a build (no parameter properties, no enums), and imports
// nothing of the companion's.
//
//   THE FOLDER  the drive or folder its owner offered, and never more than the size they offered. THE HOARD keeps to a
//               folder of its own inside it (daemons-hoard/), so it never reads, counts or removes anything else there.
//               A blob is a file named by its SHA-256, written under a passing name and renamed: whole, or not there.
//   THE DOOR    hands a blob to whoever holds a TICKET for it: the blob's hash and an hour it ends, signed by the hub
//               with a secret only the hub and this node have. The hub decides who may read a file (rules.ts); the node
//               only checks the hub said so. It answers byte ranges, so a song or a film plays from it.
//   THE BEAT    as a MESH node does, it dials OUT to the hub with its paired key every few seconds: what it offers
//               (EXTEND or REPLICA, how many bytes), what it holds, its doors, whether it is on Ethernet or Wi-Fi, and
//               how many transfers it carries. The hub answers with what to fetch (WANT), let go of (DROP) and hand
//               back (SEND). While its owner's WHEN says rest (not on Wi-Fi, not plugged in), it says so and moves nothing.
// Every word a person reads is DRAFT.
import { execFileSync } from "node:child_process";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, statfsSync, copyFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { networkInterfaces } from "node:os";
import { dirname, join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

export const HASH = /^[0-9a-f]{64}$/;
export const BEAT_MS = 5_000, HOARD_FRESH_MS = 20_000, TICKET_S = 6 * 3600, DOOR_PORT = 4772;
export const FOLDER = "daemons-hoard";
export type OfferKind = "extend" | "replica";
export type LinkKind = "ethernet" | "wifi" | "cell" | "other";

// ---- THE FOLDER ----
export class DiskStore {
  root: string;
  /** `dir` is what the owner offered; `own` false keeps the blobs in it directly (the hub's own staging) */
  constructor(dir: string, own = true) {
    this.root = own ? join(dir, FOLDER) : dir;
  }
  ready() { mkdirSync(this.root, { recursive: true }); return this; }
  path(sha: string): string {
    if (!HASH.test(sha)) throw new Error("a blob is named by its SHA-256");
    return join(this.root, sha.slice(0, 2), sha);
  }
  has(sha: string): boolean { return HASH.test(sha) && existsSync(this.path(sha)); }
  size(sha: string): number { try { return statSync(this.path(sha)).size; } catch { return -1; } }
  private listed: { at: number; all: { sha: string; size: number }[] } | null = null;
  /** every blob here. Read from the folder at most once a minute, and again after anything this store itself changed
   *  (a node says what it holds at every beat: a large folder is not walked every five seconds) */
  list(): { sha: string; size: number }[] {
    if (this.listed && Date.now() - this.listed.at < 60_000) return this.listed.all;
    const out: { sha: string; size: number }[] = [];
    this.listed = { at: Date.now(), all: out };
    let dirs: string[] = [];
    try { dirs = readdirSync(this.root); } catch { return out; }
    for (const d of dirs) {
      if (!/^[0-9a-f]{2}$/.test(d)) continue;
      for (const f of readdirSync(join(this.root, d))) if (HASH.test(f)) { try { out.push({ sha: f, size: statSync(join(this.root, d, f)).size }); } catch { /* gone */ } }
    }
    return out;
  }
  used(): number { return this.list().reduce((s, b) => s + b.size, 0); }
  remove(sha: string): boolean { if (!this.has(sha)) return false; rmSync(this.path(sha), { force: true }); this.listed = null; return true; }
  /** free bytes on the drive the folder is on (0 when it cannot be read) */
  diskFree(): number {
    let at = this.root;
    while (!existsSync(at) && dirname(at) !== at) at = dirname(at);
    try { const s = statfsSync(at); return Number(s.bavail) * Number(s.bsize); } catch { return 0; }
  }
  /** take a stream in: hashed as it is written, refused past `most` bytes or if it is not the blob it was said to be.
   *  A blob already here is not written again (the stream is still read to its end and checked). */
  async put(stream: Readable, o: { sha?: string | null; most?: number } = {}): Promise<{ sha: string; size: number; md5: string; fresh: boolean }> {
    this.ready();
    const part = join(this.root, `.part-${randomBytes(8).toString("hex")}`);
    const h = createHash("sha256"), m = createHash("md5");
    let size = 0;
    const most = o.most ?? Infinity;
    const count = new Transform({ transform(chunk: Buffer, _e, cb) {
      size += chunk.length;
      if (size > most) return cb(Object.assign(new Error("it is larger than the room there is"), { status: 507 }));
      h.update(chunk); m.update(chunk); cb(null, chunk);
    } });
    try {
      await pipeline(stream, count, createWriteStream(part));
      const sha = h.digest("hex");
      if (o.sha && o.sha !== sha) throw Object.assign(new Error("those are not the bytes it was said to be"), { status: 422 });
      const to = this.path(sha), fresh = !existsSync(to);
      if (fresh) { mkdirSync(dirname(to), { recursive: true }); renameSync(part, to); this.listed = null; } else rmSync(part, { force: true });
      return { sha, size, md5: m.digest("hex"), fresh };
    } catch (e) { rmSync(part, { force: true }); throw e; }
  }
  /** take in a file that is already on this machine and already hashed (the hub's staging to its own offer) */
  adopt(file: string, sha: string) {
    const to = this.path(sha);
    if (existsSync(to)) return;
    mkdirSync(dirname(to), { recursive: true });
    this.listed = null;
    try { renameSync(file, to); } catch { const part = `${to}.part`; copyFileSync(file, part); renameSync(part, to); }
  }
  /** parts left by a write that never finished (a restart mid-transfer) */
  sweep() { try { for (const f of readdirSync(this.root)) if (f.startsWith(".part-")) rmSync(join(this.root, f), { force: true }); } catch { /* no folder yet */ } }
}

// ---- THE TICKET ----
/** the hub's word that a blob may be handed out until `exp` (seconds). `mark` ties a ticket to one use (a file's id) */
export function ticketFor(secret: string, sha: string, exp: number, mark = ""): string {
  return createHmac("sha256", secret).update(`${sha}.${exp}.${mark}`).digest("hex").slice(0, 40);
}
export function ticketOk(secret: string, sha: string, exp: number, ticket: string, now: number, mark = ""): boolean {
  if (!secret || !HASH.test(sha) || !Number.isFinite(exp) || exp * 1000 < now) return false;
  const want = Buffer.from(ticketFor(secret, sha, exp, mark)), got = Buffer.from(String(ticket));
  return want.length === got.length && timingSafeEqual(want, got);
}
/** a blob's address at a door: /hoard/d/<sha>?e=<exp>&t=<ticket>[&m=<mark>] */
export function doorPath(secret: string, sha: string, now: number, o: { seconds?: number; mark?: string; name?: string; mime?: string } = {}): string {
  const exp = Math.floor(now / 1000) + (o.seconds ?? TICKET_S), mark = o.mark ?? "";
  const q = new URLSearchParams({ e: String(exp), t: ticketFor(secret, sha, exp, mark) });
  if (mark) q.set("m", mark);
  if (o.mime) q.set("c", o.mime);
  if (o.name) q.set("n", o.name);
  return `/hoard/d/${sha}?${q}`;
}

// ---- THE DOOR ----
export type Served = { sha: string; bytes: number; ms: number; whole: boolean; mark: string };
/** send a file, or the range of it that was asked for; `done` hears how it went once the last byte has left */
export function serveFile(req: IncomingMessage, res: ServerResponse, file: string, o: { mime?: string; name?: string; done?: (bytes: number, ms: number, whole: boolean) => void } = {}) {
  let size = 0;
  try { size = statSync(file).size; } catch { res.writeHead(404, { "content-type": "application/json" }); return res.end('{"error":"not here"}'); }
  const head: Record<string, string | number> = {
    "content-type": o.mime || "application/octet-stream", "accept-ranges": "bytes", "cache-control": "private, max-age=3600",
    "access-control-allow-origin": "*", "access-control-expose-headers": "content-length, content-range",
  };
  if (o.name) head["content-disposition"] = `inline; filename*=UTF-8''${encodeURIComponent(o.name)}`;
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range ?? ""));
  let from = 0, to = size - 1, status = 200;
  if (m && size > 0 && (m[1] || m[2])) {
    if (m[1]) { from = Number(m[1]); if (m[2]) to = Math.min(to, Number(m[2])); }
    else { from = Math.max(0, size - Number(m[2])); }
    if (from > to || from >= size) { res.writeHead(416, { ...head, "content-range": `bytes */${size}` }); return res.end(); }
    status = 206; head["content-range"] = `bytes ${from}-${to}/${size}`;
  }
  const length = size === 0 ? 0 : to - from + 1;
  head["content-length"] = length;
  res.writeHead(status, head);
  if (req.method === "HEAD" || length === 0) { res.end(); if (req.method !== "HEAD") o.done?.(0, 0, true); return; }
  const t0 = Date.now();
  let sent = 0;
  const s = createReadStream(file, { start: from, end: to });
  s.on("data", (c) => { sent += c.length; });
  s.on("error", () => res.destroy());
  res.on("finish", () => { if (sent === length) o.done?.(sent, Date.now() - t0, status === 200); });
  s.pipe(res);
}
/** the door itself: true when the request was its to answer. `find` says where a blob is on this machine */
export function answerDoor(req: IncomingMessage, res: ServerResponse, o: { secret: () => string; find: (sha: string) => string | null;
                           now?: () => number; busy?: (d: number) => void; served?: (s: Served) => void; rests?: () => string }): boolean {
  const url = new URL(req.url ?? "/", "http://door");
  if (!url.pathname.startsWith("/hoard/")) return false;
  const json = (code: number, v: unknown) => { res.writeHead(code, { "content-type": "application/json", "access-control-allow-origin": "*", "cache-control": "no-store" }); res.end(JSON.stringify(v)); };
  if (req.method === "OPTIONS") { res.writeHead(204, { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, HEAD", "access-control-allow-headers": "range" }); res.end(); return true; }
  if (req.method !== "GET" && req.method !== "HEAD") { json(405, { error: "the door only hands out" }); return true; }
  if (url.pathname === "/hoard/ping") { json(200, { ok: true, at: (o.now ?? Date.now)() }); return true; }
  const m = /^\/hoard\/d\/([0-9a-f]{64})$/.exec(url.pathname);
  if (!m) { json(404, { error: "not found" }); return true; }
  const rests = o.rests?.() ?? "";
  if (rests) { json(503, { error: `this node is resting: ${rests}` }); return true; }
  const mark = url.searchParams.get("m") ?? "";
  if (!ticketOk(o.secret(), m[1], Number(url.searchParams.get("e")), url.searchParams.get("t") ?? "", (o.now ?? Date.now)(), mark)) {
    json(403, { error: "that ticket does not open this" }); return true;
  }
  const file = o.find(m[1]);
  if (!file) { json(404, { error: "not here" }); return true; }
  o.busy?.(1);
  let counted = false;
  const free = () => { if (!counted) { counted = true; o.busy?.(-1); } };
  res.on("close", free);
  serveFile(req, res, file, { mime: url.searchParams.get("c") ?? undefined, name: url.searchParams.get("n") ?? undefined,
    done: (bytes, ms, whole) => o.served?.({ sha: m[1], bytes, ms, whole, mark }) });
  return true;
}

// ---- THIS MACHINE: its addresses, its link, its power ----
/** the addresses a door on this machine can be reached at (IPv4, not this machine's own loopback) */
export function addresses(): string[] {
  const out: string[] = [];
  for (const list of Object.values(networkInterfaces())) for (const a of list ?? []) if (a.family === "IPv4" && !a.internal) out.push(a.address);
  return out;
}
const sh = (cmd: string, args: string[]) => { try { return execFileSync(cmd, args, { encoding: "utf8", timeout: 4000, stdio: ["ignore", "pipe", "ignore"] }); } catch { return ""; } };
/** is the connection this machine reaches the network by Ethernet or Wi-Fi (the Mac and Linux read; Windows written, untried) */
export function linkKind(): LinkKind {
  try {
    if (process.platform === "darwin") {
      const dev = /interface:\s*(\S+)/.exec(sh("route", ["-n", "get", "default"]))?.[1];
      if (!dev) return "other";
      const ports = sh("networksetup", ["-listallhardwareports"]);
      const port = new RegExp(`Hardware Port: ([^\\n]+)\\nDevice: ${dev}\\b`).exec(ports)?.[1] ?? "";
      return /wi-?fi|airport/i.test(port) ? "wifi" : /ethernet|thunderbolt|usb.*lan|lan/i.test(port) ? "ethernet" : "other";
    }
    if (process.platform === "linux") {
      const route = sh("cat", ["/proc/net/route"]).split("\n").map((l) => l.split("\t")).find((c) => c[1] === "00000000");
      const dev = route?.[0];
      if (!dev) return "other";
      if (existsSync(`/sys/class/net/${dev}/wireless`)) return "wifi";
      return /^(wwan|rmnet|usb)/.test(dev) ? "cell" : /^(e|en|eth)/.test(dev) ? "ethernet" : "other";
    }
    if (process.platform === "win32") {
      const t = sh("powershell", ["-NoProfile", "-Command", "(Get-NetAdapter -Physical | Where-Object Status -eq 'Up' | Sort-Object ifIndex | Select-Object -First 1).PhysicalMediaType"]);
      return /802\.11|wireless/i.test(t) ? "wifi" : /802\.3/.test(t) ? "ethernet" : "other";
    }
  } catch { /* below */ }
  return "other";
}
/** is this machine on mains power (a machine with no battery is). The Mac and Linux read; Windows written, untried */
export function onPower(): boolean {
  try {
    if (process.platform === "darwin") { const t = sh("pmset", ["-g", "batt"]); return !t || /AC Power/.test(t) || !/InternalBattery/.test(t); }
    if (process.platform === "linux") {
      const dir = "/sys/class/power_supply";
      const ups = existsSync(dir) ? readdirSync(dir) : [];
      const bats = ups.filter((u) => sh("cat", [`${dir}/${u}/type`]).trim() === "Battery");
      if (!bats.length) return true;
      return ups.some((u) => sh("cat", [`${dir}/${u}/type`]).trim() !== "Battery" && sh("cat", [`${dir}/${u}/online`]).trim() === "1");
    }
    if (process.platform === "win32") {
      const t = sh("powershell", ["-NoProfile", "-Command", "(Get-CimInstance Win32_Battery).BatteryStatus"]).trim();
      return !t || t === "2" || Number(t) >= 6;
    }
  } catch { /* below */ }
  return true;
}
/** the owner's WHEN (C-601): at any time, only on Wi-Fi (or a cable: never a phone's data), and/or only while plugged in.
 *  "" when it may take part now, else why it rests */
export type When = { wifiOnly: boolean; pluggedOnly: boolean };
export function restsBy(when: When, link: LinkKind, power: boolean): string {
  if (when.wifiOnly && link !== "wifi" && link !== "ethernet") return "not on Wi-Fi";
  if (when.pluggedOnly && !power) return "not plugged in";
  return "";
}

// ---- THE BEAT: a node that dials the hub ----
export type Beat = {
  id: string; name: string;
  offer: { kind: OfferKind; bytes: number } | null;       // null: it has taken its offer back
  used: number; diskFree: number;
  doors: string[]; link: LinkKind; up: number | null; traffic: number;
  rests: string;
  have?: string[]; got?: string[]; gone?: string[];
};
export type BeatReply = { secret?: string; want?: { sha: string; size: number }[]; drop?: string[]; send?: string[]; list?: boolean; error?: string };
export type NodeOptions = {
  hub: () => string; key: () => string; id: () => string; name: () => string;
  dir: () => string; kind: () => OfferKind; bytes: () => number;
  port?: number; host?: string;
  up?: () => number | null;                 // its internet's upload, megabits a second, when its owner said
  link?: () => LinkKind | null;             // Ethernet or Wi-Fi as its owner said, when the reading is wrong (null: read it)
  when?: () => When;
  rest?: () => string;                      // one more reason to rest, said first (its owner paused it); "" for none
  doors?: () => string[];                   // its doors as it would have them said (default: every address, its port)
  log?: (...a: unknown[]) => void;
  fetch?: typeof fetch;
};

export class HoardNode {
  o: NodeOptions;
  store: DiskStore;
  secret = "";
  traffic = 0;
  lastHeard = 0;
  lastError = "";
  rests = "";
  link: LinkKind = "other";
  leaving = false;                           // its offer is taken back: it holds on until its files are held elsewhere
  moving = "";                               // what it is fetching or sending now
  moved: { sha: string; bytes: number; ms: number; way: "in" | "out" | "served"; at: number }[] = [];
  port = 0;
  private server: Server | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private got: string[] = [];
  private gone: string[] = [];
  private listNext = true;
  private beating = false;
  private probed = 0;
  private power = true;
  constructor(o: NodeOptions) {
    this.o = o;
    this.store = new DiskStore(o.dir());
  }
  private say(...a: unknown[]) { (this.o.log ?? (() => {}))(...a); }
  private f(): typeof fetch { return this.o.fetch ?? fetch; }
  private auth() { return { authorization: `Bearer ${this.o.key()}`, "x-hoard-node": this.o.id() }; }

  /** open the door and start the beat (`beats` false: the door only -- whoever started it calls beat() itself) */
  async start(o: { beats?: boolean } = {}): Promise<void> {
    this.store = new DiskStore(this.o.dir()).ready();
    this.store.sweep();
    await new Promise<void>((ok, no) => {
      this.server = createServer((req, res) => {
        if (!answerDoor(req, res, { secret: () => this.secret, find: (sha) => (this.store.has(sha) ? this.store.path(sha) : null),
              busy: (d) => { this.traffic = Math.max(0, this.traffic + d); }, rests: () => this.rests,
              served: (s) => this.note(s.sha, s.bytes, s.ms, "served") })) {
          res.writeHead(404, { "content-type": "application/json" }); res.end('{"error":"not found"}');
        }
      });
      this.server.on("error", no);
      this.server.listen(this.o.port ?? DOOR_PORT, this.o.host ?? "0.0.0.0", () => { const a = this.server!.address(); this.port = typeof a === "object" && a ? a.port : 0; ok(); });
    });
    if (o.beats === false) return;
    this.timer = setInterval(() => void this.beat(), BEAT_MS);
    void this.beat();
  }
  /** close the door and stop the beat. `final`: one last beat first that says the offer is taken back -- waited for
   *  even when a beat is in hand. A reader in the middle of a file is given a moment, then let go */
  async stop(final = false): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (final) {
      for (let i = 0; this.beating && i < 100; i++) await new Promise((r) => setTimeout(r, 50));
      await this.beat(true).catch(() => {});
    }
    const s = this.server;
    this.server = null;
    if (!s) return;
    await new Promise<void>((ok) => {
      const t = setTimeout(() => { (s as Server & { closeAllConnections?: () => void }).closeAllConnections?.(); }, 2000);
      s.close(() => { clearTimeout(t); ok(); });
    });
  }
  /** Take the offer back without stranding what it holds: from now it says so at every beat, fetches nothing more, and
   *  still hands over and lets go of what the hub asks -- until `empty()`, when its owner may stop it for good */
  leave() { this.leaving = true; }
  /** changed their mind: the offer stands again */
  stay() { this.leaving = false; }
  empty(): boolean { return this.store.list().length === 0; }
  private note(sha: string, bytes: number, ms: number, way: "in" | "out" | "served") {
    this.moved = [{ sha, bytes, ms, way, at: Date.now() }, ...this.moved].slice(0, 40);
  }
  doors(): string[] { return this.o.doors?.() ?? addresses().map((a) => `http://${a}:${this.port}`); }
  /** what it would say now (the dashboard shows it too) */
  state() {
    const list = this.store.list();
    return { id: this.o.id(), kind: this.o.kind(), bytes: this.o.bytes(), used: list.reduce((s, b) => s + b.size, 0), files: list.length,
             diskFree: this.store.diskFree(), folder: this.store.root, doors: this.doors(), link: this.link, rests: this.rests, leaving: this.leaving,
             traffic: this.traffic, lastHeard: this.lastHeard, lastError: this.lastError, moving: this.moving, moved: this.moved.slice(0, 12) };
  }

  /** one beat: say what it is and holds, do what the hub answers. `leaving`: its offer is taken back from this beat on */
  async beat(leaving = false): Promise<void> {
    if (leaving) this.leaving = true;
    if (this.beating || !this.o.key() || !this.o.hub()) return;
    this.beating = true;
    try {
      if (Date.now() - this.probed > 30_000) { this.link = this.o.link?.() ?? linkKind(); this.power = onPower(); this.probed = Date.now(); }
      else if (this.o.link?.()) this.link = this.o.link()!;
      this.rests = this.o.rest?.() || restsBy(this.o.when?.() ?? { wifiOnly: false, pluggedOnly: false }, this.link, this.power);
      const list = this.store.list(), got = this.got.splice(0), gone = this.gone.splice(0);
      const beat: Beat = { id: this.o.id(), name: this.o.name(), offer: this.leaving ? null : { kind: this.o.kind(), bytes: Math.max(0, Math.floor(this.o.bytes())) },
        used: list.reduce((s, b) => s + b.size, 0), diskFree: this.store.diskFree(), doors: this.rests ? [] : this.doors(), link: this.link,
        up: this.o.up?.() ?? null, traffic: this.traffic, rests: this.rests, got, gone, ...(this.listNext ? { have: list.map((b) => b.sha) } : {}) };
      let r: BeatReply;
      try {
        const res = await this.f()(`${this.o.hub()}/api/hoard/beat`, { method: "POST", headers: { ...this.auth(), "content-type": "application/json" },
                                    body: JSON.stringify(beat), signal: AbortSignal.timeout(20_000) });
        r = (await res.json().catch(() => ({}))) as BeatReply;
        // the hub says why when it can (another key already keeps a node by this name); a bare refusal is the key
        if (res.status === 401 || res.status === 403) throw new Error(r.error ? `the hub refused: ${r.error}` : `the hub refused this node's key (${res.status}): pair it again`);
        if (!res.ok) throw new Error(r.error || `the hub answered ${res.status}`);
      } catch (e) { this.got.unshift(...got); this.gone.unshift(...gone); throw e; }
      this.lastHeard = Date.now(); this.lastError = ""; this.listNext = r.list === true;
      if (r.secret) this.secret = r.secret;
      if (this.rests) return;                                      // resting: nothing moves
      for (const sha of r.drop ?? []) { this.store.remove(sha); this.gone.push(sha); }
      if (!this.leaving) for (const w of r.want ?? []) await this.fetchIn(w.sha, w.size, this.store.used());
      for (const sha of r.send ?? []) await this.sendOut(sha);
    } catch (e) { this.lastError = (e as Error).message.slice(0, 200); }
    finally { this.beating = false; this.moving = ""; }
  }
  /** fetch a blob the hub wants kept here: from the hub, or from wherever the hub sends it (another node's door) */
  private async fetchIn(sha: string, size: number, used: number) {
    if (this.store.has(sha)) { this.got.push(sha); return; }
    if (used + size > this.o.bytes()) { this.lastError = "there is no room left in what was offered"; return; }
    const t0 = Date.now();
    this.moving = `fetching ${sha.slice(0, 8)}`;
    try {
      const res = await this.f()(`${this.o.hub()}/api/hoard/blob/${sha}`, { headers: this.auth(), signal: AbortSignal.timeout(3_600_000) });
      if (!res.ok || !res.body) throw new Error(`a blob did not come (${res.status})`);
      const r = await this.store.put(Readable.fromWeb(res.body as never), { sha, most: Math.max(0, this.o.bytes() - used) });
      this.got.push(sha); this.note(sha, r.size, Date.now() - t0, "in");
      this.say(`kept ${sha.slice(0, 8)} (${r.size} bytes)`);
    } catch (e) { this.lastError = (e as Error).message.slice(0, 200); }
  }
  /** hand a blob back to the hub (it asked: no other source could be reached) */
  private async sendOut(sha: string) {
    if (!this.store.has(sha)) { this.gone.push(sha); return; }
    const t0 = Date.now(), file = this.store.path(sha), size = statSync(file).size;
    this.moving = `sending ${sha.slice(0, 8)}`;
    try {
      const res = await this.f()(`${this.o.hub()}/api/hoard/blob/${sha}`, { method: "POST", signal: AbortSignal.timeout(3_600_000),
        headers: { ...this.auth(), "content-type": "application/octet-stream", "content-length": String(size) },
        body: Readable.toWeb(createReadStream(file)) as never, duplex: "half" } as RequestInit);
      if (!res.ok) throw new Error(`the hub did not take a blob back (${res.status})`);
      this.note(sha, size, Date.now() - t0, "out");
    } catch (e) { this.lastError = (e as Error).message.slice(0, 200); }
  }
}
