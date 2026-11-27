// C-591 (the user, 2026-11-26: "The Pulsetto which stimulates the vegas nerve ... all needed code is in the other app, so
// lets please bring it over too"): THE PULSETTO over Bluetooth -- PulseEntrain's PulsettoProvider (mobile/src/pulsetto/)
// carried over as a plain object, on the app's one Bluetooth manager (the handheld's, platform/handheld.ts): find it by
// its name, link, listen for its battery, begin and end a session as its maker's app does, keep it alive while one runs,
// and come back to it when it drops. What to write is server/src/shared/pulsetto.ts; when, and how strong, is
// app/sound/entrain.ts. Phone only: loaded lazily (platform/entrainers.ts), never by the site. Every word DRAFT.
//
// Two rules carried from PulseEntrain's own fixes. A stop is safe to call at any time and always ends a live session
// (it reads the live flag, never a screen's stale copy -- a stale stop once left a Pulsetto buzzing). And a level is
// re-sent every ten seconds while a session runs, or the device lets it lapse.
import type { BleManager, Device, Subscription } from "react-native-ble-plx";
import { HANDHELD } from "./net";
import { CMD, fromBase64, levelCmd, NAME_PREFIX, parseNotification, RX, SERVICE, startSequence, STOP_SEQUENCE, textBytes,
         toBase64, TX, withResponse, type Step } from "../../server/src/shared/pulsetto";
import { outputs, setOutputs } from "../state/drift";

export type Linked = { phase: "off" | "looking" | "linked" | "lost"; name: string; battery: number | null; charging: boolean | null;
                       running: boolean; level: number; note: string };
const KEEPALIVE_MS = 10000, POLL_IDLE_MS = 30000, POLL_RUNNING_MS = 3000, SCAN_MS = 12000;
const pause = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

class Pulsetto {
  now: Linked = { phase: "off", name: "", battery: null, charging: null, running: false, level: 0, note: "" };
  private device: Device | null = null;
  private subs: Subscription[] = [];
  private keepalive: ReturnType<typeof setInterval> | null = null;
  private poll: ReturnType<typeof setInterval> | null = null;
  private letGo = false;                      // the player unlinked it: do not chase it
  private live = false;                       // a session is running (the live flag every stop reads)
  private listeners = new Set<(l: Linked) => void>();

  watch(fn: (l: Linked) => void) { this.listeners.add(fn); fn(this.now); return () => { this.listeners.delete(fn); }; }
  private set(p: Partial<Linked>) { this.now = { ...this.now, ...p }; this.listeners.forEach((f) => f(this.now)); }
  private ble(): Promise<BleManager> {
    if (!HANDHELD) return Promise.reject(new Error("The PULSETTO links in the phone app."));   // DRAFT
    return HANDHELD.bluetooth();
  }

  /** LINK: the one linked last, if it is near; otherwise the first Pulsetto heard in twelve seconds. */
  async link() {
    if (this.device || this.now.phase === "looking") return;
    this.letGo = false;
    let ble: BleManager;
    try { ble = await this.ble(); } catch (e) { return this.set({ phase: "off", note: (e as Error).message }); }
    this.set({ phase: "looking", note: "Looking for the PULSETTO. Turn it on and keep it close." });   // DRAFT
    const known = outputs().pulsettoId;
    if (known) {
      try {
        const [d] = await ble.devices([known]);
        if (d && (await this.open(ble, d.id))) return;
      } catch { /* not near: scan */ }
    }
    await new Promise<void>((done) => {
      const stop = setTimeout(() => { ble.stopDeviceScan(); if (!this.device) this.set({ phase: "off", note: "No PULSETTO heard. Is it on and charged?" }); done(); }, SCAN_MS);
      ble.startDeviceScan(null, null, (error, found) => {
        if (error) { clearTimeout(stop); ble.stopDeviceScan(); this.set({ phase: "off", note: `Bluetooth: ${error.message}` }); return done(); }
        if (!found?.name?.startsWith(NAME_PREFIX)) return;
        clearTimeout(stop); ble.stopDeviceScan();
        this.open(ble, found.id).then(() => done());
      });
    });
  }

  private async open(ble: BleManager, id: string): Promise<boolean> {
    try {
      const d = await ble.connectToDevice(id, { autoConnect: false });
      await d.discoverAllServicesAndCharacteristics();
      this.drop();
      this.device = d;
      this.subs.push(ble.onDeviceDisconnected(d.id, () => this.lost()));
      this.subs.push(d.monitorCharacteristicForService(SERVICE, TX, (err, ch) => {
        if (err || !ch?.value) return;
        const p = parseNotification(fromBase64(ch.value));
        if (p.battery !== undefined) this.set({ battery: p.battery });
        if (p.charging !== undefined) this.set({ charging: p.charging });
      }));
      setOutputs({ pulsettoId: d.id });
      this.set({ phase: "linked", name: d.name ?? "PULSETTO", note: "" });
      await this.send(CMD.firmware); await this.send(CMD.identity);
      await this.status();
      this.polling(this.live ? POLL_RUNNING_MS : POLL_IDLE_MS);
      if (this.live) await this.begin(this.now.level || 1);   // back after a drop, mid-session: carry on
      return true;
    } catch (e) {
      this.set({ phase: "off", note: `It would not link: ${(e as Error).message}` });   // DRAFT
      return false;
    }
  }

  private async send(cmd: string) {
    const d = this.device;
    if (!d) return;
    try {
      const v = toBase64(textBytes(cmd));
      if (withResponse(cmd)) await d.writeCharacteristicWithResponseForService(SERVICE, RX, v);
      else await d.writeCharacteristicWithoutResponseForService(SERVICE, RX, v);
    } catch (e) {
      if (/not connected|disconnected/i.test((e as Error).message ?? "")) this.lost();
    }
  }
  private async run(steps: Step[]) { for (const s of steps) { if ("wait" in s) await pause(s.wait); else await this.send(s.send); } }
  private status = async () => { await this.send(CMD.charging); await this.send(CMD.battery); };
  private polling(ms: number) { if (this.poll) clearInterval(this.poll); this.poll = setInterval(() => { this.status(); }, ms); }

  /** Begin a session at a level (1..9). False when none is linked: the drift goes on without it. */
  async begin(level: number): Promise<boolean> {
    this.live = true;
    this.set({ running: true, level });
    if (!this.device) return false;
    await this.run(startSequence(level));
    this.polling(POLL_RUNNING_MS);
    if (this.keepalive) clearInterval(this.keepalive);
    this.keepalive = setInterval(() => { if (this.live && this.device) this.send(levelCmd(this.now.level, 0)); }, KEEPALIVE_MS);
    return true;
  }
  /** A new level while running: 1..9, or 0 to pause it without ending the session. */
  async level(n: number) {
    this.set({ level: n });
    if (this.live && this.device) await this.send(levelCmd(n, 0));
  }
  /** End the session -- always safe, and always ends a live one. */
  async end() {
    const was = this.live;
    this.live = false;
    if (this.keepalive) { clearInterval(this.keepalive); this.keepalive = null; }
    this.set({ running: false, level: 0 });
    if (this.device && was) { await this.run(STOP_SEQUENCE); this.polling(POLL_IDLE_MS); await this.status(); }
  }
  /** UNLINK: end anything running and let it go, without chasing it. */
  async unlink() {
    this.letGo = true;
    await this.end().catch(() => {});
    const d = this.device;
    this.drop(); this.device = null;
    if (d) await d.cancelConnection().catch(() => {});
    this.set({ phase: "off", battery: null, charging: null, note: "" });
  }
  private drop() {
    this.subs.forEach((s) => { try { s.remove(); } catch { /* gone */ } });
    this.subs = [];
    if (this.poll) { clearInterval(this.poll); this.poll = null; }
  }
  private lost() {
    this.drop(); this.device = null;
    if (this.keepalive) { clearInterval(this.keepalive); this.keepalive = null; }
    if (this.letGo) { this.set({ phase: "off" }); return; }
    this.set({ phase: "lost", battery: null, note: "The PULSETTO dropped: looking for it again." });   // DRAFT
    setTimeout(() => { if (!this.device && !this.letGo) { this.set({ phase: "off" }); this.link().catch(() => {}); } }, 1500);
  }
}

export const pulsetto = new Pulsetto();
