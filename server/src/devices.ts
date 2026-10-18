// C-80, the first step: every device has a name of its own (docs/DEVICES.md). A board's id is its kind and the end of
// its MAC (`t-embed-cc1101-36f484`); it says so in HELLO and in an `x-device` header on every request, and a bridge
// (the cable, the phone) passes it on. The server keeps each one it has heard: when, by which way, its firmware and its
// battery -- kept in the store, so a restart does not forget them. Which daemon each carries comes next, once the user
// has answered DEVICES.md's questions.
import { randomBytes, timingSafeEqual } from "node:crypto";
import type { Store } from "./db.js";
import { validDeviceId, kindOf } from "./deviceid.js";
export { validDeviceId, kindOf };
import type { Via } from "./device.js";

export type Battery = { percent: number; mv: number | null; charging: boolean; full: boolean; usb: boolean; at: string };
export type DeviceRow = { id: string; kind: string; via: Via | null; firstSeen: string; lastSeen: string;
                          firmware: string | null; battery: Battery | null };

const KEY = "devices", KEYS = "device.keys";
export const FRESH_MS = 60_000;


// the review, 2026-10-18: one unreadable setting made every /api/device/* request a 500 -- it reads as nothing instead
function parsed<T>(json: string | null | undefined): Record<string, T> {
  try { const v = JSON.parse(json ?? "{}"); return v && typeof v === "object" ? v : {}; } catch { return {}; }
}

export class Devices {
  constructor(private store: Store) {}

  private all(): Record<string, DeviceRow> { return parsed(this.store.getSetting(KEY)); }
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
      // in the order each was first seen, so the list stays put while devices check in (the user, 2026-10-11: the phone's
      // DEVICE tab reshuffled every few seconds, sorted by lastSeen, and could not be tapped)
      .sort((a, b) => Date.parse(a.firstSeen) - Date.parse(b.firstSeen) || a.id.localeCompare(b.id))
      .map((d) => ({ ...d, here: now - Date.parse(d.lastSeen) < FRESH_MS }));
  }

  forget(id: string) {
    const rows = this.all(); delete rows[id]; this.save(rows);
    const keys = this.keys(); delete keys[id]; this.store.setSetting(KEYS, JSON.stringify(keys));   // its key stops working
  }

  // C-82: a key of its own, for a board away from home that reaches the relay on its own Wi-Fi. Made the first time the
  // board is linked by its cable, and handed to it only down that cable (api.ts); kept as a paired phone's key is.
  private keys(): Record<string, string> { return parsed(this.store.getSetting(KEYS)); }
  keyFor(id: string): string | null {
    if (!validDeviceId(id)) return null;
    const keys = this.keys();
    if (!keys[id]) { keys[id] = randomBytes(24).toString("base64url"); this.store.setSetting(KEYS, JSON.stringify(keys)); }
    return keys[id];
  }
  deviceFor(key: string): string | null {
    for (const [id, k] of Object.entries(this.keys()))
      if (k.length === key.length && timingSafeEqual(Buffer.from(k), Buffer.from(key))) return id;
    return null;
  }
}
