// C-316: a meeting recorded on the phone, or a voice memo given to it, goes down the watch's road -- made 16 kHz, cut into
// half-minute parts, each heard, then written up. A temp database; no module here, so it stops at hearing, said.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "node:http";
import { makeServer } from "../src/api.js";
import { DEFAULTS } from "../src/config.js";
import { partsOfPcm } from "../src/meetings.js";
import { CAN_CONVERT, wavOf } from "../src/ai/voice.js";

describe("a whole recording cut as the watch cuts it", () => {
  it("makes half-minute parts, drops a scrap at the end, and stops at four hours", () => {
    const rate = 16000, sec = rate * 2;
    expect(partsOfPcm(new Uint8Array(sec * 65), rate).map((p) => p.length / sec)).toEqual([30, 30, 5]);
    expect(partsOfPcm(new Uint8Array(sec * 60 + 100), rate)).toHaveLength(2);
    expect(partsOfPcm(new Uint8Array(sec * 2), rate)).toHaveLength(1);
    expect(partsOfPcm(new Uint8Array(sec * 95), rate, 30, 2)).toHaveLength(2);
  });
});

let server: Server, base = "", dir = "";
beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "meetimport-"));
  server = makeServer({ ...DEFAULTS, database: join(dir, "c.db"), savePath: null } as any);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(() => server.close());

describe.skipIf(!CAN_CONVERT)("POST /api/meeting/import", () => {
  it("keeps a voice memo under its name and date, cut into parts, and says why it cannot be heard", async () => {
    const pcm = Buffer.alloc(16000 * 2 * 40);                       // forty seconds: two parts
    for (let i = 0; i < pcm.length / 2; i++) pcm.writeInt16LE(Math.round(Math.sin(i / 10) * 8000), i * 2);
    const at = Date.parse("2026-11-09T14:00:00Z");
    const r = await fetch(`${base}/api/meeting/import?from=memo&at=${at}&name=${encodeURIComponent("Standup.m4a")}`,
      { method: "POST", headers: { "content-type": "application/octet-stream" }, body: new Uint8Array(wavOf(pcm)) });
    expect(r.status).toBe(200);
    const { id } = await r.json();
    let m: any;
    for (let i = 0; i < 50; i++) {
      m = (await (await fetch(`${base}/api/meeting/list`)).json()).meetings.find((x: any) => x.id === id);
      if (m.state === "failed") break;
      await new Promise((ok) => setTimeout(ok, 100));
    }
    expect(m).toMatchObject({ from: "memo", title: "Standup", startedAt: "2026-11-09T14:00:00.000Z", state: "failed" });
    expect(m.error).toMatch(/hear/);
    expect(m.parts).toHaveLength(2);
    expect(new Date(m.endedAt).getTime() - at).toBe(40_000);
    expect(existsSync(join(dir, "meetings", String(id), "1.wav"))).toBe(true);
    expect(existsSync(join(dir, "meetings", String(id), "source"))).toBe(false);
  });
  it("dates a memo by when it ended, beginning its length before", async () => {
    const ended = Date.parse("2026-11-09T15:00:00Z");
    const r = await fetch(`${base}/api/meeting/import?from=memo&ended=${ended}`,
      { method: "POST", body: new Uint8Array(wavOf(Buffer.alloc(16000 * 2 * 10))) });
    const { id } = await r.json();
    let m: any;
    for (let i = 0; i < 50 && m?.state !== "failed"; i++) {
      await new Promise((ok) => setTimeout(ok, 100));
      m = (await (await fetch(`${base}/api/meeting/list`)).json()).meetings.find((x: any) => x.id === id);
    }
    expect(m).toMatchObject({ startedAt: "2026-11-09T14:59:50.000Z", endedAt: "2026-11-09T15:00:00.000Z" });
  });
  it("refuses an empty recording", async () => {
    expect((await fetch(`${base}/api/meeting/import`, { method: "POST", body: new Uint8Array(10) })).status).toBe(413);
  });
});
