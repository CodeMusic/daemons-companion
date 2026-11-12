// C-226: ACCOUNTS over HTTP, on THE COMMONS' server (commons_api.ts hands it every /accounts/ request). DRAFT.
//
//   GET  /accounts/names                          the two word lists a name is built from
//   POST /accounts/signin {provider, idToken}     Apple or Google: a guardian token (and the guardian, made the first time)
//   POST /accounts/passkey/login/start            a challenge for a passkey sign-in
//   POST /accounts/passkey/login {id, credentialId, clientDataJSON, authenticatorData, signature}   a guardian token
//   POST /accounts/device/join {code, label}      a kid's device, with the guardian's one-time code: a device token
//   -- as a guardian (authorization: Bearer <guardian token>) --
//   GET  /accounts/me                             the guardian's profiles, devices and passkeys
//   POST /accounts/signout
//   POST /accounts/passkey/register/start         a challenge for a new passkey on this device
//   POST /accounts/passkey/register {id, clientDataJSON, attestationObject, label}
//   POST /accounts/passkey/remove {id}
//   POST /accounts/profile {first, second}        a profile, named from the lists
//   POST /accounts/profile/rename {id, first, second}  /controls {id, friends?, trade?, meet?, lobby?}
//   POST /accounts/profile/nickname {id, text}    /remove {id}
//   POST /accounts/device/code {profile}          a one-time code for one profile (eight letters, fifteen minutes)
//   POST /accounts/device/revoke {id}
//   POST /accounts/delete {confirm: "DELETE"}     the guardian and everything theirs
//   -- as a profile's device (x-daemons-profile: <device token>) --
//   GET  /accounts/profile/me                     its own name, tag, nickname, controls and friend code
//   GET/POST /accounts/x/<name>                   C-226 piece 4: the exchange's requests as the profile (profiletrade.ts)
//   -- piece 4, as a guardian --
//   POST /accounts/profile/ledger {id}            a profile's every trade, loan and gift, and its friends
//   POST /accounts/profile/friend {profile, player, yes?}   a friend waiting for the guardian: let it, or not
//   POST /accounts/profile/block {profile, player, yes?}    a player kept away from a profile (yes: false lets it back)
//   POST /accounts/profile/claim {id}             a home's player claimed into a profile -- through /commons/x/claim
//                                                 (the hub speaks for its player), never here
//
// Who the app is with each provider, and the passkeys' site, come from the environment (commons_main.ts): unset, sign-in
// and passkeys say so rather than taking anything.
import type { Store } from "./store.js";
import * as A from "./accounts.js";
import { failed } from "./exchange.js";
import { jwksFor, kidOf, PROVIDERS, verifyIdToken, type Provider } from "./idtoken.js";
import * as W from "./webauthn.js";
import * as P from "./profiletrade.js";   // piece 4

// devSignIn (ACCOUNTS_DEV_SIGNIN=1): a guardian signed in by name with no provider, from the commons' own machine only --
// for trying the app against a scratch commons. Never set where anyone else reaches it.
export type AccountsConfig = { audiences: Record<Provider, string[]>; rpId: string | null; origins: string[]; fetcher?: typeof fetch; devSignIn?: boolean };
export type Reply = { status: number; body: unknown };
const ok = (body: unknown, status = 200): Reply => ({ status, body });
const no = (status: number, error: string): Reply => ({ status, body: { error } });
const of = <T>(r: T | { error: string }, f: (v: T) => unknown = (v) => v): Reply => (failed(r as any) ? no(400, (r as any).error) : ok(f(r as T)));

export function accountsConfigFromEnv(env: Record<string, string | undefined>): AccountsConfig {
  const list = (v?: string) => (v ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  return { audiences: { apple: list(env.ACCOUNTS_APPLE_AUD), google: list(env.ACCOUNTS_GOOGLE_AUD) },
           rpId: env.ACCOUNTS_RP_ID || null, origins: list(env.ACCOUNTS_ORIGINS), devSignIn: env.ACCOUNTS_DEV_SIGNIN === "1" };
}

export async function accountsRoute(store: Store, keys: A.AccountKeys, cfg: AccountsConfig, method: string, path: string, b: any,
                                    headers: Record<string, string | string[] | undefined>, here = false, now = new Date()): Promise<Reply> {
  const expect = (challenge: string) => ({ challenge, rpId: cfg.rpId ?? "", origins: cfg.origins });
  if (method === "GET" && path === "/accounts/names") return ok({ ...A.names(), ...(cfg.devSignIn && here ? { dev: true } : {}) });
  if (method === "POST" && path === "/accounts/signin") {
    if (b?.provider === "dev") {                              // ACCOUNTS_DEV_SIGNIN, this machine only
      if (!cfg.devSignIn || !here || typeof b.sub !== "string" || !/^[a-z0-9-]{1,32}$/.test(b.sub)) return no(403, "no such sign-in here");
      const r = A.signIn(store, keys, "dev", b.sub, now);
      return ok({ token: r.token, guardian: A.guardianView(store, r.guardian) });
    }
    const provider = b?.provider as Provider;
    if (!PROVIDERS.includes(provider)) return no(400, "sign in with apple or google");
    if (!cfg.audiences[provider].length) return no(503, `sign-in with ${provider} is not set up on this server`);   // DRAFT
    let jwks;
    try { jwks = await jwksFor(provider, kidOf(b?.idToken), cfg.fetcher ?? fetch, now.getTime()); }
    catch { return no(502, `${provider} could not be reached`); }
    const who = verifyIdToken(b?.idToken, provider, cfg.audiences[provider], jwks, now.getTime());
    if (typeof who === "string") return no(401, `that sign-in is refused: ${who}`);
    const r = A.signIn(store, keys, provider, who.sub, now);
    return ok({ token: r.token, guardian: A.guardianView(store, r.guardian) });
  }
  if (path.startsWith("/accounts/passkey/") && (!cfg.rpId || !cfg.origins.length)) return no(503, "passkeys are not set up on this server");   // DRAFT
  if (method === "POST" && path === "/accounts/passkey/login/start") return ok({ ...A.challenge(store, keys, "login", null, now), rpId: cfg.rpId });
  if (method === "POST" && path === "/accounts/passkey/login") {
    const c = A.takeChallenge(store, b?.id, "login", now);
    if (!c) return no(400, "that question has expired -- ask again");
    const k = A.passkeyOf(store, b?.credentialId);
    if (!k) return no(401, "this passkey is not one we know");
    const r = W.check(b ?? {}, k as unknown as W.Passkey, expect(c.value));
    if (typeof r === "string") return no(401, `that sign-in is refused: ${r}`);
    const s = A.passkeyUsed(store, keys, k.id, r.count, now);
    return s ? ok({ token: s.token, guardian: A.guardianView(store, s.guardian) }) : no(401, "this passkey's account is gone");
  }
  if (method === "POST" && path === "/accounts/device/join") return of(A.joinDevice(store, keys, b ?? {}, now));
  if (method === "GET" && path === "/accounts/profile/me") {
    const p = A.profileForDevice(store, keys, String(headers["x-daemons-profile"] ?? ""));
    return p ? ok({ ...A.profileView(p), code: P.codeOf(store, keys, p.id) }) : no(401, "this device is not open on a profile");
  }
  if (path.startsWith("/accounts/x/")) {                       // piece 4: a kid's device plays as its profile
    const p = A.profileForDevice(store, keys, String(headers["x-daemons-profile"] ?? ""));
    if (!p) return no(401, "this device is not open on a profile");
    const name = path.slice("/accounts/x/".length);
    if (name === "claim") return no(404, "not found");
    const r = await P.profileRoute(store, keys, P.playerFor(store, p), name, b ?? {});
    return r?.error === "not found" ? no(404, r.error) : r?.error ? no(400, r.error) : ok(r);
  }

  const bearer = String(headers.authorization ?? "").replace(/^Bearer\s+/i, "");
  const g = A.guardianFor(store, keys, bearer, now);
  if (!g) return no(401, "sign in first");
  const seen = () => { const v = A.guardianView(store, g); return { ...v, profiles: v.profiles.map((p) => ({ ...p, ...P.socialOf(store, keys, p.id) })) }; };
  if (method === "GET" && path === "/accounts/me") return ok(seen());
  if (method !== "POST") return no(404, "not found");
  switch (path) {
    case "/accounts/signout": A.signOut(store, keys, bearer, now); return ok({ signedOut: true });
    case "/accounts/passkey/register/start": return ok({ ...A.challenge(store, keys, "register", g, now), rpId: cfg.rpId, user: g.id });
    case "/accounts/passkey/register": {
      const c = A.takeChallenge(store, b?.id, "register", now);
      if (!c || c.guardian !== g.id) return no(400, "that question has expired -- ask again");
      const k = W.register(b ?? {}, expect(c.value));
      if (typeof k === "string") return no(400, `that passkey is refused: ${k}`);
      return of(A.keepPasskey(store, g, k, b?.label, now), seen);
    }
    case "/accounts/passkey/remove": return of(A.removePasskey(store, g, b?.id, now), seen);
    case "/accounts/profile": return of(A.addProfile(store, keys, g, b ?? {}, now), A.profileView);
    case "/accounts/profile/rename": return of(A.rename(store, g, b ?? {}, now), A.profileView);
    case "/accounts/profile/controls": return of(A.setControls(store, g, b ?? {}, now), A.profileView);
    case "/accounts/profile/nickname": return of(A.setNickname(store, g, b ?? {}, now), A.profileView);
    case "/accounts/profile/remove": {
      const r = A.removeProfile(store, g, b?.id, now);
      if (!failed(r)) P.forget(store, [r.removed]);              // piece 4: off the exchange
      return of(r, seen);
    }
    case "/accounts/profile/ledger": return of(P.ledger(store, g, b?.id));
    case "/accounts/profile/friend": return of(P.decide(store, g, b ?? {}));
    case "/accounts/profile/block": return of(P.block(store, g, b ?? {}));
    case "/accounts/device/code": return of(A.deviceCode(store, keys, g, b?.profile, now));
    case "/accounts/device/revoke": return of(A.revokeDevice(store, g, b?.id, now), seen);
    case "/accounts/delete":
      if (b?.confirm !== "DELETE") return no(400, 'to delete everything, send confirm: "DELETE"');   // DRAFT
      P.forget(store, A.profilesOf(store, g));                   // piece 4: every profile off the exchange first
      return ok(A.deleteGuardian(store, g, now));
  }
  return no(404, "not found");
}
