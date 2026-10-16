import { describe, expect, it } from "vitest";
import { Home, thingOf, type Fetch } from "../src/home.js";

// A Home Assistant that answers from a table, and keeps what it was asked
function fakeHa(states: any[], opts: { rooms?: any; token?: string } = {}) {
  const calls: { method: string; path: string; body: any; auth: string | null }[] = [];
  const fetchFn: Fetch = (async (url: string, init: RequestInit = {}) => {
    const path = new URL(url).pathname, method = init.method ?? "GET", body = init.body ? JSON.parse(String(init.body)) : null;
    const auth = new Headers(init.headers).get("authorization");
    calls.push({ method, path, body, auth });
    const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status });
    if (auth !== `Bearer ${opts.token ?? "secret"}`) return json({ message: "401: Unauthorized" }, 401);
    if (path === "/api/config") return json({ location_name: "Home" });
    if (path === "/api/states") return json(states);
    if (path.startsWith("/api/states/")) return json(states.find((s) => s.entity_id === path.slice(12)) ?? {}, 200);
    if (path === "/api/template") return new Response(JSON.stringify(opts.rooms ?? []));
    if (path.startsWith("/api/services/")) {
      const s = states.find((x) => x.entity_id === body.entity_id);
      if (s && path.endsWith("/toggle")) s.state = s.state === "on" ? "off" : "on";
      return json(s ? [s] : []);
    }
    if (path === "/api/conversation/process") return json({ response: { speech: { plain: { speech: `You said ${body.text}` } } }, conversation_id: "c1" });
    return json({}, 404);
  }) as Fetch;
  return { fetchFn, calls };
}
const keys = (init: Record<string, string> = {}) => {
  const m = new Map(Object.entries(init));
  return { get: (k: string) => m.get(k) ?? null, set: (k: string, v: string | null) => { v == null ? m.delete(k) : m.set(k, v); }, m };
};
const STATES = () => [
  { entity_id: "light.kitchen", state: "on", attributes: { friendly_name: "Kitchen light", brightness: 128 } },
  { entity_id: "switch.kettle", state: "off", attributes: { friendly_name: "Kettle" } },
  { entity_id: "lock.front_door", state: "locked", attributes: { friendly_name: "Front door" } },
  { entity_id: "sensor.temp", state: "21", attributes: { friendly_name: "Temperature" } },
  { entity_id: "scene.movie", state: "2026-10-16", attributes: { friendly_name: "Movie night" } },
  { entity_id: "climate.hall", state: "heat", attributes: { friendly_name: "Hall", temperature: 20, current_temperature: 19, temperature_unit: "°C", min_temp: 7, max_temp: 30 } },
];
const SET = { "home.url": "http://ha.test:8123", "home.token": "secret" };

describe("HOME: Home Assistant through the server (C-139)", () => {
  it("says it is not set up until it has an address and a token, and never hands the token back", async () => {
    const k = keys(), home = new Home(k, fakeHa(STATES()).fetchFn);
    expect(await home.view()).toMatchObject({ ok: false, rooms: [] });
    expect(home.set("http://ha.test:8123/", "secret")).toEqual({ url: "http://ha.test:8123", hasToken: true });
    expect(JSON.stringify(home.settings())).not.toContain("secret");
    expect(() => home.set("ha.test", undefined)).toThrow(/http/);
    expect(home.set(undefined, "")).toEqual({ url: "http://ha.test:8123", hasToken: false });
  });

  it("groups what it can show by room, leaves sensors out, and puts the rest Elsewhere", async () => {
    const { fetchFn } = fakeHa(STATES(), { rooms: [{ name: "Kitchen", ids: ["light.kitchen", "switch.kettle", "sensor.temp"] }] });
    const v = await new Home(keys(SET), fetchFn).view();
    expect(v.ok).toBe(true);
    expect(v.home).toBe("Home");
    expect(v.rooms.map((r) => r.name)).toEqual(["Kitchen", "Elsewhere"]);
    expect(v.rooms[0].things.map((t) => t.id)).toEqual(["light.kitchen", "switch.kettle"]);
    expect(v.rooms[0].things[0]).toMatchObject({ on: true, detail: "50%", can: ["toggle", "on", "off"] });
    expect(v.rooms[1].things.map((t) => t.kind)).toEqual(["scene", "climate", "lock"]);
  });

  it("does only what its kind allows -- never opens a lock -- and returns the thing as it is after", async () => {
    const { fetchFn, calls } = fakeHa(STATES());
    const home = new Home(keys(SET), fetchFn);
    expect(await home.act("switch.kettle", "toggle")).toMatchObject({ ok: true, thing: { on: true } });
    expect(calls.some((c) => c.path === "/api/services/switch/toggle" && c.body.entity_id === "switch.kettle")).toBe(true);
    expect((await home.act("lock.front_door", "unlock")).ok).toBe(false);
    expect((await home.act("light.kitchen", "explode")).ok).toBe(false);
    expect((await home.act("light.kitchen; rm", "toggle")).ok).toBe(false);
    expect(calls.filter((c) => c.path.startsWith("/api/services/")).length).toBe(1);
  });

  it("warms and cools by the climate's own step, within its limits", async () => {
    const { fetchFn, calls } = fakeHa(STATES());
    await new Home(keys(SET), fetchFn).act("climate.hall", "warmer");
    expect(calls.find((c) => c.path === "/api/services/climate/set_temperature")?.body).toEqual({ entity_id: "climate.hall", temperature: 20.5 });
  });

  it("asks Home Assistant's conversation agent, and says when the token is refused", async () => {
    expect(await new Home(keys(SET), fakeHa(STATES()).fetchFn).ask("turn on the kettle")).toMatchObject({ ok: true, speech: "You said turn on the kettle", conversationId: "c1" });
    const refused = await new Home(keys({ ...SET, "home.token": "old" }), fakeHa(STATES()).fetchFn).view();
    expect(refused.ok).toBe(false);
    expect(refused.error).toMatch(/refused the token/);
  });

  it("marks a thing it cannot reach as neither on nor off, with nothing to do", () => {
    expect(thingOf({ entity_id: "light.porch", state: "unavailable", attributes: {} })).toMatchObject({ on: null, can: [] });
  });
});
