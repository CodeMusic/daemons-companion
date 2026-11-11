// C-342: THE ENGINE ROOM does what the command line did -- its JOBS and THE HANDS, the hub's own settings from a paired
// key (never through the relay), and the site fetched by the hub itself from the release every push builds.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { networkInterfaces, tmpdir } from "node:os";
import { join } from "node:path";
import { makeServer } from "../src/api.js";
import { DEFAULTS } from "../src/config.js";
import { Store } from "../src/db.js";
import * as JOBS from "../src/jobs.js";
import { siteNow, siteUpdate } from "../src/sitefetch.js";

describe("JOBS (C-342)", () => {
  const store = () => new Store(":memory:");
  it("runs only the jobs it names, each argument checked against its pattern", () => {
    const s = store();
    expect(JOBS.ask(s, "rm -rf /", null, "x")).toEqual({ error: "no such job" });
    expect(JOBS.ask(s, "commons-approve", "h1; rm -rf ~", "x")).toMatchObject({ error: expect.stringContaining("needs") });
    const j = JOBS.ask(s, "commons-approve", "h1", "a phone") as JOBS.Job;
    expect(j.state).toBe("waiting");
    expect(JOBS.argvOf(JOBS.JOBS["commons-approve"], "h1").join(" ")).toContain("commons.sh approve h1");
    expect((JOBS.ask(s, "save-status", "ignored", "x") as JOBS.Job).arg).toBeNull();   // a job with no argument takes none
  });
  it("is taken oldest first by THE HANDS, reported as it goes, and settled by its exit", () => {
    const s = store();
    const a = JOBS.ask(s, "save-status", null, "p") as JOBS.Job, b = JOBS.ask(s, "art", null, "p") as JOBS.Job;
    const taken = JOBS.next(s, "THE HANDS (test)")!;
    expect(taken.id).toBe(a.id);
    expect(JOBS.hands(s)?.name).toBe("THE HANDS (test)");
    expect(JOBS.report(s, a.id, "line one\n")).toBe(true);
    expect(JOBS.report(s, a.id, "", 0)).toBe(true);
    expect(JOBS.list(s).find((j) => j.id === a.id)).toMatchObject({ state: "done", exit: 0, output: "line one\n" });
    expect(JOBS.report(s, a.id, "late")).toBe(false);                     // a settled job hears nothing more
    expect(JOBS.callOff(s, b.id)).toBe(true);
    expect(JOBS.next(s, "THE HANDS (test)")).toBeNull();
  });
  it("says a job failed when its hands went quiet for an hour", () => {
    const s = store();
    const j = JOBS.ask(s, "backups", null, "p") as JOBS.Job;
    JOBS.next(s, "h", new Date("2026-11-11T10:00:00Z"));
    JOBS.next(s, "h", new Date("2026-11-11T11:30:00Z"));
    expect(JOBS.list(s).find((x) => x.id === j.id)?.state).toBe("failed");
  });
});

describe("the site from the release (C-342)", () => {
  const dir = mkdtempSync(join(tmpdir(), "sitefetch-")), siteDir = join(dir, "site");
  const pack = (commit: string, said = commit) => {
    const b = join(dir, `b-${commit}`); mkdirSync(b, { recursive: true });
    writeFileSync(join(b, "index.html"), `<title>${commit}</title>`); writeFileSync(join(b, "site-commit.txt"), said + "\n");
    const t = join(dir, `${commit}.tar.gz`); execFileSync("tar", ["-czf", t, "-C", b, "."]);
    return readFileSync(t);
  };
  const release = (commit: string, tar: Buffer) => (async (u: string) =>
    u.endsWith("site-commit.txt") ? new Response(commit + "\n") : new Response(new Uint8Array(tar))) as unknown as typeof fetch;
  it("fetches a build it does not have, serves it, and keeps two", async () => {
    mkdirSync(siteDir, { recursive: true }); writeFileSync(join(siteDir, "index.html"), "sent");
    const v = await siteUpdate(siteDir, release("aaaaaaa", pack("aaaaaaa")));
    expect(v).toMatchObject({ serving: "release", commit: "aaaaaaa", latest: "aaaaaaa", error: null });
    expect(readFileSync(join(siteNow(siteDir), "index.html"), "utf8")).toContain("aaaaaaa");
    await siteUpdate(siteDir, release("bbbbbbb", pack("bbbbbbb")));
    await new Promise((r) => setTimeout(r, 20));
    await siteUpdate(siteDir, release("ccccccc", pack("ccccccc")));
    expect(existsSync(join(`${siteDir}-release`, "aaaaaaa"))).toBe(false);
    expect(existsSync(join(`${siteDir}-release`, "ccccccc", "index.html"))).toBe(true);
  });
  it("refuses a build that is not the one named (still uploading), and serves a newer site sent by hand", async () => {
    const v = await siteUpdate(siteDir, release("ddddddd", pack("ddddddd", "ccccccc")));
    expect(v.error).toMatch(/still being uploaded/);
    expect(v.commit).toBe("ccccccc");
    await new Promise((r) => setTimeout(r, 20));
    writeFileSync(join(siteDir, "index.html"), "sent later");
    expect(siteNow(siteDir)).toBe(siteDir);
  });
});

const server = makeServer({ ...DEFAULTS, database: ":memory:", savePath: null });
let port = 0;
beforeAll(async () => { await new Promise<void>((r) => server.listen(0, "0.0.0.0", () => r())); port = (server.address() as AddressInfo).port; });
afterAll(() => server.close());
const here = (p: string, init?: RequestInit) => fetch(`http://127.0.0.1:${port}${p}`, init);
const json = { "content-type": "application/json" };

describe("never through the relay (C-342)", () => {
  it("refuses the jobs and the site through it", async () => {
    const { code } = await (await here("/api/pair/code", { method: "POST" })).json();
    const { token } = await (await here("/api/pair", { method: "POST", headers: json, body: JSON.stringify({ code, name: "p" }) })).json();
    const secret = (await (await here("/api/settings/relay")).json()).secret;
    const away = { ...json, authorization: `Bearer ${token}`, "x-companion-relay": secret };
    expect((await here("/api/engine/jobs", { headers: away })).status).toBe(403);
    expect((await here("/api/engine/next", { method: "POST", headers: away, body: "{}" })).status).toBe(403);
    expect((await here("/api/pair/code", { method: "POST", headers: away, body: "{}" })).status).toBe(403);
  });
});

const lan = Object.values(networkInterfaces()).flat().find((i) => i && i.family === "IPv4" && !i.internal)?.address;
describe.skipIf(!lan)("from a paired ENGINE ROOM at home (C-342)", () => {
  const at = (p: string, init?: RequestInit) => fetch(`http://${lan}:${port}${p}`, init);
  it("shows a pairing code, the paired, the relay -- but no computer's dialogs; and runs the jobs", async () => {
    const { code } = await (await here("/api/pair/code", { method: "POST" })).json();
    const { token } = await (await at("/api/pair", { method: "POST", headers: json, body: JSON.stringify({ code, name: "THE ENGINE ROOM" }) })).json();
    const key = { ...json, authorization: `Bearer ${token}` };
    expect((await at("/api/pair/code", { method: "POST", headers: json, body: "{}" })).status).toBe(403);   // no key: no code
    const r = await at("/api/pair/code", { method: "POST", headers: key, body: "{}" });
    expect(r.status).toBe(200);
    expect((await r.json()).code).toMatch(/^\d+$/);
    expect((await (await at("/api/pair/phones", { headers: key })).json()).map((p: any) => p.name)).toContain("THE ENGINE ROOM");
    expect((await at("/api/settings/relay", { headers: key })).status).toBe(200);
    expect((await at("/api/settings/pick", { method: "POST", headers: key, body: "{}" })).status).toBe(403);
    const job = await (await at("/api/engine/jobs", { method: "POST", headers: key, body: JSON.stringify({ name: "save-status" }) })).json();
    expect(job).toMatchObject({ name: "save-status", by: "THE ENGINE ROOM", state: "waiting" });
    const taken = (await (await at("/api/engine/next", { method: "POST", headers: key, body: "{}" })).json()).job;
    expect(taken.id).toBe(job.id);
    await at("/api/engine/report", { method: "POST", headers: key, body: JSON.stringify({ id: job.id, output: "fine\n", exit: 0 }) });
    const v = await (await at("/api/engine/jobs", { headers: key })).json();
    expect(v.jobs[0]).toMatchObject({ state: "done", output: "fine\n" });
    expect(v.kinds.map((k: any) => k.name)).toContain("deploy");
    expect((await (await at("/api/engine/site", { headers: key })).json()).serving).toBe("none");
  });
});
