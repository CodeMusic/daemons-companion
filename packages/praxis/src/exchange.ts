// C-429: PRAXIS runs on the phone too (C-111) -- no node:*, no fs, and nothing imported from the companion.
// SYNC (PROJECTS.md 5) is one exchange: "here is what I have seen; send me the rest" -- both ways, safe to repeat, in any
// order. What carries it does not matter (HTTP to the hub, the n8n relay's envelope, Bluetooth, a USB cable, a file
// carried by hand): a transport only has to put a Peer's three calls at the far end. A Praxis is a Peer as it is.
// Which replicas may exchange which spaces, and the blobs beside the events, are C-431.

import type { Have, Received } from "./engine.js";
import type { PxEvent } from "./events.js";

export interface Peer {
  have(spaces?: string[]): Have | Promise<Have>;
  missing(have: Have, o?: { spaces?: string[]; limit?: number }): PxEvent[] | Promise<PxEvent[]>;
  receive(events: PxEvent[]): Received | Promise<Received>;
}

/** what the far end lacks, sent in batches until it lacks nothing */
async function send(from: Peer, to: Peer, spaces: string[] | undefined, batch: number): Promise<number> {
  let sent = 0;
  for (;;) {
    const events = await from.missing(await to.have(spaces), { spaces, limit: batch });
    if (!events.length) return sent;
    const r = await to.receive(events);
    if (!r.applied) return sent;          // nothing it would take: stop rather than offer it again
    sent += r.applied;
  }
}

/** a and b exchange until neither has anything the other lacks. A keeper that numbers what it was sent makes new
 *  events, so this goes round again until a round moves nothing. Returns what each was sent. */
export async function sync(a: Peer, b: Peer, o: { spaces?: string[]; batch?: number } = {}): Promise<{ toA: number; toB: number }> {
  const batch = o.batch ?? 500;
  let toA = 0, toB = 0;
  for (let round = 0; round < 8; round++) {
    const b1 = await send(a, b, o.spaces, batch), a1 = await send(b, a, o.spaces, batch);
    toB += b1; toA += a1;
    if (!a1 && !b1) break;
  }
  return { toA, toB };
}
