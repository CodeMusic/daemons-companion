// 2026-10-08: with the voice server out of reach (the Mac off the home network), a fetch waited longer than the relay's
// minute and the phone heard nothing. The companion now asks with a bare connection first and says so in seconds.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { makeServer } from "../src/api.js";
import { DEFAULTS } from "../src/config.js";

const server = makeServer({ ...DEFAULTS, database: ":memory:", savePath: null,
                            talk: { url: "http://10.255.255.1:5678/webhook", secretEnv: "NONE" } });   // nothing answers there
let base = "";
beforeAll(async () => {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

describe("a voice server out of reach", () => {
  it("is said within seconds, not after the relay has given up", async () => {
    const t0 = Date.now();
    const r = await fetch(base + "/api/ai/speak", { method: "POST", headers: { "content-type": "application/json" },
                                                     body: JSON.stringify({ text: "hello" }) }).then((x) => x.json());
    expect(r.error).toMatch(/cannot be reached/);
    expect(Date.now() - t0).toBeLessThan(5000);
  }, 10000);
});
