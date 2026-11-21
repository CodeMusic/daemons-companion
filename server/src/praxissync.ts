// C-290: this file runs on the phone too (C-111) -- the app imports it, directly or through another file -- so keep it free of Node-only APIs (node:*, fs).
// C-431: PRAXIS's SYNC over HTTP (docs/PROJECTS.md 5). The hub answers the exchange -- a paired phone or this machine, at
// home or on the tailnet, never through the relay (api.ts) -- and a phone reaches it with hubPeer(). The engine
// (@daemons/praxis) knows nothing of how events travel; this is one way they can.
//
//   POST /api/praxis/have      { spaces? }               -> { have }               what the hub has seen
//   POST /api/praxis/missing   { have, spaces?, limit? } -> { events }             what the asker lacks: HOME, SHARED and
//                                                                                   PUBLIC spaces -- THIS PHONE never
//   POST /api/praxis/receive   { events }                -> { received, joined }   taken, and any LIFE it then joined
//   POST /api/praxis/wanted    { spaces? }               -> { hashes }             blobs its spaces name and it lacks
//   POST /api/praxis/holds     { hashes }                -> { hashes }             which of these it holds
//   GET  /api/praxis/blob/<sha256>                       -> the bytes
//   PUT  /api/praxis/blob/<sha256>   the bytes           -> { kept }               kept only if they are what it says
//
// A phone that hosted alone and then pairs hands the hub what it made (handOver), and the hub joins the phone's LIFE to
// its own (goals.ts joinOthers): one LIFE again, nothing lost.
import { local, moveBlobs, push, type BlobPeer, type BlobStore, type Have, type Peer, type PxEvent, type Reach, type Received } from "@daemons/praxis";
import type { Store } from "./store.js";

type Reply = { status: number; body: unknown };
const ok = (body: unknown): Reply => ({ status: 200, body });
const no = (status: number, error: string): Reply => ({ status, body: { error } });

/** the most events one call carries, and the most hashes one asks about */
export const MOST_EVENTS = 2000, MOST_HASHES = 1000;
/** the reaches a hub sends a paired phone: its household's, and wider -- never a space that is THIS PHONE's */
const SENT: readonly Reach[] = ["home", "shared", "public"];

const strings = (v: unknown, most: number): string[] | null =>
  Array.isArray(v) && v.length <= most && v.every((x) => typeof x === "string") ? (v as string[]) : null;
const isHave = (v: unknown): v is Have => typeof v === "object" && v !== null && !Array.isArray(v) &&
  Object.values(v).every((r) => typeof r === "object" && r !== null && !Array.isArray(r) && Object.values(r).every((h) => typeof h === "string"));

/** the hub's half: one of the JSON calls above, by its name. `blobs` is where this copy keeps blobs. */
export function praxisRoute(store: Store, blobs: BlobStore, method: string, name: string, b: any): Reply {
  if (method !== "POST") return no(405, "PRAXIS's exchange is asked with POST");
  const px = store.life.px;
  const spaces = b?.spaces === undefined ? undefined : strings(b.spaces, MOST_HASHES);
  if (spaces === null) return no(400, "spaces: a list of space ids");
  switch (name) {
    case "have": return ok({ have: px.have(spaces) });
    case "missing": {
      if (!isHave(b?.have)) return no(400, "missing { have }: what you have seen, by space and replica");
      const limit = Number.isInteger(b.limit) && b.limit > 0 ? Math.min(b.limit, MOST_EVENTS) : MOST_EVENTS;
      return ok({ events: px.missing(b.have, { spaces, limit, reaches: SENT }) });
    }
    case "receive": {
      if (!Array.isArray(b?.events) || b.events.length > MOST_EVENTS) return no(400, `receive { events }: at most ${MOST_EVENTS}`);
      return px.transaction(() => {
        const received: Received = px.receive(b.events as PxEvent[]);
        return ok({ received, joined: store.life.joinOthers() });
      });
    }
    case "wanted": return ok({ hashes: px.blobs(spaces).filter((h) => !blobs.has(h)) });
    case "holds": {
      const hashes = strings(b?.hashes, MOST_HASHES);
      if (!hashes) return no(400, `holds { hashes }: at most ${MOST_HASHES}`);
      return ok({ hashes: local(px, blobs).holds!(hashes) });
    }
  }
  return no(404, "no such call in PRAXIS's exchange");
}

/** the phone's half: the hub at `base` as the far end of an exchange -- events and blobs */
export function hubPeer(base: string, token: string | null, f: typeof fetch = fetch): Peer & BlobPeer {
  const auth: Record<string, string> = token ? { authorization: `Bearer ${token}` } : {};
  const url = (name: string) => `${base.replace(/\/+$/, "")}/api/praxis/${name}`;
  const post = async (name: string, body: unknown) => {
    const r = await f(url(name), { method: "POST", headers: { ...auth, "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error ?? `the hub answered ${r.status}`);
    return j;
  };
  return {
    have: async (spaces) => (await post("have", { spaces })).have,
    missing: async (have, o) => (await post("missing", { have, spaces: o?.spaces, limit: o?.limit })).events,
    receive: async (events) => (await post("receive", { events })).received,
    wanted: async (spaces) => (await post("wanted", { spaces })).hashes,
    holds: async (hashes) => (await post("holds", { hashes })).hashes,
    blob: async (hash) => {
      const r = await f(url(`blob/${hash}`), { headers: auth });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`the hub answered ${r.status}`);
      return new Uint8Array(await r.arrayBuffer());
    },
    putBlob: async (hash, bytes) => {
      const r = await f(url(`blob/${hash}`), { method: "PUT", headers: { ...auth, "content-type": "application/octet-stream" }, body: bytes as BodyInit });
      return r.ok && (await r.json().catch(() => ({}))).kept === true;
    },
  };
}

export interface HandedOver { spaces: number; sent: number; ahead: number; blobs: number }

/** a phone that hosted alone, pairing with a hub, hands it everything it made -- each space of its own with anything in
 *  it, HOME and wider (THIS PHONE never leaves it), and their blobs -- and the hub joins the phone's LIFE to its own.
 *  Safe to repeat: only what the hub has not seen is sent. */
export async function handOver(store: Store, hub: Peer & Partial<BlobPeer>, blobs?: BlobStore): Promise<HandedOver> {
  const px = store.life.px;
  const mine = px.spaces().filter((s) => s.reach !== "phone" && !s.archived &&
    px.items(s.home).some((it) => it.space === s.id)).map((s) => s.id);
  if (!mine.length) return { spaces: 0, sent: 0, ahead: 0, blobs: 0 };
  const here = local(px, blobs);
  const { sent, ahead } = await push(here, hub, { spaces: mine, reaches: SENT });
  let moved = 0;
  if (blobs && hub.wanted && hub.holds && hub.blob && hub.putBlob)
    moved = (await moveBlobs(here as Peer & BlobPeer, hub as Peer & BlobPeer, mine)).moved;
  return { spaces: mine.length, sent, ahead, blobs: moved };
}
