// C-499: THE ENGINE ROOM from the outside world -- its public name, taken only through a proxy, and from there a paired
// key or nothing (no board's key, no device door); the page, its pictures and a pairing code open without one
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { request } from "node:http";
import { makeServer, publicAdminHost } from "../src/api.js";
import { DEFAULTS } from "../src/shared/config.js";

const server = makeServer({ ...DEFAULTS, database: ":memory:", savePath: null });
let port = 0;
beforeAll(async () => { await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r())); port = (server.address() as AddressInfo).port; });
afterAll(() => server.close());

// a request as the Mac mini's Apache sends it: the public Host kept, X-Forwarded-For added
function ask(method: string, path: string, headers: Record<string, string> = {}, body?: string): Promise<{ status: number; text: string }> {
  return new Promise((done, fail) => {
    const r = request({ host: "127.0.0.1", port, method, path, headers: { ...(body ? { "content-type": "application/json" } : {}), ...headers } }, (res) => {
      let text = ""; res.on("data", (c) => (text += c)); res.on("end", () => done({ status: res.statusCode ?? 0, text }));
    });
    r.on("error", fail); if (body) r.write(body); r.end();
  });
}
const OUT = { host: "engine.daemons.codemusic.ca", "x-forwarded-for": "203.0.113.9" };

describe("THE ENGINE ROOM from outside (C-499)", () => {
  it("knows its public name, and only that", () => {
    expect(publicAdminHost("engine.daemons.codemusic.ca")).toBe(true);
    expect(publicAdminHost("https://engine.daemons.codemusic.ca")).toBe(true);
    expect(publicAdminHost("evil.example")).toBe(false);
    expect(publicAdminHost("engine.daemons.codemusic.ca.evil.example")).toBe(false);
  });

  it("takes the public name only through a proxy", async () => {
    expect((await ask("GET", "/admin/", { host: "engine.daemons.codemusic.ca" })).status).toBe(403);   // no proxy's hop
    expect((await ask("GET", "/admin/", OUT)).status).toBe(200);
    expect((await ask("GET", "/admin/", { host: "evil.example", "x-forwarded-for": "203.0.113.9" })).status).toBe(403);
  });

  it("opens the API to a paired key only -- not to this machine's own address, not to the device door", async () => {
    // from this machine, without a key, the API answers (as it always has) ...
    expect((await ask("GET", "/api/games")).status).toBe(200);
    // ... but through the public name, nothing does
    expect((await ask("GET", "/api/games", OUT)).status).toBe(401);
    expect((await ask("GET", "/api/device/state", OUT)).status).toBe(401);
    expect((await ask("POST", "/api/device/hello", OUT, "{}")).status).toBe(401);
    expect((await ask("GET", "/api/games", { ...OUT, authorization: "Bearer not-a-key" })).status).toBe(401);
    // a pairing code may be typed, and the page's pictures shown
    const pair = await ask("POST", "/api/pair", { ...OUT, origin: "https://engine.daemons.codemusic.ca" }, JSON.stringify({ code: "000000" }));
    expect(pair.status).toBe(403);                         // a wrong code, refused as a wrong code -- not as the outside
    expect(pair.text).toMatch(/code/);
    expect((await ask("GET", "/art/species/1.png", OUT)).status).not.toBe(401);
    // a page elsewhere may not ask through it
    expect((await ask("GET", "/api/games", { ...OUT, origin: "https://evil.example" })).status).toBe(403);
  });

  it("opens the API to a key paired through the public name", async () => {
    const code = JSON.parse((await ask("POST", "/api/pair/code", {}, "{}")).text).code;   // made at home, on this machine
    const pair = await ask("POST", "/api/pair", { ...OUT, origin: "https://engine.daemons.codemusic.ca" }, JSON.stringify({ code, name: "THE ENGINE ROOM" }));
    expect(pair.status).toBe(200);
    const token = JSON.parse(pair.text).token;
    const games = await ask("GET", "/api/games", { ...OUT, authorization: `Bearer ${token}` });
    expect(games.status).toBe(200);
    expect(JSON.parse(games.text)).toHaveProperty("playing");
  });
});
