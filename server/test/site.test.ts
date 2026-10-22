// C-170: the site from the companion itself, for the home network and the tailnet -- its files to anyone, the API only
// to a key.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { networkInterfaces, tmpdir } from "node:os";
import { join } from "node:path";
import { makeServer } from "../src/api.js";
import { DEFAULTS } from "../src/config.js";
import { siteFile } from "../src/site.js";

const dir = mkdtempSync(join(tmpdir(), "site-"));
const siteDir = join(dir, "site"), artDir = join(dir, "art");
mkdirSync(join(siteDir, "_expo"), { recursive: true }); mkdirSync(artDir);
writeFileSync(join(siteDir, "index.html"), "<!doctype html><title>companion</title>");
writeFileSync(join(siteDir, "_expo", "entry-0123456789abcdef.js"), "console.log(1)");
writeFileSync(join(dir, "secret.txt"), "not for the network");
copyFileSync(new URL("../data/art/rovercub.png", import.meta.url), join(artDir, "rovercub_front.png"));
const server = makeServer({ ...DEFAULTS, database: ":memory:", savePath: null, siteDir, artDir });
let port = 0;
beforeAll(async () => {
  await new Promise<void>((r) => server.listen(0, "0.0.0.0", () => r()));
  port = (server.address() as AddressInfo).port;
});
afterAll(() => server.close());

describe("the site's files (C-170)", () => {
  it("never leave the site's folder", () => {
    expect(siteFile(siteDir, "/index.html")).toBe(join(siteDir, "index.html"));
    expect(siteFile(siteDir, "/")).toBe(join(siteDir, "index.html"));
    expect(siteFile(siteDir, "/../secret.txt")).toBeNull();
    expect(siteFile(siteDir, "/%2e%2e/secret.txt")).toBeNull();
    expect(siteFile(siteDir, "/_expo")).toBeNull();                       // a folder is not a file
    expect(siteFile(siteDir, "/%E0%A4%A")).toBeNull();                    // not an escape at all
  });
});

const lan = Object.values(networkInterfaces()).flat().find((i) => i && i.family === "IPv4" && !i.internal)?.address;
describe.skipIf(!lan)("from another computer (C-170)", () => {
  const at = (p: string) => `http://${lan}:${port}${p}`;
  it("serves the site without a key, its routes as the page, and its bundles kept", async () => {
    const page = await fetch(at("/"));
    expect(page.status).toBe(200);
    expect(page.headers.get("content-type")).toMatch(/text\/html/);
    expect(page.headers.get("cache-control")).toBe("no-cache");
    expect(await (await fetch(at("/goals"))).text()).toContain("<title>companion</title>");
    const js = await fetch(at("/_expo/entry-0123456789abcdef.js"));
    expect(js.headers.get("content-type")).toMatch(/javascript/);
    expect(js.headers.get("cache-control")).toMatch(/immutable/);
    expect((await fetch(at("/missing.js"))).status).toBe(404);
    expect((await fetch(at("/%2e%2e/secret.txt"))).status).toBe(404);
  });

  it("keeps the API behind a key; the pictures stay open, as they are to every board (the device's door)", async () => {
    expect((await fetch(at("/api/today"))).status).toBe(403);
    expect((await fetch(at("/art/rovercub_front.png"))).status).toBe(200);
    const { code } = await (await fetch(`http://127.0.0.1:${port}/api/pair/code`, { method: "POST" })).json();
    const paired = await fetch(at("/api/pair"), { method: "POST", headers: { "content-type": "application/json", origin: at("") },
                                                  body: JSON.stringify({ code, name: "a browser" }) });
    const { token } = await paired.json();
    expect((await fetch(at("/api/today"), { headers: { authorization: `Bearer ${token}` } })).status).toBe(200);
    expect((await fetch(at("/api/pair/code"), { method: "POST", headers: { authorization: `Bearer ${token}` } })).status).toBe(403);   // LOCAL_ONLY stays
  });
});
