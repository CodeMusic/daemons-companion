// C-80, the first step: every device has a name of its own (docs/DEVICES.md). A board's id is its kind and the end of
// its MAC (`t-embed-cc1101-36f484`); it says so in HELLO and in an `x-device` header on every request, and a bridge
// (the cable, the phone) passes it on. The server keeps each one it has heard: when, by which way, its firmware and its
// battery -- kept in the store, so a restart does not forget them. Which daemon each carries comes next, once the user
// has answered DEVICES.md's questions.
import type { Store } from "./db.js";
import type { Via } from "./device.js";

export type Battery = { percent: number; mv: number | null; charging: boolean; full: boolean; usb: boolean; at: string };
export type DeviceRow = { id: string; kind: string; via: Via | null; firstSeen: string; lastSeen: string;
                          firmware: string | null; battery: Battery | null };

const KEY = "devices";
const ID = /^[a-z0-9][a-z0-9-]{2,47}$/;
export const FRESH_MS = 60_000;

export function validDeviceId(id: unknown): id is string { return typeof id === "string" && ID.test(id); }

// "t-embed-cc1101-36f484" -> "t-embed-cc1101": the kind is the id without its MAC tail.
export function kindOf(id: string): string { return id.replace(/-[0-9a-f]{6}$/, ""); }

export class Devices {
  constructor(private store: Store) {}

  private all(): Record<string, DeviceRow> { return JSON.parse(this.store.getSetting(KEY) ?? "{}"); }
  private save(rows: Record<string, DeviceRow>) { this.store.setSetting(KEY, JSON.stringify(rows)); }

  seen(id: string, via: Via, now = new Date()) {
    if (!validDeviceId(id)) return;
    const rows = this.all(), at = now.toISOString(), row = rows[id];
    // written at most every ten seconds a device, so a board polling every second does not rewrite the store each time
    if (row && row.via === via && now.getTime() - Date.parse(row.lastSeen) < 10_000) return;
    rows[id] = { id, kind: kindOf(id), via, firstSeen: row?.firstSeen ?? at, lastSeen: at,
                 firmware: row?.firmware ?? null, battery: row?.battery ?? null };
    this.save(rows);
  }

  note(id: string, what: { firmware?: string; battery?: Battery }) {
    if (!validDeviceId(id)) return;
    const rows = this.all(), at = new Date().toISOString(), row = rows[id];
    rows[id] = { id, kind: kindOf(id), via: row?.via ?? null, firstSeen: row?.firstSeen ?? at, lastSeen: row?.lastSeen ?? at,
                 firmware: what.firmware ?? row?.firmware ?? null, battery: what.battery ?? row?.battery ?? null };
    this.save(rows);
  }

  // Every device heard, the most recent first, each with whether it is here now.
  list(now = Date.now()) {
    return Object.values(this.all())
      .sort((a, b) => Date.parse(b.lastSeen) - Date.parse(a.lastSeen))
      .map((d) => ({ ...d, here: now - Date.parse(d.lastSeen) < FRESH_MS }));
  }

  forget(id: string) { const rows = this.all(); delete rows[id]; this.save(rows); }
}
