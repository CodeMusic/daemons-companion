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
//   GET/POST /commons/x/<name>             the exchange's requests (tradelink.ts exchangeRoute), within REACH
//
// The tailnet only for now (the user, 2026-10-28): it listens where its config says, and nothing here is for the
// internet until accounts and abuse are decided.
import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";
import type { Store } from "./store.js";
import { KEYS } from "./keys.js";
import * as C from "./commons.js";
import * as X from "./exchange.js";
import { exchangeRoute } from "./tradelink.js";

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

export function makeCommons(store: Store): Server {
  return createServer(async (req, res) => {
    try {
      const path = new URL(req.url ?? "/", "http://localhost").pathname, method = req.method ?? "GET";
      const b = method === "POST" ? await body(req) : {};
      // the keeper's machine: loopback, or the machine's own address when the commons listens only on the tailnet's
      const here = isLoopback(req.socket.remoteAddress) || req.socket.remoteAddress === req.socket.localAddress, who = req.socket.remoteAddress ?? "";
      const tried = () => { const now = Date.now(), t = (TRIES.get(who) ?? []).filter((x) => now - x < WINDOW_MS); TRIES.set(who, [...t, now]); return t.length >= MOST; };
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
        const r = await exchangeRoute(store, KEYS, p, path.slice("/commons/x/".length), b, C.reach(store));   // a meeting or a hello waits on its lines
        return send(res, r?.error === "not found" ? 404 : r?.error ? 400 : 200, r);
      }
      return send(res, 404, { error: "not found" });
    } catch (e) { return send(res, 500, { error: (e as Error).message }); }
  });
}
