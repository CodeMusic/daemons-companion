// THE COMMONS, on its own machine (roverbyteseer, the tailnet only for now): npm run commons (Node 22+).
// COMMONS_DB names its database (default commons.sqlite beside this folder), COMMONS_PORT its port (4750), COMMONS_HOST
// where it listens -- on roverbyteseer, its tailnet address only (hub/commons.sh), so neither the internet nor the house's
// own network reaches it.
//   approve a home, on that machine:  hub/commons.sh homes   then   hub/commons.sh approve h1
import { fileURLToPath } from "node:url";
import { makeCommons } from "./commons_api.js";
import { Store } from "./db.js";

const db = process.env.COMMONS_DB || fileURLToPath(new URL("../commons.sqlite", import.meta.url));
const port = Number(process.env.COMMONS_PORT || 4750), host = process.env.COMMONS_HOST || "0.0.0.0";
makeCommons(new Store(db)).listen(port, host, () => console.log(`THE COMMONS on http://${host}:${port}  (database ${db})`));
