// C-330: THE ENGINE ROOM -- the hub's admin, one installable web app at /admin/: its files to the home network and the
// tailnet (they are code), the API behind a paired key, and none of it through the relay.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { networkInterfaces } from "node:os";
import { makeServer } from "../src/api.js";
import { DEFAULTS } from "../src/config.js";
import { ADMIN_DIR } from "../src/admin.js";

const server = makeServer({ ...DEFAULTS, database: ":memory:", savePath: null });
let port = 0;
beforeAll(async () => {
  await new Promise<void>((r) => server.listen(0, "0.0.0.0", () => r()));
  port = (server.address() as AddressInfo).port;
});
afterAll(() => server.close());
const here = (p: string, init?: RequestInit) => fetch(`http://127.0.0.1:${port}${p}`, init);

describe("THE ENGINE ROOM's files (C-330)", () => {
  it("is an installable web app: a manifest, its icons, a worker, a page for the home screen", () => {
    const m = JSON.parse(readFileSync(join(ADMIN_DIR, "manifest.webmanifest"), "utf8"));
    expect(m.name).toBe("THE ENGINE ROOM");
    expect(m.display).toBe("standalone");
    expect(m.scope).toBe("/admin/");
    expect(m.start_url.startsWith("/admin/")).toBe(true);
    for (const i of m.icons) expect(existsSync(join(ADMIN_DIR, i.src))).toBe(true);
    expect(m.icons.some((i: any) => i.sizes === "512x512" && i.purpose === "maskable")).toBe(true);
    const page = readFileSync(join(ADMIN_DIR, "index.html"), "utf8");
    for (const s of ['rel="manifest"', 'rel="apple-touch-icon"', "apple-mobile-web-app-capable", 'name="viewport"'])
      expect(page).toContain(s);
    expect(existsSync(join(ADMIN_DIR, "apple-touch-icon.png"))).toBe(true);
    expect(readFileSync(join(ADMIN_DIR, "admin.js"), "utf8")).toContain('serviceWorker.register("sw.js"');
  });

  it("reaches every admin feature from its one navigation", () => {
    const js = readFileSync(join(ADMIN_DIR, "admin.js"), "utf8");
    for (const id of ["hub", "mind", "house", "voices", "devices", "exchange", "commons"]) expect(js).toContain(`id: "${id}"`);
    for (const api of ["/api/mind/tasks", "/api/casino", "voicesAgain", "/api/devices/forget", "/api/exchange/invite", "/api/commons"])
      expect(js).toContain(api);
  });

  it("is served at /admin/, always asked again, and /admin is /admin/", async () => {
    const r = await here("/admin", { redirect: "manual" });
    expect(r.status).toBe(308);
    expect(r.headers.get("location")).toBe("/admin/");
    const page = await here("/admin/");
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("<title>THE ENGINE ROOM</title>");
    const js = await here("/admin/admin.js");
    expect(js.headers.get("content-type")).toMatch(/javascript/);
    expect(js.headers.get("cache-control")).toBe("no-cache");      // a deploy reaches it at once
    expect((await here("/admin/manifest.webmanifest")).headers.get("content-type")).toMatch(/manifest\+json/);
    expect((await here("/admin/icon-192.png")).headers.get("content-type")).toBe("image/png");
    expect((await here("/admin/%2e%2e/src/api.ts")).status).toBe(404);   // never a step out of its folder
    expect((await here("/admin/nothing.js")).status).toBe(404);
  });

  it("is never served through the relay, and neither are the admin requests it makes", async () => {
    expect((await here("/admin/", { headers: { "x-companion-relay": "anything" } })).status).toBe(403);
    // through the relay even a right secret and a paired key do not reach THE HOUSE, a device forgotten or the commons' link
    const { code } = await (await here("/api/pair/code", { method: "POST" })).json();
    const { token } = await (await here("/api/pair", { method: "POST", headers: { "content-type": "application/json" },
                                                        body: JSON.stringify({ code, name: "a phone" }) })).json();
    const secret = (await (await here("/api/settings/relay")).json()).secret as string;
    const away = { authorization: `Bearer ${token}`, "x-companion-relay": secret, "content-type": "application/json" };
    expect((await here("/api/casino", { headers: away })).status).toBe(403);
    expect((await here("/api/devices/forget", { method: "POST", headers: away, body: JSON.stringify({ id: "x" }) })).status).toBe(403);
    expect((await here("/api/commons", { method: "POST", headers: away, body: JSON.stringify({ url: "" }) })).status).toBe(403);
    expect((await here("/api/talk/settings", { method: "POST", headers: away, body: JSON.stringify({ voicesAgain: true }) })).status).toBe(403);
    expect((await here("/api/mind/tasks", { method: "POST", headers: away, body: JSON.stringify({ act: "plan", plan: "x", on: false }) })).status).toBe(403);
    // and the app's own requests still go through it
    expect((await here("/api/mind/tasks", { headers: away })).status).toBe(200);
  });

  it("answers from home: MAKE THE VOICES AGAIN moves the generation on", async () => {
    const before = (await (await here("/api/voices/generation")).json()).generation;
    await here("/api/talk/settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ voicesAgain: true }) });
    expect((await (await here("/api/voices/generation")).json()).generation).not.toBe(before);
  });
});

const lan = Object.values(networkInterfaces()).flat().find((i) => i && i.family === "IPv4" && !i.internal)?.address;
describe.skipIf(!lan)("from the phone on the home network (C-330)", () => {
  it("opens without a key, and asks the API for one", async () => {
    expect((await fetch(`http://${lan}:${port}/admin/`)).status).toBe(200);
    expect((await fetch(`http://${lan}:${port}/api/casino`)).status).toBe(403);
  });
});
