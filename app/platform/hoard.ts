// THE HOARD from this device (C-596; C-501, C-576, C-601 to C-606): the household's own local cloud storage, as the app
// and the site reach it. Every request the hub answers for it (server/src/hoard/http.ts) is asked here:
//
//   its files     what is in it, a file put in (COPY or MOVE, C-576), its share changed, PROTECTED, removed
//   its doors     where a file can be fetched from right now. The hub ranks them; the best few are timed again from
//                 HERE and ranked again by the hub's own rule (server/src/hoard/route.ts, C-574), and what each
//                 delivery measured is told back, so the hub learns how fast and how reliable each machine really is
//   its makings   READ IT ALOUD (C-603), MAKE IT SPEAK, a MAGIC VIDEO (C-604), ASK IT (C-606), and the JOBS they wait in
//   WHEN          whether this device may send a file now (C-601; state/hoard.ts keeps the choice), and the short queue
//                 a file waits in until it may
//
// Never kept and never through what the phone kept (apiLive, not api): a door's address carries a ticket that runs out,
// and a list of files shown from hours ago is worse than a moment's wait. A file's bytes go straight to the hub's
// address or a machine's own door, never through the relay (the hub refuses them there). Nothing here hands words to a
// voice: every making is spoken on the hub, by its own speech paths. Every word a person reads is DRAFT.
import { Directory, File, Paths } from "expo-file-system";
import { FileSystemUploadType, uploadAsync } from "expo-file-system/legacy";
import { Platform } from "react-native";
import { endsShare, SCENES_MOST, type FullPolicy, type HoardFile, type Kind, type OfferKind, type Share, type Stage } from "../../server/src/hoard/rules";
import { hostOf, isPrivate, isTailnet, rank, type Link, type Near, type Source } from "../../server/src/hoard/route";
import { hoardKept, wantsPlugged, wantsWifi } from "../state/hoard";
import { ALONE, apiLive, asThisDevice, homeBase, isAway, ON_PHONE, SERVER, TAILNET, TOKEN } from "./net";

// ---- what the hub says ----
/** a file as THE HOARD shows it to whoever asks */
export type Held = HoardFile & { shareNow: Share; ended: boolean; mine: boolean };
export type Machine = { id: string; name: string; kind: OfferKind; fresh: boolean; state: "on" | "retiring" | "gone"; link: Link; rests: string };
export type HoardNow = { capacity: number; used: number; free: number; files: number; policy: FullPolicy; me: { key: string; name: string }; nodes: Machine[] };
export type Scope = "mine" | "shared" | "all";
export type Change = { name?: string; share?: Share; friend?: string; minutes?: number | null; once?: boolean; protected?: boolean };
export type Job = { id: string; kind: Kind | string; title: string; state: "waiting" | "making" | "done" | "failed" | "stopped"; step: string; stage?: Stage; progress: number;
                    at: number; started: number | null; ended: number | null; error: string | null; by: string; mine: boolean; result: string | null };
/** a way to a file: one of its sources, with its whole address, and whether it answered a ping from here (null: not asked) */
export type Door = Source & { ms: number; why: string; full: string; origin: string; reached: boolean | null };

const auth = (): Record<string, string> => (TOKEN ? { authorization: `Bearer ${TOKEN}` } : {});
const base = () => homeBase().replace(/\/+$/, "");
const now = () => globalThis.performance?.now?.() ?? Date.now();
const id16 = (id: string) => encodeURIComponent(id);
/** the hub is older than this app: it has no such page yet (net.ts says so for the hub's own "not found") */
export const notYet = (e: unknown) => /doesn't have this yet/.test((e as Error)?.message ?? "");
/** a once-only file that is someone else's: fetching it whole IS its one download (rules.ts endsShare) */
export const onceOnly = (f: Held) => endsShare(f, { key: f.mine ? f.owner : "", name: "" }, Date.now());

export const hoardNow = () => apiLive<HoardNow>("/api/hoard");
export const filesOf = (scope: Scope = "all") => apiLive<{ files: Held[] }>(`/api/hoard/files?scope=${scope}`).then((r) => r.files);
export const fileOf = (id: string) => apiLive<{ file: Held }>(`/api/hoard/files/${id16(id)}`).then((r) => r.file);
export const changeFile = (id: string, c: Change) => apiLive<{ file: Held; link?: string }>(`/api/hoard/files/${id16(id)}`, c);
export const removeFile = (id: string) => apiLive<{ ok: boolean }>(`/api/hoard/files/${id16(id)}/remove`, {});
export const textOf = (id: string) => apiLive<{ text: string; whole: boolean }>(`/api/hoard/files/${id16(id)}/text`);
/** a friend's link, whole: the hub's address as this device was paired with it, and the path the hub gave once */
export const linkOf = (path: string) => `${SERVER.replace(/\/+$/, "")}${path}`;

// ---- where this device is from the hub, and WHEN it may send (C-601) ----
/** a quick question at a door (the hub's, or a machine's own): how long before it answers, or null when it does not */
async function pingAt(origin: string, ms = 2500): Promise<number | null> {
  if (!origin) return null;
  const stop = new AbortController(), t = setTimeout(() => stop.abort(), ms), t0 = now();
  try { const r = await fetch(`${origin}/hoard/ping`, { signal: stop.signal }); return r.ok ? Math.max(1, Math.round(now() - t0)) : null; }
  catch { return null; } finally { clearTimeout(t); }
}
const nearOf = (address: string): Near => {
  const h = hostOf(address).toLowerCase();
  if (isPrivate(h) || h === "localhost" || h.endsWith(".local")) return "here";
  return isTailnet(h) || h.endsWith(".ts.net") || !h.includes(".") ? "tailnet" : "away";   // a bare name is most often the tailnet's
};
/** the hub's address that answers now, and how near that is: the home network, the tailnet, or neither (null) */
export async function reach(): Promise<{ base: string; near: Near } | null> {
  for (const b of [...new Set([base(), SERVER, TAILNET].filter((x): x is string => !!x).map((x) => x.replace(/\/+$/, "")))])
    if (await pingAt(b) !== null) return { base: b, near: nearOf(b) };
  return null;
}
async function pluggedIn(): Promise<boolean> {
  if (!ON_PHONE) {                                          // a browser that can say (Chrome); one that cannot is a computer on the wall
    try { const b = await (navigator as unknown as { getBattery?: () => Promise<{ charging: boolean }> }).getBattery?.(); return b ? b.charging : true; }
    catch { return true; }
  }
  try {
    const B = require("expo-battery") as typeof import("expo-battery");
    const s = await B.getBatteryStateAsync();
    return s === B.BatteryState.CHARGING || s === B.BatteryState.FULL;
  } catch { return false; }
}
// There is no Wi-Fi reading in this build (no expo-network). On the site the browser says, where it can
// (navigator.connection). On the phone the hub reached directly at an address on the home network -- not through the
// relay, and not over the tailnet, which mobile data carries too -- is taken to be Wi-Fi. A later build reads it properly.
async function onWifi(): Promise<boolean> {
  if (!ON_PHONE) {
    const c = (globalThis.navigator as unknown as { connection?: { type?: string; saveData?: boolean } } | undefined)?.connection;
    return !(c?.type === "cellular" || c?.saveData === true);
  }
  if (isAway()) return false;
  return (await reach())?.near === "here";
}
/** may a file be sent now, and if not, what it waits for */
export async function mayGoNow(): Promise<{ ok: boolean; why: string }> {
  const w = hoardKept().when;
  if (wantsPlugged(w) && !(await pluggedIn())) return { ok: false, why: "waiting to be plugged in" };
  if (wantsWifi(w) && !(await onWifi())) return { ok: false, why: ON_PHONE ? "waiting for the home network" : "waiting for Wi-Fi" };
  return { ok: true, why: "" };
}

// ---- a file's doors (C-574) ----
type Ways = { file: Held; doors: Door[]; coming: boolean; through: boolean };
const TIMED = 3;                                                    // how many of the best doors are timed again from here
const originOf = (url: string) => /^(https?:\/\/[^/?#]+)/i.exec(url)?.[1] ?? "";
const endsAt = (url: string) => (Number(/[?&]e=(\d+)/.exec(url)?.[1]) || 0) * 1000;   // a ticket says when it runs out
const known = new Map<string, { ways: Ways; until: number; timed: boolean }>();

/** Every place a file can be fetched from now, the one reckoned soonest first. With `time`, the best few are asked a
 *  quick question from here, and all of them ranked again with what that measured; one that did not answer goes last. */
export async function doorsOf(id: string, o: { time?: boolean; fresh?: boolean } = {}): Promise<Ways> {
  const had = known.get(id);
  if (had && !o.fresh && Date.now() < had.until && (had.timed || !o.time)) return had.ways;
  const r = await apiLive<{ file: Held; sources: (Source & { ms: number; why: string })[]; coming: boolean; through: boolean }>(`/api/hoard/files/${id16(id)}/sources`);
  const hub = base();
  let doors: Door[] = r.sources.map((s) => {
    const full = s.url.startsWith("/") ? hub + s.url : s.url;
    return { ...s, full, origin: originOf(full), reached: null };
  });
  if (o.time && doors.length > 1) {
    const timed = await Promise.all(doors.slice(0, TIMED).map(async (d) => ({ node: d.node, ping: await pingAt(d.origin) })));
    const pinged = new Map(timed.map((t) => [t.node, t.ping]));
    const keep = new Map(doors.map((d) => [d.node, d]));
    const mine = doors.map((d) => (pinged.get(d.node) != null ? { ...d, ping: pinged.get(d.node)! } : d));
    doors = rank(mine, r.file.size).map((s) => ({ ...keep.get(s.node)!, ...s, reached: pinged.has(s.node) ? pinged.get(s.node) !== null : null }));
    doors = [...doors.filter((d) => d.reached !== false), ...doors.filter((d) => d.reached === false)];
  }
  const ways: Ways = { file: r.file, doors, coming: r.coming, through: r.through };
  // kept for a few minutes, never past the first ticket to run out -- and never a once-only file's, whose ticket is for one go
  const until = Math.min(Date.now() + 5 * 60_000, ...doors.map((d) => endsAt(d.full) - 30_000).filter((t) => t > 0));
  if (doors.length && !r.through) known.set(id, { ways, until, timed: !!o.time }); else known.delete(id);
  return ways;
}
/** what one delivery measured, told to the hub (it learns each machine's speed and reliability from these) */
export function fetched(id: string, d: Pick<Door, "node" | "near">, ok: boolean, bytes = 0, ms = 0) {
  if (!ok) known.delete(id);
  apiLive(`/api/hoard/files/${id16(id)}/fetched`, { node: d.node, near: d.near, bytes, ms: Math.round(ms), ok }).catch(() => {});
}

export type Best = { url: string; door: Door; file: Held;
                     /** a player says how it went with this door (it took the address itself, so only it knows) */
                     told: (ok: boolean) => void;
                     /** the next best door, after this one failed; null when there is no other */
                     next: () => Best | null };
/** A file fetched from its best source. `take` is handed each door in turn, the best first, until one delivers; how
 *  long each took and whether it came is told to the hub. Without `take` the best door's address is the answer, for
 *  a player to take it from there (and say `told`, or ask for `next`). A file the hub is still bringing back is waited
 *  for, ten seconds at a time. */
export async function fetchBest(id: string, o?: { onWait?: () => void }): Promise<Best>;
export async function fetchBest<T>(id: string, o: { onWait?: () => void; take: (door: Door, file: Held) => Promise<{ got: T; bytes: number }> }): Promise<{ got: T; door: Door; file: Held }>;
export async function fetchBest<T>(id: string, o: { onWait?: () => void; take?: (door: Door, file: Held) => Promise<{ got: T; bytes: number }> } = {}) {
  let ways = await doorsOf(id, { time: true });
  for (let tries = 0; !ways.doors.length && ways.coming && tries < 12; tries++) {
    o.onWait?.();
    await new Promise((ok) => setTimeout(ok, 10_000));
    ways = await doorsOf(id, { time: true, fresh: true });
  }
  if (!ways.doors.length) throw new Error(ways.coming ? "The hub is still bringing it back. Try again in a moment." : "No machine that holds it can be reached from here now.");
  const { doors, file } = ways;
  if (!o.take) {
    const at = (i: number): Best => {
      const t0 = now();
      let said = false;
      return { url: doors[i].full, door: doors[i], file,
               told: (ok) => {
                 if (said) return;
                 said = true;
                 const ms = now() - t0;
                 if (ok) { fetched(id, doors[i], true, 0, ms); return; }
                 // a player that could not play it may only not know its kind: the machine is marked down only if its door is silent too
                 known.delete(id);
                 pingAt(doors[i].origin).then((p) => { if (p === null) fetched(id, doors[i], false, 0, ms); });
               },
               next: () => (i + 1 < doors.length ? at(i + 1) : null) };
    };
    return at(0);
  }
  let failed: unknown;
  for (const door of doors) {
    const t0 = now();
    try {
      const r = await o.take(door, file);
      fetched(id, door, true, r.bytes, now() - t0);
      return { got: r.got, door, file };
    } catch (e) { failed = e; fetched(id, door, false, 0, now() - t0); if (ways.through) break; }   // a once-only file has one door
  }
  throw failed instanceof Error ? failed : new Error("It could not be fetched.");
}

// ---- a file brought here whole: to save, to share, or because it may be fetched only once ----
const safe = (s: string) => s.replace(/[^A-Za-z0-9._-]/g, "_").slice(-80) || "file";
const fetchedDir = () => { const d = new Directory(Paths.cache, "hoard"); if (!d.exists) d.create({ intermediates: true, idempotent: true }); return d; };
/** The original, whole, on this device: a file in the app's cache on the phone, a blob's address on the site. */
export async function bringHere(f: Held, onWait?: () => void): Promise<string> {
  const r = await fetchBest<string>(f.id, { onWait, take: async (door) => {
    if (!ON_PHONE) {
      const got = await fetch(door.full);
      if (!got.ok) throw new Error(`It did not come: the door answered ${got.status}.`);
      const blob = await got.blob();
      return { got: URL.createObjectURL(blob), bytes: blob.size };
    }
    const to = new File(fetchedDir(), `${f.id}-${safe(f.name)}`);
    if (to.exists) to.delete();
    const got = await File.downloadFileAsync(door.full, to);
    if (!got.exists || got.size !== f.size) { try { if (got.exists) got.delete(); } catch { /* gone */ } throw new Error("It did not come whole."); }
    return { got: got.uri, bytes: got.size };
  } });
  return r.got;
}
/** SAVE OR SHARE THE ORIGINAL: brought to the cache and handed to the share sheet on the phone; a download on the
 *  site. `local` is the copy already here (a once-only file is fetched once, and saved from that). */
export async function saveOriginal(f: Held, local?: string | null): Promise<void> {
  if (!ON_PHONE) {
    const url = local ?? (onceOnly(f) ? await bringHere(f) : (await fetchBest(f.id)).url);
    const a = document.createElement("a");
    a.href = url; a.download = f.name; a.target = "_blank"; a.rel = "noopener";
    document.body.appendChild(a); a.click(); a.remove();
    return;
  }
  const uri = local ?? await bringHere(f);
  const Sharing = require("expo-sharing") as typeof import("expo-sharing");
  await Sharing.shareAsync(uri, { dialogTitle: f.name, mimeType: f.mime });
}

// ---- a file put in (C-576) ----
export type Putting = { uri: string; name: string; mime: string; size: number | null;
                        blob?: Blob;                         // the site: the browser's own File
                        how: "copy" | "move"; share: Share; friend?: string; minutes?: number | null; once?: boolean };
export type Put = { file: Held; md5: string; link?: string };
/** the hub did answer, and said no (no room, not allowed): that is not a reason to wait and try again */
export class Refused extends Error { name = "Refused"; }

const q = (o: Record<string, string | number | undefined | null>) =>
  Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&");
/** the hub's address for a file's bytes: never the relay's, which the hub refuses for them */
async function direct(path: string): Promise<string> {
  if (ALONE) throw new Refused("THE HOARD is the hub's, and this phone is on its own.");
  return base() + await asThisDevice(path);
}
/** bytes sent to the hub as a request's whole body: in a background session on the phone, by the browser on the site */
async function sendBytes<T>(url: string, from: { uri: string; blob?: Blob }, mime = "application/octet-stream"): Promise<T> {
  let status = 0, text = "";
  if (!ON_PHONE) {
    const body = from.blob ?? await (await fetch(from.uri)).blob();
    const r = await fetch(url, { method: "POST", headers: { "content-type": mime, ...auth() }, body });
    status = r.status; text = await r.text();
  } else {
    const r = await uploadAsync(url, from.uri, { httpMethod: "POST", uploadType: FileSystemUploadType.BINARY_CONTENT, headers: { "content-type": mime, ...auth() } });
    status = r.status; text = r.body;
  }
  let j: { error?: string } = {};
  try { j = JSON.parse(text); } catch { /* said below */ }
  if (status === 404 && j.error === "not found") throw new Refused("The companion doesn't have this yet. Update it (the hub's deploy), then try again.");
  if (status < 200 || status >= 300) throw new Refused(j.error ?? `the hub answered ${status}`);
  return j as T;
}
/** A file sent to THE HOARD now, whatever WHEN says. Throws Refused when the hub said no, anything else when it could
 *  not be reached. */
export async function upload(p: Putting): Promise<Put> {
  const url = await direct(`/api/hoard/upload?${q({ name: p.name, mime: p.mime, share: p.share, friend: p.share === "friend" ? p.friend : undefined,
    minutes: p.share === "me" ? undefined : p.minutes, once: p.share !== "me" && p.once ? 1 : undefined, how: p.how })}`);
  const put = await sendBytes<Put>(url, p);
  if (!put.file) throw new Refused("the hub did not say it kept it");
  return put;
}

// MOVE: this device lets go of its own copy only once the hub's copy is known to be the same, and only a copy that is
// this app's own to remove.
const plain = (uri: string) => { let u = uri; try { u = decodeURI(uri); } catch { /* as it is */ } return u.replace(/^file:\/\//, "").replace(/^\/private\//, "/"); };
/** the copy a picker made in this app's cache: this app's own, and only ever a duplicate */
const inCache = (uri: string) => ON_PHONE && uri.startsWith("file://") && plain(uri).startsWith(plain(Paths.cache.uri));
/** is a file inside this app's own folders (its documents or its cache)? Nothing else is ever removed. */
export function ownHere(uri: string): boolean {
  if (!ON_PHONE || !uri.startsWith("file://")) return false;
  const p = plain(uri);
  if (p.split("/").includes("..")) return false;
  return [Paths.document.uri, Paths.cache.uri].some((d) => { const dir = plain(d).replace(/\/+$/, "") + "/"; return p.startsWith(dir) && p.length > dir.length; });
}
function letGoHere(uri: string): boolean {
  if (!ownHere(uri)) return false;
  try { const f = new File(uri); if (f.exists) f.delete(); return true; } catch { return false; }
}
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const CHECK_MOST = 256 * 1024 * 1024;                          // the most a browser reads into memory to check a copy
/** is the hub's copy the same as this device's own, byte for byte? null: it could not be checked here */
export async function sameAsMine(p: Putting, put: Put): Promise<boolean | null> {
  try {
    if (ON_PHONE) { const mine = new File(p.uri).md5; return mine && put.md5 ? mine.toLowerCase() === put.md5.toLowerCase() : null; }
    // a browser has no MD5: where it can hash at all (a secure page), the file's own SHA-256 against the one the hub kept it by
    const subtle = globalThis.crypto?.subtle;
    if (!subtle || !p.blob || p.blob.size > CHECK_MOST) return null;
    return hex(await subtle.digest("SHA-256", await p.blob.arrayBuffer())) === put.file.sha;
  } catch { return null; }
}
export type Moved = { same: boolean | null; removed: boolean };
/** After a file is in THE HOARD: for a MOVE, the copies compared and this app's own let go of only when they match.
 *  For a COPY, only the copy the picker made in this app's cache is tidied away; the file it was picked from is
 *  never this app's to touch, either way. */
export async function settle(p: Putting, put: Put): Promise<Moved> {
  if (p.how !== "move") { if (inCache(p.uri)) letGoHere(p.uri); return { same: null, removed: false }; }
  const same = await sameAsMine(p, put);
  return { same, removed: same === true ? letGoHere(p.uri) : false };
}

// ---- waiting to be sent (C-601): a short queue, on this device ----
export type Waiting = Putting & { id: string; why: string; at: number;
                                 refused?: boolean };          // the hub said no: it is not sent again by itself, only by SEND IT NOW
const waitDir = () => new Directory(Paths.document, "hoard", "waiting");
const waitList = () => new File(new Directory(Paths.document, "hoard"), "waiting.json");
let inBrowser: Waiting[] = [];                                // the site: for this visit (a browser's file cannot be kept)
const waitHeard = new Set<() => void>();
export const onWaiting = (f: () => void) => { waitHeard.add(f); return () => { waitHeard.delete(f); }; };
export function waiting(): Waiting[] {
  if (!ON_PHONE) return inBrowser;
  try { const f = waitList(); return f.exists ? JSON.parse(f.textSync()) : []; } catch { return []; }
}
function keepWaiting(l: Waiting[]) {
  if (!ON_PHONE) inBrowser = l;
  else { const d = new Directory(Paths.document, "hoard"); if (!d.exists) d.create(); const f = waitList(); if (!f.exists) f.create(); f.write(JSON.stringify(l)); }
  waitHeard.forEach((f) => f());
}
function wait(p: Putting, why: string): Waiting {
  const id = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  let uri = p.uri;
  if (ON_PHONE) {                                             // out of the cache, which the phone may empty, into the app's documents
    const d = waitDir(); if (!d.exists) d.create({ intermediates: true, idempotent: true });
    const from = new File(p.uri), held = new File(d, `${id}${from.extension || ""}`);
    from.copySync(held);
    if (inCache(p.uri)) letGoHere(p.uri);
    uri = held.uri;
  }
  const w: Waiting = { ...p, uri, id, why, at: Date.now() };
  keepWaiting([...waiting(), w]);
  return w;
}
export type Sent = { put: Put; moved: Moved } | { waiting: Waiting };
/** Put a file in: sent now when WHEN allows (or `now` says to anyway), else kept waiting, with what it waits for. One
 *  the hub could not be reached for waits too; one the hub refused does not (Refused). */
export async function putIn(p: Putting, o: { now?: boolean } = {}): Promise<Sent> {
  const may = o.now ? { ok: true, why: "" } : await mayGoNow();
  if (!may.ok) return { waiting: wait(p, may.why) };
  try { const put = await upload(p); return { put, moved: await settle(p, put) }; }
  catch (e) { if (e instanceof Refused) throw e; return { waiting: wait(p, (e as Error).message || "the hub could not be reached") }; }
}
let sendingWaiting = false;
/** Each waiting file tried: all that WHEN lets through now, or the one named, whatever WHEN says (SEND IT NOW). */
export async function sendWaiting(only?: string): Promise<{ sent: (Waiting & { put: Put; moved: Moved })[]; left: number }> {
  if (sendingWaiting) return { sent: [], left: waiting().length };
  sendingWaiting = true;
  const sent: (Waiting & { put: Put; moved: Moved })[] = [];
  try {
    const may = only ? { ok: true, why: "" } : await mayGoNow();
    for (const w of waiting().filter((x) => (only ? x.id === only : !x.refused))) {
      const still = (why: string, refused = false) => keepWaiting(waiting().map((x) => (x.id === w.id ? { ...x, why, refused } : x)));
      if (!may.ok) { if (w.why !== may.why) still(may.why); continue; }
      try {
        const put = await upload(w), moved = await settle(w, put);
        sent.push({ ...w, put, moved });
        // a MOVE whose copies differ lets go of nothing: it stays here, to be sent again or forgotten by hand
        if (w.how === "move" && moved.same === false) { still("THE HOARD's copy did not match this one. Remove that one, then send this again.", true); continue; }
        if (ON_PHONE && !moved.removed) letGoHere(w.uri);         // the waiting copy is this app's own, made by wait()
        keepWaiting(waiting().filter((x) => x.id !== w.id));
      } catch (e) { still((e as Error).message || "the hub could not be reached", e instanceof Refused); if (!(e instanceof Refused)) break; }
    }
  } finally { sendingWaiting = false; }
  return { sent, left: waiting().length };
}
export function forgetWaiting(id: string) {
  const w = waiting().find((x) => x.id === id);
  if (w && ON_PHONE) letGoHere(w.uri);
  keepWaiting(waiting().filter((x) => x.id !== id));
}

// ---- the makings, and the JOBS they wait in (C-603, C-604, C-606) ----
export type Voice = "auto" | "daemon" | `daemon:${number}`;
export type Scene = { of: string; say: "auto" | "words" | "daemon"; words?: string; species?: number };
export type Music = "none" | "under" | "song";
export type Making =
  | { kind: "spoken"; of: string; voice: Voice }
  | { kind: "magic"; of: string; words?: string; voice?: "auto" | `daemon:${number}` }
  | { kind: "video"; title?: string; scenes: Scene[]; music: Music; musicPrompt?: string };
/** a scene with someone speaking in it: a SONG carries the words itself, so it is offered only when no scene has one */
export const speaks = (s: Scene) => s.say !== "auto";

export type JobsNow = { jobs: Job[]; now: string | null; asked: boolean; missing: boolean; error: string };
let jobsNow: JobsNow = { jobs: [], now: null, asked: false, missing: false, error: "" };
const jobsHeard = new Set<(j: JobsNow) => void>();
let jobsTimer: ReturnType<typeof setTimeout> | null = null, jobsAsking = false, jobsAgain = false;
export const live = (j: Job) => j.state === "waiting" || j.state === "making";
const tellJobs = (p: Partial<JobsNow>) => { jobsNow = { ...jobsNow, ...p }; jobsHeard.forEach((f) => f(jobsNow)); };
/** The JOBS read now; and again every three seconds while a page is watching and one is waiting or being made. */
export async function lookAtJobs(): Promise<void> {
  if (jobsTimer) { clearTimeout(jobsTimer); jobsTimer = null; }
  if (jobsAsking) { jobsAgain = true; return; }             // asked before a new job was queued: asked once more after
  jobsAsking = true;
  try {
    const r = await apiLive<{ jobs: Job[]; now: string | null }>("/api/hoard/jobs");
    tellJobs({ jobs: r.jobs ?? [], now: r.now ?? null, asked: true, missing: false, error: "" });
  } catch (e) { tellJobs(notYet(e) ? { asked: true, missing: true, error: "" } : { asked: true, error: (e as Error).message }); }
  finally { jobsAsking = false; }
  if (jobsAgain) { jobsAgain = false; return lookAtJobs(); }
  // through the relay each read is a run of it, so away from home they are five times as far apart
  if (jobsHeard.size && !jobsNow.missing && jobsNow.jobs.some(live)) jobsTimer = setTimeout(lookAtJobs, isAway() ? 15_000 : 3000);
}
/** watch the JOBS while a page shows them; the page is told at once, and whenever they are read again */
export function onJobs(f: (j: JobsNow) => void) {
  jobsHeard.add(f); f(jobsNow); lookAtJobs();
  return () => { jobsHeard.delete(f); if (!jobsHeard.size && jobsTimer) { clearTimeout(jobsTimer); jobsTimer = null; } };
}
// a job just queued is told at once, as far as the hub said (the rest of it comes with the next read, a moment later)
const queued = (r: { job: Partial<Job> & Pick<Job, "id"> }): Job => {
  const job: Job = { kind: "", title: "", state: "waiting", step: "", progress: 0, at: Date.now(), started: null, ended: null, error: null, by: "", mine: true, result: null, ...r.job };
  tellJobs({ jobs: [...jobsNow.jobs.filter((j) => j.id !== job.id), job] });
  lookAtJobs();
  return job;
};
/** the most pictures one MAGIC VIDEO takes: the hub's own number (rules.ts, which the phone loads too) */
export { SCENES_MOST };
export const make = (m: Making) => apiLive<{ job: Job }>("/api/hoard/make", m).then(queued);
export const stopJob = (id: string) => apiLive(`/api/hoard/jobs/${id16(id)}/stop`, {}).then(() => lookAtJobs());
export const againJob = (id: string) => apiLive(`/api/hoard/jobs/${id16(id)}/again`, {}).then(() => lookAtJobs());
/** ASK IT, typed */
export const askFile = (id: string, text: string) => apiLive<{ job: Job }>(`/api/hoard/files/${id16(id)}/ask`, { text }).then(queued);
/** ASK IT, said: the recording itself sent, for the hub to hear */
export async function askAloud(id: string, uri: string): Promise<Job> {
  const mime = Platform.OS === "web" ? "audio/webm" : "audio/mp4";
  return queued(await sendBytes<{ job: Job }>(await direct(`/api/hoard/files/${id16(id)}/ask?spoken=1&mime=${encodeURIComponent(mime)}`), { uri }, mime));
}
