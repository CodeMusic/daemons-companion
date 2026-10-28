// C-215: a save selector -- every save known, one chosen; a save kept by name. Synthetic saves; never the user's own.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeServer } from "../src/api.js";
import { DEFAULTS } from "../src/config.js";
import { buildSave } from "./build_save.js";

const dir = mkdtempSync(join(tmpdir(), "saves-"));
const own = join(dir, "own.sav");
const mk = (player: string, trainerId: number) => buildSave({ player, trainerId, slots: [{ counter: 1, party: [{ personality: 9, otId: trainerId, species: 1, nickname: "PIP", level: 5 }] }, { counter: 0, party: [] }] });
writeFileSync(own, mk("ROVER", 7));
const server = makeServer({ ...DEFAULTS, database: join(dir, "c.sqlite"), savePath: own, edition: "CONTENT" as const });
let base = "";
beforeAll(async () => { await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r())); base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; });
afterAll(() => server.close());
const post = (path: string, b: object) => fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });
const b64 = (u: Uint8Array) => Buffer.from(u).toString("base64");

describe("the saves (C-215)", () => {
  it("lists the save it was given, as current", async () => {
    const { saves } = await (await fetch(`${base}/api/saves`)).json();
    expect(saves).toHaveLength(1);
    expect(saves[0]).toMatchObject({ kind: "given", name: "ROVER", current: true });
    expect(JSON.stringify(saves)).not.toContain(dir);        // no paths to a client
  });
  it("keeps another game by name, and switches to it and back; the user's own file is never written", async () => {
    const before = readFileSync(own);
    const k = await (await post("/api/saves/keep", { b64: b64(mk("NEWGAME", 42)), label: "The iPad's new game" })).json();
    expect(k.saves.map((x: any) => x.label)).toContain("The iPad's new game");
    await post("/api/saves/choose", { id: k.id });
    expect((await (await fetch(`${base}/api/profile`)).json()).name).toBe("NEWGAME");
    const back = k.saves.find((x: any) => x.name === "ROVER");
    const after = await (await post("/api/saves/choose", { id: back.id })).json();
    expect(after.saves.find((x: any) => x.current).name).toBe("ROVER");
    expect(readFileSync(own).equals(before)).toBe(true);
  });
  it("refuses what is not a save, and an id it does not know", async () => {
    expect((await post("/api/saves/keep", { b64: b64(new Uint8Array(0x20000)) })).status).toBe(400);
    expect((await post("/api/saves/choose", { id: "nope" })).status).toBe(404);
  });
});
