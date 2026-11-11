// C-226 (docs/ACCOUNTS.md): a guardian signs in with Apple or Google, and the app hands the server the provider's ID token
// -- a JWT the provider signed. Checked here against the provider's published keys (its JWKS): the signature (RS256),
// the issuer, the audience (our app's id with that provider), and that it has not expired. We keep only `sub`, the
// provider's stable id for that person, and never a password. node:crypto: never imported by core.ts or routes.ts.
import { createPublicKey, verify } from "node:crypto";
type JsonWebKey = { [k: string]: unknown };

export type Provider = "apple" | "google";
export const PROVIDERS: Provider[] = ["apple", "google"];
const ISSUERS: Record<Provider, string[]> = { apple: ["https://appleid.apple.com"], google: ["https://accounts.google.com", "accounts.google.com"] };
export const JWKS_URL: Record<Provider, string> = { apple: "https://appleid.apple.com/auth/keys", google: "https://www.googleapis.com/oauth2/v3/certs" };
export type Jwk = JsonWebKey & { kid?: string; alg?: string };
export type Jwks = { keys: Jwk[] };
const SKEW_S = 60;

const part = (s: string) => JSON.parse(Buffer.from(s, "base64url").toString("utf8"));

// The person the token names, or why it is refused
export function verifyIdToken(token: unknown, provider: Provider, audiences: string[], jwks: Jwks, now = Date.now()): { sub: string } | string {
  if (typeof token !== "string" || token.length > 8192) return "no token";
  const bits = token.split(".");
  if (bits.length !== 3) return "not a token";
  let head: any, body: any;
  try { head = part(bits[0]); body = part(bits[1]); } catch { return "not a token"; }
  if (head.alg !== "RS256") return "an unexpected signature";
  const jwk = jwks.keys.find((k) => k.kid === head.kid);
  if (!jwk) return "signed with a key the provider does not list";
  let ok = false;
  try { ok = verify("RSA-SHA256", Buffer.from(`${bits[0]}.${bits[1]}`), createPublicKey({ key: jwk as any, format: "jwk" }), Buffer.from(bits[2], "base64url")); }
  catch { ok = false; }
  if (!ok) return "the signature fails";
  if (!ISSUERS[provider].includes(body.iss)) return "not from that provider";
  const aud: string[] = Array.isArray(body.aud) ? body.aud : [body.aud];
  if (!audiences.length || !aud.some((a) => audiences.includes(a))) return "not meant for this app";
  const t = Math.floor(now / 1000);
  if (typeof body.exp !== "number" || body.exp + SKEW_S < t) return "expired";
  if (typeof body.iat === "number" && body.iat - SKEW_S > t) return "issued in the future";
  if (typeof body.sub !== "string" || !body.sub) return "names nobody";
  return { sub: body.sub };
}

// The provider's keys, fetched and kept six hours (they rotate slowly; a key not listed is fetched again once)
const KEPT_MS = 6 * 60 * 60 * 1000;
const kept = new Map<Provider, { at: number; jwks: Jwks }>();
export async function jwksFor(provider: Provider, kid: string | null, fetcher: typeof fetch = fetch, now = Date.now()): Promise<Jwks> {
  const k = kept.get(provider);
  if (k && now - k.at < KEPT_MS && (!kid || k.jwks.keys.some((x) => x.kid === kid))) return k.jwks;
  const r = await fetcher(JWKS_URL[provider]);
  const jwks = (await r.json()) as Jwks;
  if (!Array.isArray(jwks?.keys)) throw new Error("the provider's keys could not be read");
  kept.set(provider, { at: now, jwks });
  return jwks;
}
export const kidOf = (token: unknown): string | null => {
  try { return typeof token === "string" ? part(token.split(".")[0]).kid ?? null : null; } catch { return null; }
};
