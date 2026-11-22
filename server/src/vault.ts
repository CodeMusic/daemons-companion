// C-434: THE VAULT (DRAFT name) -- PRAXIS's encrypted relay and backup, on its own machine (roverbyteseer for now; any
// address later, the tailnet a fallback). It keeps each household's spaces SEALED and holds no key: every event it is
// sent is one it cannot read (@daemons/praxis seal.ts), kept by an ordinary Praxis that orders it and passes it on as it
// came, and every blob is kept under a name that says nothing of it. Node only (vault_main.ts runs it).
//
// It answers the same calls as the hub's PRAXIS exchange (praxissync.ts), so hubPeer() reaches it as it reaches a hub:
//   POST /api/praxis/have | missing | receive | wanted | holds      GET | PUT /api/praxis/blob/<name>
//   GET  /vault/status       that it is up; with a household's token, what that household keeps here
// Every call but the bare status carries a household's token (Authorization: Bearer ...). The vault keeps only each
// token's SHA-256 (vault.json beside the households' files), and each household's spaces in a database of their own.
import { createHash, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { HASH, isSealed, keepSealed, Praxis, type BlobPeer, type Db, type PxEvent } from "@daemons/praxis";
import { folderBlobs } from "./blobstore.js";
import { MOST_EVENTS, MOST_HASHES } from "./praxissync.js";

/** the households a vault keeps: each one's name and the SHA-256 of its token */
export interface VaultBook { households: Record<string, { token: string; since: string }> }
const NAME = /^[a-z0-9][a-z0-9-]{0,40}$/;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

export const readBook = (dir: string): VaultBook => {
  const f = join(dir, "vault.json");
  return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : { households: {} };
};

/** one household's spaces, as the vault keeps them */
class Household {
  readonly px: Praxis;
  readonly blobs: BlobPeer;
  constructor(dir: string, name: string) {
    mkdirSync(join(dir, "households"), { recursive: true, mode: 0o700 });
    this.px = new Praxis(new DatabaseSync(join(dir, "households", `${name}.sqlite`)) as unknown as Db, { replica: "vault", actor: "vault" });
    this.blobs = keepSealed(folderBlobs(join(dir, "households", `${name}-blobs`)));
  }
  counts() {
    const have = this.px.have();
    return { spaces: Object.keys(have).length, events: this.px.waiting() };
  }
}

const send = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};
async function read(req: IncomingMessage, most: number): Promise<Buffer | null> {
  const chunks: Buffer[] = [];
  let n = 0;
  for await (const c of req) {
    n += (c as Buffer).length;
    if (n > most) return null;
    chunks.push(c as Buffer);
  }
  return Buffer.concat(chunks);
}
const strings = (v: unknown, most: number): string[] | null =>
  Array.isArray(v) && v.length <= most && v.every((x) => typeof x === "string") ? (v as string[]) : null;

/** THE VAULT's HTTP server, keeping its households in `dir` (vault.json and households/) */
export function makeVault(dir: string): Server {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const open = new Map<string, Household>();
  /** the household a request's token is, or null */
  const whose = (req: IncomingMessage): Household | null => {
    const m = /^Bearer (.+)$/.exec(req.headers.authorization ?? "");
    if (!m) return null;
    const asked = Buffer.from(sha(m[1]));
    for (const [name, h] of Object.entries(readBook(dir).households)) {
      const known = Buffer.from(h.token);
      if (NAME.test(name) && known.length === asked.length && timingSafeEqual(known, asked)) {
        if (!open.has(name)) open.set(name, new Household(dir, name));
        return open.get(name)!;
      }
    }
    return null;
  };

  return createServer(async (req, res) => {
    try {
      const path = (req.url ?? "/").split("?")[0];
      if (path === "/vault/status" && req.method === "GET") {
        const h = whose(req);
        return send(res, 200, { vault: "THE VAULT", keeps: "sealed events and blobs, never a key", ...(h ? h.counts() : {}) });
      }
      if (!path.startsWith("/api/praxis/")) return send(res, 404, { error: "THE VAULT answers PRAXIS's exchange only" });
      const h = whose(req);
      if (!h) return send(res, 401, { error: "a household's token, please" });   // DRAFT
      const name = path.slice("/api/praxis/".length), blob = /^blob\/([0-9a-f]{64})$/.exec(name);
      if (blob && req.method === "GET") {
        const bytes = await h.blobs.blob(blob[1]);
        if (!bytes) return send(res, 404, { error: "no such blob here" });
        res.writeHead(200, { "content-type": "application/octet-stream", "content-length": bytes.length });
        return res.end(bytes);
      }
      if (blob && req.method === "PUT") {
        const bytes = await read(req, 64 * 1024 * 1024 + 64);
        if (!bytes) return send(res, 413, { error: "a blob is at most 64 MB" });
        return send(res, 200, { kept: await h.blobs.putBlob(blob[1], new Uint8Array(bytes)) });
      }
      if (blob) return send(res, 405, { error: "a blob is fetched with GET and given with PUT" });
      if (req.method !== "POST") return send(res, 405, { error: "PRAXIS's exchange is asked with POST" });
      const raw = await read(req, 16 * 1024 * 1024);
      if (!raw) return send(res, 413, { error: "too much in one call" });
      let b: any;
      try { b = JSON.parse(raw.toString("utf8") || "{}"); } catch { return send(res, 400, { error: "JSON, please" }); }
      const spaces = b?.spaces === undefined ? undefined : strings(b.spaces, MOST_HASHES);
      if (spaces === null) return send(res, 400, { error: "spaces: a list of space ids" });
      switch (name) {
        case "have": return send(res, 200, { have: h.px.have(spaces) });
        case "missing": {
          const limit = Number.isInteger(b?.limit) && b.limit > 0 ? Math.min(b.limit, MOST_EVENTS) : MOST_EVENTS;
          if (typeof b?.have !== "object" || b.have === null) return send(res, 400, { error: "missing { have }" });
          return send(res, 200, { events: h.px.missing(b.have, { spaces, limit }) });
        }
        case "receive": {
          if (!Array.isArray(b?.events) || b.events.length > MOST_EVENTS) return send(res, 400, { error: `receive { events }: at most ${MOST_EVENTS}` });
          // only sealed events: an open one sent here by mistake is refused, never kept where it could be read
          const events = b.events as PxEvent[], sealed = events.filter((e) => e && isSealed(e));
          const r = h.px.receive(sealed);
          return send(res, 200, { received: { ...r, rejected: r.rejected + events.length - sealed.length } });
        }
        case "wanted": return send(res, 200, { hashes: [] });
        case "holds": {
          const hashes = strings(b?.hashes, MOST_HASHES);
          if (!hashes) return send(res, 400, { error: `holds { hashes }: at most ${MOST_HASHES}` });
          return send(res, 200, { hashes: await h.blobs.holds(hashes.filter((x) => HASH.test(x))) });
        }
      }
      return send(res, 404, { error: "no such call in PRAXIS's exchange" });
    } catch (e) {
      return send(res, 500, { error: String((e as Error)?.message ?? e) });
    }
  });
}

/** a new household: its name and a fresh token, the token shown once (only its SHA-256 is kept) */
export function tokenFor(token: string) { return sha(token); }
