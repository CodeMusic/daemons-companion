// C-327: social within the household -- a swap of what two devices carry, two daemons in one space shown on both, and a
// care given on either seen on both. On synthetic saves built as the game builds them; never the user's own.
import { describe, expect, it } from "vitest";
import * as core from "../src/core.js";
import { carriedFor } from "../src/carry.js";
import { Store } from "../src/db.js";
import { route } from "../src/routes.js";
import { SPACE_MS } from "../src/household.js";
import { buildSave } from "./build_save.js";

const PIP = { personality: 0x12345678, otId: 0x00ab1234, species: 1, nickname: "PIP", level: 12, away: true };
const LABEL = { personality: 0x0000002f, otId: 0x00ab1234, species: 4, nickname: "LABEL", level: 9, away: true };
const WATCH = "t-watch-ultra-a1b2c3", PHONE = "iphone-widget-0a0b0c", STICK = "m5-sticks3-0a0b0c";
const T0 = new Date("2026-11-11T12:00:00Z");

function home(party = [PIP, LABEL]) {
  const bytes = { save: buildSave({ player: "ASH", trainerId: 0x00ab1234, slots: [{ counter: 3, party }] }) };
  const h: core.Host = { edition: "CONTENT", save: { read: () => bytes.save, write: (b) => { bytes.save = b; return null; } } };
  const store = new Store(":memory:");
  const away = core.awayNow(h);
  carriedFor(store, away, WATCH); carriedFor(store, away, PHONE);     // the watch takes PIP, the phone LABEL
  const post = (path: string, body: object, deviceId = "", now = T0) => route(h, store, { method: "POST", path, body, deviceId }, now);
  const state = (deviceId: string, now = T0) => core.deviceState(h, store, now, deviceId) as any;
  return { h, store, post, state };
}

describe("SWAP between two of the household's devices", () => {
  it("exchanges what each carries, and nothing is written to the save", () => {
    const { h, post, state } = home(), before = h.save.read()!.slice();
    expect(state(WATCH).daemon.nickname).toBe("PIP");
    const r = post("/api/household/swap", { b: PHONE }, WATCH);
    expect(r.status).toBe(200);
    expect(state(WATCH).daemon.nickname).toBe("LABEL");
    expect(state(PHONE).daemon.nickname).toBe("PIP");
    expect((r.body as any).carrying[WATCH].nickname).toBe("LABEL");
    expect(h.save.read()).toEqual(before);
  });
  it("moves one across when the other device carries none, and refuses two empty or the same device", () => {
    const { post, state } = home([PIP]);
    expect(state(PHONE).daemon).toBeNull();
    expect(post("/api/household/swap", { a: WATCH, b: PHONE }).status).toBe(200);
    expect(state(PHONE).daemon.nickname).toBe("PIP");
    expect(state(WATCH).daemon).toBeNull();
    expect(post("/api/household/swap", { a: WATCH, b: STICK }).status).toBe(400);
    expect(post("/api/household/swap", { a: PHONE, b: PHONE }).status).toBe(400);
  });
});

describe("TOGETHER: two daemons in one space, shown on both", () => {
  it("names the other daemon and the side each stands on, and ends when either leaves", () => {
    const { post, state } = home();
    expect(state(WATCH).together).toBeUndefined();
    expect(post("/api/household/together", { b: PHONE }, WATCH).status).toBe(200);
    expect(state(WATCH).together).toMatchObject({ device: PHONE, side: "left", daemon: { nickname: "LABEL" }, care: null });
    expect(state(PHONE).together).toMatchObject({ device: WATCH, side: "right", daemon: { nickname: "PIP" } });
    post("/api/household/apart", {}, PHONE);
    expect(state(WATCH).together).toBeUndefined();
  });
  it("lasts twelve hours, and a device joining another space leaves its first", () => {
    const { post, state } = home();
    post("/api/household/together", { a: WATCH, b: PHONE });
    expect(state(WATCH, new Date(T0.getTime() + SPACE_MS - 1000)).together).toBeDefined();
    expect(state(WATCH, new Date(T0.getTime() + SPACE_MS + 1000)).together).toBeUndefined();
    post("/api/household/together", { a: WATCH, b: PHONE });
    post("/api/household/together", { a: STICK, b: PHONE });
    expect(state(WATCH).together).toBeUndefined();
    expect(state(PHONE).together.device).toBe(STICK);
  });
  it("shows a care given on either on both for a minute and a half, and counts it for both daemons' bonds", () => {
    const { store, post, state } = home();
    post("/api/household/together", { a: WATCH, b: PHONE });
    expect(post("/api/daemon/feed", {}, PHONE).status).toBe(200);
    expect(state(WATCH).together.care).toMatchObject({ kind: "feed", by: PHONE, mine: false });
    expect(state(PHONE).together.care).toMatchObject({ kind: "feed", mine: true });
    expect(state(WATCH, new Date(T0.getTime() + 91_000)).together.care).toBeNull();
    for (const d of [PIP, LABEL]) expect(JSON.parse(store.getSetting(`bond.caresToday.${d.personality >>> 0}`) ?? "{}").n).toBe(1);
  });
  it("counts a care apart for its own daemon only, as before", () => {
    const { store, post } = home();
    post("/api/daemon/water", {}, PHONE);
    expect(store.getSetting(`bond.caresToday.${PIP.personality >>> 0}`)).toBeNull();
    expect(JSON.parse(store.getSetting(`bond.caresToday.${LABEL.personality >>> 0}`)!).n).toBe(1);
  });
});
