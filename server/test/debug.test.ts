// C-216: the DEBUG patches, private -- given to this machine or a paired phone, never a board, never through the relay.
// A scratch folder with a stand-in patch; never the real ones.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeServer } from "../src/api.js";
import { DEFAULTS } from "../src/config.js";

const dir = mkdtempSync(join(tmpdir(), "debug-"));
writeFileSync(join(dir, "debug_patches.json"), JSON.stringify({ version: "11.315.4", debug: true,
  patches: [{ name: "CONTENT DEBUG for FireRed 1.0", file: "x.bps", edition: "CONTENT", debug: true }] }));
writeFileSync(join(dir, "x.bps"), "BPS1-stand-in");
writeFileSync(join(dir, "secret.txt"), "not in the manifest");
const server = makeServer({ ...DEFAULTS, database: join(dir, "c.sqlite"), savePath: null, debugDir: dir } as any);
let base = "";
beforeAll(async () => { await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r())); base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; });
afterAll(() => server.close());

describe("the testing builds' patches (C-216)", () => {
  it("gives the manifest, and a patch the manifest names", async () => {
    expect((await (await fetch(`${base}/api/game/debug`)).json()).patches[0].file).toBe("x.bps");
    const r = await (await fetch(`${base}/api/game/debug/file?file=x.bps`)).json();
    expect(Buffer.from(r.b64, "base64").toString()).toBe("BPS1-stand-in");
  });
  it("gives nothing the manifest does not name", async () => {
    expect((await fetch(`${base}/api/game/debug/file?file=secret.txt`)).status).toBe(404);
    expect((await fetch(`${base}/api/game/debug/file?file=../c.sqlite`)).status).toBe(404);
  });
  it("never through the relay", async () => {
    expect((await fetch(`${base}/api/game/debug`, { headers: { "x-companion-relay": "anything" } })).status).not.toBe(200);
  });
});
