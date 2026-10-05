// C-55: the handheld's link, carried by the phone over Bluetooth -- on the phone, the app does what usb_bridge.py does
// at the desk. The board speaks the same lines either way (STATE, TICK, CMD, RESULT ...; firmware/esp32/src/link.cpp):
// the phone hands the companion's state and the site's commands down, and the board's ticks, results and routines up.
//
// Pairing is the board's own: PAIR MY PHONE (WHISPER) shows a code, and the first time the app listens to the link iOS
// asks for it. The handheld's id is kept, and the app goes back to it whenever it opens -- iOS waits for the board to
// come into range on its own, so a link lost on a walk comes back by itself.
//
// Away from the companion, nothing is lost: the board's last state is handed back to it so it stays linked, and what
// it did (a step ticked, a routine run) waits on the phone and goes up, in order, when the companion answers again.
import { BleManager, Device, Subscription } from "react-native-ble-plx";
import * as SecureStore from "expo-secure-store";

const SERVICE = "DAE00001-5C0D-4E5A-8C0D-E0C0DEC0DE00";
const RX = "DAE00002-5C0D-4E5A-8C0D-E0C0DEC0DE00";   // the phone writes here
const TX = "DAE00003-5C0D-4E5A-8C0D-E0C0DEC0DE00";   // the board notifies here
const STATE_MS = 5000, COMMANDS_MS = 1500, LIST_MS = 60000;

export type Api = <T>(path: string, body?: unknown) => Promise<T>;
export type Handheld = {
  phase: "none" | "looking" | "pairing" | "linked" | "lost";
  name: string;            // what the board calls itself
  companion: boolean;      // the companion answered the last time it was asked
  waiting: number;         // things the board did that wait for the companion
  note: string;
};

const utf8 = new TextEncoder(), text = new TextDecoder();
const toB64 = (s: string) => { let b = ""; for (const c of utf8.encode(s)) b += String.fromCharCode(c); return btoa(b); };
const fromB64 = (s: string) => text.decode(Uint8Array.from(atob(s), (c) => c.charCodeAt(0)));

class Link {
  private ble: BleManager | null = null;
  private device: Device | null = null;
  private subs: Subscription[] = [];
  private timers: ReturnType<typeof setInterval>[] = [];
  private heard = "";
  private writing: Promise<unknown> = Promise.resolve();
  private lastState: string | null = null;
  private queue: { path: string; body: unknown }[] = [];
  private api: Api | null = null;
  private id: string | null = null;
  private listeners = new Set<(h: Handheld) => void>();
  now: Handheld = { phase: "none", name: "", companion: true, waiting: 0, note: "" };

  watch(fn: (h: Handheld) => void) { this.listeners.add(fn); fn(this.now); return () => { this.listeners.delete(fn); }; }
  private set(p: Partial<Handheld>) { this.now = { ...this.now, ...p }; this.listeners.forEach((fn) => fn(this.now)); }
  private manager() { return (this.ble ??= new BleManager()); }

  // When the app opens: back to the handheld it paired with, if there is one.
  async start(api: Api) {
    this.api = api;
    const saved = await SecureStore.getItemAsync("handheld");
    const waiting = await SecureStore.getItemAsync("handheld-waiting");
    if (waiting) { this.queue = JSON.parse(waiting); this.set({ waiting: this.queue.length }); }
    if (saved && this.now.phase === "none") this.connect(saved, false);
  }

  // PAIR THE HANDHELD: find a board showing the link's service, connect, and listen -- which makes iOS ask for the code.
  async pair() {
    await this.forget(false);
    const ble = this.manager();
    this.set({ phase: "looking", note: "Looking for the handheld. On it, open ROUTINES, WHISPER, PAIR MY PHONE." });
    await new Promise<void>((done) => {
      const stop = setTimeout(() => { ble.stopDeviceScan(); this.set({ phase: "none", note: "No handheld nearby. Is PAIR MY PHONE open on it?" }); done(); }, 60000);
      ble.startDeviceScan([SERVICE], null, (error, found) => {
        if (error) { clearTimeout(stop); ble.stopDeviceScan(); this.set({ phase: "none", note: `Bluetooth: ${error.message}` }); return done(); }
        if (!found) return;
        clearTimeout(stop); ble.stopDeviceScan();
        this.connect(found.id, true).then(done);
      });
    });
  }

  async forget(clear = true) {
    this.drop();
    if (this.device) await this.device.cancelConnection().catch(() => {});
    this.device = null;
    if (clear) { await SecureStore.deleteItemAsync("handheld"); this.set({ phase: "none", name: "", note: "Forgotten. On the handheld, WHISPER, FORGET MY PHONES finishes it." }); }
  }

  private drop() { this.subs.forEach((s) => s.remove()); this.subs = []; this.timers.forEach(clearInterval); this.timers = []; this.heard = ""; }

  private async connect(id: string, pairing: boolean) {
    const ble = this.manager();
    try {
      this.set({ phase: pairing ? "pairing" : "lost", note: pairing ? "When iOS asks, type the code the handheld shows." : "Waiting for the handheld to come into range." });
      // no timeout: iOS keeps the connection pending until the board is near again
      const d = await ble.connectToDevice(id, { requestMTU: 247 });
      await d.discoverAllServicesAndCharacteristics();
      this.device = d;
      this.drop();
      this.subs.push(d.onDisconnected(() => { this.drop(); this.set({ phase: "lost", note: "The handheld went out of range. It links again by itself." }); this.connect(id, false); }));
      // the first listen is what makes iOS pair: the link's notes need an encrypted, authenticated connection
      this.subs.push(d.monitorCharacteristicForService(SERVICE, TX, (error, c) => {
        if (error) { if (pairing) this.set({ phase: "none", note: "The handheld was not paired: was the code right? Try again." }); return; }
        if (c?.value) this.hear(fromB64(c.value));
      }));
      this.id = id;
      this.set({ name: d.name ?? "DAEMONS companion" });
      this.say("LIST");                                   // its answer is the first proof the link is paired (hear)
      await this.sendState();
      this.timers.push(setInterval(() => this.sendState(), STATE_MS));
      this.timers.push(setInterval(() => this.sendCommands(), COMMANDS_MS));
      this.timers.push(setInterval(() => this.say("LIST"), LIST_MS));
    } catch (e) {
      this.set({ phase: pairing ? "none" : "lost", note: (e as Error).message });
    }
  }

  // One line down to the board, in pieces the connection carries, in order.
  private say(line: string) {
    const d = this.device;
    if (!d) return;
    const all = line + "\n", piece = Math.max(20, (d.mtu ?? 23) - 3);
    this.writing = this.writing.then(async () => {
      for (let at = 0; at < all.length; at += piece)
        await d.writeCharacteristicWithResponseForService(SERVICE, RX, toB64(all.slice(at, at + piece)));
    }).catch(() => {});
  }

  private hear(chunk: string) {
    if (this.now.phase !== "linked" && this.id) {         // the board answered: paired, and kept
      SecureStore.setItemAsync("handheld", this.id).catch(() => {});
      this.set({ phase: "linked", note: "" });
    }
    this.heard += chunk;
    let at: number;
    while ((at = this.heard.indexOf("\n")) >= 0) {
      const line = this.heard.slice(0, at).trim();
      this.heard = this.heard.slice(at + 1);
      if (line) this.handle(line).catch(() => {});
    }
  }

  private async ask<T>(path: string, body?: unknown): Promise<T> {
    try { const r = await this.api!<T>(path, body); this.set({ companion: true }); return r; }
    catch (e) { this.set({ companion: false }); throw e; }
  }

  private async sendState() {
    try { this.lastState = JSON.stringify(await this.ask("/api/device/state?via=phone")); await this.flush(); }
    catch { /* away from the companion: the board keeps the last state it was given */ }
    if (this.lastState) this.say("STATE " + this.lastState);
  }

  private async sendCommands() {
    try {
      const { commands } = await this.ask<{ commands: object[] }>("/api/device/commands?via=phone");
      commands.forEach((c) => this.say("CMD " + JSON.stringify(c)));
    } catch { /* the companion is away */ }
  }

  // What the board did, kept on the phone until the companion answers.
  private async later(path: string, body: unknown) {
    this.queue.push({ path, body });
    await SecureStore.setItemAsync("handheld-waiting", JSON.stringify(this.queue));
    this.set({ waiting: this.queue.length });
  }
  private async flush() {
    while (this.queue.length) {
      await this.ask(this.queue[0].path, this.queue[0].body);
      this.queue.shift();
      await SecureStore.setItemAsync("handheld-waiting", JSON.stringify(this.queue));
      this.set({ waiting: this.queue.length });
    }
  }

  private async handle(line: string) {
    const [word] = line.split(" ", 1), rest = line.slice(word.length + 1);
    if (word === "TICK" || word === "UNTICK") {
      const step = Number(rest);
      const [path, body] = word === "TICK" ? ["/api/device/ticks", { steps: [step] }] : ["/api/device/untick", { step }];
      try {
        await this.flush();
        const r = await this.ask<{ state: object; celebrate?: string }>(path, body);
        if (r.celebrate) this.say("CELEBRATE " + r.celebrate);
        this.lastState = JSON.stringify(r.state);
        this.say("STATE " + this.lastState);
      } catch {
        await this.later(path, body);
        if (word === "TICK") this.say("CELEBRATE step");    // heard now; the companion learns it when it is back
      }
    } else if (word === "ART?") {
      try { this.say("ART " + JSON.stringify(await this.ask("/api/device/art"))); } catch { /* asked again later */ }
    } else if (word === "INTERACT") {
      const [kind, ...detail] = rest.split(" ");
      try { await this.flush(); await this.ask("/api/device/interact", { kind, detail: detail.join(" ") }); await this.sendState(); }
      catch { await this.later("/api/device/interact", { kind, detail: detail.join(" ") }); }
    } else if (word === "RESULT") {
      await this.ask("/api/device/results", JSON.parse(rest)).catch(() => {});
    } else if (word === "ROUTINES" || word === "REMOTES" || word === "NETWORKS") {
      await this.ask("/api/device/" + word.toLowerCase(), JSON.parse(rest)).catch(() => {});
    }
  }
}

export const handheld = new Link();
