// The companion's server, on this machine: npm start (Node 24).
import { loadConfig } from "./config.js";
import { makeServer } from "./api.js";

const cfg = loadConfig();
makeServer(cfg).listen(cfg.port, "127.0.0.1", () =>
  console.log(`daemons-companion server on http://127.0.0.1:${cfg.port}  (edition ${cfg.edition}, AI ${cfg.ai.enabled ? "on" : "off"})`));
