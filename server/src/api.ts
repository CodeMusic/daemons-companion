// C-04: the companion's local HTTP API -- small on purpose. JSON in, JSON out, on this machine only.
//
//   GET  /api/today              the day (colour, note), the season of the daemon's edition, and the ONE next step
//   GET  /api/goals              every goal, its sub-items and steps
//   POST /api/goals              {title, breakdown?: true} -- a goal, broken down (C-06) when asked
//   POST /api/steps/:id/done     tick a step off
//   GET  /api/party              the party of the configured save COPY (C-02)
//   GET  /api/species/:id        one daemon's name, types, category and its edition's INDEX entry
import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";
import { readFileSync } from "node:fs";
import weekJson from "../data/week.json" with { type: "json" };
import speciesJson from "../data/species.json" with { type: "json" };
import { breakdown } from "./ai/breakdown.js";
import type { Config } from "./config.js";
import { Store } from "./db.js";
import { readSave } from "./save/reader.js";
import { season } from "./seasons.js";

const SPECIES = speciesJson as unknown as Record<string, any>;

async function body(req: IncomingMessage): Promise<any> {
  let s = "";
  for await (const chunk of req) s += chunk;
  return s ? JSON.parse(s) : {};
}

function send(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { "content-type": "application/json", "access-control-allow-origin": "*" });
  res.end(JSON.stringify(data));
}

export function today(cfg: Config, store: Store, now = new Date()) {
  const day = weekJson.days[now.getDay()];               // Sunday first, as the game keeps it
  return { date: now.toISOString().slice(0, 10), edition: cfg.edition, day, season: season(cfg.edition, now),
           next: store.nextStep() };
}

export function makeServer(cfg: Config, store = new Store(cfg.database)): Server {
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      const path = url.pathname;
      if (req.method === "OPTIONS") {
        res.writeHead(204, { "access-control-allow-origin": "*", "access-control-allow-methods": "GET,POST",
                             "access-control-allow-headers": "content-type" });
        return res.end();
      }
      if (req.method === "GET" && path === "/api/today") return send(res, 200, today(cfg, store));
      if (req.method === "GET" && path === "/api/goals") return send(res, 200, store.goals());
      if (req.method === "POST" && path === "/api/goals") {
        const b = await body(req);
        if (!b.title || typeof b.title !== "string") return send(res, 400, { error: "a goal needs a title" });
        const bd = b.breakdown ? await breakdown(b.title, cfg) : null;
        const goal = store.addGoal(b.title, bd?.plan);
        return send(res, 201, { goal, breakdown: bd });
      }
      const step = path.match(/^\/api\/steps\/(\d+)\/done$/);
      if (req.method === "POST" && step) {
        return store.completeStep(Number(step[1])) ? send(res, 200, { next: store.nextStep() })
                                                   : send(res, 404, { error: "no such step" });
      }
      if (req.method === "GET" && path === "/api/party") {
        if (!cfg.savePath) return send(res, 404, { error: "no save named -- set savePath to a COPY of your save" });
        return send(res, 200, readSave(new Uint8Array(readFileSync(cfg.savePath))));
      }
      const sp = path.match(/^\/api\/species\/(\d+)$/);
      if (req.method === "GET" && sp) {
        const row = SPECIES[sp[1]];
        if (!row) return send(res, 404, { error: "no such species" });
        return send(res, 200, { ...row, entry: row.entry[cfg.edition] });
      }
      send(res, 404, { error: "not found" });
    } catch (e) {
      send(res, 500, { error: (e as Error).message });
    }
  });
}
