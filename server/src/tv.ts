// C-256 (the user, 2026-10-30: "we will have to add to the app/site an interface of entering your tv type and adding it to
// the watch then.. I really want that feature for the t-watch ultra"; by multiple choice: over Wi-Fi and through Home
// Assistant; a Roku, a Google / Android / Fire TV and an Apple TV). The Ultra has no IR light, so its TV remote is a
// request to this server, which presses the button the TV's own way:
//
//   a Roku     -- directly, by its External Control Protocol (POST http://<roku>:8060/keypress/<Key>), no pairing; the
//                 Roku's Settings > System > Advanced system settings > Control by mobile apps must not be Disabled
//   Apple TV   -- through Home Assistant's Apple TV integration: remote.send_command on its remote.* entity
//   Google TV  -- through Home Assistant's Android TV Remote integration (Google TV, Android TV, a Shield): the same
//   a Fire TV  -- through Home Assistant's Android Debug Bridge integration: androidtv.adb_command on its media_player
//   a Roku in Home Assistant -- its Roku integration's remote.* entity, for a Roku the server cannot reach itself
//
// What is kept is a list of TVs, each a name, a platform and where it is (a Roku's address, or a Home Assistant entity).
// Home Assistant's address and token stay home.ts's; this file only asks it to press. Every word DRAFT.
import type { Home } from "./home.js";

export const KEYS = ["power", "home", "back", "up", "down", "left", "right", "ok", "play", "volup", "voldown", "mute"] as const;
export type Key = (typeof KEYS)[number];
export type Platform = "roku" | "apple" | "google" | "fire";
export type Tv = { id: string; name: string; platform: Platform; host?: string; entity?: string };
export type Found = { name: string; platform: Platform; host?: string; entity?: string; added: boolean };

// Each platform's word for each key. Power on a remote.* entity is its own service (toggle), not a command.
const ROKU: Record<Key, string> = { power: "Power", home: "Home", back: "Back", up: "Up", down: "Down", left: "Left",
  right: "Right", ok: "Select", play: "Play", volup: "VolumeUp", voldown: "VolumeDown", mute: "VolumeMute" };
const HA: Record<Platform, Record<Key, string | null>> = {
  apple:  { power: null, home: "home", back: "menu", up: "up", down: "down", left: "left", right: "right", ok: "select",
            play: "play_pause", volup: "volume_up", voldown: "volume_down", mute: null },
  google: { power: "POWER", home: "HOME", back: "BACK", up: "DPAD_UP", down: "DPAD_DOWN", left: "DPAD_LEFT",
            right: "DPAD_RIGHT", ok: "DPAD_CENTER", play: "MEDIA_PLAY_PAUSE", volup: "VOLUME_UP", voldown: "VOLUME_DOWN", mute: "VOLUME_MUTE" },
  fire:   { power: "POWER", home: "HOME", back: "BACK", up: "UP", down: "DOWN", left: "LEFT", right: "RIGHT", ok: "CENTER",
            play: "KEYCODE_MEDIA_PLAY_PAUSE", volup: "KEYCODE_VOLUME_UP", voldown: "KEYCODE_VOLUME_DOWN", mute: "KEYCODE_VOLUME_MUTE" },
  roku:   { power: "power", home: "home", back: "back", up: "up", down: "down", left: "left", right: "right", ok: "select",
            play: "play", volup: "volume_up", voldown: "volume_down", mute: "volume_mute" },
};
// The Home Assistant integration behind each platform, and which of its entities is pressed
const INTEGRATION: Record<Platform, { domain: string; entity: "remote" | "media_player" }> = {
  apple: { domain: "apple_tv", entity: "remote" }, google: { domain: "androidtv_remote", entity: "remote" },
  fire: { domain: "androidtv", entity: "media_player" }, roku: { domain: "roku", entity: "remote" },
};
export const PLATFORMS: Platform[] = ["roku", "apple", "google", "fire"];

const KEY = "tv.list", MAX = 8;
const cleanName = (s: unknown) => (typeof s === "string" ? s.replace(/[^\x20-\x7e]/g, "").trim().slice(0, 16).trim() : "");
// A Roku's address: on this network only (a private IPv4 or a .local name), never a place on the internet -- a paired
// phone adds TVs, and the server must not be made to send requests anywhere else
export function lanHost(h: unknown): string | null {
  const s = typeof h === "string" ? h.trim().toLowerCase() : "";
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (m.slice(1).some((x) => Number(x) > 255)) return null;
    return a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 100 && b >= 64 && b <= 127) ? s : null;
  }
  return /^[a-z0-9][a-z0-9-]{0,62}\.local$/.test(s) ? s : null;
}
const entityOk = (e: unknown, kind: string) => typeof e === "string" && new RegExp(`^${kind}\\.[a-z0-9_]{1,64}$`).test(e);
const slug = (name: string, taken: string[]) => {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 12) || "tv";
  let id = base;
  for (let n = 2; taken.includes(id); n++) id = `${base}-${n}`;
  return id;
};

export interface Keys { get(k: string): string | null; set(k: string, v: string | null): void }
export type Fetch = typeof fetch;

export class Tvs {
  constructor(private keys: Keys, private home: Home, private fetchFn: Fetch = fetch) {}

  list(): Tv[] {
    try { const l = JSON.parse(this.keys.get(KEY) ?? "[]"); return Array.isArray(l) ? l : []; } catch { return []; }
  }
  private save(l: Tv[]) { this.keys.set(KEY, JSON.stringify(l)); }
  // what a device is shown: the names and ids, never where they are
  forDevice() { return { tvs: this.list().map(({ id, name, platform }) => ({ id, name, platform })), keys: KEYS }; }

  add(x: { name?: unknown; platform?: unknown; host?: unknown; entity?: unknown }): { ok: boolean; tv?: Tv; error?: string } {
    const platform = x.platform as Platform, name = cleanName(x.name);
    if (!PLATFORMS.includes(platform)) return { ok: false, error: "a TV is a Roku, an Apple TV, a Google TV or a Fire TV" };   // DRAFT
    if (!name) return { ok: false, error: "the TV needs a name" };                                                            // DRAFT
    const l = this.list();
    if (l.length >= MAX) return { ok: false, error: `at most ${MAX} TVs` };                                                    // DRAFT
    const tv: Tv = { id: slug(name, l.map((t) => t.id)), name, platform };
    if (platform === "roku" && x.host !== undefined && x.host !== null && x.host !== "") {
      const host = lanHost(x.host);
      if (!host) return { ok: false, error: "a Roku's address is on this network: 192.168.x.x, 10.x.x.x or a .local name" };   // DRAFT
      tv.host = host;
    } else {
      const kind = INTEGRATION[platform].entity;
      if (!entityOk(x.entity, kind)) return { ok: false, error: `pick its ${kind} from Home Assistant` };                       // DRAFT
      tv.entity = x.entity as string;
    }
    this.save([...l, tv]);
    return { ok: true, tv };
  }
  remove(id: unknown): boolean {
    const l = this.list(), kept = l.filter((t) => t.id !== id);
    if (kept.length === l.length) return false;
    this.save(kept);
    return true;
  }
  rename(id: unknown, to: unknown): boolean {
    const l = this.list(), t = l.find((x) => x.id === id), name = cleanName(to);
    if (!t || !name) return false;
    t.name = name;
    this.save(l);
    return true;
  }

  async press(id: unknown, key: unknown): Promise<{ ok: boolean; error?: string }> {
    const tv = this.list().find((t) => t.id === id);
    if (!tv) return { ok: false, error: "no such TV" };                                                                      // DRAFT
    if (!KEYS.includes(key as Key)) return { ok: false, error: "no such button" };                                           // DRAFT
    const k = key as Key;
    try {
      if (tv.host) {
        let r: Response;
        try { r = await this.fetchFn(`http://${tv.host}:8060/keypress/${ROKU[k]}`, { method: "POST", signal: AbortSignal.timeout(4000) }); }
        catch { return { ok: false, error: "the Roku did not answer" }; }                                                     // DRAFT
        if (r.status === 403) return { ok: false, error: "the Roku refuses: turn on Control by mobile apps" };                // DRAFT
        return r.ok ? { ok: true } : { ok: false, error: `the Roku answered ${r.status}` };                                   // DRAFT
      }
      const { entity: kind } = INTEGRATION[tv.platform], cmd = HA[tv.platform][k];
      if (kind === "remote" && k === "power") await this.home.tvCall("remote", "toggle", { entity_id: tv.entity });
      else if (!cmd) return { ok: false, error: "this TV has no such button" };                                              // DRAFT
      else if (kind === "remote") await this.home.tvCall("remote", "send_command", { entity_id: tv.entity, command: cmd });
      else await this.home.tvCall("androidtv", "adb_command", { entity_id: tv.entity, command: cmd });
      return { ok: true };
    } catch (e) { return { ok: false, error: (e as Error).message }; }
  }

  // What could be added: the Rokus heard on the network (passed in -- the search is api.ts's, node:dgram), and every TV
  // Home Assistant has through the four integrations
  async find(rokus: { host: string; name: string }[] = []): Promise<{ found: Found[]; homeError?: string }> {
    const have = this.list(), out: Found[] = [];
    for (const r of rokus) out.push({ name: r.name, platform: "roku", host: r.host, added: have.some((t) => t.host === r.host) });
    let homeError: string | undefined;
    try {
      const by = await this.home.tvEntities(Object.fromEntries(PLATFORMS.map((p) => [p, INTEGRATION[p].domain])));
      for (const p of PLATFORMS) for (const e of by[p] ?? []) {
        if (!entityOk(e.id, INTEGRATION[p].entity)) continue;
        out.push({ name: e.name, platform: p, entity: e.id, added: have.some((t) => t.entity === e.id) });
      }
    } catch (e) { homeError = (e as Error).message; }
    return { found: out, homeError };
  }
}
