// C-190 (the user, 2026-11-12, by multiple choice): THE HUB card acts -- CHECK EVERY BRAIN NOW runs the minute's health
// check at once, and TRY THE AI sends one line, timed, and answers with who answered (or why nothing did).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { makeServer } from "../src/api.js";
import { DEFAULTS } from "../src/config.js";

// n8n set to an address nothing answers at, so the check has something to find out of reach
const server = makeServer({ ...DEFAULTS, database: ":memory:", savePath: null,
                            talk: { url: "http://10.255.255.1:5678/webhook", secretEnv: "NONE" } });
let port = 0;
beforeAll(async () => {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  port = (server.address() as AddressInfo).port;
});
afterAll(() => server.close());
const post = (p: string, body: unknown = {}) =>
  fetch(`http://127.0.0.1:${port}${p}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("C-190: THE HUB card's actions", () => {
  it("CHECK EVERY BRAIN NOW answers with the health just found", async () => {
    const r = await post("/api/talk/check");
    expect(r.status).toBe(200);
    const v = await r.json();
    expect(v.health.n8n).toMatchObject({ ok: false });
    expect(typeof v.health.n8n.at).toBe("string");
    expect(Array.isArray(v.health.modules)).toBe(true);
  }, 20_000);

  it("TRY THE AI says the line it sent, how long it took, and why nothing answered", async () => {
    const r = await post("/api/ai/try");
    expect(r.status).toBe(200);
    const v = await r.json();
    expect(v.said).toBe("Say hello in one short sentence.");
    expect(typeof v.ms).toBe("number");
    expect(v.answer ?? v.error).toBeTruthy();
  }, 40_000);

  it("TRY THE AI sends the user's own line, cut to 200 characters", async () => {
    const v = await (await post("/api/ai/try", { text: `  ${"x".repeat(300)}  ` })).json();
    expect(v.said).toBe("x".repeat(200));
  }, 40_000);
});
