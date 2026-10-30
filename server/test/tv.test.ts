import { describe, expect, it } from "vitest";
import { Home, type Fetch } from "../src/home.js";
import { Tvs, lanHost } from "../src/tv.js";

// C-256: a Roku and a Home Assistant that answer from a table, and keep what they were asked
function world(opts: { rokuStatus?: number } = {}) {
  const calls: { url: string; method: string; body: any }[] = [];
  const states = [
    { entity_id: "remote.living_room", state: "on", attributes: { friendly_name: "Living Room" } },
    { entity_id: "remote.shield", state: "on", attributes: { friendly_name: "Shield" } },
    { entity_id: "media_player.fire_tv", state: "idle", attributes: { friendly_name: "Fire TV" } },
  ];
  const fetchFn: Fetch = (async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET", body = init.body ? JSON.parse(String(init.body)) : null;
    calls.push({ url, method, body });
    const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status });
    if (url.includes(":8060/")) return new Response("", { status: opts.rokuStatus ?? 200 });
    const path = new URL(url).pathname;
    if (path === "/api/states") return json(states);
    if (path === "/api/template") return json({ roku: [], apple: ["remote.living_room", "media_player.living_room"], google: ["remote.shield"], fire: ["media_player.fire_tv"] });
    if (path.startsWith("/api/services/")) return json([]);
    return json({}, 404);
  }) as Fetch;
  const m = new Map<string, string>([["home.url", "http://ha.local:8123"], ["home.token", "secret"]]);
  const keys = { get: (k: string) => m.get(k) ?? null, set: (k: string, v: string | null) => { v == null ? m.delete(k) : m.set(k, v); } };
  return { tvs: new Tvs(keys, new Home(keys, fetchFn), fetchFn), calls, m };
}

describe("TVs (C-256)", () => {
  it("keeps a Roku's address to this network", () => {
    expect(lanHost("192.168.1.40")).toBe("192.168.1.40");
    expect(lanHost("10.0.0.9")).toBe("10.0.0.9");
    expect(lanHost("roku-den.local")).toBe("roku-den.local");
    expect(lanHost("8.8.8.8")).toBeNull();
    expect(lanHost("example.com")).toBeNull();
    expect(lanHost("192.168.1.400")).toBeNull();
  });

  it("presses a Roku directly, by its own key names", async () => {
    const { tvs, calls } = world();
    const { tv } = tvs.add({ name: "Den", platform: "roku", host: "192.168.1.40" });
    expect(await tvs.press(tv!.id, "ok")).toEqual({ ok: true });
    expect(await tvs.press(tv!.id, "volup")).toEqual({ ok: true });
    expect(calls.map((c) => [c.method, c.url])).toEqual([
      ["POST", "http://192.168.1.40:8060/keypress/Select"], ["POST", "http://192.168.1.40:8060/keypress/VolumeUp"]]);
  });

  it("says when a Roku has mobile control switched off", async () => {
    const { tvs } = world({ rokuStatus: 403 });
    const { tv } = tvs.add({ name: "Den", platform: "roku", host: "192.168.1.40" });
    expect((await tvs.press(tv!.id, "home")).error).toMatch(/Control by mobile apps/);
  });

  it("presses an Apple TV, a Google TV and a Fire TV through Home Assistant", async () => {
    const { tvs, calls } = world();
    const apple = tvs.add({ name: "Living Room", platform: "apple", entity: "remote.living_room" }).tv!;
    const google = tvs.add({ name: "Shield", platform: "google", entity: "remote.shield" }).tv!;
    const fire = tvs.add({ name: "Fire TV", platform: "fire", entity: "media_player.fire_tv" }).tv!;
    await tvs.press(apple.id, "back");
    await tvs.press(apple.id, "power");
    await tvs.press(google.id, "up");
    await tvs.press(fire.id, "play");
    const asked = calls.filter((c) => c.url.includes("/api/services/")).map((c) => [new URL(c.url).pathname, c.body]);
    expect(asked).toEqual([
      ["/api/services/remote/send_command", { entity_id: "remote.living_room", command: "menu" }],
      ["/api/services/remote/toggle", { entity_id: "remote.living_room" }],
      ["/api/services/remote/send_command", { entity_id: "remote.shield", command: "DPAD_UP" }],
      ["/api/services/androidtv/adb_command", { entity_id: "media_player.fire_tv", command: "KEYCODE_MEDIA_PLAY_PAUSE" }],
    ]);
  });

  it("refuses what is not a TV, a button or a place on this network", async () => {
    const { tvs } = world();
    expect(tvs.add({ name: "Away", platform: "roku", host: "203.0.113.5" }).ok).toBe(false);
    expect(tvs.add({ name: "Lamp", platform: "apple", entity: "light.lamp" }).ok).toBe(false);
    expect(tvs.add({ name: "Box", platform: "tivo" }).ok).toBe(false);
    const tv = tvs.add({ name: "Den", platform: "roku", host: "192.168.1.40" }).tv!;
    expect((await tvs.press(tv.id, "selfdestruct")).ok).toBe(false);
    expect((await tvs.press("nope", "ok")).ok).toBe(false);
  });

  it("shows a device the names, never the addresses", () => {
    const { tvs } = world();
    tvs.add({ name: "Den", platform: "roku", host: "192.168.1.40" });
    const d = tvs.forDevice();
    expect(d.tvs).toEqual([{ id: "den", name: "Den", platform: "roku" }]);
    expect(JSON.stringify(d)).not.toContain("192.168");
  });

  it("finds the Rokus heard and Home Assistant's TVs, marking those already added", async () => {
    const { tvs } = world();
    tvs.add({ name: "Shield", platform: "google", entity: "remote.shield" });
    const { found } = await tvs.find([{ host: "192.168.1.40", name: "Den Roku" }]);
    expect(found).toEqual([
      { name: "Den Roku", platform: "roku", host: "192.168.1.40", added: false },
      { name: "Living Room", platform: "apple", entity: "remote.living_room", added: false },
      { name: "Shield", platform: "google", entity: "remote.shield", added: true },
      { name: "Fire TV", platform: "fire", entity: "media_player.fire_tv", added: false },
    ]);
  });

  it("renames and removes", () => {
    const { tvs } = world();
    const tv = tvs.add({ name: "Den", platform: "roku", host: "192.168.1.40" }).tv!;
    expect(tvs.rename(tv.id, "Bedroom")).toBe(true);
    expect(tvs.list()[0].name).toBe("Bedroom");
    expect(tvs.remove(tv.id)).toBe(true);
    expect(tvs.list()).toEqual([]);
  });
});
