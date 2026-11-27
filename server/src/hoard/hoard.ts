// BRAIN: none -- storage: the hub's ledger of the household's files, who holds each and who may read it
// The hub's only (it keeps files): never imported by core.ts or routes.ts.
// C-596, C-598, C-599, C-574 (the user, 2026-11-27): THE HOARD on the hub -- the household's own local cloud storage,
// the storage twin of THE MIND. The hub keeps the LEDGER: every file, its owner and its share (rules.ts); every NODE that
// offers room and what it holds (the same registry THE MESH keeps its nodes in, shared/nodes.ts); and it answers three
// questions:
//
//   WHERE DOES A NEW FILE GO   it is taken in at the hub, then kept on one EXTEND node and on every REPLICA (rules.plan).
//                              Nodes dial out, so each learns what to fetch on its next BEAT and fetches it from the hub,
//                              or from another node's door when the hub no longer holds it.
//   WHO MAY HAVE IT            the owner; the household or a friend while its share lasts (rules.canRead). The hub alone
//                              decides, and hands whoever may a TICKET a node's door will take.
//   WHERE FROM                 every node that holds it and can be reached from where the asker is, ranked by which
//                              would deliver it soonest (route.rank) -- the hub's own copy among them, and the hub
//                              passing on another node's copy as the last resort.
//
// The hub itself is a node when it has an offer of its own (a drive or folder, set in THE ENGINE ROOM); with none it only
// keeps the ledger and a STAGE, where a new file waits until a node has it. Every word a person reads is DRAFT.
import { createHash, randomBytes } from "node:crypto";
import { existsSync, readdirSync, statfsSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Readable } from "node:stream";
import type { Store } from "../shared/store.js";
import { Nodes, marked, reliability, type NetNode } from "../shared/nodes.js";
import { DiskStore, HASH, HOARD_FRESH_MS, TICKET_S, doorPath, linkKind, type Beat, type BeatReply } from "./node.js";
import { canChange, canProtect, canRead, canRemove, canSee, capacityOf, cleanName, cleanUpFor, endsShare, lastingOf, mimeOf, plan, shareEnded, shareNow,
         KINDS, OFFER_KINDS, POLICIES, SHARES,
         type Blob, type Copy, type FullPolicy, type Holder, type HoardFile, type Kind, type OfferKind, type Share, type Who } from "./rules.js";
import { LINKS, doorFor, isPrivate, isTailnet, learn, rank, type Link, type Near, type Source } from "./route.js";

export type StoreNode = NetNode & {
  kind: OfferKind; offer: number; used: number; diskFree: number;
  doors: string[]; link: Link; up: number | null; traffic: number; rests: string;
  ping: number | null; learned: Partial<Record<Near, number>>;
  state: "on" | "retiring" | "gone"; secret: string; owner: string; added: number;
};
type Row = HoardFile & { link: string | null };
export type Ask = { name?: unknown; mime?: unknown; share?: unknown; friend?: unknown; minutes?: unknown; once?: unknown; how?: unknown;
                    kind?: unknown; of?: unknown; meta?: unknown; protected?: unknown; sha?: unknown; size?: unknown };
export class HoardError extends Error { status: number; constructor(status: number, message: string) { super(message); this.status = status; } }
const STAGE_KEEP_FREE = 512 * 1024 * 1024;     // the hub's own disk is never filled by what is waiting on it (DRAFT)
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const HUB = "hub";

export class Hoard {
  nodes: Nodes<StoreNode>;
  stage: DiskStore;                              // where a new file waits on the hub until a node has it
  here: DiskStore | null = null;                 // the hub's own offer, when it has one
  traffic = 0;                                   // the transfers the hub's own door carries now
  private store: Store;
  private now: () => number;
  private listed = new Set<string>();            // the nodes whose whole list has been heard since this hub started
  private summoned = new Map<string, string>();  // a blob the hub asked a node to hand back: sha -> node
  private pinged = new Map<string, number>();
  private f: typeof fetch;

  constructor(store: Store, dir: string, o: { now?: () => number; fetch?: typeof fetch } = {}) {
    this.store = store;
    this.now = o.now ?? (() => store.now());
    this.f = o.fetch ?? fetch;
    this.nodes = new Nodes<StoreNode>({ now: () => this.now(), freshMs: HOARD_FRESH_MS });
    this.stage = new DiskStore(join(dir, "stage"), false).ready();
    this.stage.sweep();
    store.db.exec(`
      CREATE TABLE IF NOT EXISTS hoard_files (id TEXT PRIMARY KEY, sha TEXT NOT NULL, size INTEGER NOT NULL, name TEXT NOT NULL, mime TEXT NOT NULL,
        owner TEXT NOT NULL, owner_name TEXT NOT NULL, added INTEGER NOT NULL, share TEXT NOT NULL, friend TEXT, link TEXT, until INTEGER,
        once INTEGER NOT NULL DEFAULT 0, taken INTEGER, protected INTEGER NOT NULL DEFAULT 0, how TEXT NOT NULL DEFAULT 'copy',
        kind TEXT NOT NULL DEFAULT 'file', of TEXT, meta TEXT NOT NULL DEFAULT '{}');
      CREATE INDEX IF NOT EXISTS hoard_files_sha ON hoard_files (sha);
      CREATE TABLE IF NOT EXISTS hoard_copies (sha TEXT NOT NULL, node TEXT NOT NULL, state TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (sha, node));
      CREATE TABLE IF NOT EXISTS hoard_nodes (id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL, offer INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0,
        state TEXT NOT NULL, secret TEXT NOT NULL, owner TEXT NOT NULL, doors TEXT NOT NULL DEFAULT '[]', link TEXT NOT NULL DEFAULT 'other', up REAL,
        learned TEXT NOT NULL DEFAULT '{}', history TEXT NOT NULL DEFAULT '[]', seen INTEGER NOT NULL DEFAULT 0, added INTEGER NOT NULL);`);
    for (const r of store.db.prepare("SELECT * FROM hoard_nodes").all() as any[]) {
      if (r.id === HUB) continue;                // the hub's own node is made from its setting, below
      this.nodes.set(r.id, { id: r.id, name: r.name, caps: ["store"], seen: r.seen, holds: 0, history: json(r.history, []), kind: r.kind, offer: r.offer,
        used: r.used, diskFree: 0, doors: json(r.doors, []), link: r.link, up: r.up ?? null, traffic: 0, rests: "", ping: null, learned: json(r.learned, {}),
        state: r.state, secret: r.secret, owner: r.owner, added: r.added });
    }
    this.openHere();
  }

  // ---- settings ----
  private get(key: string) { return this.store.getSetting(`hoard.${key}`); }
  private set(key: string, v: string | null) { this.store.setSetting(`hoard.${key}`, v); }
  /** the hub's own secret: its door's tickets and nothing else */
  secret(): string { let s = this.get("secret"); if (!s) { s = randomBytes(24).toString("hex"); this.set("secret", s); } return s; }
  policy(): FullPolicy { const p = this.get("full"); return p === "oldest" ? "oldest" : "manual"; }
  setPolicy(p: unknown) { if (!POLICIES.includes(p as FullPolicy)) throw new HoardError(400, "by hand, or the oldest first"); this.set("full", p as string); }

  // ---- who is asking ----
  /** a paired key as THE HOARD names it (never the key itself) */
  static keyOf(bearer: string) { return `k${sha256(bearer).slice(0, 12)}`; }
  private people(): Record<string, { person: string; name?: string }> { return json(this.get("people"), {}); }
  /** the person a paired key is: itself, or the person a keeper set it together with (one person's phone, tablet and computer) */
  who(bearer: string | null | undefined, phoneName: string | null | undefined, loopback: boolean): Who | null {
    if (bearer && phoneName) {
      const k = Hoard.keyOf(bearer), p = this.people()[k];
      return { key: p?.person ?? k, name: p?.name ?? phoneName };
    }
    return loopback ? { key: "here", name: "this machine" } : null;            // DRAFT
  }
  /** a keeper manages THE HOARD from THE ENGINE ROOM. Until keepers are named, whoever opens THE ENGINE ROOM is one --
   *  the hub has no separate admin sign-in (C-330); once some are named, only they and the hub's own machine */
  keepers(): string[] { return json(this.get("keepers"), []); }
  keeper(who: Who | null): Who | null {
    if (!who) return null;
    const k = this.keepers();
    return k.length === 0 || who.key === "here" || k.includes(who.key) ? { ...who, keeper: true } : null;
  }
  setKeepers(keys: unknown) {
    const all = Array.isArray(keys) ? [...new Set(keys.map(String).filter((k) => /^[a-z0-9]{2,40}$/.test(k)))].slice(0, 40) : [];
    this.set("keepers", all.length ? JSON.stringify(all) : null);
  }
  /** set a paired key together with a person (another key's), or apart again; a keeper's to do */
  setPerson(key: string, person: string | null, name?: string) {
    if (!/^k[0-9a-f]{12}$/.test(key)) throw new HoardError(400, "name a paired key");
    const all = this.people();
    if (!person || person === key) delete all[key];
    else { if (!/^k[0-9a-f]{12}$/.test(person)) throw new HoardError(400, "name the person's first key"); all[key] = { person, ...(name ? { name: name.slice(0, 60) } : {}) }; }
    this.set("people", Object.keys(all).length ? JSON.stringify(all) : null);
  }
  /** every paired key, for THE ENGINE ROOM: its name, the person it is, and whether that person keeps THE HOARD */
  keys(): { key: string; name: string; person: string; keeper: boolean }[] {
    const people = this.people(), keepers = this.keepers();
    return (this.store.db.prepare("SELECT token, name FROM phones ORDER BY paired").all() as { token: string; name: string }[]).map((r) => {
      const key = Hoard.keyOf(r.token), person = people[key]?.person ?? key;
      return { key, name: r.name, person, keeper: keepers.includes(person) };
    });
  }

  // ---- the hub's own offer ----
  hereOffer(): { dir: string; bytes: number; kind: OfferKind } | null {
    const o = json<{ dir?: string; bytes?: number; kind?: OfferKind } | null>(this.get("here"), null);
    return o && typeof o.dir === "string" && o.dir && Number(o.bytes) > 0 ? { dir: o.dir, bytes: Number(o.bytes), kind: o.kind === "replica" ? "replica" : "extend" } : null;
  }
  private openHere() {
    const o = this.hereOffer(), was = this.nodes.get(HUB);
    if (!o) {
      this.here = was ? this.here : null;
      if (was) { was.state = "retiring"; was.offer = 0; }      // its files move off before the folder is let go
      return;
    }
    this.here = new DiskStore(o.dir).ready();
    this.here.sweep();
    this.nodes.set(HUB, { id: HUB, name: "the hub", caps: ["store"], seen: this.now(), holds: 0, history: was?.history ?? [], here: true,
      kind: o.kind, offer: o.bytes, used: this.here.used(), diskFree: this.here.diskFree(), doors: [], link: was?.link ?? (linkKind() as Link), up: was?.up ?? null,
      traffic: 0, rests: "", ping: 0, learned: was?.learned ?? json(this.get("hub.learned"), {}), state: "on", secret: this.secret(), owner: "here", added: was?.added ?? this.now() });
  }
  /** a drive or folder of the hub's own, and the most it will share; null takes the offer back (its files move off first) */
  setHere(o: { dir?: unknown; bytes?: unknown; kind?: unknown } | null) {
    if (!o) { this.set("here", null); this.openHere(); this.replan(); return; }
    const dir = String(o.dir ?? "").trim(), bytes = Math.floor(Number(o.bytes));
    if (!dir.startsWith("/") || dir.includes("\0")) throw new HoardError(400, "name a folder by its whole path");
    if (!existsSync(dir) || !statSync(dir).isDirectory()) throw new HoardError(400, "there is no such folder on the hub");
    if (!(bytes >= 1024 * 1024)) throw new HoardError(400, "offer at least a megabyte");
    const kind: OfferKind = OFFER_KINDS.includes(o.kind as OfferKind) ? (o.kind as OfferKind) : "extend";
    const was = this.hereOffer();
    if (was && was.dir !== dir && this.copies().some((c) => c.node === HUB && c.state !== "drop"))
      throw new HoardError(409, "the hub's folder still holds files: take the offer back first and let them move, then offer the new folder");
    this.set("here", JSON.stringify({ dir, bytes, kind }));
    this.openHere(); this.replan();
  }
  /** the drives and folders the hub could offer: where a drive is mounted, and beside its own database */
  volumes(): { path: string; free: number; total: number }[] {
    const seen = new Set<string>(), out: { path: string; free: number; total: number }[] = [];
    const add = (p: string) => {
      if (seen.has(p) || !existsSync(p)) return;
      try { if (!statSync(p).isDirectory()) return; const s = statfsSync(p); seen.add(p); out.push({ path: p, free: Number(s.bavail) * Number(s.bsize), total: Number(s.blocks) * Number(s.bsize) }); } catch { /* unreadable */ }
    };
    for (const base of ["/Volumes", "/media", "/mnt", "/run/media"]) {
      let names: string[] = [];
      try { names = readdirSync(base); } catch { continue; }
      for (const n of names) {
        if (n.startsWith(".")) continue;
        const p = join(base, n); add(p);
        if (base !== "/Volumes") { try { for (const m of readdirSync(p)) if (!m.startsWith(".")) add(join(p, m)); } catch { /* not a folder */ } }
      }
    }
    add(join(this.stage.root, ".."));
    return out;
  }

  // ---- the ledger ----
  private rowOf(r: any): Row {
    return { id: r.id, sha: r.sha, size: r.size, name: r.name, mime: r.mime, owner: r.owner, ownerName: r.owner_name, added: r.added, share: r.share,
             friend: r.friend ?? null, link: r.link ?? null, until: r.until ?? null, once: !!r.once, taken: r.taken ?? null, protected: !!r.protected,
             how: r.how === "move" ? "move" : "copy", kind: r.kind, of: r.of ?? null, meta: json(r.meta, {}) };
  }
  private rows(): Row[] { return (this.store.db.prepare("SELECT * FROM hoard_files ORDER BY added DESC, id").all() as any[]).map((r) => this.rowOf(r)); }
  private row(id: string): Row | null { const r = this.store.db.prepare("SELECT * FROM hoard_files WHERE id = ?").get(String(id)); return r ? this.rowOf(r) : null; }
  private blobs(): Blob[] { return this.store.db.prepare("SELECT sha, MAX(size) AS size FROM hoard_files GROUP BY sha").all() as Blob[]; }
  copies(): Copy[] { return this.store.db.prepare("SELECT sha, node, state FROM hoard_copies").all() as Copy[]; }
  private setCopy(sha: string, node: string, state: Copy["state"] | null) {
    if (state === null) this.store.db.prepare("DELETE FROM hoard_copies WHERE sha = ? AND node = ?").run(sha, node);
    else this.store.db.prepare("INSERT INTO hoard_copies (sha, node, state, at) VALUES (?, ?, ?, ?) ON CONFLICT (sha, node) DO UPDATE SET state = excluded.state, at = excluded.at")
      .run(sha, node, state, this.now());
  }
  private holders(): Holder[] { return [...this.nodes.values()].map((n) => ({ id: n.id, kind: n.kind, offer: n.offer, state: n.state, fresh: this.nodes.fresh(n) })); }
  capacity() { return capacityOf(this.holders()); }
  used() { return this.blobs().reduce((s, b) => s + b.size, 0); }
  /** what a caller is shown of a file: never its link's hash; how it is shared NOW */
  shown(f: Row, who: Who | null) {
    const now = this.now(), { link, ...rest } = f;
    void link;
    return { ...rest, shareNow: shareNow(f, now), ended: f.share !== "me" && shareEnded(f, now), mine: !!who && who.key === f.owner };
  }

  /** Where everything should be, made so: the plan's changes kept, the hub's own part of them done at once */
  replan() {
    const blobs = this.blobs();
    for (const c of plan(blobs, this.holders(), this.copies())) this.setCopy(c.sha, c.node, c.state);
    const known = new Set(blobs.map((b) => b.sha));
    for (const c of this.copies()) {
      const n = this.nodes.get(c.node);
      if (!n) { this.setCopy(c.sha, c.node, null); continue; }                 // a node that was forgotten
      if (c.node !== HUB) continue;
      if (c.state === "want" && this.here && this.stage.has(c.sha)) { this.here.adopt(this.stage.path(c.sha), c.sha); this.setCopy(c.sha, HUB, "have"); }
      else if (c.state === "want" && this.here?.has(c.sha)) this.setCopy(c.sha, HUB, "have");
      else if (c.state === "drop") { this.here?.remove(c.sha); this.setCopy(c.sha, HUB, null); }
    }
    // the stage lets go of a blob no file names, and of one some node now holds (the others fetch it from that node)
    const copies = this.copies();
    for (const b of this.stage.list())
      if (!known.has(b.sha) || copies.some((c) => c.sha === b.sha && c.state === "have")) this.stage.remove(b.sha);
    const hub = this.nodes.get(HUB);
    if (hub && this.here) { hub.used = this.here.used(); hub.diskFree = this.here.diskFree(); }
    if (hub && hub.state === "retiring" && !this.copies().some((c) => c.node === HUB)) { this.nodes.delete(HUB); this.here = null; }
  }

  // ---- a file comes in ----
  /** the room a new file has: what is free, and with OLDEST FIRST what cleaning up would free */
  room(): { free: number; reclaim: number } {
    const free = Math.max(0, this.capacity() - this.used());
    const reclaim = this.policy() === "oldest" ? this.rows().filter((f) => !f.protected).reduce((s, f) => s + f.size, 0) : 0;
    return { free, reclaim };
  }
  async take(body: Readable, ask: Ask, who: Who): Promise<{ file: ReturnType<Hoard["shown"]>; link?: string; md5: string }> {
    if (!who.key) throw new HoardError(403, "only the household puts files in THE HOARD");
    if (this.capacity() <= 0) throw new HoardError(507, "THE HOARD has no room yet: no drive or computer offers any (THE ENGINE ROOM, THE HOARD)");
    const { free, reclaim } = this.room();
    const said = Number(ask.size);
    if (Number.isFinite(said) && said > free + reclaim) throw new HoardError(507, "THE HOARD is full: there is not that much room");
    const stageRoom = Math.max(0, this.stage.diskFree() - STAGE_KEEP_FREE);
    const sha = typeof ask.sha === "string" && HASH.test(ask.sha) ? ask.sha : null;
    const put = await this.stage.put(body, { sha, most: Math.min(free + reclaim, stageRoom) });
    const known = this.blobs().some((b) => b.sha === put.sha);
    if (!known) {
      const { go, why } = this.makeRoom(put.size);
      if (go === null || (go.length && this.policy() !== "oldest")) {
        this.stage.remove(put.sha);
        throw new HoardError(507, why === "whole" ? "no one drive of THE HOARD has room for a file that large: a file is kept whole on one of them"   // DRAFT
                                                  : "THE HOARD is full: there is not that much room");
      }
      const rows = this.rows();
      for (const id of go) this.store.db.prepare("DELETE FROM hoard_files WHERE id = ?").run(id);
      this.cleaned = [...go.map((id) => { const f = rows.find((r) => r.id === id)!; return { id, name: f.name, ownerName: f.ownerName, size: f.size, at: this.now(), for: cleanName(ask.name) }; }),
                      ...this.cleaned].slice(0, 100);
    }
    const r = this.add({ ...ask, sha: put.sha, size: put.size }, who);
    return { ...r, md5: put.md5 };
  }
  /** what OLDEST FIRST removed to make room, the latest first (kept while the hub runs) */
  cleaned: { id: string; name: string; ownerName: string; size: number; at: number; for: string }[] = [];
  /** What would have to go for `size` more bytes to be kept: nothing ([]), the oldest unprotected files in turn, or it
   *  cannot be done (null). A file is kept WHOLE on one EXTEND node, so room in the whole of THE HOARD is not enough:
   *  one node must have it ("whole"), as well as the whole having it ("full"). */
  makeRoom(size: number): { go: string[] | null; why: "" | "full" | "whole" } {
    const rows = this.rows(), copies = this.copies().filter((c) => c.state !== "drop");
    const extend = [...this.nodes.values()].filter((n) => n.kind === "extend" && n.state === "on");
    const cap = this.capacity(), gone = new Set<string>();
    const state = () => {
      const left = new Map<string, number>();
      for (const f of rows) if (!gone.has(f.id)) left.set(f.sha, f.size);
      const used = [...left.values()].reduce((a, b) => a + b, 0);
      const room = Math.max(0, ...extend.map((n) => n.offer - copies.filter((c) => c.node === n.id && left.has(c.sha)).reduce((a, c) => a + (left.get(c.sha) ?? 0), 0)));
      return { full: cap - used < size, whole: room < size };
    };
    const queue = rows.filter((f) => !f.protected).sort((a, b) => a.added - b.added || a.id.localeCompare(b.id));
    let why: "" | "full" | "whole" = "";
    for (;;) {
      const s = state();
      if (!s.full && !s.whole) return { go: [...gone], why };
      why ||= s.full ? "full" : "whole";
      const next = queue.shift();
      if (!next) return { go: null, why };
      gone.add(next.id);
    }
  }
  /** a file's row for bytes THE HOARD already has in hand (take() staged them; a making wrote them there) */
  add(ask: Ask & { sha: string; size: number }, who: Who): { file: ReturnType<Hoard["shown"]>; link?: string } {
    const now = this.now(), name = cleanName(ask.name), share: Share = SHARES.includes(ask.share as Share) ? (ask.share as Share) : "me";
    const { until, once } = share === "me" ? { until: null, once: false } : lastingOf({ minutes: ask.minutes as number, once: ask.once === true || ask.once === "1" }, now);
    const token = share === "friend" ? randomBytes(18).toString("base64url") : null;
    const id = randomBytes(8).toString("hex");
    const kind: Kind = KINDS.includes(ask.kind as Kind) ? (ask.kind as Kind) : "file";
    const meta = ask.meta && typeof ask.meta === "object" ? JSON.stringify(ask.meta).slice(0, 8000) : "{}";
    this.store.db.prepare(`INSERT INTO hoard_files (id, sha, size, name, mime, owner, owner_name, added, share, friend, link, until, once, taken, protected, how, kind, of, meta)
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)`)
      .run(id, ask.sha, ask.size, name, mimeOf(name, ask.mime), who.key, who.name.slice(0, 60), now, share,
           share === "friend" ? String(ask.friend ?? "").trim().slice(0, 60) || "a friend" : null, token ? sha256(token) : null, until, once ? 1 : 0,
           ask.protected === true ? 1 : 0, ask.how === "move" ? "move" : "copy", kind, typeof ask.of === "string" ? ask.of.slice(0, 40) : null, meta);
    this.replan();
    return { file: this.shown(this.row(id)!, who), ...(token ? { link: `/hoard/s/${token}` } : {}) };
  }

  // ---- reading the ledger ----
  /** the files a caller may read; a keeper, in THE ENGINE ROOM, sees that every file is there */
  list(who: Who, scope: "mine" | "shared" | "all" = "all") {
    const now = this.now();
    return this.rows().filter((f) => (who.keeper ? canSee(f, who, now) : canRead(f, who, now)))
      .filter((f) => scope === "all" || (scope === "mine") === (f.owner === who.key)).map((f) => this.shown(f, who));
  }
  /** one file, if the caller may read it (403), or it is not there (404) */
  file(id: string, who: Who): Row {
    const f = this.row(id);
    if (!f) throw new HoardError(404, "no such file");
    if (!canRead(f, who, this.now())) throw new HoardError(403, who.link ? "that link no longer opens this" : "that file is not shared with you");   // DRAFT
    return f;
  }
  /** a friend's link: the file it opens, and who the holder is to THE HOARD */
  byLink(token: string): { file: Row; who: Who } {
    const link = sha256(String(token));
    const r = this.store.db.prepare("SELECT * FROM hoard_files WHERE link = ?").get(link);
    if (!r) throw new HoardError(404, "that link opens nothing");
    const f = this.rowOf(r), who: Who = { key: "", name: f.friend ?? "a friend", link };
    if (!canRead(f, who, this.now())) throw new HoardError(403, "that link no longer opens this");   // DRAFT
    return { file: f, who };
  }
  remove(id: string, who: Who) {
    const f = this.row(id);
    if (!f) throw new HoardError(404, "no such file");
    if (!canRemove(f, who)) throw new HoardError(403, "only the one who put a file here removes it");   // DRAFT
    this.store.db.prepare("DELETE FROM hoard_files WHERE id = ?").run(f.id);
    this.replan();
    return f;
  }
  /** its share, its name: the owner's. PROTECTED: the owner's, or a keeper's */
  change(id: string, b: Ask, who: Who): { file: ReturnType<Hoard["shown"]>; link?: string } {
    const f = this.row(id);
    if (!f) throw new HoardError(404, "no such file");
    let link: string | undefined;
    if (b.protected !== undefined) {
      if (!canProtect(f, who)) throw new HoardError(403, "only its owner or a keeper protects a file");   // DRAFT
      this.store.db.prepare("UPDATE hoard_files SET protected = ? WHERE id = ?").run(b.protected === true ? 1 : 0, f.id);
    }
    if (b.name !== undefined || b.share !== undefined) {
      if (!canChange(f, who)) throw new HoardError(403, "only the one who put a file here changes it");   // DRAFT
      if (b.name !== undefined) this.store.db.prepare("UPDATE hoard_files SET name = ? WHERE id = ?").run(cleanName(b.name), f.id);
      if (b.share !== undefined) {
        if (!SHARES.includes(b.share as Share)) throw new HoardError(400, "yourself, the household or a friend");
        const share = b.share as Share, now = this.now();
        const { until, once } = share === "me" ? { until: null, once: false } : lastingOf({ minutes: b.minutes as number, once: b.once === true }, now);
        const token = share === "friend" ? randomBytes(18).toString("base64url") : null;
        this.store.db.prepare("UPDATE hoard_files SET share = ?, friend = ?, link = ?, until = ?, once = ?, taken = NULL WHERE id = ?")
          .run(share, share === "friend" ? String(b.friend ?? "").trim().slice(0, 60) || "a friend" : null, token ? sha256(token) : null, until, once ? 1 : 0, f.id);
        if (token) link = `/hoard/s/${token}`;
      }
    }
    return { file: this.shown(this.row(id)!, who), ...(link ? { link } : {}) };
  }
  /** a download by someone other than its owner finished whole: a once-only share ends here */
  delivered(id: string, who: Who): boolean {
    const f = this.row(id);
    if (!f || !endsShare(f, who, this.now())) return false;
    this.store.db.prepare("UPDATE hoard_files SET taken = ? WHERE id = ? AND taken IS NULL").run(this.now(), f.id);
    return true;
  }
  /** a once-only file: is its share still to be had */
  onceOpen(id: string): boolean { const f = this.row(id); return !!f && f.once && !shareEnded(f, this.now()); }
  /** make room by hand, or see what OLDEST FIRST would remove for `need` bytes (a keeper's) */
  cleanUp(need: number, o: { dry?: boolean } = {}): { ids: string[]; freed: number } | null {
    const rows = this.rows(), free = Math.max(0, this.capacity() - this.used());
    const go = cleanUpFor(rows, free, free + Math.max(0, need));
    if (!go) return null;
    const before = this.used();
    if (!o.dry) { for (const id of go) this.store.db.prepare("DELETE FROM hoard_files WHERE id = ?").run(id); this.replan(); }
    const freed = o.dry ? [...new Set(go.map((id) => rows.find((r) => r.id === id)!))].reduce((s, f) => s + f.size, 0) : before - this.used();
    return { ids: go, freed };
  }

  // ---- THE BEAT: a node says it is here ----
  beat(b: Beat, owner: string): BeatReply {
    const id = String(b.id ?? "").replace(/[^A-Za-z0-9._-]/g, "").slice(0, 60);
    if (!id || id === HUB) throw new HoardError(400, "a node says its own id");
    const was = this.nodes.get(id);
    if (was && was.owner !== owner) throw new HoardError(403, "another key already keeps a node by that name");   // DRAFT
    const offer = b.offer && OFFER_KINDS.includes(b.offer.kind) && Number(b.offer.bytes) > 0 ? { kind: b.offer.kind, bytes: Math.floor(Number(b.offer.bytes)) } : null;
    if (!was && !offer) return {};
    const before = was ? `${was.kind}/${was.offer}/${was.state}` : "";
    const n = this.nodes.hear({ id, name: b.name, caps: ["store"], holds: Number(b.traffic) || 0 }, (w) => ({
      kind: offer?.kind ?? w?.kind ?? "extend", offer: offer?.bytes ?? 0, used: Math.max(0, Number(b.used) || 0), diskFree: Math.max(0, Number(b.diskFree) || 0),
      doors: (Array.isArray(b.doors) ? b.doors : []).map(String).filter((d) => /^https?:\/\/[A-Za-z0-9.\-[\]:]+$/.test(d)).slice(0, 8),
      link: LINKS.includes(b.link as Link) ? (b.link as Link) : "other", up: Number(b.up) > 0 ? Math.min(100_000, Number(b.up)) : null,
      traffic: Math.max(0, Math.floor(Number(b.traffic) || 0)), rests: String(b.rests ?? "").slice(0, 80), ping: w?.ping ?? null, learned: w?.learned ?? {},
      state: offer ? "on" : "retiring", secret: w?.secret ?? randomBytes(24).toString("hex"), owner, added: w?.added ?? this.now() }));
    let changed = before !== `${n.kind}/${n.offer}/${n.state}`;

    const mine = new Map(this.copies().filter((c) => c.node === id).map((c) => [c.sha, c.state]));
    const known = new Set(this.blobs().map((x) => x.sha));
    const shas = (v: unknown) => (Array.isArray(v) ? v.map(String).filter((s) => HASH.test(s)).slice(0, 100_000) : []);
    if (Array.isArray(b.have)) {                     // its whole list: what it lost is wanted again, what it should not hold goes
      const has = new Set(shas(b.have));
      this.listed.add(id);
      for (const [sha, state] of mine) {
        if (state === "have" && !has.has(sha)) { this.setCopy(sha, id, "want"); changed = true; }
        if (state === "drop" && !has.has(sha)) this.setCopy(sha, id, null);
      }
      for (const sha of has) {
        if (!mine.has(sha)) { this.setCopy(sha, id, known.has(sha) ? "have" : "drop"); changed = true; }
        else if (mine.get(sha) === "want") { this.setCopy(sha, id, "have"); changed = true; }
      }
    }
    for (const sha of shas(b.got)) if (known.has(sha)) { this.setCopy(sha, id, "have"); changed = true; if (this.summoned.get(sha) === id) this.summoned.delete(sha); }
    for (const sha of shas(b.gone)) {
      const state = mine.get(sha);
      if (state === "drop") this.setCopy(sha, id, null);
      else if (state === "have") { this.setCopy(sha, id, "want"); changed = true; }
    }
    if (changed) this.replan();
    this.keepNode(n);
    void this.ping(n);

    const size = new Map(this.blobs().map((x) => [x.sha, x.size]));
    const now = this.copies().filter((c) => c.node === id);
    return { secret: n.secret, list: !this.listed.has(id),
      want: now.filter((c) => c.state === "want" && size.has(c.sha)).slice(0, 8).map((c) => ({ sha: c.sha, size: size.get(c.sha)! })),
      drop: now.filter((c) => c.state === "drop").slice(0, 100).map((c) => c.sha),
      send: [...this.summoned].filter(([, node]) => node === id).map(([sha]) => sha).slice(0, 4) };
  }
  private keepNode(n: StoreNode) {
    this.store.db.prepare(`INSERT INTO hoard_nodes (id, name, kind, offer, used, state, secret, owner, doors, link, up, learned, history, seen, added)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET name = excluded.name, kind = excluded.kind, offer = excluded.offer,
      used = excluded.used, state = excluded.state, doors = excluded.doors, link = excluded.link, up = excluded.up, learned = excluded.learned,
      history = excluded.history, seen = excluded.seen`)
      .run(n.id, n.name, n.kind, n.offer, n.used, n.state, n.secret, n.owner, JSON.stringify(n.doors), n.link, n.up, JSON.stringify(n.learned), JSON.stringify(n.history), n.seen, n.added);
  }
  /** how long the hub waits on a node's door, measured now and then (which also says the hub can reach it) */
  async ping(n: StoreNode, again = false) {
    if (!n.doors.length || (!again && this.now() - (this.pinged.get(n.id) ?? 0) < 60_000)) return;
    this.pinged.set(n.id, this.now());
    let best: number | null = null;
    for (const d of n.doors) {
      const t0 = performance.now();
      try { const r = await this.f(`${d}/hoard/ping`, { signal: AbortSignal.timeout(3000) }); if (r.ok) { const ms = performance.now() - t0; best = best === null ? ms : Math.min(best, ms); } } catch { /* not from here */ }
    }
    n.ping = best === null ? null : Math.round(best * 10) / 10;
  }
  /** a keeper retires a node (its files move off), brings it back, or forgets one that is gone for good */
  nodeAct(id: string, act: string) {
    const n = this.nodes.get(id);
    if (!n || id === HUB) throw new HoardError(404, "no such node");
    if (act === "retire") n.state = "retiring";
    else if (act === "back") n.state = n.offer > 0 ? "on" : "retiring";
    else if (act === "forget") {
      if (this.nodes.fresh(n)) throw new HoardError(409, "it is still here: take its offer back on that computer first");   // DRAFT
      n.state = "gone"; this.replan(); this.nodes.delete(id);
      this.store.db.prepare("DELETE FROM hoard_nodes WHERE id = ?").run(id);
      this.store.db.prepare("DELETE FROM hoard_copies WHERE node = ?").run(id);
      this.replan(); return;
    } else throw new HoardError(400, "retire, back or forget");
    this.keepNode(n); this.replan();
  }

  // ---- WHERE FROM ----
  /** where a blob is on the hub itself: its own offer, or the stage */
  find(sha: string): string | null { return this.here?.has(sha) ? this.here.path(sha) : this.stage.has(sha) ? this.stage.path(sha) : null; }
  private nearOf(asker: string): Near { return /^(127\.|::1$|::ffff:127\.)/.test(asker) || isPrivate(asker) ? "here" : isTailnet(asker) ? "tailnet" : "away"; }
  private hubLearned(): Partial<Record<Near, number>> { return json(this.get("hub.learned"), {}); }
  private hubHistory(): boolean[] { return json(this.get("hub.history"), []); }
  /** the nodes that hold a blob and are here now */
  private holding(sha: string): StoreNode[] {
    return this.copies().filter((c) => c.sha === sha && c.state === "have" && c.node !== HUB).map((c) => this.nodes.get(c.node))
      .filter((n): n is StoreNode => !!n && n.state !== "gone" && this.nodes.fresh(n) && !n.rests);
  }
  /** every way a caller could get a file now, the soonest first. `asker` is the address they asked from.
   *  A once-only file, to anyone but its owner, comes only through the hub, which sees it arrive whole. */
  sources(id: string, who: Who, asker: string) {
    const f = this.file(id, who), now = this.now();
    const through = endsShare(f, who, now);
    const seconds = Math.max(60, Math.min(TICKET_S, through ? 900 : TICKET_S, f.until !== null && who.key !== f.owner ? Math.floor((f.until - now) / 1000) : TICKET_S));
    const path = (secret: string, mark = "") => doorPath(secret, f.sha, now, { seconds, mark, name: f.name, mime: f.mime });
    const mark = through ? `o:${f.id}:${who.link ? "l" : who.key}` : "";
    const out: Source[] = [];
    const holders = this.holding(f.sha);
    if (!through) for (const n of holders) {
      const d = doorFor(n.doors, asker);
      if (d) out.push({ node: n.id, name: n.name, url: d.url + path(n.secret), near: d.near, link: n.link, up: n.up, learned: n.learned[d.near] ?? null,
                        traffic: n.traffic, ping: d.near === "here" ? n.ping : null, history: n.history });
    }
    const near = this.nearOf(asker), hub = this.nodes.get(HUB);
    const hubSource = (relay: boolean): Source => ({ node: HUB, name: "the hub", url: path(this.secret(), mark), near, link: hub?.link ?? this.hubLink(), up: hub?.up ?? null,
      learned: relay ? null : this.hubLearned()[near] ?? null, traffic: this.traffic, ping: null, history: this.hubHistory(), ...(relay ? { relay: true } : {}) });
    if (this.find(f.sha)) out.push(hubSource(false));
    else if (holders.some((n) => n.ping !== null)) out.push(hubSource(true));           // the hub can reach a holder's door, and pass it on
    const coming = out.length === 0 && this.summon(f.sha);
    return { file: this.shown(f, who), sources: rank(out, f.size), coming, through };
  }
  private link_: Link | null = null;
  private hubLink(): Link { return (this.link_ ??= linkKind() as Link); }
  /** ask a node that holds a blob to hand it back to the hub's stage (no door of its can be reached) */
  summon(sha: string): boolean {
    if (this.find(sha)) return false;
    const n = this.holding(sha)[0];
    if (!n) return false;
    this.summoned.set(sha, n.id);
    return true;
  }
  /** a holder's door the hub itself can ask (to pass a blob on), the best first */
  relayFrom(sha: string): string | null {
    const able = this.holding(sha).filter((n) => n.ping !== null && n.doors.length);
    const n = this.nodes.ranked((x) => (x.learned.here ?? 50) * reliability(x) / (1 + x.traffic), (x) => able.includes(x))[0];
    if (!n) return null;
    return n.doors[0] + doorPath(n.secret, sha, this.now(), { seconds: 900 });
  }
  /** what a download measured: the node's reliability, and what it can really deliver to an asker that near */
  fetched(r: { node?: unknown; near?: unknown; bytes?: unknown; ms?: unknown; ok?: unknown }) {
    const near: Near = r.near === "tailnet" || r.near === "away" ? r.near : "here", ok = r.ok === true;
    const bytes = Number(r.bytes) || 0, ms = Number(r.ms) || 0;
    if (r.node === HUB || !this.nodes.get(String(r.node))) {
      if (r.node !== HUB) return;
      this.set("hub.history", JSON.stringify(marked(this.hubHistory(), ok)));
      if (ok) { const l = this.hubLearned(); const v = learn(l[near] ?? null, bytes, ms); if (v) { l[near] = v; this.set("hub.learned", JSON.stringify(l)); } }
      return;
    }
    const n = this.nodes.get(String(r.node))!;
    this.nodes.mark(n.id, ok);
    if (ok) { const v = learn(n.learned[near] ?? null, bytes, ms); if (v) n.learned[near] = v; }
    this.keepNode(n);
  }
  /** a blob a node was told to fetch: where the hub has it, or another holder's door it can use instead */
  forNode(sha: string, nodeId: string, asker: string): { file: string } | { redirect: string } | { coming: true } {
    if (!this.copies().some((c) => c.sha === sha && c.node === nodeId && c.state === "want")) throw new HoardError(403, "that blob is not this node's to fetch");
    const file = this.find(sha);
    if (file) return { file };
    for (const n of this.holding(sha)) { const d = doorFor(n.doors, asker); if (d) return { redirect: d.url + doorPath(n.secret, sha, this.now(), { seconds: 3600 }) }; }
    this.summon(sha);
    return { coming: true };
  }
  /** a node hands a blob back (the hub summoned it): into the stage, where whoever waits finds it */
  async handedBack(sha: string, nodeId: string, body: Readable) {
    if (this.summoned.get(sha) !== nodeId) throw new HoardError(403, "the hub did not ask for that");
    await this.stage.put(body, { sha, most: Math.max(0, this.stage.diskFree() - STAGE_KEEP_FREE) });
    this.summoned.delete(sha);
  }

  // ---- what THE ENGINE ROOM and the app are shown ----
  view() {
    const copies = this.copies(), blobs = this.blobs(), cap = this.capacity(), used = this.used();
    const haveOn = (id: string) => copies.filter((c) => c.node === id && c.state === "have").length;
    const wantOn = (id: string) => copies.filter((c) => c.node === id && c.state === "want").length;
    const safe = blobs.filter((b) => copies.some((c) => c.sha === b.sha && c.state === "have")).length;
    const twice = blobs.filter((b) => copies.filter((c) => c.sha === b.sha && c.state === "have").length >= 2).length;
    return {
      capacity: cap, used, free: Math.max(0, cap - used), files: this.rows().length, blobs: blobs.length, safe, twice, waiting: this.stage.list().length,
      policy: this.policy(), here: this.hereOffer(),
      nodes: [...this.nodes.values()].map((n) => ({ id: n.id, name: n.name, kind: n.kind, offer: n.offer, used: n.used, diskFree: n.diskFree, state: n.state,
        fresh: this.nodes.fresh(n), seen: n.seen, link: n.link, up: n.up, traffic: n.traffic, rests: n.rests, ping: n.ping, learned: n.learned,
        doors: n.doors.length, reliability: Math.round(reliability(n) * 100) / 100, has: haveOn(n.id), behind: wantOn(n.id), here: !!n.here })),
    };
  }
}

function json<T>(s: string | null | undefined, otherwise: T): T { try { return s ? (JSON.parse(s) as T) : otherwise; } catch { return otherwise; } }
