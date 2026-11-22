// C-434: THE VAULT on its own machine (roverbyteseer for now): npm run vault (Node 22+). hub/vault.sh runs it there.
// VAULT_DIR is where it keeps its households (vault.json and households/), VAULT_PORT its port (4760), VAULT_HOST where it
// listens (on roverbyteseer, its tailnet address only). It takes any address: when the tailnet gives way to something
// easier for new players, the vault moves behind it with no change of code.
//   npm run vault                 serve
//   npm run vault -- add NAME     a new household, its token printed once (only its SHA-256 is kept)
//   npm run vault -- list         the households it keeps
import { randomBytes } from "node:crypto";
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { makeVault, readBook, tokenFor } from "./vault.js";

const dir = process.env.VAULT_DIR || join(homedir(), "Library", "Application Support", "daemons-vault");
const port = Number(process.env.VAULT_PORT || 4760), host = process.env.VAULT_HOST || "127.0.0.1";
const [what, name] = process.argv.slice(2);

if (what === "add") {
  if (!name || !/^[a-z0-9][a-z0-9-]{0,40}$/.test(name)) { console.error("add NAME: lower case, digits and dashes"); process.exit(64); }
  const book = readBook(dir);
  if (book.households[name]) { console.error(`${name} is kept here already`); process.exit(1); }
  const token = randomBytes(32).toString("base64url");
  book.households[name] = { token: tokenFor(token), since: new Date().toISOString() };
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const f = join(dir, "vault.json"), passing = `${f}.${process.pid}.part`;
  writeFileSync(passing, JSON.stringify(book, null, 2) + "\n", { mode: 0o600 });
  renameSync(passing, f);
  console.log(`${name}'s token (shown once; put it in that hub's config.json as vault.token):\n${token}`);
} else if (what === "list") {
  for (const [n, h] of Object.entries(readBook(dir).households)) console.log(`${n}  since ${h.since}`);
} else {
  makeVault(dir).listen(port, host, () => console.log(`THE VAULT on http://${host}:${port}  (households in ${dir})`));
}
