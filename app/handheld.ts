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
import { BleManager, Device, State, Subscription } from "react-native-ble-plx";
import * as SecureStore from "expo-secure-store";
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";
import { File, Paths } from "expo-file-system";

const KEEP = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };   // C-57: readable in a locked pocket

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

// C-82: the daemon's answer to a talk the board carried here, said on the phone's own speaker (the board shows the words).
let voice: AudioPlayer | null = null;
async function sayOnPhone(mp3Base64: string) {
  const f = new File(Paths.cache, `handheld-voice-${Date.now()}.mp3`);
  f.create(); f.write(mp3Base64, { encoding: "base64" });
  await setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
  voice?.remove();
  voice = createAudioPlayer({ uri: f.uri });
  voice.play();
}

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
  private away: () => boolean = () => false;              // C-56: reaching the companion through n8n
  private stateAt = 0; private commandsAt = 0;
  private listeners = new Set<(h: Handheld) => void>();
  now: Handheld = { phase: "none", name: "", companion: true, waiting: 0, note: "" };

  watch(fn: (h: Handheld) => void) { this.listeners.add(fn); fn(this.now); return () => { this.listeners.delete(fn); }; }
  private set(p: Partial<Handheld>) { this.now = { ...this.now, ...p }; this.listeners.forEach((fn) => fn(this.now)); }
  // C-57: with a restore identifier, iOS keeps the handheld's connection when it closes the app in the background,
  // and opens the app again (in the background) when the board has something to say. The app then goes back to
  // the same handheld: start() reconnects to it, which iOS answers at once because it is already connected.
  private manager() {
    return (this.ble ??= new BleManager({ restoreStateIdentifier: "daemons-companion-handheld", restoreStateFunction: () => {} }));
  }

  // C-57: back at the front -- iOS paused the timers in the background, so catch up at once rather than in five seconds
  nudge() {
    if (this.now.phase !== "linked") return;
    this.stateAt = 0; this.commandsAt = 0;
    this.sendState(); this.sendCommands();
  }

  // iOS says what state Bluetooth is in a moment after the app first asks (it starts "unknown"), and asks the user's
  // permission the first time: wait for it to be on before scanning or connecting.
  // C-15: the meeting listen (beacon.ts) uses the same Bluetooth -- never while a pairing is scanning
  bluetooth(): Promise<BleManager> {
    if (this.now.phase === "looking") return Promise.reject(new Error("pairing is scanning"));
    return this.ready();
  }

  private ready(): Promise<BleManager> {
    const ble = this.manager();
    return new Promise((ok, fail) => {
      const give = setTimeout(() => { sub.remove(); fail(new Error("Bluetooth did not start. Try again in a moment.")); }, 15000);
      const sub = ble.onStateChange((s) => {
        const why = s === State.PoweredOff ? "Bluetooth is off. Turn it on in Control Center, then try again."
          : s === State.Unauthorized ? "The app may not use Bluetooth. Allow it in Settings, DAEMONS companion, Bluetooth."
          : s === State.Unsupported ? "This phone has no Bluetooth the app can use." : null;
        if (s === State.PoweredOn) { clearTimeout(give); sub.remove(); ok(ble); }
        else if (why) { clearTimeout(give); sub.remove(); fail(new Error(why)); }
      }, true);
    });
  }

  // When the app opens: back to the handheld it paired with, if there is one.
  async start(api: Api, away?: () => boolean) {
    this.api = api;
    if (away) this.away = away;
    const saved = await SecureStore.getItemAsync("handheld");
    const waiting = await SecureStore.getItemAsync("handheld-waiting");
    if (waiting) { this.queue = JSON.parse(waiting); this.set({ waiting: this.queue.length }); }
    if (saved && this.now.phase === "none") this.connect(saved, false);
  }

  // PAIR THE HANDHELD: find a board showing the link's service, connect, and listen -- which makes iOS ask for the code.
  async pair() {
    await this.forget(false);
    let ble: BleManager;
    try { ble = await this.ready(); } catch (e) { return this.set({ phase: "none", note: (e as Error).message }); }
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
    try {
      const ble = await this.ready();
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
      SecureStore.setItemAsync("handheld", this.id, KEEP).catch(() => {});
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

  // C-80: the board's own name, from its HELLO, carried on every request as ?device= (the relay passes the query on)
  private deviceId: string | null = null;
  private talkParts: string[] | null = null;     // C-82: a recording arriving from the board, in base64 lines
  private async ask<T>(path: string, body?: unknown): Promise<T> {
    if (this.deviceId) path += (path.includes("?") ? "&" : "?") + "device=" + encodeURIComponent(this.deviceId);
    try { const r = await this.api!<T>(path, body); this.set({ companion: true }); return r; }
    catch (e) { this.set({ companion: false }); throw e; }
  }

  private async sendState() {
    // away, n8n runs once a request: the state every half minute rather than every five seconds (docs/REMOTE.md)
    if (this.away() && Date.now() - this.stateAt < 30000) { if (this.lastState) this.say("STATE " + this.lastState); return; }
    this.stateAt = Date.now();
    try { this.lastState = JSON.stringify(await this.ask("/api/device/state?via=phone")); await this.flush(); }
    catch { /* away from the companion: the board keeps the last state it was given */ }
    if (this.lastState) this.say("STATE " + this.lastState);
  }

  private async sendCommands() {
    if (this.away() && Date.now() - this.commandsAt < 10000) return;
    this.commandsAt = Date.now();
    try {
      const { commands } = await this.ask<{ commands: object[] }>("/api/device/commands?via=phone");
      commands.forEach((c) => this.say("CMD " + JSON.stringify(c)));
    } catch { /* the companion is away */ }
  }

  // What the board did, kept on the phone until the companion answers.
  // C-87: what the board reports as its whole current state (its routines, remotes, networks, battery) is kept once --
  // the latest; what it did (ticks, meetings, results) is kept every time, in order.
  private async later(path: string, body: unknown) {
    if (/\/api\/device\/(routines|remotes|networks|battery|listen)$/.test(path)) this.queue = this.queue.filter((q) => q.path !== path);
    this.queue.push({ path, body });
    await SecureStore.setItemAsync("handheld-waiting", JSON.stringify(this.queue), KEEP);
    this.set({ waiting: this.queue.length });
  }
  private async flush() {
    while (this.queue.length) {
      // C-87: a report the companion answers NO to is done with; only being out of reach keeps it (and the rest)
      try { await this.ask(this.queue[0].path, this.queue[0].body); }
      catch (e) { if ((e as Error)?.name === "Unreachable") throw e; }
      this.queue.shift();
      await SecureStore.setItemAsync("handheld-waiting", JSON.stringify(this.queue), KEEP);
      this.set({ waiting: this.queue.length });
    }
  }

  private async handle(line: string) {
    const [word] = line.split(" ", 1), rest = line.slice(word.length + 1);
    if (word === "TALKWAV") { this.talkParts = []; return; }
    if (word === "TW") { this.talkParts?.push(rest); return; }
    if (word === "TALKEND") {                             // C-82: the board talked away from Wi-Fi; the phone carries it
      const parts = this.talkParts; this.talkParts = null;
      if (!parts) return;
      let r: { answer?: string | null; heard?: string | null; error?: string | null; audioBase64?: string | null };
      try { r = await this.ask("/api/ai/talk", { audioBase64: parts.join(""), audioMime: "audio/wav" }); }
      catch { r = { error: "The companion did not answer." }; }
      this.say("TALKED " + JSON.stringify({ answer: r.answer ?? null, heard: r.heard ?? null, error: r.error ?? null, audio: false }));
      if (r.audioBase64) await sayOnPhone(r.audioBase64).catch(() => {});
      return;
    }
    if (word === "HELLO") {
      const id = rest.split(" ")[3];
      if (id && /^[a-z0-9][a-z0-9-]{2,47}$/.test(id)) this.deviceId = id;
    } else if (word === "TICK" || word === "UNTICK") {
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
    } else if (word === "LISTEN") {                         // C-15: one listen of the board's meeting radio
      const [started, devices, beacons] = rest.split(" ").map(Number);
      await this.ask("/api/device/listen", { started, devices, beacons }).catch(() => this.later("/api/device/listen", { started, devices, beacons }));
    } else if (word === "MET") {                            // C-15: a companion the board heard nearby
      const [species, peer] = rest.split(" ");
      try { await this.ask("/api/device/met", { species, peer }); } catch { await this.later("/api/device/met", { species, peer }); }
    } else if (word === "BEACON") {                         // C-15: the board's own tag, so it is never a meeting
      try { await this.ask("/api/device/beacon", { peer: rest }); } catch { await this.later("/api/device/beacon", { peer: rest }); }
    } else if (word === "RESULT") {
      await this.ask("/api/device/results", JSON.parse(rest)).catch(() => this.later("/api/device/results", JSON.parse(rest)));
    } else if (word === "ROUTINES" || word === "REMOTES" || word === "NETWORKS") {
      await this.ask("/api/device/" + word.toLowerCase(), JSON.parse(rest)).catch(() => this.later("/api/device/" + word.toLowerCase(), JSON.parse(rest)));
    }
  }
}

export const handheld = new Link();
