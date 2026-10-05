// C-15: the phone as a companion that meets others nearby (C-27) -- the same beacon as the board's
// (firmware/esp32/src/meet.cpp): one service UUID, dae0beac-0015-4d45-SSSS-PPPPPPPP0001, the carried daemon's species
// and a random tag that changes every hour. While the app is open it listens for a few seconds every three minutes;
// what it hears goes to the companion (POST /api/device/met), which keeps it once an hour per tag and never counts our
// own board (it notes that our companions heard each other: the proof the radios work). iOS hears another iPhone's beacon only while that iPhone has the app open; a board, always.
import type { BleManager } from "react-native-ble-plx";
import Beacon from "./modules/daemons-beacon";

const PREFIX = "dae0beac-0015-4d45-";
const ROTATE_MS = 3600000, LISTEN_EVERY_MS = 180000, LISTEN_MS = 5000;
type Api = <T>(path: string, body?: unknown) => Promise<T>;

class Meeting {
  private api: Api | null = null;
  private ble: (() => Promise<BleManager>) | null = null;
  private tag = "";
  private tagAt = 0;
  private species = 0;
  private on = false;
  private busy = false;                                          // one check at a time: opening the app runs two
  private ours = new Set<string>();
  private heard = new Map<string, number>();                     // tag -> when, for once an hour
  private timer: ReturnType<typeof setInterval> | null = null;

  start(api: Api, ble: () => Promise<BleManager>) {
    this.api = api; this.ble = ble;
    this.tick();
    this.timer ??= setInterval(() => this.tick(), LISTEN_EVERY_MS);
  }

  // Back at the front: a listen now rather than in three minutes.
  nudge() { this.tick(); }

  private async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      const b = await this.api!<{ meet: boolean; species: number | null; ours: string[] }>("/api/beacons");
      this.ours = new Set(b.ours);
      if (!b.meet || !b.species) return this.stop();
      if (!this.on || b.species !== this.species || Date.now() - this.tagAt > ROTATE_MS) {
        this.species = b.species;
        this.tag = Array.from({ length: 8 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
        this.tagAt = Date.now();
        Beacon.start(`${PREFIX}${b.species.toString(16).padStart(4, "0")}-${this.tag}0001`);
        this.on = true;
        await this.api!("/api/device/beacon", { peer: this.tag }).catch(() => {});
      }
      await this.listen();
    } catch { /* the companion is out of reach: try again next time */ }
    finally { this.busy = false; }
  }

  private stop() { if (this.on) { Beacon.stop(); this.on = false; } }

  private async listen() {
    const ble = await this.ble!();
    const found: { species: string; peer: string }[] = [];
    ble.startDeviceScan(null, { allowDuplicates: false }, (error, d) => {
      if (error || !d?.serviceUUIDs) return;
      for (const raw of d.serviceUUIDs) {
        const u = raw.toLowerCase();
        if (u.length !== 36 || !u.startsWith(PREFIX)) continue;
        const species = parseInt(u.slice(19, 23), 16), peer = u.slice(24, 32);
        if (!species || peer === this.tag) continue;          // our board too: the server notes it, never counts it
        if (Date.now() - (this.heard.get(peer) ?? 0) < ROTATE_MS) continue;
        this.heard.set(peer, Date.now());
        found.push({ species: String(species), peer });
      }
    });
    await new Promise((r) => setTimeout(r, LISTEN_MS));
    ble.stopDeviceScan();
    for (const m of found) await this.api!("/api/device/met", m).catch(() => {});
  }
}

export const meeting = new Meeting();
