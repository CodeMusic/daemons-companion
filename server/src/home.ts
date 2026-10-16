// C-139 (the user, 2026-10-16): "a new entry in the tab5/app/site where you can also control your homeassistant" -- and
// C-138 makes a daemon the home's voice assistant, so HOME is where you reach the same house by hand.
//
// The server talks to Home Assistant's own REST API (developers.home-assistant.io/docs/api/rest) with a long-lived access
// token the user makes in Home Assistant (their profile, Security, Long-lived access tokens) and enters on the site's
// SETTINGS, on this machine only. THE TOKEN NEVER LEAVES THE SERVER: the app, the site and the Tab5 see rooms, names and
// states, and ask for an action by name; this file decides what an action may be.
//
// What HOME shows and does, by kind. A lock shows its state and is never opened from here: HOME also answers a paired
// phone away from home, through the relay, and a door is not a light.
export const KINDS: Record<string, { acts: Record<string, string>; on?: string[] }> = {
  light:         { acts: { toggle: "toggle", on: "turn_on", off: "turn_off" }, on: ["on"] },
  switch:        { acts: { toggle: "toggle", on: "turn_on", off: "turn_off" }, on: ["on"] },
  fan:           { acts: { toggle: "toggle", on: "turn_on", off: "turn_off" }, on: ["on"] },
  input_boolean: { acts: { toggle: "toggle", on: "turn_on", off: "turn_off" }, on: ["on"] },
  cover:         { acts: { open: "open_cover", close: "close_cover", stop: "stop_cover" }, on: ["open", "opening"] },
  scene:         { acts: { run: "turn_on" } },
  script:        { acts: { run: "turn_on" }, on: ["on"] },
  media_player:  { acts: { play_pause: "media_play_pause", next: "media_next_track" }, on: ["playing"] },
  climate:       { acts: { warmer: "set_temperature", cooler: "set_temperature" }, on: ["heat", "cool", "heat_cool", "auto", "dry", "fan_only"] },
  lock:          { acts: {}, on: ["locked"] },
};
const ORDER = Object.keys(KINDS);

export type Thing = { id: string; name: string; kind: string; state: string; on: boolean | null; can: string[]; detail: string | null };
export type Room = { name: string; things: Thing[] };
export type HomeView = { ok: boolean; error?: string; home?: string; rooms: Room[] };
type State = { entity_id: string; state: string; attributes: Record<string, any> };

// Rooms are Home Assistant's areas: an entity in one directly, or through its device. One template asks for all of them.
const ROOMS_TEMPLATE = `{%- set ns = namespace(rooms=[]) -%}
{%- for a in areas() -%}
{%- set ns.rooms = ns.rooms + [{"name": area_name(a), "ids": (area_entities(a) + (area_devices(a) | map('device_entities') | sum(start=[]))) | unique | list}] -%}
{%- endfor -%}
{{ ns.rooms | tojson }}`;

export interface HomeKeys { get(k: string): string | null; set(k: string, v: string | null): void }
export type Fetch = typeof fetch;

export class Home {
  private rooms: { at: number; list: { name: string; ids: string[] }[] } | null = null;
  constructor(private keys: HomeKeys, private fetchFn: Fetch = fetch) {}

  settings() {
    const url = this.keys.get("home.url"), token = this.keys.get("home.token");
    return { url, hasToken: !!token };
  }
  // url: http(s) only, its trailing slash dropped; token: "" forgets it, undefined keeps it
  set(url: string | null | undefined, token: string | null | undefined) {
    if (url !== undefined) {
      const u = (url ?? "").trim().replace(/\/+$/, "");
      if (u && !/^https?:\/\/[^\s/]+(:\d+)?(\/[^\s]*)?$/.test(u)) throw new Error("Home Assistant's address starts http:// or https://");
      this.keys.set("home.url", u || null);
    }
    if (token !== undefined) this.keys.set("home.token", (token ?? "").trim() || null);
    this.rooms = null;
    return this.settings();
  }

  private async call(method: "GET" | "POST", path: string, body?: unknown): Promise<any> {
    const url = this.keys.get("home.url"), token = this.keys.get("home.token");
    if (!url || !token) throw new HomeError("not set", "Home Assistant is not set up -- its address and a token, on the companion's SETTINGS");
    let res: Response;
    try {
      res = await this.fetchFn(url + path, { method, signal: AbortSignal.timeout(8000),
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch { throw new HomeError("unreachable", `Home Assistant did not answer at ${url}`); }
    if (res.status === 401 || res.status === 403) throw new HomeError("refused", "Home Assistant refused the token -- make a new one and enter it on SETTINGS");
    if (!res.ok) throw new HomeError("failed", `Home Assistant answered ${res.status}`);
    const text = await res.text();
    try { return JSON.parse(text); } catch { return text; }
  }

  // Whether it answers, and the home's own name
  async check(): Promise<{ ok: boolean; error?: string; home?: string }> {
    try { const c = await this.call("GET", "/api/config"); return { ok: true, home: c?.location_name ?? undefined }; }
    catch (e) { return { ok: false, error: (e as Error).message }; }
  }

  async view(): Promise<HomeView> {
    try {
      const [states, config] = await Promise.all([this.call("GET", "/api/states") as Promise<State[]>, this.call("GET", "/api/config").catch(() => null)]);
      const rooms = await this.roomList();
      const byId = new Map(states.filter((s) => KINDS[kindOf(s.entity_id)] && !s.attributes?.hidden).map((s) => [s.entity_id, s]));
      const placed = new Set<string>(), out: Room[] = [];
      for (const r of rooms) {
        const things = r.ids.map((id) => byId.get(id)).filter((s): s is State => !!s).map(thingOf);
        things.forEach((t) => placed.add(t.id));
        if (things.length) out.push({ name: r.name, things: sortThings(things) });
      }
      out.sort((a, b) => a.name.localeCompare(b.name));
      const rest = [...byId.values()].filter((s) => !placed.has(s.entity_id)).map(thingOf);
      if (rest.length) out.push({ name: "Elsewhere", things: sortThings(rest) });   // DRAFT
      return { ok: true, home: config?.location_name, rooms: out };
    } catch (e) { return { ok: false, error: (e as Error).message, rooms: [] }; }
  }

  private async roomList() {
    if (this.rooms && Date.now() - this.rooms.at < 60_000) return this.rooms.list;
    let list: { name: string; ids: string[] }[] = [];
    try {
      const r = await this.call("POST", "/api/template", { template: ROOMS_TEMPLATE });
      list = Array.isArray(r) ? r : JSON.parse(String(r));
    } catch (e) { if (e instanceof HomeError && e.code !== "failed") throw e; }   // no areas, or an old HA: everything is Elsewhere
    this.rooms = { at: Date.now(), list };
    return list;
  }

  // One action on one thing, by name: only what KINDS allows for its kind, only a thing Home Assistant has
  async act(id: string, action: string): Promise<{ ok: boolean; thing?: Thing; error?: string }> {
    const kind = kindOf(String(id)), service = KINDS[kind]?.acts[action];
    if (!/^[a-z_]+\.[a-z0-9_]+$/.test(String(id)) || !service) return { ok: false, error: `HOME does not ${action} a ${kind || "thing"}` };
    try {
      const s = await this.call("GET", `/api/states/${id}`) as State;
      const data: Record<string, unknown> = { entity_id: id };
      if (kind === "climate") {
        const target = Number(s.attributes?.temperature), step = Number(s.attributes?.target_temp_step) || (s.attributes?.temperature_unit === "°F" ? 1 : 0.5);
        if (!Number.isFinite(target)) return { ok: false, error: "it has no temperature to change" };
        data.temperature = Math.min(Number(s.attributes?.max_temp ?? 99), Math.max(Number(s.attributes?.min_temp ?? 0), target + (action === "warmer" ? step : -step)));
      }
      const changed = await this.call("POST", `/api/services/${kind}/${service}`, data);
      const after = Array.isArray(changed) ? changed.find((c: State) => c.entity_id === id) : null;
      return { ok: true, thing: thingOf(after ?? await this.call("GET", `/api/states/${id}`)) };
    } catch (e) { return { ok: false, error: (e as Error).message }; }
  }

  // Asked in words: Home Assistant's own conversation agent answers (the one its voice pipeline uses, the BOX-3's too)
  async ask(text: string, conversationId?: string | null): Promise<{ ok: boolean; speech?: string; conversationId?: string; error?: string }> {
    const t = String(text ?? "").trim().slice(0, 500);
    if (!t) return { ok: false, error: "nothing was asked" };
    try {
      const r = await this.call("POST", "/api/conversation/process", { text: t, ...(conversationId ? { conversation_id: conversationId } : {}) });
      return { ok: true, speech: r?.response?.speech?.plain?.speech ?? "", conversationId: r?.conversation_id ?? undefined };
    } catch (e) { return { ok: false, error: (e as Error).message }; }
  }
}

export class HomeError extends Error { constructor(public code: string, message: string) { super(message); } }

const kindOf = (id: string) => id.split(".")[0];
const sortThings = (t: Thing[]) => t.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) || a.name.localeCompare(b.name));

export function thingOf(s: State): Thing {
  const kind = kindOf(s.entity_id), k = KINDS[kind], a = s.attributes ?? {};
  const unknown = s.state === "unavailable" || s.state === "unknown";
  let detail: string | null = null;
  if (kind === "light" && s.state === "on" && a.brightness != null) detail = `${Math.round((Number(a.brightness) / 255) * 100)}%`;
  if (kind === "cover" && a.current_position != null) detail = `${a.current_position}%`;
  if (kind === "climate") {
    const u = a.temperature_unit ?? "°";
    detail = [a.current_temperature != null ? `${a.current_temperature}${u}` : null, a.temperature != null ? `to ${a.temperature}${u}` : null].filter(Boolean).join(" ") || null;
  }
  if (kind === "media_player" && a.media_title) detail = [a.media_artist, a.media_title].filter(Boolean).join(" -- ");
  return { id: s.entity_id, name: String(a.friendly_name ?? s.entity_id), kind, state: s.state,
           on: unknown || !k?.on ? null : k.on.includes(s.state), can: unknown ? [] : Object.keys(k?.acts ?? {}), detail };
}
