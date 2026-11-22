// C-221: THE LINK CABLE -- the hub passes a player's screen, buttons and the cable's state to the two linked games
// (seer/linkhost/), the screen still deflated; never a byte into a game's memory, never through the relay.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { deflateSync, inflateSync } from "node:zlib";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeServer } from "../src/api.js";
import { DEFAULTS } from "../src/config.js";
import { LINK_PAGE, linkHost, linkTarget } from "../src/game/linkcable.js";
import { buildSave } from "./build_save.js";

const asked: string[] = [];
const screen = new Uint8Array(240 * 160 * 4).fill(7);
const mk = (player: string, trainerId: number) => buildSave({ player, trainerId, slots: [{ counter: 1, party: [{ personality: 9, otId: trainerId, species: 1, nickname: "PIP", level: 5 }] }, { counter: 0, party: [] }] });
const seated: Uint8Array[] = [mk("FRIEND", 9), mk("OTHER", 11)];
const fake = createServer((req: IncomingMessage, res) => {   // linkhost, as far as the hub can tell
  asked.push(`${req.method} ${req.url ?? ""}`.replace(/^GET /, ""));
  const s = /^\/s\/(\d)$/.exec(req.url ?? "");
  if (s && req.method === "PUT") {
    const parts: Buffer[] = [];
    req.on("data", (b: Buffer) => parts.push(b));
    req.on("end", () => { seated[Number(s[1])] = new Uint8Array(Buffer.concat(parts)); res.writeHead(200); res.end("ok"); });
    return;
  }
  if (s) { res.writeHead(200, { "Content-Type": "application/octet-stream" }); return res.end(seated[Number(s[1])]); }
  if (/^\/v\/\d$/.test(req.url ?? "")) {                  // video: a frame, a still second, another frame
    res.writeHead(200, { "Content-Type": "application/x-daemons-frames" });
    const z = deflateSync(screen, { level: 1 }), n = Buffer.alloc(4);
    n.writeUInt32BE(z.length);
    res.write(Buffer.concat([n, z, Buffer.alloc(4), n, z]));
    return res.end();
  }
  if (req.url?.startsWith("/f/")) {
    const z = /deflate/.test(String(req.headers["accept-encoding"] ?? ""));
    res.writeHead(200, { "Content-Type": "application/octet-stream", ...(z ? { "Content-Encoding": "deflate" } : {}) });
    return res.end(z ? deflateSync(screen, { level: 1 }) : screen);
  }
  if (req.url === "/state") { res.writeHead(200, { "Content-Type": "application/json" }); return res.end('{"frames":[1,2],"attached":2}'); }
  res.writeHead(200, { "Content-Type": "text/plain" }); res.end("ok");
});
const dir = mkdtempSync(join(tmpdir(), "link-")), own = join(dir, "own.sav");
writeFileSync(own, mk("ROVER", 7));
const server = makeServer({ ...DEFAULTS, database: join(dir, "c.sqlite"), savePath: own });
let port = 0;
beforeAll(async () => {
  await new Promise<void>((r) => fake.listen(0, "127.0.0.1", () => r()));
  process.env.DAEMONS_LINKHOST = `http://127.0.0.1:${(fake.address() as AddressInfo).port}`;
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  port = (server.address() as AddressInfo).port;
});
afterAll(() => { delete process.env.DAEMONS_LINKHOST; server.close(); fake.close(); });
const here = (p: string, init?: RequestInit) => fetch(`http://127.0.0.1:${port}${p}`, init);

describe("C-221: what the hub passes on", () => {
  it("names only the screen, the buttons and the state, for two players", () => {
    expect(linkTarget("/api/link/f/0")).toBe("/f/0");
    expect(linkTarget("/api/link/f/1")).toBe("/f/1");
    expect(linkTarget("/api/link/f/2")).toBeNull();
    expect(linkTarget("/api/link/v/1")).toBe("/v/1");
    expect(linkTarget("/api/link/v/2")).toBeNull();
    expect(linkTarget("/api/link/k/1/9")).toBe("/k/1/9");
    expect(linkTarget("/api/link/k/0/4095")).toBe("/k/0/1023");        // only the GBA's ten buttons
    expect(linkTarget("/api/link/state")).toBe("/state");
    expect(linkTarget("/api/link/p/0/2031e00/8/1")).toBeNull();        // never a byte into a game's memory
    expect(linkTarget("/api/link/../p/0")).toBeNull();
  });
  it("takes its address from the setting, or the environment, and only an http one", () => {
    expect(linkHost("http://roverbyteseer:4795/", "")).toBe("http://roverbyteseer:4795");
    expect(linkHost(null, "http://100.67.234.4:4795")).toBe("http://100.67.234.4:4795");
    expect(linkHost("file:///etc/passwd", "")).toBeNull();
    expect(linkHost("http://a b", "")).toBeNull();
    expect(linkHost(null, "")).toBeNull();
  });
});

describe("C-221: through the hub", () => {
  it("gives a screen still deflated, and every byte of it", async () => {
    const r = await here("/api/link/f/1");                              // fetch asks for deflate and undoes it
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(new Uint8Array(await r.arrayBuffer())).toEqual(screen);
    expect(asked.at(-1)).toBe("/f/1");
  });
  it("passes the screen on as video, each changed frame deflated and led by its length", async () => {
    const r = await here("/api/link/v/0");
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("application/x-daemons-frames");
    const b = Buffer.from(await r.arrayBuffer()), frames: Buffer[] = [];
    for (let at = 0; at < b.length;) {
      const n = b.readUInt32BE(at); at += 4;
      if (n) { frames.push(inflateSync(b.subarray(at, at + n))); at += n; }
    }
    expect(frames).toHaveLength(2);
    expect(new Uint8Array(frames[1])).toEqual(screen);
    expect(asked.at(-1)).toBe("/v/0");
  });
  it("passes the buttons and the state on, and refuses the memory", async () => {
    expect((await here("/api/link/k/0/129")).status).toBe(200);
    expect(asked.at(-1)).toBe("/k/0/129");
    expect(await (await here("/api/link/state")).json()).toEqual({ frames: [1, 2], attached: 2 });
    const n = asked.length;
    expect((await here("/api/link/p/0/2031e00/8/1")).status).toBe(404);
    expect(asked.length).toBe(n);
  });
  it("is never reached through the relay", async () => {
    expect((await here("/link/", { headers: { "x-companion-relay": "anything" } })).status).toBe(403);
  });
  it("keeps where linkhost is, set from this machine, and only an http address", async () => {
    const set = (host: string) => here("/api/link/host", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ host }) });
    expect((await set("file:///etc")).status).toBe(400);
    expect(await (await set("http://roverbyteseer:4795/")).json()).toEqual({ host: "http://roverbyteseer:4795" });
    expect(await (await here("/api/link/host")).json()).toEqual({ host: "http://roverbyteseer:4795" });
    await set(process.env.DAEMONS_LINKHOST!);                             // back to the fake, for the rest
  });
  it("serves the page a phone shows, its requests the hub's own", async () => {
    const r = await here("/link/");
    expect(r.status).toBe(200);
    const page = await r.text();
    expect(page).toBe(LINK_PAGE);
    expect(page).toContain('fetch("/api/link/f/" + seat');
    expect(page).not.toContain("/p/");
    expect(page).toContain("DRAFT");
  });
});

describe("C-221: each player's own save", () => {
  const post = (p: string, b: object) => here(p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });
  it("sits a save the companion knows in a seat, whole", async () => {
    const { saves } = await (await here("/api/saves")).json();
    const r = await post("/api/link/seat", { seat: 1, id: saves[0].id });
    expect(r.status).toBe(200);
    expect((await r.json()).save.name).toBe("ROVER");
    expect(asked.at(-1)).toBe("PUT /s/1");
    expect(Buffer.from(seated[1]).equals(readFileSync(own))).toBe(true);
  });
  it("brings a seat's save home as a kept copy, and never writes anyone's own file", async () => {
    const before = readFileSync(own);
    const r = await (await post("/api/link/home", { seat: 0 })).json();
    expect(r.saves.find((x: any) => x.id === r.id)).toMatchObject({ kind: "kept", name: "FRIEND", label: "LINK CABLE · PLAYER 1" });
    expect(readFileSync(own).equals(before)).toBe(true);
    const again = await (await post("/api/link/home", { seat: 0 })).json();   // the same game comes back over its own copy
    expect(again.saves.filter((x: any) => x.name === "FRIEND")).toHaveLength(1);
  });
  it("refuses a seat that is not there, a save it does not know, and a seat with no whole save", async () => {
    expect((await post("/api/link/seat", { seat: 2, id: "x" })).status).toBe(400);
    expect((await post("/api/link/seat", { seat: 0, id: "nothing" })).status).toBe(404);
    seated[1] = new Uint8Array(10);
    expect((await post("/api/link/home", { seat: 1 })).status).toBe(502);
  });
});
