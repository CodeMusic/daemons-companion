// THE COMMONS, on its own machine (roverbyteseer, the tailnet only for now): npm run commons (Node 22+).
// COMMONS_DB names its database (default commons.sqlite beside this folder), COMMONS_PORT its port (4750), COMMONS_HOST
// where it listens -- on roverbyteseer, its tailnet address only (hub/commons.sh), so neither the internet nor the house's
// own network reaches it.
//   approve a home, on that machine:  hub/commons.sh homes   then   hub/commons.sh approve h1
import { fileURLToPath } from "node:url";
import { makeCommons } from "./commons_api.js";
import { Store } from "./db.js";
import { reach } from "./commons.js";
import { llmTalker } from "./llmtalker.js";
import { meetOnTheirOwn, setMeetTalker } from "./together.js";

const db = process.env.COMMONS_DB || fileURLToPath(new URL("../commons.sqlite", import.meta.url));
const port = Number(process.env.COMMONS_PORT || 4750), host = process.env.COMMONS_HOST || "0.0.0.0";
// C-220: meetings' lines from a model -- COMMONS_LLM_URL (an OpenAI-compatible endpoint), COMMONS_LLM_MODEL and
// COMMONS_LLM_KEY from the environment, never from a file here; unset, every line is written. Friends' daemons out
// together meet on their own each quarter hour, one pair a turn, as at home.
const store = new Store(db);
const llm = process.env.COMMONS_LLM_URL, model = process.env.COMMONS_LLM_MODEL;
if (llm && model) setMeetTalker(llmTalker(llm, model, process.env.COMMONS_LLM_KEY ?? ""));
setInterval(() => { meetOnTheirOwn(store, reach(store)).catch(() => {}); }, 15 * 60 * 1000).unref();
makeCommons(store).listen(port, host, () =>
  console.log(`THE COMMONS on http://${host}:${port}  (database ${db}; meetings' lines ${llm && model ? `from ${model}` : "written"})`));
