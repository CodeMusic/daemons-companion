// C-190: GET /api/hub -- what the companion gives the one app beyond a phone alone. A temp database, never a real save.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "node:http";
import { makeServer } from "../src/api.js";
import { DEFAULTS } from "../src/config.js";

let server: Server, base = "";
beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), "hub-"));
  server = makeServer({ ...DEFAULTS, database: join(dir, "c.db"), savePath: null } as any);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(() => server.close());

describe("THE HUB (C-190)", () => {
  it("says what it gives: the mirror off, no modules, the LoRa boards that have been in touch", async () => {
    await fetch(`${base}/api/device/state?device=t-deck-00a1b2&via=usb`);
    await fetch(`${base}/api/device/state?device=t-embed-36f484&via=usb`);
    const h = await (await fetch(`${base}/api/hub`)).json();
    expect(h).toMatchObject({ hub: true, mirror: { on: false, at: null }, ai: { modules: [] } });
    expect(h.lora.boards.map((b: any) => b.kind)).toEqual(["t-deck"]);
  });
});

describe("who answers a talk first, and whether each can (C-211)", () => {
  it("is in every board's state, set from a board or the site, with each source's health", async () => {
    const st = await (await fetch(`${base}/api/device/state?device=t-watch-ultra-f351d4&via=usb`)).json();
    expect(st.talk).toEqual({ first: "n8n", n8n: false, module: false });          // no voice server set, no module known
    const set = (detail: string) => fetch(`${base}/api/device/interact?device=t-watch-ultra-f351d4&via=usb`,
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "talkfirst", detail }) });
    expect((await set("module")).status).toBe(200);
    expect((await (await fetch(`${base}/api/device/state?device=t-watch-ultra-f351d4&via=usb`)).json()).talk.first).toBe("module");
    expect((await set("loudly")).status).toBe(400);
    const post = await fetch(`${base}/api/talk/settings`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ first: "n8n" }) });
    const v = await post.json();
    expect(v.first).toBe("n8n");
    expect(v.health).toEqual({ n8n: null, modules: [] });
  });
});
