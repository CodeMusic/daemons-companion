// C-93: the networks every device knows (the user, 2026-10-09: "saved networks should be available to all connected
// devices -- like if i save it on one they all get it"). One list, kept here: a network learned anywhere -- on a board
// (UPLINK, TEACH A NETWORK), on the Tab5, or from the site -- is learned by every device the next time it is in touch,
// and one forgotten anywhere is forgotten by all of them.
//
// A forget is remembered (by name), so a board that has not heard yet cannot bring a network back by reporting it: only
// a board that learned it again itself (`fresh`) can. Passwords are kept on this machine as the boards' keys are, and
// are handed only to a device that has proved itself -- down the cable, a board's own key, a paired key (api.ts). The
// site and the app see names only.
import type { Store } from "./db.js";

const KEY = "networks.shared";
export type Network = { ssid: string; password: string; at: string };
type Shared = { rev: number; nets: Network[]; forgot: Record<string, string> };
export type Reported = { ssid: string; password: string; fresh?: boolean };

const MAX = 8;                                  // as a board keeps (MAX_NETS): the newest eight
const clean = (s: unknown) => (typeof s === "string" ? s.slice(0, 32) : "");          // an SSID is at most 32 bytes
const cleanPass = (s: unknown) => (typeof s === "string" ? s.slice(0, 64) : "");      // a WPA passphrase, 64

export class SharedNetworks {
  constructor(private store: Store) {}

  private read(): Shared {
    try { const s = JSON.parse(this.store.getSetting(KEY) ?? ""); if (Array.isArray(s.nets)) return s; } catch { /* none yet */ }
    return { rev: 0, nets: [], forgot: {} };
  }
  private write(s: Shared) { s.rev++; this.store.setSetting(KEY, JSON.stringify(s)); }

  rev() { return this.read().rev; }
  // What the site and the app see: names, never a password.
  names() { const s = this.read(); return { rev: s.rev, networks: s.nets.map((n) => n.ssid) }; }
  // What a device that has proved itself is handed: every network, and every one forgotten.
  full() { const s = this.read(); return { rev: s.rev, shared: s.nets.map(({ ssid, password }) => ({ ssid, password })),
                                           forget: Object.keys(s.forgot) }; }

  learn(ssid: string, password: string, now = new Date()): boolean {
    ssid = clean(ssid); password = cleanPass(password);
    if (!ssid) return false;
    const s = this.read();
    const had = s.nets.find((n) => n.ssid === ssid);
    if (had && had.password === password && !s.forgot[ssid]) return true;
    delete s.forgot[ssid];
    s.nets = [...s.nets.filter((n) => n.ssid !== ssid), { ssid, password, at: now.toISOString() }].slice(-MAX);
    this.write(s);
    return true;
  }

  forget(ssid: string, now = new Date()): boolean {
    ssid = clean(ssid);
    const s = this.read();
    if (!ssid || (!s.nets.some((n) => n.ssid === ssid) && s.forgot[ssid])) return false;
    s.nets = s.nets.filter((n) => n.ssid !== ssid);
    s.forgot[ssid] = now.toISOString();
    this.write(s);
    return true;
  }

  // What a device reports it knows. New to the list: added, unless forgotten here and not learned again on the device.
  // Known with another password: the device's wins only if it learned it again itself. Forgotten on the device: forgotten.
  merge(known: Reported[], forgot: string[], now = new Date()) {
    for (const f of forgot) this.forget(f, now);
    for (const k of known) {
      const ssid = clean(k?.ssid);
      if (!ssid) continue;
      const s = this.read(), had = s.nets.find((n) => n.ssid === ssid);
      if (k.fresh) this.learn(ssid, k.password, now);
      else if (!had && !s.forgot[ssid]) this.learn(ssid, k.password, now);
    }
  }
}
