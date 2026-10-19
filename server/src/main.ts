// The companion's server, on this machine: npm start (Node 24).
import { existsSync } from "node:fs";
import { loadConfig } from "./config.js";
import { makeServer } from "./api.js";
import { Store } from "./db.js";

// C-53: whether it listens on the network is set on the site (Settings) and kept by the server; config.json is the default.
// C-169: COMPANION_CONFIG names another config file -- the DAEMONS playground runs companions of its own this way, each
// with its own port, database and save, beside the user's. A file that is not there stops it: the defaults are the
// user's own database and port.
const named = process.env.COMPANION_CONFIG || undefined;
if (named && !existsSync(named)) { console.error(`COMPANION_CONFIG names ${named}, which is not there`); process.exit(1); }
const base = loadConfig(named);
const store = new Store(base.database);
const cfg = { ...base, host: store.getSetting("host") ?? base.host };
makeServer(cfg, store).listen(cfg.port, cfg.host, () =>
  console.log(`daemons-companion server on http://${cfg.host}:${cfg.port}  (edition ${cfg.edition}, AI ${cfg.ai.enabled ? "on" : "off"})` +
              (cfg.host === "127.0.0.1" ? "" : "  -- listening on the local network: no secrets go over it")));
