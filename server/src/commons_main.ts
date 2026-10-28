// THE COMMONS, on its own machine (roverbyteseer, the tailnet only for now): npm run commons (Node 22+).
// COMMONS_DB names its database (default commons.sqlite beside this folder), COMMONS_PORT its port (4750), COMMONS_HOST
// where it listens (0.0.0.0: the tailnet reaches it; the machine's firewall keeps the internet out).
//   approve a home:  curl -s localhost:4750/commons/keeper   then   curl -s -XPOST localhost:4750/commons/approve -d '{"id":"h1"}'
import { fileURLToPath } from "node:url";
import { makeCommons } from "./commons_api.js";
import { Store } from "./db.js";

const db = process.env.COMMONS_DB || fileURLToPath(new URL("../commons.sqlite", import.meta.url));
const port = Number(process.env.COMMONS_PORT || 4750), host = process.env.COMMONS_HOST || "0.0.0.0";
makeCommons(new Store(db)).listen(port, host, () => console.log(`THE COMMONS on http://${host}:${port}  (database ${db})`));
