// The T-Watch Ultra, 2026-11-16: re-paired, the watch showed STARR -- the phone's own widget's daemon. The bridge
// (app/platform/handheld.ts) asked for the board before its HELLO, with no device=, and the app named its widget instead.
import { beforeEach, describe, expect, it, vi } from "vitest";

const kept = new Map<string, string>();
vi.mock("../../app/node_modules/expo-secure-store", () => ({
  AFTER_FIRST_UNLOCK: 0,
  getItemAsync: async (k: string) => kept.get(k) ?? null,
  setItemAsync: async (k: string, v: string) => { kept.set(k, v); },
  deleteItemAsync: async (k: string) => { kept.delete(k); },
}));
vi.mock("../../app/node_modules/react-native-ble-plx", () => ({ BleManager: class {}, State: {} }));
vi.mock("../../app/node_modules/expo-audio", () => ({ createAudioPlayer: () => ({}), setAudioModeAsync: async () => {} }));
vi.mock("../../app/platform/voiceFile", () => ({ voiceFile: async () => null }));

const { handheld } = await import("../../app/platform/handheld");
const link = handheld as any;
const asked: string[] = [], said: string[] = [];
const api = async (path: string) => { asked.push(path); return path.includes("/art") ? { artKey: "148" } : { daemon: { name: "EMERGENCE" } }; };

beforeEach(async () => {
  asked.length = 0; said.length = 0; kept.clear();
  link.say = (l: string) => said.push(l);
  link.queue = [];
  await link.start(api);
  await link.unknown();
});

describe("the handheld's bridge names the board, never the phone", () => {
  it("asks nothing for a board that has not said HELLO, and keeps what it sent", async () => {
    await link.handle("ART?");
    await link.sendState();
    await link.handle("TICK 3");
    expect(asked).toEqual([]);
    expect(link.queue.map((q: any) => q.path)).toEqual(["/api/device/ticks"]);
  });
  it("at its HELLO, sends it its own state and picture, and what it sent is asked under its name", async () => {
    await link.handle("TICK 3");
    await link.handle("HELLO 1 t-watch-ultra x t-watch-ultra-f351d4");
    expect(asked).toContain("/api/device/state?via=phone&device=t-watch-ultra-f351d4");
    expect(asked).toContain("/api/device/ticks?device=t-watch-ultra-f351d4");
    expect(asked).toContain("/api/device/art?device=t-watch-ultra-f351d4");
    expect(said.some((l) => l.startsWith("ART "))).toBe(true);
    expect(kept.get("handheld-id")).toBe("t-watch-ultra-f351d4");
    expect(asked.every((p) => /[?&]device=t-watch-ultra-f351d4/.test(p))).toBe(true);
  });
  it("forgets the last board's name and state when another is paired", async () => {
    await link.handle("HELLO 1 t-watch-ultra x t-watch-ultra-f351d4");
    await link.unknown();
    expect(link.deviceId).toBeNull();
    expect(link.lastState).toBeNull();
    expect(kept.has("handheld-id")).toBe(false);
  });
});
