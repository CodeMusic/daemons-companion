// THE COMMONS over HTTP (commons.ts): what a home's hub asks of it, and what only its keeper does, on its own machine.
//
//   POST /commons/register {name}          a home's hub asks to join (then waits for the keeper)
//   GET  /commons/keeper                   THIS MACHINE ONLY: every home, approved or waiting
//   POST /commons/approve {id, yes?}       THIS MACHINE ONLY: let a home in (or out)
//   -- as a home (x-daemons-home: its key) --
//   GET  /commons/home                     its name, approval, friend code, friends and asks
//   POST /commons/friend {code}            ask a home to be friends (or accept, when it asked first)
//   POST /commons/friend/accept {id}       accept an ask;  POST /commons/friend/forget {id}
//   POST /commons/player {name}            vouch for one of its players: a token for that player
//   -- as a home's player (x-daemons-home and x-daemons-player) --
//   GET/POST /commons/x/<name>             the exchange's requests (tradelink.ts exchangeRoute), within REACH -- a player
//                                          that is a profile within its guardian's controls (profiletrade.ts, C-226 piece 4)
//   POST /commons/x/claim {guardian, profile}   C-226 piece 4: this player claimed into the guardian's profile
//   -- C-226 --
//   /accounts/*                            ACCOUNTS: guardians, profiles, kids' devices, passkeys (accounts_api.ts)
//
// The tailnet only for now (the user, 2026-10-28): it listens where its config says. C-226 piece 5: the internet reaches
// it only through a Cloudflare Tunnel (C-278) to a second, PUBLIC listener on this machine's loopback (commons_main.ts
// COMMONS_PUBLIC_PORT): there nothing is ever "the keeper's machine" -- cloudflared connects from loopback, so without
// this every request from the internet would look like the keeper's -- each address is Cloudflare's CF-Connecting-IP,
// and every address has a budget of requests besides the tries below. A request that carries a forwarding header is
// never the keeper's on either listener.
import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";
import type { Store } from "./store.js";
import { KEYS } from "./keys.js";
import * as C from "./commons.js";
import * as X from "./exchange.js";
import * as A from "./accounts.js";
import * as P from "./profiletrade.js";   // C-226 piece 4
import { ACCOUNT_KEYS } from "./keys.js";
import { accountsRoute, type AccountsConfig } from "./accounts_api.js";   // C-226

const isLoopback = (a?: string) => !a || a === "127.0.0.1" || a === "::1" || a === "::ffff:127.0.0.1";
const send = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};
async function body(req: IncomingMessage, most = 256 * 1024): Promise<any> {
  let n = 0; const parts: Buffer[] = [];
  for await (const c of req) { n += (c as Buffer).length; if (n > most) throw new Error("too large"); parts.push(c as Buffer); }
  try { return parts.length ? JSON.parse(Buffer.concat(parts).toString("utf8")) : {}; } catch { return {}; }
}
const TRIES = new Map<string, number[]>(), MOST = 20, WINDOW_MS = 10 * 60 * 1000;   // registrations and friend codes
// piece 5: on the public listener, every request counts against its address -- generous for a person, not for a script
export const PUBLIC_MOST = 600;
const SEEN = new Map<string, number[]>();
const FORWARDED = ["cf-connecting-ip", "x-forwarded-for", "forwarded", "x-real-ip", "cf-ray"];

export function makeCommons(store: Store, accounts: AccountsConfig | null = null, opts: { public?: boolean } = {}): Server {
  return createServer(async (req, res) => {
    try {
      const path = new URL(req.url ?? "/", "http://localhost").pathname, method = req.method ?? "GET";
      const b = method === "POST" ? await body(req) : {};
      // the keeper's machine: loopback, or the machine's own address when the commons listens only on the tailnet's --
      // never the public listener, and never a request something passed on (piece 5)
      const forwarded = FORWARDED.some((h) => req.headers[h] !== undefined);
      const here = !opts.public && !forwarded && (isLoopback(req.socket.remoteAddress) || req.socket.remoteAddress === req.socket.localAddress);
      const who = opts.public ? `cf:${String(req.headers["cf-connecting-ip"] ?? req.socket.remoteAddress ?? "")}` : req.socket.remoteAddress ?? "";
      if (opts.public) {
        const now = Date.now(), t = (SEEN.get(who) ?? []).filter((x) => now - x < WINDOW_MS);
        SEEN.set(who, [...t, now]);
        if (t.length >= PUBLIC_MOST) return send(res, 429, { error: "too many requests -- wait ten minutes" });   // DRAFT
      }
      const tried = () => { const now = Date.now(), t = (TRIES.get(who) ?? []).filter((x) => now - x < WINDOW_MS); TRIES.set(who, [...t, now]); return t.length >= MOST; };
      // C-226: ACCOUNTS beside the commons (accounts_api.ts); a sign-in, a passkey's or a device's code tried too often waits
      if (path.startsWith("/accounts/")) {
        if (!accounts) return send(res, 404, { error: "accounts are not on this commons" });
        if (method === "POST" && ["/accounts/signin", "/accounts/passkey/login", "/accounts/device/join"].includes(path) && tried())
          return send(res, 429, { error: "too many tries -- wait ten minutes" });
        const r = await accountsRoute(store, ACCOUNT_KEYS, accounts, method, path, b, req.headers, here);
        return send(res, r.status, r.body);
      }
      if (method === "GET" && path === "/commons/keeper") return here ? send(res, 200, { homes: C.homes(store) }) : send(res, 403, { error: "the keeper's, on the commons' machine" });
      if (method === "POST" && path === "/commons/approve") {
        if (!here) return send(res, 403, { error: "the keeper's, on the commons' machine" });
        const r = C.approve(store, String(b.id ?? ""), b.yes !== false);
        return X.failed(r) ? send(res, 404, r) : send(res, 200, { homes: C.homes(store) });
      }
      if (method === "POST" && path === "/commons/register") {
        if (tried()) return send(res, 429, { error: "too many tries -- wait ten minutes" });
        const r = C.register(store, KEYS, b);
        return send(res, X.failed(r) ? 400 : 200, r);
      }
      const home = C.homeFor(store, KEYS, String(req.headers["x-daemons-home"] ?? ""));
      if (!home) return send(res, 401, { error: "register this home first" });
      if (method === "GET" && path === "/commons/home") return send(res, 200, C.view(store, home));
      if (!home.approved) return send(res, 403, { error: "this home is waiting for the commons to approve it" });   // DRAFT
      if (method === "POST" && path === "/commons/friend") {
        if (tried()) return send(res, 429, { error: "too many tries -- wait ten minutes" });
        const r = C.befriend(store, home, b.code);
        return send(res, X.failed(r) ? 400 : 200, r);
      }
      if (method === "POST" && path === "/commons/friend/accept") { const r = C.acceptFriend(store, home, String(b.id ?? "")); return send(res, X.failed(r) ? 400 : 200, r); }
      if (method === "POST" && path === "/commons/friend/forget") return send(res, 200, C.forgetFriend(store, home, String(b.id ?? "")));
      if (method === "POST" && path === "/commons/player") { const r = C.vouch(store, KEYS, home, b.name); return send(res, X.failed(r) ? 400 : 200, r); }
      if (path.startsWith("/commons/x/")) {
        const p = X.playerFor(store, KEYS, String(req.headers["x-daemons-player"] ?? ""));
        if (!p || p.home !== home.id) return send(res, 401, { error: "that player is not this home's" });
        const name = path.slice("/commons/x/".length);
        if (name === "claim") {                                     // piece 4: the guardian's token, passed by the hub
          const g = accounts ? A.guardianFor(store, ACCOUNT_KEYS, String(b.guardian ?? "")) : null;
          if (!g) return send(res, 401, { error: "sign in first" });
          const r = P.claim(store, g, b.profile, p);
          return send(res, X.failed(r) ? 400 : 200, r);
        }
        const r = await P.profileRoute(store, KEYS, p, name, b);   // a meeting or a hello waits on its lines
        return send(res, r?.error === "not found" ? 404 : r?.error ? 400 : 200, r);
      }
      return send(res, 404, { error: "not found" });
    } catch (e) { return send(res, 500, { error: (e as Error).message }); }
  });
}
