// The review (2026-10-18): a web page in the user's browser could drive the companion -- this machine is trusted and every
// answer allowed any origin. A browser's request must now come from a page of ours, to a Host of ours, at a sane size.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { request } from "node:http";
import { makeServer, ourHost } from "../src/api.js";
import { DEFAULTS } from "../src/config.js";

describe("whose pages and names the companion answers", () => {
  it("knows its own names, and no one else's", () => {
    for (const h of ["", "localhost:4730", "127.0.0.1", "[::1]:4730", "192.168.2.76:4730", "M2cBook.local:4730",
                     "mac.tail1234.ts.net", "christophers-m2-pro-macbook-pro:4730", "host.docker.internal:4730",
                     "http://localhost:8081", "http://192.168.2.76:8081"])
      expect(ourHost(h), h).toBe(true);
    for (const h of ["https://evil.example", "evil.example:4730", "localhost.evil.example", "null", "http://rebind.attacker.com:4730"])
      expect(ourHost(h), h).toBe(false);
  });
});

describe("the server's door to a browser", () => {
  const server = makeServer({ ...DEFAULTS, database: ":memory:", savePath: null });
  let port = 0;
  beforeAll(async () => { await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r())); port = (server.address() as AddressInfo).port; });
  afterAll(() => server.close());
  const ask = (path: string, headers: Record<string, string>, method = "GET", body?: string) => new Promise<number>((res, rej) => {
    const r = request({ host: "127.0.0.1", port, path, method, headers }, (a) => { a.resume(); res(a.statusCode ?? 0); });
    r.on("error", rej); if (body) r.write(body); r.end();
  });

  it("answers the companion's own site", async () => {
    expect(await ask("/api/settings/relay", { origin: "http://localhost:8081" })).toBe(200);
  });
  it("refuses another site's page", async () => {
    expect(await ask("/api/settings/relay", { origin: "https://evil.example" })).toBe(403);
    expect(await ask("/api/pair/code", { origin: "https://evil.example", "content-type": "text/plain" }, "POST", "{}")).toBe(403);
  });
  it("refuses a name that is not the companion's (DNS rebinding)", async () => {
    expect(await ask("/api/settings/relay", { host: `rebind.attacker.com:${port}` })).toBe(403);
  });
  it("refuses a body too big to be one of ours", async () => {
    expect(await ask("/api/device/interact", { "content-type": "application/json" }, "POST", "x".repeat(4 * 1024 * 1024 + 10))).toBe(413);
  });
});
