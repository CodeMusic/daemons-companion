// C-364 / C-365: every save that moves kept in a trail, going back to one, and the companion's copy as the truth.
// Synthetic saves in a temporary folder; never the user's own.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeServer } from "../src/api.js";
import { DEFAULTS } from "../src/config.js";
import { KEEP, recordSave, trail } from "../src/game/savehistory.js";
import { buildSave } from "./build_save.js";

const dir = mkdtempSync(join(tmpdir(), "trail-")), own = join(dir, "own.sav");
const mk = (player: string, trainerId: number, level = 5) => buildSave({ player, trainerId, slots: [{ counter: 1, party: [{ personality: 9, otId: trainerId, species: 1, nickname: "PIP", level }] }, { counter: 0, party: [] }] });
writeFileSync(own, mk("ROVER", 7));
const cfg = { ...DEFAULTS, database: join(dir, "c.sqlite"), savePath: own };
const server = makeServer(cfg);
let base = "";
beforeAll(async () => { await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r())); base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; });
afterAll(() => server.close());
const post = (p: string, b: object) => fetch(`${base}${p}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });
const b64 = (u: Uint8Array) => Buffer.from(u).toString("base64");
const history = async () => (await (await fetch(`${base}/api/saves/history`)).json());

describe("the trail (C-364)", () => {
  it("keeps a save once, and not again until it changes", () => {
    const c = { ...cfg, database: ":memory:" };
    expect(recordSave(c, mk("A", 1), "game", "x")).not.toBeNull();
    expect(recordSave(c, mk("A", 1), "sync", "x")).toBeNull();
    expect(recordSave(c, mk("A", 1, 6), "sync", "x")?.kind).toBe("sync");
    expect(trail(c).map((e) => e.kind)).toEqual(["sync", "game"]);
  });
  it("keeps no more than KEEP", () => {
    const c = { ...cfg, database: ":memory:" };   // the same in-memory trail as above
    for (let i = 0; i < KEEP + 5; i++) recordSave(c, mk("B", 2, (i % 90) + 2), "game", String(i));
    expect(trail(c)).toHaveLength(KEEP);
  });
  it("keeps a device's game saving, and a copy kept", async () => {
    expect((await post("/api/save/mirror", { b64: b64(mk("ROVER", 7, 6)) })).status).toBe(200);
    await post("/api/saves/keep", { b64: b64(mk("OTHER", 9)), label: "another" });
    const t = (await history()).trail;
    expect(t.slice(0, 2).map((e: any) => [e.kind, e.name])).toEqual([["kept", "OTHER"], ["game", "ROVER"]]);
    expect(JSON.stringify(t)).not.toContain(dir);
  });
  it("keeps a device's save the companion refused, set aside, and one a device sets aside", async () => {
    expect((await post("/api/save/mirror", { b64: b64(mk("ROVER", 7, 8)), base: "not-what-it-has" })).status).toBe(409);
    expect((await history()).trail[0]).toMatchObject({ kind: "set-aside", name: "ROVER" });
    expect(await (await post("/api/saves/history", { b64: b64(mk("ROVER", 7, 9)), note: "replaced" })).json()).toEqual({ kept: true });
    expect((await history()).trail[0]).toMatchObject({ kind: "set-aside", note: "replaced" });
  });
  it("goes back to an earlier save, into the mirror, and the going back is kept too", async () => {
    const t = (await history()).trail, first = t.find((e: any) => e.kind === "game" && e.name === "ROVER");
    const r = await (await post("/api/saves/history/back", { id: first.id })).json();
    expect(r.wrote).toBe("mirror");
    expect((await (await fetch(`${base}/api/save/mirror`)).json()).sha1).toBe(first.sha1);
    expect((await history()).trail[0]).toMatchObject({ kind: "back", sha1: first.sha1 });
    expect((await post("/api/saves/history/back", { id: 99999 })).status).toBe(404);
  });
  it("will not go back to another game's save", async () => {
    const other = (await history()).trail.find((e: any) => e.name === "OTHER");
    expect((await post("/api/saves/history/back", { id: other.id })).status).toBe(409);
    expect(readFileSync(own).equals(Buffer.from(mk("ROVER", 7)))).toBe(true);   // the given save never written by the mirror's games
  });
});

describe("the truth (C-365)", () => {
  it("is the companion's by default, and can be the device's", async () => {
    expect((await history()).truth).toBe("companion");
    expect((await (await fetch(`${base}/api/save/mirror`)).json()).truth).toBe("companion");
    expect(await (await post("/api/saves/truth", { truth: "device" })).json()).toEqual({ truth: "device" });
    expect((await post("/api/saves/truth", { truth: "nobody" })).status).toBe(400);
    await post("/api/saves/truth", { truth: "companion" });
  });
});
