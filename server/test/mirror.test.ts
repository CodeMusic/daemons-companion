import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeServer } from "../src/api.js";
import { DEFAULTS } from "../src/config.js";
import { buildSave } from "./build_save.js";

// C-188: a paired app's save, mirrored beside the database; the save path the user set is never written
const dir = mkdtempSync(join(tmpdir(), "mirror-"));
const own = join(dir, "own.sav");
const mk = (player: string) => buildSave({ player, trainerId: 7, slots: [{ counter: 1, party: [{ personality: 99, otId: 7, species: 1, nickname: "PIP", level: 5 }] }, { counter: 0, party: [] }] });
writeFileSync(own, mk("ROVER"));
const cfg = { ...DEFAULTS, database: join(dir, "c.sqlite"), savePath: own, edition: "CONTENT" as const };
const server = makeServer(cfg);
let base = "";
beforeAll(async () => {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());
const b64 = (u: Uint8Array) => Buffer.from(u).toString("base64");

describe("the save mirror (C-188)", () => {
  it("is off until the app sends one", async () => {
    expect((await fetch(`${base}/api/save/mirror`)).status).toBe(404);
  });
  it("refuses what is not a save", async () => {
    const r = await fetch(`${base}/api/save/mirror`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ b64: b64(new Uint8Array(0x20000)) }) });
    expect(r.status).toBe(400);
  });
  it("keeps the app's save, reads from it, and never writes the user's own", async () => {
    const before = readFileSync(own);
    const r = await fetch(`${base}/api/save/mirror`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ b64: b64(mk("IPAD")) }) });
    expect(r.status).toBe(200);
    const { sha1 } = await r.json();
    expect(existsSync(join(dir, "mirror.sav"))).toBe(true);
    const back = await (await fetch(`${base}/api/save/mirror`)).json();
    expect(back.sha1).toBe(sha1);
    expect((await (await fetch(`${base}/api/profile`)).json()).name).toBe("IPAD");
    expect((await (await fetch(`${base}/api/settings`)).json()).source).toBe("mirror");
    expect(readFileSync(own).equals(before)).toBe(true);
  });
  it("ends when a save path is chosen", async () => {
    await fetch(`${base}/api/settings`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ savePath: own }) });
    expect((await fetch(`${base}/api/save/mirror`)).status).toBe(404);
    expect((await (await fetch(`${base}/api/profile`)).json()).name).toBe("ROVER");
  });
});
