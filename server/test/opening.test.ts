// C-226 piece 5: before THE COMMONS opens -- the public listener the Cloudflare Tunnel points at is never the keeper's
// machine (cloudflared connects from loopback), a forwarded request never is either, every address there has a budget,
// a passkey answers only from https, and a guardian can export everything held.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { makeCommons, PUBLIC_MOST } from "../src/commons_api.js";
import { accountsConfigFromEnv, safeOrigin, type AccountsConfig } from "../src/accounts_api.js";
import { Store } from "../src/db.js";
import { eraseIdle } from "../src/accounts_api.js";
import { masked } from "../src/profiletrade.js";
import * as A from "../src/accounts.js";
import { ACCOUNT_KEYS } from "../src/keys.js";

const servers: Server[] = [];
const up = async (s: Server) => { servers.push(s); await new Promise<void>((r) => s.listen(0, "127.0.0.1", () => r())); return `http://127.0.0.1:${(s.address() as AddressInfo).port}`; };
const cfg: AccountsConfig = { audiences: { apple: [], google: [] }, rpId: null, origins: [], devSignIn: true };
let priv = "", pub = "";
beforeAll(async () => {
  const store = new Store(":memory:");
  priv = await up(makeCommons(store, cfg));
  pub = await up(makeCommons(store, cfg, { public: true }));
});
afterAll(() => servers.forEach((s) => s.close()));
const call = async (u: string, body?: unknown, headers: Record<string, string> = {}) => {
  const r = await fetch(u, body === undefined ? { headers } : { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
  return { status: r.status, body: (await r.json()) as any };
};

describe("before it opens (piece 5)", () => {
  it("never treats the public listener, or a forwarded request, as the keeper's machine", async () => {
    expect((await call(`${priv}/commons/keeper`)).status).toBe(200);
    expect((await call(`${pub}/commons/keeper`)).status).toBe(403);
    expect((await call(`${pub}/commons/approve`, { id: "h1" })).status).toBe(403);
    expect((await call(`${priv}/commons/keeper`, undefined, { "x-forwarded-for": "203.0.113.9" })).status).toBe(403);
    expect((await call(`${priv}/commons/keeper`, undefined, { "cf-connecting-ip": "203.0.113.9" })).status).toBe(403);
    // the dev sign-in, set on this commons, is refused from the internet
    expect((await call(`${pub}/accounts/names`)).body.dev).toBeUndefined();
    expect((await call(`${pub}/accounts/signin`, { provider: "dev", sub: "anyone" })).status).toBe(403);
    expect((await call(`${priv}/accounts/signin`, { provider: "dev", sub: "keeper" })).status).toBe(200);
  });

  it("gives every address on the public listener a budget, counted by Cloudflare's address for it", async () => {
    const a = { "cf-connecting-ip": "198.51.100.7" };
    for (let i = 0; i < PUBLIC_MOST; i++) expect((await fetch(`${pub}/accounts/names`, { headers: a })).status).toBe(200);
    expect((await call(`${pub}/accounts/names`, undefined, a)).status).toBe(429);
    expect((await call(`${pub}/accounts/names`, undefined, { "cf-connecting-ip": "198.51.100.8" })).status).toBe(200);   // another person
  });

  it("lets a passkey answer only from https pages or an Android app", () => {
    expect(safeOrigin("https://api.daemons.codemusic.ca")).toBe(true);
    expect(safeOrigin("http://api.daemons.codemusic.ca")).toBe(false);
    expect(safeOrigin("http://localhost:8081")).toBe(true);
    expect(safeOrigin("android:apk-key-hash:abc_DEF-1")).toBe(true);
    expect(safeOrigin("https://evil.example/path")).toBe(false);
    expect(accountsConfigFromEnv({ ACCOUNTS_ORIGINS: "https://a.example, http://b.example" }).origins).toEqual(["https://a.example"]);
  });

  it("exports everything held for a guardian, never the provider's id or a token", async () => {
    const { token } = (await call(`${priv}/accounts/signin`, { provider: "dev", sub: "exporter" })).body;
    const auth = { authorization: `Bearer ${token}` };
    const p = (await call(`${priv}/accounts/profile`, { first: 2, second: 3 }, auth)).body;
    expect((await call(`${priv}/accounts/export`)).status).toBe(401);
    const e = (await call(`${priv}/accounts/export`, undefined, auth)).body;
    expect(e.guardian.profiles).toMatchObject([{ id: p.id, name: p.name, code: expect.any(String) }]);
    expect(e.profiles).toMatchObject([{ id: p.id, offers: [], friends: { friends: [] } }]);
    expect(JSON.stringify(e)).not.toContain("exporter");
    expect(JSON.stringify(e)).not.toContain(token);
  });

  it("shows a profile's daemons to non-friends by species, never by the nickname a child typed", () => {
    const hide = new Set(["QUIET KERNEL #4410"]);
    const v = { open: [{ from: { player: "QUIET KERNEL #4410", species: 4, nickname: "SAM", level: 5 } }],
                others: [{ player: "KIT · KIT HOUSE", species: 1, nickname: "BUDDY" }] };
    const m = masked(v, hide);
    expect(m.open[0].from.nickname).not.toBe("SAM");
    expect(m.open[0].from.nickname).toMatch(/^[A-Z]/);
    expect(m.others[0].nickname).toBe("BUDDY");
  });

  it("erases an account nobody has used for two years, and keeps one a kid's device still plays on", () => {
    const store = new Store(":memory:"), then = new Date("2024-01-01T00:00:00Z"), now = new Date("2026-11-11T00:00:00Z");
    const old = A.signIn(store, ACCOUNT_KEYS, "dev", "old", then).guardian;
    const kept = A.signIn(store, ACCOUNT_KEYS, "dev", "kept", then).guardian;
    const p = A.addProfile(store, ACCOUNT_KEYS, kept, { first: 0, second: 0 }, then) as A.Profile;
    const { code } = A.deviceCode(store, ACCOUNT_KEYS, kept, p.id, then) as { code: string };
    const d = A.joinDevice(store, ACCOUNT_KEYS, { code }, then) as { token: string };
    A.profileForDevice(store, ACCOUNT_KEYS, d.token, new Date("2026-06-01T00:00:00Z"));   // the kid played this summer
    A.addProfile(store, ACCOUNT_KEYS, old, { first: 1, second: 1 }, then);
    expect(eraseIdle(store, now)).toBe(1);
    expect(A.profiles(store).map((x) => x.guardian)).toEqual([kept.id]);
    expect(eraseIdle(store, now)).toBe(0);
  });
});
