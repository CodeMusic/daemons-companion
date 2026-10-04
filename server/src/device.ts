// C-32: the site and the device, linked -- with the server as the hub, so the site never talks to a radio itself.
// The site queues a COMMAND here (run a routine, set the device's Wi-Fi, try an IR code); the device takes its
// commands -- through the bridge over the cable, or itself over Wi-Fi -- and answers each with a RESULT. The device
// also tells the hub what ROUTINES it has, so the site's list is the board's own and never a copy kept by hand.
//
// It lives in memory: a link is a now, not a record. What a routine did is kept as tending the daemon elsewhere (C-13).

export type Via = "usb" | "wifi";
export type Command = { id: number; type: "run" | "wifi" | "ir" | "remote" | "network"; [k: string]: unknown };
export type Result = { id: number; ok: boolean; text: string; at: string };
export type RoutineType = { name: string; radio: string; routines: string[] };

const FRESH_MS = 15000;          // as the device's own USB_FRESH_MS: unseen for longer, it is not linked
const KEEP_RESULTS = 12;

export class DeviceHub {
  private seenAt = 0;
  private via: Via | null = null;
  private queue: Command[] = [];
  private results: Result[] = [];
  private nextId = 1;
  routines: RoutineType[] = [];
  remotes: { active: number; remotes: { name: string; buttons: boolean[] }[] } = { active: 0, remotes: [] };   // C-51
  networks: string[] = [];                                                                                   // C-52
  currentNetwork = "";
  firmware = "";

  seen(via: Via, now = Date.now()) { this.seenAt = now; this.via = via; }

  link(now = Date.now()) {
    const linked = this.seenAt > 0 && now - this.seenAt < FRESH_MS;
    return { linked, via: linked ? this.via : null, lastSeen: this.seenAt ? new Date(this.seenAt).toISOString() : null,
             firmware: this.firmware, routines: this.routines, remotes: this.remotes, networks: this.networks,
             currentNetwork: this.currentNetwork, pending: this.queue.map(({ id, type }) => ({ id, type })),
             results: this.results };
  }

  send(cmd: Omit<Command, "id">): number {
    const id = this.nextId++;
    this.queue.push({ ...cmd, id } as Command);
    return id;
  }

  // The device takes everything waiting for it, once. A Wi-Fi password is only ever handed down the cable: it never
  // crosses the network, even the local one (C-33).
  take(via: Via): Command[] {
    const mine = this.queue.filter((c) => via === "usb" || c.type !== "wifi");
    this.queue = this.queue.filter((c) => !mine.includes(c));
    return mine;
  }

  answer(r: { id: number; ok: boolean; text: string }) {
    this.results = [{ id: Number(r.id), ok: !!r.ok, text: String(r.text ?? ""), at: new Date().toISOString() },
                    ...this.results].slice(0, KEEP_RESULTS);
  }

  hasRoutine(name: string) {
    const [type, routine] = name.split("/");
    return this.routines.some((t) => t.name === type && t.routines.includes(routine));
  }
}
