// C-434: THE VAULT and the hub's BACKUP -- every HOME and SHARED space kept sealed at a vault that holds no key, a recovery
// code shown once, and a new hub that gets everything back from the code alone. All on scratch databases.
import { readdirSync, readFileSync, statSync, mkdtempSync, existsSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Backup, backupFile, restore } from "../src/backup.js";
import { blobsBeside } from "../src/blobstore.js";
import { Store } from "../src/db.js";
import { LIFE } from "../src/goals.js";
import { hubPeer } from "../src/praxissync.js";
import { readCode, recoveryCode, wrappingKey } from "../src/sealing.js";
import { makeVault, tokenFor } from "../src/vault.js";

const dir = mkdtempSync(join(tmpdir(), "c434-"));
const vaultDir = join(dir, "vault");
const TOKEN = "a-scratch-household-token";
const vault = makeVault(vaultDir);
writeFileSync(join(vaultDir, "vault.json"), JSON.stringify({ households: { scratch: { token: tokenFor(TOKEN), since: "2026-11-22T00:00:00Z" } } }));
let url = "";
beforeAll(async () => {
  await new Promise<void>((r) => vault.listen(0, "127.0.0.1", () => r()));
  url = `http://127.0.0.1:${(vault.address() as AddressInfo).port}`;
});
afterAll(() => vault.close());

const plan = (...steps: string[]) => ({ subitems: [{ title: "", steps }] });
const shut = (...s: Store[]) => { for (const x of s) (x.db as unknown as { close(): void }).close(); };
/** every byte the vault keeps, as one string: what anyone holding its disk could read */
const everything = (d: string): string => readdirSync(d, { withFileTypes: true })
  .map((e) => (e.isDirectory() ? everything(join(d, e.name)) : readFileSync(join(d, e.name)).toString("latin1"))).join("\n");

describe("the recovery code", () => {
  it("is 140 bits in seven groups of four, read as Crockford's base32 reads it", () => {
    const c = recoveryCode();
    expect(c).toMatch(/^([0-9A-HJKMNP-TV-Z]{4}-){6}[0-9A-HJKMNP-TV-Z]{4}$/);
    expect(recoveryCode()).not.toBe(c);
    expect(readCode(c.toLowerCase().replace(/-/g, " "))).toBe(c);
    expect(readCode("O1IL-0000-0000-0000-0000-0000-0000")).toBe("0111-0000-0000-0000-0000-0000-0000");
    expect(readCode("too short")).toBeNull();
    expect(Buffer.from(wrappingKey(c)).equals(Buffer.from(wrappingKey(c.toLowerCase())))).toBe(true);
    expect(() => wrappingKey("nope")).toThrow();
  });
});

describe("where the vault is", () => {
  it("comes from config.json, or from the hub's settings once set on the site, checked", async () => {
    const { setVault, vaultOf } = await import("../src/backup.js");
    const s = new Store(":memory:");
    expect(vaultOf(s)).toBeNull();
    expect(() => setVault(s, "roverbyteseer:4760", TOKEN)).toThrow(/address/);
    expect(() => setVault(s, "http://roverbyteseer:4760", "short")).toThrow(/token/);
    setVault(s, "http://roverbyteseer:4760/", TOKEN);
    expect(vaultOf(s)).toEqual({ url: "http://roverbyteseer:4760", token: TOKEN });
    // read at each use, so a vault set after the server started is the one the backup turns on with
    let now: { url: string; token: string } | null = null;
    const b = new Backup(s, blobsBeside(":memory:"), null, () => now);
    expect(b.status().vault).toBeNull();
    now = vaultOf(s);
    expect(b.status().vault).toBe("http://roverbyteseer:4760");
  });
});

describe("C-434: the backup to THE VAULT", () => {
  const hubDb = join(dir, "hub", "companion.sqlite");
  let code = "";

  it("refuses a caller without a household's token, and keeps nothing it could read", async () => {
    expect((await fetch(`${url}/api/praxis/have`, { method: "POST", body: "{}" })).status).toBe(401);
    expect((await fetch(`${url}/vault/status`)).status).toBe(200);
    // an open event sent by mistake is refused, never kept
    const store = new Store(":memory:");
    store.addGoal("An open secret", plan("Tell no one"));
    const open = store.life.px.missing({});
    const r = await hubPeer(url, TOKEN).receive(open);
    expect(r).toMatchObject({ applied: 0, rejected: open.length });
    expect(await hubPeer(url, TOKEN).have()).toEqual({});
  });

  it("is off until turned on, then shows the code once and keeps every HOME space sealed", async () => {
    const { mkdirSync } = await import("node:fs");
    mkdirSync(join(dir, "hub"), { recursive: true });
    const hub = new Store(hubDb);
    const g = hub.addGoal("Clear the garden", plan("Pull the weeds", "Turn the soil", "Rake the leaves"));
    hub.completeStep(g.subitems[0].steps[0].id);
    hub.completeStep(g.subitems[0].steps[1].id);
    const nothing = new Backup(hub, blobsBeside(hubDb), backupFile(hubDb), null);
    expect(nothing.status()).toMatchObject({ on: false, vault: null });
    await expect(nothing.turnOn()).rejects.toThrow(/no vault/);

    const backup = new Backup(hub, blobsBeside(hubDb), backupFile(hubDb), { url, token: TOKEN });
    expect(backup.status()).toMatchObject({ on: false, vault: url });
    code = await backup.turnOn();
    expect(readCode(code)).toBe(code);
    const s = backup.status();
    expect(s).toMatchObject({ on: true, spaces: 1, unread: 0 });
    expect(s.sent).toBe(hub.life.px.missing({}).length);
    await expect(backup.turnOn()).rejects.toThrow(/on already/);

    // backup.json beside the database, this machine's alone; the code is in it nowhere
    const file = backupFile(hubDb)!;
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(readFileSync(file, "utf8")).not.toContain(code);
    expect(readFileSync(file, "utf8")).not.toContain(code.replace(/-/g, ""));

    // the vault holds the hub's events, and nothing on its disk says what they are
    expect(await hubPeer(url, TOKEN).have()).toEqual(hub.life.px.have(Object.keys(await hubPeer(url, TOKEN).have())));
    const disk = everything(vaultDir);
    for (const w of ["Clear the garden", "Pull the weeds", "garden", "Rake", "LIFE", "goal"]) expect(disk).not.toContain(w);
    expect(disk).not.toContain(code);

    // safe to repeat; a step ticked later goes at the next run
    expect(await backup.run()).toMatchObject({ sent: 0, taken: 0 });
    hub.completeStep(g.subitems[0].steps[2].id);
    expect((await backup.run()).sent).toBeGreaterThan(0);
    shut(hub);
  });

  it("gives a new hub everything back from the code alone, and that hub carries the backup on", async () => {
    const before = new Store(hubDb);
    const goals = before.goals(), arete = before.life.arete(new Date()).held;
    expect(arete).toBeGreaterThanOrEqual(20);                  // the goal was finished: its ARETE is part of what comes back

    const freshDb = join(dir, "fresh", "companion.sqlite");
    const { mkdirSync } = await import("node:fs");
    mkdirSync(join(dir, "fresh"), { recursive: true });
    await expect(restore({ database: freshDb, vault: { url, token: TOKEN }, code: recoveryCode() })).rejects.toThrow(/no keyring/);
    const r = await restore({ database: freshDb, vault: { url, token: TOKEN }, code: code.toLowerCase() });
    expect(r).toMatchObject({ spaces: 1, generation: 0 });
    expect(r.events).toBe(before.life.px.missing({}).length);

    const fresh = new Store(freshDb);
    expect(fresh.goals()).toEqual(goals);
    expect(fresh.life.arete(new Date()).held).toBe(arete);
    expect(fresh.life.px.space(fresh.life.life)!.keeper).toBe(fresh.life.px.replica);   // it numbers what comes next
    const next = fresh.addGoal("Plant the bulbs", plan("Dig"));
    expect(next.id).toBe(goals[goals.length - 1].id + 1);

    // and it backs up as the old hub did, under the same keys
    expect(existsSync(backupFile(freshDb)!)).toBe(true);
    const carried = new Backup(fresh, blobsBeside(freshDb), backupFile(freshDb), { url, token: TOKEN });
    expect((await carried.run())).toMatchObject({ on: true, unread: 0 });
    expect(carried.status().sent).toBeGreaterThan(0);
    // into a database that holds events already, never
    await expect(restore({ database: freshDb, vault: { url, token: TOKEN }, code })).rejects.toThrow(/new database only/);
    shut(before, fresh);
  });

  it("keeps a new space's key in the next generation of the keyring", async () => {
    const hub = new Store(hubDb);
    const backup = new Backup(hub, blobsBeside(hubDb), backupFile(hubDb), { url, token: TOKEN });
    const form = LIFE;
    hub.life.px.makeSpace({ title: "Shared with a friend", form, reach: "shared" });
    hub.life.px.makeSpace({ title: "This phone's", form, reach: "phone" });
    expect(await backup.run()).toMatchObject({ spaces: 2, unread: 0 });
    const kept = JSON.parse(readFileSync(backupFile(hubDb)!, "utf8"));
    expect(kept.generation).toBe(1);
    const again = join(dir, "again", "companion.sqlite");
    const { mkdirSync } = await import("node:fs");
    mkdirSync(join(dir, "again"), { recursive: true });
    expect(await restore({ database: again, vault: { url, token: TOKEN }, code })).toMatchObject({ spaces: 2, generation: 1 });
    shut(hub);
  });
});
