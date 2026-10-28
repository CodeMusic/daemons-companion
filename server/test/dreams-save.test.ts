// C-200 (DAEMONS T-462): the last dream written into the save's vars at SYNC -- 0x40D4 quality (bit 2 tucked in) and the
// image, 0x40D5 the hours in tenths, 0x40D6 nights and rested nights since the last SYNC, 0x40D7 the day. Synthetic saves.
import { describe, expect, it } from "vitest";
import eventsJson from "../data/events.json" with { type: "json" };
import { sync, type Host } from "../src/core.js";
import { Store } from "../src/db.js";
import { blocks } from "../src/save/reader.js";
import { checkNight, DREAM_VARS, dreamDay, dreamImage, keepNight, type Night } from "../src/dreams.js";
import P from "../data/profile_layout.json" with { type: "json" };
import { buildSave } from "./build_save.js";

const EV = eventsJson as unknown as { sb1_vars: number; vars_start: number };
const OT = 0x00ab1234;
const host = (): Host & { bytes: Uint8Array } => {
  const h = { edition: "CONTENT" as const, bytes: buildSave({ player: "ROVER", trainerId: OT, slots: [{ counter: 8, party: [
    { personality: 0x2f, otId: OT, species: 4, nickname: "LABEL", level: 9 }] }] }),
    save: { read: () => h.bytes, write: (b: Uint8Array) => { h.bytes = b; return null; } } };
  return h;
};
const varOf = (save: Uint8Array, n: number) => {
  const { sb1 } = blocks(save);
  return new DataView(sb1.buffer, sb1.byteOffset, sb1.byteLength).getUint16(EV.sb1_vars + 2 * (n - EV.vars_start), true);
};
const night = (to: string, hours: number, stirs: number, tucked = false) =>
  checkNight({ from: new Date(Date.parse(to) - hours * 3600000).toISOString(), to, stirs, tucked }) as Night;
const who = { nickname: "LABEL", species: 4, personality: 0x2f, device: "t-watch-ultra-f351d4" };

describe("C-200: the last dream, into the save at SYNC", () => {
  it("writes nothing when there is no dream", () => {
    const h = host(), store = new Store(":memory:");
    sync(h, store);
    for (const v of [0x40d4, 0x40d5, 0x40d6, 0x40d7]) expect(varOf(h.bytes, v)).toBe(0);
  });
  it("writes the newest dream, the nights since the last SYNC, and leaves them as they are with no new one", () => {
    const h = host(), store = new Store(":memory:");
    sync(h, store);                                               // married first
    keepNight(store, night("2026-10-28T11:00:00Z", 3, 0), who);   // broken
    const last = keepNight(store, night("2026-10-29T11:00:00Z", 8, 1, true), who);   // vivid, tucked in: rested
    sync(h, store);
    expect(varOf(h.bytes, 0x40d4)).toBe((dreamImage(last) << 8) | 3 | 4);
    expect(varOf(h.bytes, 0x40d5)).toBe(80);
    expect(varOf(h.bytes, 0x40d6)).toBe((1 << 8) | 2);
    expect(varOf(h.bytes, 0x40d7)).toBe(dreamDay(last));
    const before = h.bytes.slice();
    sync(h, store);                                               // no new dream: every var as it was
    for (const v of [0x40d4, 0x40d5, 0x40d6, 0x40d7]) expect(varOf(h.bytes, v)).toBe(varOf(before, v));
  });
  it("writes the four the game left to it, where its layout says (T-462), and never the game's own", () => {
    const W = (P as any).its_dreams.write;
    expect(DREAM_VARS).toEqual({ dream: W.dream.var, hours: W.hours.var, nights: W.nights.var, day: W.day.var });
    for (const k of ["dream", "hours", "nights", "day"]) expect(EV.sb1_vars + 2 * (W[k].var - EV.vars_start)).toBe(W[k].sb1);
    const game = Object.values((P as any).its_dreams.game).map((g: any) => g.var);
    expect(Object.values(DREAM_VARS).some((v) => game.includes(v))).toBe(false);
  });
  it("tells different dreams on different nights (nights a day apart once all told the same one)", () => {
    const seen = new Set(Array.from({ length: 16 }, (_, i) =>
      dreamImage({ to: new Date(Date.parse("2026-10-01T11:00:00Z") + i * 86400000).toISOString(), personality: 0x2f, quality: "vivid" })));
    expect(seen.size).toBeGreaterThanOrEqual(8);
  });
  it("picks the image the written dream told, from sixteen", () => {
    const d = { to: "2026-10-29T11:00:00Z", personality: 0x2f, quality: "quiet" as const };
    expect(dreamImage(d)).toBeGreaterThanOrEqual(0);
    expect(dreamImage(d)).toBeLessThan(16);
    expect(dreamImage(d)).toBe(dreamImage({ ...d }));
  });
});
