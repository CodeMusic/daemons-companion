// C-221: THE LINK CABLE -- the hub passes a player's screen, buttons and the cable's state to the two linked games
// (seer/linkhost/), the screen still deflated; never a byte into a game's memory, never through the relay.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { deflateSync } from "node:zlib";
import { makeServer } from "../src/api.js";
import { DEFAULTS } from "../src/config.js";
import { LINK_PAGE, linkHost, linkTarget } from "../src/linkcable.js";

const asked: string[] = [];
const screen = new Uint8Array(240 * 160 * 4).fill(7);
const fake = createServer((req: IncomingMessage, res) => {   // linkhost, as far as the hub can tell
  asked.push(req.url ?? "");
  if (req.url?.startsWith("/f/")) {
    const z = /deflate/.test(String(req.headers["accept-encoding"] ?? ""));
    res.writeHead(200, { "Content-Type": "application/octet-stream", ...(z ? { "Content-Encoding": "deflate" } : {}) });
    return res.end(z ? deflateSync(screen, { level: 1 }) : screen);
  }
  if (req.url === "/state") { res.writeHead(200, { "Content-Type": "application/json" }); return res.end('{"frames":[1,2],"attached":2}'); }
  res.writeHead(200, { "Content-Type": "text/plain" }); res.end("ok");
});
const server = makeServer({ ...DEFAULTS, database: ":memory:", savePath: null });
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
