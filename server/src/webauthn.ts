// C-226 (docs/ACCOUNTS.md): a passkey on each of the guardian's devices -- WebAuthn, the least of it, with no library.
// Registration takes the device's new public key (attestation is not checked: "none" is what Apple's and Google's
// passkeys send, and we trust the guardian's own sign-in, not the device's maker). Every sign-in after is a signature
// over the server's one-time challenge, checked here against that key: the right site (rpId), the right page (origin),
// the user present, and a sign counter that never goes back (a copied key). node:crypto: never imported by core.ts.
import { createHash, createPublicKey, verify } from "node:crypto";
type JsonWebKey = { [k: string]: unknown };

const sha256 = (b: Buffer | string) => createHash("sha256").update(b).digest();
const b64 = (b: Buffer) => b.toString("base64url");

// ---- the little CBOR a passkey speaks: unsigned and negative integers, bytes, text, arrays, maps
export function cbor(buf: Buffer): any {
  let at = 0;
  const len = (info: number): number => {
    if (info < 24) return info;
    if (info === 24) return buf[at++];
    if (info === 25) { const v = buf.readUInt16BE(at); at += 2; return v; }
    if (info === 26) { const v = buf.readUInt32BE(at); at += 4; return v; }
    throw new Error("a CBOR length too long for a passkey");
  };
  const item = (): any => {
    if (at >= buf.length) throw new Error("CBOR ends early");
    const b = buf[at++], major = b >> 5, info = b & 31;
    switch (major) {
      case 0: return len(info);
      case 1: return -1 - len(info);
      case 2: { const n = len(info), v = buf.subarray(at, at + n); at += n; return Buffer.from(v); }
      case 3: { const n = len(info), v = buf.subarray(at, at + n).toString("utf8"); at += n; return v; }
      case 4: { const n = len(info); return Array.from({ length: n }, () => item()); }
      case 5: { const n = len(info), m = new Map<any, any>(); for (let i = 0; i < n; i++) { const k = item(); m.set(k, item()); } return m; }
      case 7: if (info === 20) return false; if (info === 21) return true; if (info === 22) return null;
    }
    throw new Error("a CBOR item a passkey does not send");
  };
  const v = item();
  (cbor as any).used = at;
  return v;
}

// A COSE public key (EC2 P-256, or RSA) as a JWK node can read, and the signature algorithm it names
function coseToJwk(m: Map<number, any>): { jwk: JsonWebKey; alg: number } {
  const kty = m.get(1), alg = m.get(3);
  if (kty === 2 && m.get(-1) === 1 && alg === -7) return { alg, jwk: { kty: "EC", crv: "P-256", x: b64(m.get(-2)), y: b64(m.get(-3)) } };
  if (kty === 3 && alg === -257) return { alg, jwk: { kty: "RSA", n: b64(m.get(-1)), e: b64(m.get(-2)) } };
  throw new Error("a passkey of a kind this server does not take");
}

type AuthData = { rpIdHash: Buffer; flags: number; count: number; credentialId?: Buffer; key?: Map<number, any> };
function authData(a: Buffer): AuthData {
  if (a.length < 37) throw new Error("the authenticator's data is too short");
  const d: AuthData = { rpIdHash: a.subarray(0, 32), flags: a[32], count: a.readUInt32BE(33) };
  if (d.flags & 0x40) {                                         // attested credential data: aaguid, id, key
    const n = a.readUInt16BE(53);
    d.credentialId = a.subarray(55, 55 + n);
    d.key = cbor(a.subarray(55 + n));
  }
  return d;
}

export type Expect = { challenge: string; origins: string[]; rpId: string };
export type Passkey = { id: string; jwk: JsonWebKey; alg: number; count: number };
function clientData(json: string, type: string, e: Expect): string | null {
  let c: any;
  try { c = JSON.parse(Buffer.from(json, "base64url").toString("utf8")); } catch { return "not a passkey's answer"; }
  if (c.type !== type) return "the wrong kind of answer";
  if (c.challenge !== e.challenge) return "an answer to another question";
  if (!e.origins.includes(c.origin)) return "from a page this server does not know";
  return null;
}

// A new passkey, from navigator.credentials.create()'s answer (base64url fields)
export function register(r: { clientDataJSON?: unknown; attestationObject?: unknown }, e: Expect): Passkey | string {
  if (typeof r.clientDataJSON !== "string" || typeof r.attestationObject !== "string") return "no passkey given";
  const bad = clientData(r.clientDataJSON, "webauthn.create", e);
  if (bad) return bad;
  try {
    const att = cbor(Buffer.from(r.attestationObject, "base64url")) as Map<string, any>;
    const d = authData(att.get("authData"));
    if (!d.rpIdHash.equals(sha256(e.rpId))) return "made for another site";
    if (!(d.flags & 0x01)) return "made with nobody there";
    if (!d.credentialId || !d.key) return "no key in it";
    const { jwk, alg } = coseToJwk(d.key);
    createPublicKey({ key: jwk as any, format: "jwk" });              // a key node cannot read is refused now, not at sign-in
    return { id: b64(d.credentialId), jwk, alg, count: d.count };
  } catch (err) { return (err as Error).message; }
}

// A sign-in, from navigator.credentials.get()'s answer: the passkey's new count, or why it is refused
export function check(r: { clientDataJSON?: unknown; authenticatorData?: unknown; signature?: unknown }, key: Passkey, e: Expect): { count: number } | string {
  if (typeof r.clientDataJSON !== "string" || typeof r.authenticatorData !== "string" || typeof r.signature !== "string") return "no answer given";
  const bad = clientData(r.clientDataJSON, "webauthn.get", e);
  if (bad) return bad;
  const raw = Buffer.from(r.authenticatorData, "base64url");
  let d: AuthData;
  try { d = authData(raw); } catch (err) { return (err as Error).message; }
  if (!d.rpIdHash.equals(sha256(e.rpId))) return "for another site";
  if (!(d.flags & 0x01)) return "nobody was there";
  const signed = Buffer.concat([raw, sha256(Buffer.from(r.clientDataJSON, "base64url"))]);
  let ok = false;
  try { ok = verify("sha256", signed, createPublicKey({ key: key.jwk as any, format: "jwk" }), Buffer.from(r.signature, "base64url")); } catch { ok = false; }
  if (!ok) return "the signature fails";
  if (d.count !== 0 && key.count !== 0 && d.count <= key.count) return "this passkey looks copied";
  return { count: d.count };
}
