// C-15: the phone as a companion that meets others nearby (C-27) -- the same beacon as the board's
// (firmware/esp32/src/meet.cpp): one service UUID, dae0beac-0015-4d45-SSSS-PPPPPPPP0001, the carried daemon's species
// and a random tag that changes every hour. While the app is open it listens for a few seconds every three minutes;
// what it hears goes to the companion (POST /api/device/met), which keeps it once an hour per tag and never counts our
// own board (it notes that our companions heard each other: the proof the radios work). iOS hears another iPhone's beacon only while that iPhone has the app open; a board, always.
import type { BleManager } from "react-native-ble-plx";
import Beacon from "./modules/daemons-beacon";
import { Gatherer, toPieces, type BleCast } from "../server/src/blecast";

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
  // C-141: broadcasts by Bluetooth, as the boards carry them (server/src/blecast.ts) -- heard while NEARBY is open,
  // sent as a twelve-second burst of pieces after a send; only while MEET OTHERS NEARBY is on (the beacon's own consent)
  private gatherer = new Gatherer();
  private casting = false;                                       // NEARBY is open: listen the whole time
  private scanning = false;
  private found: { species: string; peer: string }[] = [];
  private beaconUuid = "";
  private burstTimer: ReturnType<typeof setInterval> | null = null;

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
        this.beaconUuid = `${PREFIX}${b.species.toString(16).padStart(4, "0")}-${this.tag}0001`;
        if (!this.burstTimer) Beacon.start(this.beaconUuid);
        this.on = true;
        await this.api!("/api/device/beacon", { peer: this.tag }).catch(() => {});
      }
      await this.listen();
    } catch { /* the companion is out of reach: try again next time */ }
    finally { this.busy = false; }
  }

  private stop() { if (this.on) { Beacon.stop(); this.on = false; } this.casting && this.stopScan(); }

  // One scan serves both: beacons go to `found` for the meeting's listen, broadcast pieces to the gatherer.
  private onDevice = (uuids: string[]) => {
    for (const raw of uuids) {
      const u = raw.toLowerCase();
      if (u.length === 36 && u.startsWith("dae1")) {
        const c = this.gatherer.take(u);
        if (c) this.api!("/api/device/broadcast", { ...c, dir: "in", via: "ble" }).catch(() => {});
        continue;
      }
      if (u.length !== 36 || !u.startsWith(PREFIX)) continue;
      const species = parseInt(u.slice(19, 23), 16), peer = u.slice(24, 32);
      if (!species || peer === this.tag) continue;          // our board too: the server notes it, never counts it
      if (Date.now() - (this.heard.get(peer) ?? 0) < ROTATE_MS) continue;
      this.heard.set(peer, Date.now());
      this.found.push({ species: String(species), peer });
    }
  };
  private async startScan() {
    if (this.scanning) return;
    const ble = await this.ble!();
    this.scanning = true;
    ble.startDeviceScan(null, { allowDuplicates: true }, (error, d) => { if (!error && d?.serviceUUIDs) this.onDevice(d.serviceUUIDs); });
  }
  private async stopScan() {
    if (!this.scanning) return;
    (await this.ble!()).stopDeviceScan();
    this.scanning = false;
  }

  // NEARBY open or closed: while open (and meeting is on) the phone listens the whole time, as a board does lightly.
  async listenForCasts(on: boolean) {
    this.casting = on;
    if (on && this.on) await this.startScan().catch(() => {});
    else if (!on) await this.stopScan().catch(() => {});
  }

  // After a send from this phone: its pieces turn in the advertisement for twelve seconds, a fifth of a second each, and
  // then the meeting's beacon comes back -- as a board's burst (meet.cpp meetCastSend).
  burst(c: BleCast) {
    if (!this.on) return;
    const pieces = toPieces(c);
    if (this.burstTimer) clearInterval(this.burstTimer);
    let at = 0;
    const until = Date.now() + 12000;
    this.burstTimer = setInterval(() => {
      if (Date.now() > until) {
        clearInterval(this.burstTimer!); this.burstTimer = null;
        if (this.on && this.beaconUuid) Beacon.start(this.beaconUuid); else Beacon.stop();
        return;
      }
      Beacon.start(pieces[at++ % pieces.length]);
    }, 200);
  }

  private async listen() {
    const already = this.scanning;                               // NEARBY open: the scan is running already
    if (!already) await this.startScan();
    await new Promise((r) => setTimeout(r, LISTEN_MS));
    if (!already && !this.casting) await this.stopScan();
    const found = this.found.splice(0);
    for (const m of found) await this.api!("/api/device/met", m).catch(() => {});
  }
}

export const meeting = new Meeting();
