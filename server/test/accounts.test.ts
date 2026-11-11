// C-226: ACCOUNTS -- a guardian signed in by a provider's ID token (a fake provider's, signed here with its own RSA key),
// profiles named from the lists, a kid's device by one-time code, the controls, passkeys (a P-256 key made here, the
// way a phone's would answer), and DELETE. Over HTTP on THE COMMONS' own server, as roverbyteseer runs it.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { createHash, generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import { makeCommons } from "../src/commons_api.js";
import { Store } from "../src/db.js";
import { verifyIdToken, type Jwks } from "../src/idtoken.js";
import type { AccountsConfig } from "../src/accounts_api.js";

const AUD = "ca.codemusic.daemons";
const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 });
const JWKS: Jwks = { keys: [{ ...rsa.publicKey.export({ format: "jwk" }), kid: "k1", alg: "RS256" }] };
const b64 = (x: Buffer | string) => Buffer.from(x).toString("base64url");
function idToken(claims: Record<string, unknown>, key: KeyObject = rsa.privateKey, kid = "k1") {
  const head = b64(JSON.stringify({ alg: "RS256", kid })), body = b64(JSON.stringify(claims));
  return `${head}.${body}.${b64(sign("RSA-SHA256", Buffer.from(`${head}.${body}`), key))}`;
}
const now = () => Math.floor(Date.now() / 1000);
const apple = (sub: string, extra: Record<string, unknown> = {}) => idToken({ iss: "https://appleid.apple.com", aud: AUD, sub, iat: now(), exp: now() + 600, ...extra });

describe("an ID token (idtoken.ts)", () => {
  it("names the person it was signed for, and refuses anything else", () => {
    expect(verifyIdToken(apple("001"), "apple", [AUD], JWKS)).toEqual({ sub: "001" });
    expect(verifyIdToken(apple("001", { aud: "someone.else" }), "apple", [AUD], JWKS)).toBe("not meant for this app");
    expect(verifyIdToken(apple("001", { exp: now() - 3600 }), "apple", [AUD], JWKS)).toBe("expired");
    expect(verifyIdToken(apple("001"), "google", [AUD], JWKS)).toBe("not from that provider");
    const other = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey;
    expect(verifyIdToken(idToken({ iss: "https://appleid.apple.com", aud: AUD, sub: "001", exp: now() + 600 }, other), "apple", [AUD], JWKS)).toBe("the signature fails");
    expect(verifyIdToken(apple("001"), "apple", [], JWKS)).toBe("not meant for this app");
  });
});

// ---- a passkey, as a phone would make and use one
function cborEnc(v: any): Buffer {
  const head = (major: number, n: number) => n < 24 ? Buffer.from([(major << 5) | n]) : n < 256 ? Buffer.from([(major << 5) | 24, n])
    : Buffer.from([(major << 5) | 25, n >> 8, n & 255]);
  if (typeof v === "number") return v >= 0 ? head(0, v) : head(1, -1 - v);
  if (Buffer.isBuffer(v)) return Buffer.concat([head(2, v.length), v]);
  if (typeof v === "string") return Buffer.concat([head(3, Buffer.byteLength(v)), Buffer.from(v)]);
  if (v instanceof Map) return Buffer.concat([head(5, v.size), ...[...v].flatMap(([k, x]) => [cborEnc(k), cborEnc(x)])]);
  throw new Error("test cbor");
}
const RP = "accounts.daemons.test", ORIGIN = "https://accounts.daemons.test";
const sha = (x: Buffer | string) => createHash("sha256").update(x).digest();
function phone() {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const jwk = publicKey.export({ format: "jwk" }) as { x: string; y: string };
  const id = Buffer.from("passkey-on-a-phone"), cose = new Map<number, any>([[1, 2], [3, -7], [-1, 1], [-2, Buffer.from(jwk.x, "base64url")], [-3, Buffer.from(jwk.y, "base64url")]]);
  let count = 0;
  const auth = (flags: number, more = Buffer.alloc(0)) => { const c = Buffer.alloc(4); c.writeUInt32BE(count); return Buffer.concat([sha(RP), Buffer.from([flags]), c, more]); };
  const client = (type: string, challenge: string) => b64(JSON.stringify({ type, challenge, origin: ORIGIN }));
  return {
    id: b64(id),
    rewind(to: number) { count = to; },
    create(challenge: string) {
      const attested = Buffer.concat([Buffer.alloc(16), Buffer.from([0, id.length]), id, cborEnc(cose)]);
      return { clientDataJSON: client("webauthn.create", challenge),
               attestationObject: b64(cborEnc(new Map<string, any>([["fmt", "none"], ["attStmt", new Map()], ["authData", auth(0x41, attested)]]))) };
    },
    get(challenge: string, again = false) {
      if (!again) count++;
      const a = auth(0x01), cd = client("webauthn.get", challenge);
      return { credentialId: b64(id), clientDataJSON: cd, authenticatorData: b64(a), signature: b64(sign("sha256", Buffer.concat([a, sha(Buffer.from(cd, "base64url"))]), privateKey)) };
    },
  };
}

describe("ACCOUNTS on the commons (accounts_api.ts)", () => {
  let base = "", server: ReturnType<typeof makeCommons>;
  const cfg: AccountsConfig = { audiences: { apple: [AUD], google: [] }, rpId: RP, origins: [ORIGIN],
                                fetcher: (async () => ({ json: async () => JWKS })) as unknown as typeof fetch };
  beforeAll(async () => {
    server = makeCommons(new Store(":memory:"), cfg);
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => server.close());
  const call = async (path: string, body?: unknown, headers: Record<string, string> = {}) => {
    const r = await fetch(base + path, body === undefined ? { headers } : { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
    return { status: r.status, body: (await r.json()) as any };
  };
  const as = (token: string) => ({ authorization: `Bearer ${token}` });

  it("signs a guardian in with Apple, the same guardian each time, and refuses Google until it is set up", async () => {
    const a = await call("/accounts/signin", { provider: "apple", idToken: apple("guardian-1") });
    expect(a.status).toBe(200);
    const b = await call("/accounts/signin", { provider: "apple", idToken: apple("guardian-1") });
    expect(b.body.guardian.id).toBe(a.body.guardian.id);
    expect((await call("/accounts/signin", { provider: "google", idToken: "x.y.z" })).status).toBe(503);
    expect((await call("/accounts/signin", { provider: "apple", idToken: apple("guardian-1", { aud: "else" }) })).status).toBe(401);
    expect((await call("/accounts/me")).status).toBe(401);
    expect(JSON.stringify((await call("/accounts/me", undefined, as(a.body.token))).body)).not.toContain("guardian-1");   // never the sub
  });

  it("adds profiles named from the lists, sets their controls and nickname, and opens a kid's device with a one-time code", async () => {
    const { body: { token } } = await call("/accounts/signin", { provider: "apple", idToken: apple("guardian-2") });
    const names = (await call("/accounts/names")).body;
    expect((await call("/accounts/profile", { first: 0, second: 99 }, as(token))).status).toBe(400);   // a word not on the list
    const p = (await call("/accounts/profile", { first: 0, second: 0 }, as(token))).body;
    expect(p).toMatchObject({ name: `${names.first[0]} ${names.second[0]}`, nickname: null, controls: { friends: "approve", trade: "friends", meet: "friends", lobby: "off" } });
    expect(p.tag).toBeGreaterThanOrEqual(1000);
    expect((await call("/accounts/profile/controls", { id: p.id, trade: "everyone" }, as(token))).status).toBe(400);
    expect((await call("/accounts/profile/controls", { id: p.id, trade: "home", lobby: "on" }, as(token))).body.controls).toMatchObject({ trade: "home", lobby: "on" });
    expect((await call("/accounts/profile/nickname", { id: p.id, text: "call me at 555" }, as(token))).status).toBe(400);
    expect((await call("/accounts/profile/nickname", { id: p.id, text: "pip" }, as(token))).body.nickname).toBe("PIP");

    const { body: code } = await call("/accounts/device/code", { profile: p.id }, as(token));
    expect(code.code).toMatch(/^[A-Z2-9]{8}$/);
    const joined = await call("/accounts/device/join", { code: code.code.toLowerCase(), label: "a tablet" });
    expect(joined.body.profile.id).toBe(p.id);
    expect((await call("/accounts/device/join", { code: code.code })).status).toBe(400);                 // once
    expect((await call("/accounts/profile/me", undefined, { "x-daemons-profile": joined.body.token })).body.name).toBe(p.name);
    expect((await call("/accounts/me", undefined, { authorization: `Bearer ${joined.body.token}` })).status).toBe(401);   // a kid's device is not the guardian

    const me = (await call("/accounts/me", undefined, as(token))).body;
    const dev = me.profiles[0].devices[0];
    expect(dev.label).toBe("a tablet");
    await call("/accounts/device/revoke", { id: dev.id }, as(token));
    expect((await call("/accounts/profile/me", undefined, { "x-daemons-profile": joined.body.token })).status).toBe(401);

    // another guardian cannot touch it
    const other = (await call("/accounts/signin", { provider: "apple", idToken: apple("guardian-3") })).body.token;
    expect((await call("/accounts/device/code", { profile: p.id }, as(other))).status).toBe(400);
  });

  it("keeps a passkey and signs in with it, refusing a replayed answer and an answer to another challenge", async () => {
    const { body: { token, guardian } } = await call("/accounts/signin", { provider: "apple", idToken: apple("guardian-4") });
    const ph = phone();
    const reg = (await call("/accounts/passkey/register/start", {}, as(token))).body;
    expect(reg.rpId).toBe(RP);
    const kept = await call("/accounts/passkey/register", { id: reg.id, label: "my phone", ...ph.create(reg.challenge) }, as(token));
    expect(kept.status).toBe(200);
    expect(kept.body.passkeys).toEqual([expect.objectContaining({ id: ph.id, label: "my phone" })]);

    const start = (await call("/accounts/passkey/login/start", {})).body;
    const answer = ph.get(start.challenge);
    const signed = await call("/accounts/passkey/login", { id: start.id, ...answer });
    expect(signed.status).toBe(200);
    expect(signed.body.guardian.id).toBe(guardian.id);
    expect((await call("/accounts/me", undefined, as(signed.body.token))).status).toBe(200);
    expect((await call("/accounts/passkey/login", { id: start.id, ...answer })).status).toBe(400);           // the challenge is spent
    const again = (await call("/accounts/passkey/login/start", {})).body;
    expect((await call("/accounts/passkey/login", { id: again.id, ...ph.get(start.challenge) })).status).toBe(401);   // answers another question
    const third = (await call("/accounts/passkey/login/start", {})).body;
    ph.rewind(1);                                                                                           // as a copied key would count
    expect((await call("/accounts/passkey/login", { id: third.id, ...ph.get(third.challenge, true) })).status).toBe(401);   // the counter went back
  });

  it("deletes a guardian and everything theirs", async () => {
    const { body: { token } } = await call("/accounts/signin", { provider: "apple", idToken: apple("guardian-5") });
    const p = (await call("/accounts/profile", { first: 1, second: 1 }, as(token))).body;
    const { body: code } = await call("/accounts/device/code", { profile: p.id }, as(token));
    const dev = (await call("/accounts/device/join", { code: code.code })).body.token;
    expect((await call("/accounts/delete", {}, as(token))).status).toBe(400);
    expect((await call("/accounts/delete", { confirm: "DELETE" }, as(token))).body).toMatchObject({ profiles: 1 });
    expect((await call("/accounts/me", undefined, as(token))).status).toBe(401);
    expect((await call("/accounts/profile/me", undefined, { "x-daemons-profile": dev })).status).toBe(401);
    const fresh = await call("/accounts/signin", { provider: "apple", idToken: apple("guardian-5") });
    expect(fresh.body.guardian.profiles).toEqual([]);                                                       // a new, empty guardian
  });
});
