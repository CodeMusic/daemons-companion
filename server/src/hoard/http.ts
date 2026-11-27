// BRAIN: none -- storage: THE HOARD's requests, answered from the hub's ledger
// The hub's only: never imported by core.ts or routes.ts.
// C-596 (the user, 2026-11-27): THE HOARD's doors on the hub, kept out of api.ts so that file stays the wiring.
//
//   /hoard/...              THE DOOR: a blob for a ticket (as a node's own door answers, node.ts), a ping, and a friend's
//                           link. No paired key: the ticket or the link is the leave. Never through the relay.
//   /api/hoard/...          the household's: its files, a file put in, its sources, a node's beat. A paired key.
//   /api/engine/hoard/...   THE ENGINE ROOM's: every file, the offers, the nodes, what happens when it is full. A keeper.
//
// Who may read or remove what is rules.ts's to say; this only asks it. Every word a person reads is DRAFT.
import { createWriteStream } from "node:fs";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { Hoard, HoardError } from "./hoard.js";
import type { Job, Makings } from "./makings.js";
import { serveFile, ticketOk, type Beat } from "./node.js";
import { looksOf, sizeSaid, type Who } from "./rules.js";

export type Ctx = {
  method: string; path: string; url: URL;
  device?: string;                 // the device that asked (whose daemon "the daemon on your device" is)
  who: Who | null;                 // the caller as THE HOARD knows them (a paired key's person, or the hub's own machine)
  key: string | null;              // the paired key itself, as THE HOARD names it (a node is bound to it)
  asker: string;                   // the address they asked from
  relayed: boolean;
  send: (res: ServerResponse, status: number, data: unknown) => void;
  body: (req: IncomingMessage) => Promise<any>;
};
export const isHoardDoor = (path: string) => path === "/hoard/ping" || path.startsWith("/hoard/d/") || path.startsWith("/hoard/s/");
export const isHoardApi = (path: string) => path === "/api/hoard" || path.startsWith("/api/hoard/");
export const isHoardEngine = (path: string) => path === "/api/engine/hoard" || path.startsWith("/api/engine/hoard/");
const SAID_MOST = 12 * 1024 * 1024;   // a spoken question: a couple of minutes of any recording
const jobShown = (j: Job) => ({ id: j.id, kind: j.kind, title: j.title, state: j.state, step: j.step, progress: j.progress, at: j.at });
const once = new Set<string>();    // the once-only files being handed over now: one at a time each

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** hand a blob over from the hub: its own copy, or another node's passed on. `done` hears a WHOLE delivery */
async function hand(H: Hoard, req: IncomingMessage, res: ServerResponse, sha: string, o: { mime?: string; name?: string; done?: () => void; whole?: boolean }) {
  H.traffic++;
  let counted = false;
  const free = () => { if (!counted) { counted = true; H.traffic = Math.max(0, H.traffic - 1); } };
  res.on("close", free);
  if (o.whole) delete req.headers.range;                 // a once-only file goes whole or not at all
  const file = H.find(sha);
  if (file) return serveFile(req, res, file, { mime: o.mime, name: o.name, done: (_b, _ms, whole) => { if (whole) o.done?.(); } });
  const from = H.relayFrom(sha);
  if (!from) { free(); res.writeHead(503, { "content-type": "application/json", "retry-after": "10" }); return res.end(JSON.stringify({ error: "no node that holds it is here now", coming: H.summon(sha) })); }
  try {
    const r = await fetch(from, { headers: req.headers.range ? { range: String(req.headers.range) } : {}, signal: AbortSignal.timeout(3_600_000) });
    if (!r.ok || !r.body) throw new Error(`the node answered ${r.status}`);
    const head: Record<string, string> = { "content-type": o.mime || "application/octet-stream", "accept-ranges": "bytes", "cache-control": "private, max-age=3600",
                                           "access-control-allow-origin": "*", "access-control-expose-headers": "content-length, content-range" };
    for (const h of ["content-length", "content-range"]) { const v = r.headers.get(h); if (v) head[h] = v; }
    if (o.name) head["content-disposition"] = `inline; filename*=UTF-8''${encodeURIComponent(o.name)}`;
    res.writeHead(r.status, head);
    await pipeline(Readable.fromWeb(r.body as never), res);
    if (r.status === 200) o.done?.();
  } catch (e) {
    if (!res.headersSent) { res.writeHead(502, { "content-type": "application/json" }); res.end(JSON.stringify({ error: `it could not be passed on: ${(e as Error).message}` })); }
    else res.destroy();
  } finally { free(); }
}

/** THE DOOR on the hub. true: answered */
export async function hoardDoor(H: Hoard, req: IncomingMessage, res: ServerResponse, c: Pick<Ctx, "method" | "path" | "url" | "relayed" | "send">): Promise<boolean> {
  if (!isHoardDoor(c.path)) return false;
  const cors = { "access-control-allow-origin": "*" };
  if (c.relayed) { c.send(res, 403, { error: "THE HOARD's door is on the home network and the tailnet only" }); return true; }
  if (c.method === "OPTIONS") { res.writeHead(204, { ...cors, "access-control-allow-methods": "GET, HEAD", "access-control-allow-headers": "range" }); res.end(); return true; }
  if (c.method !== "GET" && c.method !== "HEAD") { c.send(res, 405, { error: "the door only hands out" }); return true; }
  try {
    if (c.path === "/hoard/ping") { res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store", ...cors }); res.end(JSON.stringify({ ok: true, at: Date.now() })); return true; }
    const d = /^\/hoard\/d\/([0-9a-f]{64})$/.exec(c.path);
    if (d) {
      const q = c.url.searchParams, mark = q.get("m") ?? "";
      if (!ticketOk(H.secret(), d[1], Number(q.get("e")), q.get("t") ?? "", Date.now(), mark)) { c.send(res, 403, { error: "that ticket does not open this" }); return true; }
      const o = /^o:([0-9a-f]{16}):(.+)$/.exec(mark);          // a once-only file: is it still to be had, and by this one alone
      if (o) {
        const who: Who = o[2] === "l" ? { key: "", name: "a friend", link: "?" } : { key: o[2], name: "" };
        if (!H.onceOpen(o[1])) { c.send(res, 403, { error: "it has been downloaded: its share has ended" }); return true; }
        if (once.has(o[1])) { c.send(res, 409, { error: "it is being downloaded now" }); return true; }
        once.add(o[1]);
        res.on("close", () => once.delete(o[1]));
        await hand(H, req, res, d[1], { mime: q.get("c") ?? undefined, name: q.get("n") ?? undefined, whole: true, done: () => { H.delivered(o[1], who); } });
        return true;
      }
      await hand(H, req, res, d[1], { mime: q.get("c") ?? undefined, name: q.get("n") ?? undefined });
      return true;
    }
    const s = /^\/hoard\/s\/([A-Za-z0-9_-]{16,40})(\/file)?$/.exec(c.path);
    if (s) {
      const { file, who } = H.byLink(s[1]);
      if (!s[2]) {                                             // the page a friend lands on (DRAFT, every word)
        const last = file.once ? "It can be downloaded once." : file.until ? `It is shared until ${new Date(file.until).toISOString().slice(0, 16).replace("T", " ")} UTC.` : "";
        res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
        res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(file.name)}</title>
<body style="font-family:Georgia,serif;background:#14121c;color:#efe9f4;max-width:34em;margin:12vh auto;padding:0 1.2em;line-height:1.5">
<p style="letter-spacing:.2em;font-size:.8em;opacity:.7">THE HOARD</p><h1 style="font-weight:normal">${esc(file.name)}</h1>
<p>${esc(file.ownerName)} shared this with ${esc(file.friend ?? "you")}. ${sizeSaid(file.size)}. ${last}</p>
<p><a href="/hoard/s/${s[1]}/file" download="${esc(file.name)}" style="color:#14121c;background:#d9c7f0;padding:.6em 1.1em;border-radius:.4em;text-decoration:none">Download</a></p>`);
        return true;
      }
      if (file.once) {
        if (once.has(file.id)) { c.send(res, 409, { error: "it is being downloaded now" }); return true; }
        once.add(file.id);
        res.on("close", () => once.delete(file.id));
      }
      await hand(H, req, res, file.sha, { mime: file.mime, name: file.name, whole: file.once, done: () => { H.delivered(file.id, who); } });
      return true;
    }
    c.send(res, 404, { error: "not found" });
  } catch (e) { c.send(res, e instanceof HoardError ? e.status : 500, { error: (e as Error).message }); }
  return true;
}

/** the household's requests, and a node's. true: answered */
export async function hoardApi(H: Hoard, req: IncomingMessage, res: ServerResponse, c: Ctx, M: Makings | null = null): Promise<boolean> {
  if (!isHoardApi(c.path)) return false;
  const { method, path, send } = c;
  try {
    const who = c.who;
    if (!who) { send(res, 403, { error: "THE HOARD is the household's: pair this device first" }); return true; }
    // ---- a node of THE HOARD (a paired key of its own) ----
    if (method === "POST" && path === "/api/hoard/beat") {
      if (!c.key) { send(res, 403, { error: "a node of THE HOARD needs a paired key" }); return true; }
      send(res, 200, H.beat((await c.body(req)) as Beat, c.key)); return true;
    }
    const blob = /^\/api\/hoard\/blob\/([0-9a-f]{64})$/.exec(path);
    if (blob) {
      const node = String(req.headers["x-hoard-node"] ?? "").replace(/[^A-Za-z0-9._-]/g, "").slice(0, 60);
      if (!c.key || H.nodes.get(node)?.owner !== c.key) { send(res, 403, { error: "that is a node's own, by its own key" }); return true; }
      if (c.relayed) { send(res, 403, { error: "a node moves its files on the home network and the tailnet only" }); return true; }
      if (method === "GET") {
        const r = H.forNode(blob[1], node, c.asker);
        if ("file" in r) { serveFile(req, res, r.file); return true; }
        if ("redirect" in r) { res.writeHead(307, { location: r.redirect }); res.end(); return true; }
        res.writeHead(503, { "content-type": "application/json", "retry-after": "10" }); res.end('{"error":"it is being brought to the hub","coming":true}'); return true;
      }
      if (method === "POST") { await H.handedBack(blob[1], node, req); send(res, 200, { ok: true }); return true; }
    }
    // ---- the household ----
    if (method === "GET" && path === "/api/hoard") {
      const v = H.view();
      send(res, 200, { capacity: v.capacity, used: v.used, free: v.free, files: H.list(who).length, policy: v.policy, me: { key: who.key, name: who.name },
                       nodes: v.nodes.map((n) => ({ id: n.id, name: n.name, kind: n.kind, fresh: n.fresh, state: n.state, link: n.link, rests: n.rests })) });
      return true;
    }
    if (method === "GET" && path === "/api/hoard/files") {
      const scope = c.url.searchParams.get("scope");
      send(res, 200, { files: H.list(who, scope === "mine" || scope === "shared" ? scope : "all") }); return true;
    }
    if (method === "POST" && path === "/api/hoard/upload") {
      if (c.relayed) { send(res, 403, { error: "a file is put in THE HOARD on the home network or the tailnet" }); return true; }
      const q = c.url.searchParams, ask = Object.fromEntries(["name", "mime", "share", "friend", "minutes", "how", "sha"].map((k) => [k, q.get(k) ?? undefined]));
      const r = await H.take(req, { ...ask, once: q.get("once") === "1", protected: q.get("protected") === "1" ? true : undefined,
                                    size: req.headers["content-length"] ? Number(req.headers["content-length"]) : undefined }, who);
      send(res, 200, r); return true;
    }
    // ---- MAKINGS: queued, built one at a time, kept as creations (C-605) ----
    if (M && method === "POST" && path === "/api/hoard/make") { const b = await c.body(req); send(res, 200, { job: jobShown(M.ask(b.kind, b, who, c.device ?? "")) }); return true; }
    if (M && method === "GET" && path === "/api/hoard/jobs") { send(res, 200, M.list(who)); return true; }
    const job = /^\/api\/hoard\/jobs\/([0-9a-f]{16})\/(stop|again)$/.exec(path);
    if (M && job && method === "POST") { send(res, 200, job[2] === "stop" ? { ok: M.stop(job[1], who) } : { job: jobShown(M.again(job[1], who)) }); return true; }
    const f = /^\/api\/hoard\/files\/([0-9a-f]{16})(?:\/(remove|sources|fetched|text|ask))?$/.exec(path);
    if (f) {
      const id = f[1], act = f[2];
      if (M && method === "POST" && act === "ask") {            // C-606: ASK A FILE, typed -- or spoken, the recording as the request's body
        H.file(id, who);
        if (c.url.searchParams.get("spoken") !== "1") { send(res, 200, { job: jobShown(M.ask("answer", { of: id, text: (await c.body(req)).text }, who, c.device ?? "")) }); return true; }
        const said = join(M.inbox(), `said-${randomBytes(8).toString("hex")}`);
        let size = 0;
        await pipeline(req, async function* (src) { for await (const ch of src) { size += ch.length; if (size > SAID_MOST) throw new HoardError(413, "that is too long a question"); yield ch; } }, createWriteStream(said));
        if (size < 200) throw new HoardError(400, "nothing was said");
        send(res, 200, { job: jobShown(M.ask("answer", { of: id, said }, who, c.device ?? "")) }); return true;
      }
      if (method === "GET" && !act) { send(res, 200, { file: H.shown(H.file(id, who), who) }); return true; }
      if (method === "POST" && !act) { send(res, 200, H.change(id, await c.body(req), who)); return true; }
      if (method === "POST" && act === "remove") { const gone = H.remove(id, who); send(res, 200, { ok: true, removed: gone.id }); return true; }
      if (method === "GET" && act === "sources") { send(res, 200, H.sources(id, who, c.asker)); return true; }
      if (method === "POST" && act === "fetched") { H.file(id, who); H.fetched(await c.body(req)); send(res, 200, { ok: true }); return true; }
      if (method === "GET" && act === "text") {
        const file = H.file(id, who);
        if (looksOf(file.mime) !== "text") { send(res, 415, { error: "that is not a text file" }); return true; }
        send(res, 200, await H.text(file.sha, file.size)); return true;
      }
    }
    send(res, 404, { error: "not found" });
  } catch (e) { send(res, (e as { status?: number }).status ?? 500, { error: (e as Error).message }); }
  return true;
}

/** THE ENGINE ROOM's requests: a keeper's. true: answered */
export async function hoardEngine(H: Hoard, req: IncomingMessage, res: ServerResponse, c: Ctx): Promise<boolean> {
  if (!isHoardEngine(c.path)) return false;
  const { method, path, send } = c;
  try {
    const keeper = H.keeper(c.who);
    if (!keeper) { send(res, 403, { error: "THE HOARD is managed by its keepers" }); return true; }
    const name = path.slice("/api/engine/hoard".length);
    if (method === "GET" && name === "") {
      send(res, 200, { ...H.view(), all: H.list(keeper), volumes: H.volumes(), keys: H.keys(), keepers: H.keepers(), cleaned: H.cleaned.slice(0, 20),
                       me: { key: keeper.key, name: keeper.name } });
      return true;
    }
    if (method !== "POST") { send(res, 404, { error: "not found" }); return true; }
    const b = await c.body(req);
    if (name === "/offer") { H.setHere(b.off === true ? null : { dir: b.dir, bytes: Math.round(Number(b.gb) * 1e9), kind: b.kind }); send(res, 200, H.view()); return true; }
    if (name === "/policy") { H.setPolicy(b.full); send(res, 200, H.view()); return true; }
    if (name === "/protect") { send(res, 200, H.change(String(b.id ?? ""), { protected: b.on === true }, keeper)); return true; }
    if (name === "/delete") {
      const ids: string[] = Array.isArray(b.ids) ? b.ids.map(String).slice(0, 500) : [];
      const gone = ids.filter((id) => { try { H.remove(id, keeper); return true; } catch { return false; } });
      send(res, 200, { removed: gone, ...H.view() }); return true;
    }
    if (name === "/cleanup") {
      const r = H.cleanUp(Math.max(0, Math.round(Number(b.gb) * 1e9) || 0), { dry: b.dry === true });
      if (!r) { send(res, 409, { error: "that much cannot be freed: the rest is PROTECTED" }); return true; }
      send(res, 200, { ...r, ...H.view() }); return true;
    }
    if (name === "/node") { H.nodeAct(String(b.id ?? ""), String(b.act ?? "")); send(res, 200, H.view()); return true; }
    if (name === "/person") { H.setPerson(String(b.key ?? ""), b.person ? String(b.person) : null, typeof b.name === "string" ? b.name : undefined); send(res, 200, { keys: H.keys() }); return true; }
    if (name === "/keepers") { H.setKeepers(b.keys); send(res, 200, { keys: H.keys(), keepers: H.keepers() }); return true; }
    send(res, 404, { error: "not found" });
  } catch (e) { send(res, (e as { status?: number }).status ?? 500, { error: (e as Error).message }); }
  return true;
}
