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

// the same game, saved again later (its slot counter moved on), as the app's game would
const later = () => buildSave({ player: "ROVER", trainerId: 7, slots: [{ counter: 2, party: [{ personality: 99, otId: 7, species: 1, nickname: "PIP", level: 6 }] }, { counter: 0, party: [] }] });
const post = (bytes: Uint8Array) => fetch(`${base}/api/save/mirror`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ b64: b64(bytes) }) });

describe("the save mirror (C-188)", () => {
  it("before there is one, offers the save it was given, so the app's game starts from it", async () => {
    const r = await fetch(`${base}/api/save/mirror`);
    expect(r.status).toBe(200);
    expect(Buffer.from((await r.json()).b64, "base64").equals(readFileSync(own))).toBe(true);
  });
  it("refuses what is not a save", async () => {
    expect((await post(new Uint8Array(0x20000))).status).toBe(400);
  });
  it("refuses another game's save: a new game begun in the app never takes the companion's place", async () => {
    expect((await post(mk("IPAD"))).status).toBe(409);
    expect((await (await fetch(`${base}/api/profile`)).json()).name).toBe("ROVER");
    expect(existsSync(join(dir, "mirror.sav"))).toBe(false);
  });
  it("keeps the same game's save, reads from it, and never writes the user's own", async () => {
    const before = readFileSync(own);
    const r = await post(later());
    expect(r.status).toBe(200);
    const { sha1 } = await r.json();
    expect(existsSync(join(dir, "mirror.sav"))).toBe(true);
    expect((await (await fetch(`${base}/api/save/mirror`)).json()).sha1).toBe(sha1);
    expect((await (await fetch(`${base}/api/settings`)).json()).source).toBe("mirror");
    expect(readFileSync(own).equals(before)).toBe(true);
  });
  it("refuses a write made on a copy that has moved on since (a late save after a SYNC)", async () => {
    const was = (await (await fetch(`${base}/api/save/mirror`)).json()).sha1;
    const moved = buildSave({ player: "ROVER", trainerId: 7, slots: [{ counter: 3, party: [{ personality: 99, otId: 7, species: 1, nickname: "PIP", level: 7 }] }, { counter: 0, party: [] }] });
    expect((await post(moved)).status).toBe(200);            // the companion's copy moves on (as a SYNC would write it)
    const late = await fetch(`${base}/api/save/mirror`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ b64: b64(later()), base: was }) });
    expect(late.status).toBe(409);
  });
  it("ends when a save path is chosen, and offers that save again", async () => {
    await fetch(`${base}/api/settings`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ savePath: own }) });
    const r = await (await fetch(`${base}/api/save/mirror`)).json();
    expect(Buffer.from(r.b64, "base64").equals(readFileSync(own))).toBe(true);
    expect((await (await fetch(`${base}/api/settings`)).json()).source).not.toBe("mirror");
  });
});
