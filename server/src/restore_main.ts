// C-434: a new hub from THE VAULT with nothing but the household's recovery code (backup.ts restore()). Run it before the
// new hub's server first starts, on the database its config names, with the vault's address and the household's token in
// that config (`vault`):
//   COMPANION_CONFIG=/path/config.json npx tsx src/restore_main.ts XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX
// It fills a database that holds no PRAXIS events yet, and writes backup.json beside it, so the backup carries on.
import { existsSync } from "node:fs";
import { restore } from "./backup.js";
import { loadConfig } from "./config.js";

const named = process.env.COMPANION_CONFIG || undefined;
if (named && !existsSync(named)) { console.error(`COMPANION_CONFIG names ${named}, which is not there`); process.exit(1); }
const cfg = loadConfig(named);
const code = process.argv.slice(2).join("");
if (!code) { console.error("restore_main.ts CODE: the recovery code shown when the backup was turned on"); process.exit(64); }
if (!cfg.vault) { console.error("the config names no vault ({ \"vault\": { \"url\": ..., \"token\": ... } })"); process.exit(64); }
if (cfg.database === ":memory:") { console.error("restore into a database file, not one in memory"); process.exit(64); }
restore({ database: cfg.database, vault: cfg.vault, code }).then(
  (r) => console.log(`restored ${r.spaces} space(s): ${r.events} event(s), ${r.blobs} blob(s), keyring generation ${r.generation}`),
  (e) => { console.error(String(e?.message ?? e)); process.exit(1); });
