// C-591 (the user, 2026-11-26: "the Luma which uses a head band that flashes lights in rhythm with music ... this
// particular version doesnt have color just flash modes and patterns ... all needed code is in the other app"): THE
// LUMENATE NOVA over Bluetooth -- PulseEntrain's NovaController (mobile/src/nova/novaController.js) carried over, on the
// app's one Bluetooth manager: found among the phone's connected devices or by its name, linked with a 64-byte MTU (a
// frame is forty bytes), its telemetry listened to (the device wants a listener), and while it flashes, a frame streamed
// every quarter second -- it needs the stream to keep cycling -- each eye easing toward where the drift aims it, never
// stepping. The frames are server/src/shared/nova.ts's, clamped there; where they aim is app/sound/entrain.ts's. Phone
// only (platform/entrainers.ts). Every word DRAFT.
import type { BleManager, Characteristic, Device, Subscription } from "react-native-ble-plx";
import { HANDHELD } from "./net";
import { frame, NAME, OFF, STREAM, STROBE, TELEMETRY, type Eye } from "../../server/src/shared/nova";
import { toBase64 } from "../../server/src/shared/pulsetto";
import { outputs, setOutputs } from "../state/drift";
import type { Linked } from "./pulsetto";

const TICK_MS = 250, SCAN_MS = 15000;
const SYSTEM = ["0000180a-0000-1000-8000-00805f9b34fb", "0000180f-0000-1000-8000-00805f9b34fb"];   // device info, battery
const ease = (now: number, to: number) => (Math.abs(to - now) < 0.05 ? to : now + (to - now) * 0.35);

class Nova {
  now: Linked = { phase: "off", name: "", battery: null, charging: null, running: false, level: 0, note: "" };
  private device: Device | null = null;
  private strobe: Characteristic | null = null;
  private stream: Characteristic | null = null;
  private subs: Subscription[] = [];
  private tick: ReturnType<typeof setInterval> | null = null;
  private letGo = false;
  private target: { left: Eye; right: Eye } = { left: { hz: 2, duty: 0 }, right: { hz: 2, duty: 0 } };
  private eyes: { left: Eye; right: Eye } = { left: { hz: 2, duty: 0 }, right: { hz: 2, duty: 0 } };
  private listeners = new Set<(l: Linked) => void>();

  watch(fn: (l: Linked) => void) { this.listeners.add(fn); fn(this.now); return () => { this.listeners.delete(fn); }; }
  private set(p: Partial<Linked>) { this.now = { ...this.now, ...p }; this.listeners.forEach((f) => f(this.now)); }
  private ble(): Promise<BleManager> {
    if (!HANDHELD) return Promise.reject(new Error("The NOVA links in the phone app."));   // DRAFT
    return HANDHELD.bluetooth();
  }

  /** LINK: already connected to the phone (then it does not advertise), the one linked last, or the first heard. */
  async link() {
    if (this.device || this.now.phase === "looking") return;
    this.letGo = false;
    let ble: BleManager;
    try { ble = await this.ble(); } catch (e) { return this.set({ phase: "off", note: (e as Error).message }); }
    this.set({ phase: "looking", note: "Looking for the NOVA. Turn it on and keep it close." });   // DRAFT
    try {
      const known = (await ble.connectedDevices(SYSTEM)).find((d) => NAME.test(d.name ?? ""));
      if (known && (await this.open(ble, known.id))) return;
      const last = outputs().novaId;
      if (last) { const [d] = await ble.devices([last]); if (d && NAME.test(d.name ?? "") && (await this.open(ble, d.id))) return; }
    } catch { /* scan instead */ }
    await new Promise<void>((done) => {
      const stop = setTimeout(() => { ble.stopDeviceScan(); if (!this.device) this.set({ phase: "off", note: "No NOVA heard. Is it on and charged?" }); done(); }, SCAN_MS);
      ble.startDeviceScan(null, null, (error, found) => {
        if (error) { clearTimeout(stop); ble.stopDeviceScan(); this.set({ phase: "off", note: `Bluetooth: ${error.message}` }); return done(); }
        if (!found || !NAME.test(found.name ?? "")) return;
        clearTimeout(stop); ble.stopDeviceScan();
        this.open(ble, found.id).then(() => done());
      });
    });
  }

  private async open(ble: BleManager, id: string): Promise<boolean> {
    try {
      const d = await ble.connectToDevice(id, { requestMTU: 64 });
      await d.discoverAllServicesAndCharacteristics();
      let strobe: Characteristic | null = null, stream: Characteristic | null = null, telemetry: Characteristic | null = null;
      for (const s of await d.services()) for (const c of await s.characteristics()) {
        const u = (c.uuid ?? "").toLowerCase();
        if (u === STROBE) strobe = c; else if (u === STREAM) stream = c; else if (u === TELEMETRY) telemetry = c;
      }
      if (!strobe) { await d.cancelConnection().catch(() => {}); throw new Error("it has no light stream"); }
      this.drop();
      this.device = d; this.strobe = strobe; this.stream = stream;
      if (telemetry) this.subs.push(telemetry.monitor(() => {}));   // the light wants a listener on its motion
      if (stream) await stream.writeWithoutResponse(toBase64(Uint8Array.from([1]))).catch(() => {});
      this.subs.push(ble.onDeviceDisconnected(d.id, () => this.lost()));
      setOutputs({ novaId: d.id });
      this.set({ phase: "linked", name: d.name ?? "NOVA", note: "" });
      if (this.now.running) this.streaming();   // back after a drop: carry on
      return true;
    } catch (e) {
      this.set({ phase: "off", note: `It would not link: ${(e as Error).message}` });   // DRAFT
      return false;
    }
  }

  /** Where both eyes should be: they ease there over the next second or so. */
  aim(left: Eye, right: Eye) { this.target = { left, right }; }
  /** Begin flashing (from a gentle 2 Hz, easing up or down to the aim). */
  start(left: Eye, right: Eye) {
    this.target = { left, right };
    this.eyes = { left: { ...left, hz: Math.min(2, left.hz) }, right: { ...right, hz: Math.min(2, right.hz) } };
    this.set({ running: true });
    this.streaming();
  }
  private streaming() {
    if (this.tick) clearInterval(this.tick);
    if (!this.strobe) return;
    this.tick = setInterval(() => {
      if (!this.strobe || !this.now.running) return;
      const step = (now: Eye, to: Eye): Eye => ({ ...to, hz: ease(now.hz, to.hz), duty: ease(now.duty, to.duty) });
      this.eyes = { left: step(this.eyes.left, this.target.left), right: step(this.eyes.right, this.target.right) };
      this.strobe.writeWithoutResponse(frame(this.eyes.left, this.eyes.right).b64).catch(() => {});
    }, TICK_MS);
  }
  /** Stop: dark at once (stopping the stream alone leaves the LEDs as they were), then the telemetry stream off. */
  async stop() {
    this.set({ running: false });
    if (this.tick) { clearInterval(this.tick); this.tick = null; }
    if (this.strobe) await this.strobe.writeWithoutResponse(OFF).catch(() => {});
  }
  async unlink() {
    this.letGo = true;
    await this.stop();
    if (this.stream) await this.stream.writeWithoutResponse(toBase64(Uint8Array.from([0]))).catch(() => {});
    const d = this.device;
    this.drop(); this.device = null; this.strobe = null; this.stream = null;
    if (d) await d.cancelConnection().catch(() => {});
    this.set({ phase: "off", note: "" });
  }
  private drop() { this.subs.forEach((s) => { try { s.remove(); } catch { /* gone */ } }); this.subs = []; }
  private lost() {
    this.drop(); this.device = null; this.strobe = null; this.stream = null;
    if (this.tick) { clearInterval(this.tick); this.tick = null; }
    if (this.letGo) { this.set({ phase: "off" }); return; }
    this.set({ phase: "lost", note: "The NOVA dropped: looking for it again." });   // DRAFT
    setTimeout(() => { if (!this.device && !this.letGo) { this.set({ phase: "off" }); this.link().catch(() => {}); } }, 1500);
  }
}

export const nova = new Nova();
