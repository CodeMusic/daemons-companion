// C-290: this file runs on the phone too (C-111) -- the app imports it, directly or through another file -- so keep it free of Node-only APIs (node:*, fs).
// C-226: ACCOUNTS from the app, through its hub. Phones and devices talk only to their hub (C-222), so the hub passes
// each /api/accounts/<path> to the /accounts/<path> of THE COMMONS it is linked to, and the answer back. The tokens are
// the device's own -- the guardian's (the app keeps it in the phone's keychain or the site's storage) and a kid's
// device's -- sent in the body as { guardian, profile, get, body }, never kept by the hub, and passed on as the
// commons' headers. `get: true` asks with GET (the app's api() posts whenever it sends a body). No node: imports.
import type { Store } from "./store.js";
import { commonsOf } from "./commonslink.js";

export type Relayed = { status: number; body: unknown };
const PATH = /^\/api\/accounts\/([a-z/]{1,40})$/;

export async function accountsRelay(store: Store, path: string, b: any, f: typeof fetch = fetch): Promise<Relayed> {
  const m = PATH.exec(path);
  if (!m || m[1].includes("..")) return { status: 404, body: { error: "not found" } };
  const c = commonsOf(store);
  if (!c) return { status: 503, body: { error: "Accounts live on THE COMMONS: link this home to it first (TRADE, THE COMMONS)." } };   // DRAFT
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (typeof b?.guardian === "string" && b.guardian) headers.authorization = `Bearer ${b.guardian}`;
  if (typeof b?.profile === "string" && b.profile) headers["x-daemons-profile"] = b.profile;
  try {
    const r = await f(`${c.url}/accounts/${m[1]}`, b?.get ? { headers } : { method: "POST", headers, body: JSON.stringify(b?.body ?? {}) });
    let body: unknown;
    try { body = await r.json(); } catch { body = { error: `the commons answered ${r.status}` }; }
    return { status: r.status, body };
  } catch (e) { return { status: 502, body: { error: `the commons did not answer: ${(e as Error).message}` } }; }   // DRAFT
}
