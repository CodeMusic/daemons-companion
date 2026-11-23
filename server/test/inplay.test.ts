// C-478: THE GAMES IN PLAY -- heartbeats, a save read as the trainer card reads it, the screen kept, ending one
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import P from "../data/profile_layout.json" with { type: "json" };
import { InPlay, PLAYING_MS, LATELY, summarize } from "../src/game/inplay.js";
import { makeServer } from "../src/api.js";
import { DEFAULTS } from "../src/shared/config.js";
import { buildSave } from "./build_save.js";

const save = buildSave({
  player: "CRYSTAL", trainerId: 12345,
  slots: [{ counter: 3, party: [{ personality: 99, otId: 7, species: 1, nickname: "PIP", level: 5 }] }, { counter: 2, party: [] }],
  edit: (sb2, sb1) => {
    new DataView(sb2.buffer).setUint16(P.sb2.play_time_hours, 2, true); sb2[P.sb2.play_time_minutes] = 7;
    sb1[P.sb1.location] = 5; sb1[P.sb1.location + 1] = 2;
  },
});
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

describe("THE GAMES IN PLAY (C-478)", () => {
  it("reads a save as the trainer card does", () => {
    const s = summarize(save)!;
    expect(s).toMatchObject({ name: "CRYSTAL", playTime: "2:07", marks: 0, party: [{ species: 1, nickname: "PIP", level: 5 }] });
    expect(s.savedIn).toBeTruthy();
    expect(summarize(new Uint8Array(100))).toBeNull();
  });

  it("knows a game by its heartbeat, its save and its screen, and lets it go when unheard", () => {
    let t = Date.parse("2026-11-23T12:00:00Z");
    const ip = new InPlay(() => t);
    expect(ip.beat({ id: "a b", source: "app" })).toHaveProperty("error");
    expect(ip.beat({ id: "g1", source: "cartridge" })).toHaveProperty("error");
    expect(ip.beat({ id: "g1", source: "app", device: "iPhone", user: "PLAYER", edition: "CONTENT", save })).toEqual({ ok: true, end: false });
    expect(ip.frame("g1", JPEG, "image/jpeg")).toEqual({ ok: true });
    expect(ip.frame("g1", JPEG, "text/html")).toHaveProperty("error");
    expect(ip.frame("nobody", JPEG, "image/jpeg")).toHaveProperty("error");
    const v = ip.view();
    expect(v.playing).toHaveLength(1);
    expect(v.playing[0]).toMatchObject({ id: "g1", source: "app", device: "iPhone", user: "PLAYER", edition: "CONTENT",
                                         summary: { name: "CRYSTAL" }, frame: { type: "image/jpeg", bytes: JPEG.length } });
    expect(v.playing[0]).not.toHaveProperty("frameBytes");
    expect(ip.frameOf("g1")!.bytes).toEqual(JPEG);
    t += PLAYING_MS + 1;
    expect(ip.view()).toMatchObject({ playing: [], lately: [{ id: "g1", ended: expect.any(String) }] });
    expect(ip.frameOf("g1")).toBeNull();
  });

  it("asks a game to end at its next heartbeat; its goodbye ends it", () => {
    let t = 0;
    const ip = new InPlay(() => t);
    ip.beat({ id: "ai-1", source: "ai" });
    expect(ip.end("ai-1")).toBe(true);
    t += 1000;
    expect(ip.beat({ id: "ai-1", source: "ai" })).toEqual({ ok: true, end: true });
    expect(ip.over("ai-1")).toBe(true);
    expect(ip.view().playing).toHaveLength(0);
    expect(ip.end("ai-1")).toBe(false);
    // a new heartbeat under an ended game's id begins a new game
    expect(ip.beat({ id: "ai-1", source: "ai" })).toEqual({ ok: true, end: false });
  });

  it("keeps at most LATELY of the lately played", () => {
    let t = 0;
    const ip = new InPlay(() => t);
    for (let i = 0; i < LATELY + 5; i++) { ip.beat({ id: `g${i}`, source: "site" }); ip.over(`g${i}`); t += 10; }
    expect(ip.view().lately).toHaveLength(LATELY);
  });
});

describe("/api/games (C-478)", () => {
  const server = makeServer({ ...DEFAULTS, database: ":memory:", savePath: null });
  let base = "";
  beforeAll(async () => { await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r())); base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; });
  afterAll(() => server.close());
  const post = (p: string, b: unknown) => fetch(base + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });

  it("takes a heartbeat with its save, a frame, and lists the game with its screen", async () => {
    expect((await post("/api/games/beat", { id: "t1", source: "playground", device: "Mac", save: Buffer.from(save).toString("base64") })).status).toBe(200);
    const f = await fetch(`${base}/api/games/t1/frame`, { method: "POST", headers: { "content-type": "image/jpeg" }, body: JPEG });
    expect(f.status).toBe(200);
    const v = await (await fetch(`${base}/api/games`)).json();
    expect(v.playing[0]).toMatchObject({ id: "t1", source: "playground", summary: { name: "CRYSTAL", party: [{ nickname: "PIP" }] } });
    expect(v.sources.ai).toBeTruthy();
    const img = await fetch(`${base}/api/games/t1/frame`);
    expect(img.headers.get("content-type")).toBe("image/jpeg");
    expect(new Uint8Array(await img.arrayBuffer())).toEqual(JPEG);
    expect((await post("/api/games/t1/end", {})).status).toBe(200);
    expect(await (await post("/api/games/beat", { id: "t1", source: "playground" })).json()).toEqual({ ok: true, end: true });
    expect((await post("/api/games/nobody/end", {})).status).toBe(404);
  });
});
