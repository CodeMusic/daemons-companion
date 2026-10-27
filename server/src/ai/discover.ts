// C-180 (HUB.md Phase 5): finding the modules in the house. Nothing is scanned: a module is either on the hub's own
// link to its Module LLM (eth1, the hub at 192.168.50.1 and the module at .2 -- hub/ sets it up), or at an address the
// user gave (`ai.moduleAddresses`, comma-separated: the standalone AX630 board on Wi-Fi, any more later). Every round
// asks each one for its /v1/models through setModules, which keeps only those that answer, so a module that is off
// drops out and comes back on its own. Modules added by hand (POST /api/ai/modules) are asked again too.
// No node: imports -- this is reached by routes.ts on the phone as well.
import { modulesIn, setModules, type ModuleAt } from "./house.js";

export const LINK_MODULE = "http://192.168.50.2:8000";
export const ROUND_MS = 5 * 60_000;

type Store = { getSetting(k: string): string | null; setSetting(k: string, v: string): void };

// "10.0.0.40", "10.0.0.40:8000" or "http://board.local:8000" -> a url; the module's OpenAI front door is port 8000
export function moduleUrl(a: string): string | null {
  const t = a.trim().replace(/\/+$/, "");
  if (!t) return null;
  const u = /^https?:\/\//.test(t) ? t : `http://${t}`;
  try { const p = new URL(u); return `${p.protocol}//${p.hostname}:${p.port || "8000"}`; } catch { return null; }
}

export function candidates(store: Store): ModuleAt[] {
  const out: ModuleAt[] = [];
  const add = (m: ModuleAt) => { if (!out.some((o) => o.url === m.url)) out.push(m); };
  if (store.getSetting("ai.moduleLink") !== "off") add({ url: store.getSetting("ai.moduleLink") ?? LINK_MODULE, name: "hub module", found: "link" });
  (store.getSetting("ai.moduleAddresses") ?? "").split(",").forEach((a, i) => {
    const url = moduleUrl(a);
    if (url) add({ url, name: i ? `board ${i + 1}` : "dev board", found: "address" });
  });
  modulesIn((k) => store.getSetting(k)).forEach(add);   // those added by hand stay asked
  return out;
}

export const discoverModules = (store: Store) => setModules(store, candidates(store));

// At start and every five minutes; a failed round is only a round with nothing found
export function discoveryLoop(store: Store, every = ROUND_MS): () => void {
  const round = () => { discoverModules(store).catch(() => {}); };
  round();
  const t = setInterval(round, every);
  return () => clearInterval(t);
}
