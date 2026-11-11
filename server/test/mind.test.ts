// C-254: the mind portal's NOW (each feeling, its colour, the room's weather, the event behind the strongest) and the
// dream the save carries, read back from VAR_0x40D4..0x40D7 as SYNC wrote it. Synthetic saves (build_save.ts).
import { describe, expect, it } from "vitest";
import { sync, type Host } from "../src/core.js";
import { Store } from "../src/db.js";
import { checkNight, DREAM_TITLES, dreamImage, keepNight, type Night } from "../src/dreams.js";
import type { Feelings } from "../src/feelings.js";
import { FELT, gameDream, mindNow, ORDINARY } from "../src/mind.js";
import { buildSave } from "./build_save.js";

const f = (o: Partial<Feelings>): Feelings => ({ glad: 0, mad: 0, sad: 0, calm: 0, restless: 0, strongest: null, ...o });

describe("C-254: NOW", () => {
  it("lists the feelings strongest first, each in the words a model is given and its colour", () => {
    const n = mindNow(f({ glad: 62, sad: 12, calm: 30 }));
    expect(n.felt.map((x) => x.name)).toEqual(["GLAD", "CALM", "SAD", "MAD"]);
    expect(n.felt[0]).toEqual({ name: "GLAD", value: 62, said: "very GLAD", colour: FELT.GLAD.colour });
    expect(n.felt[2].said).toBe("a little SAD");
    expect(n.weather).toBe(FELT.GLAD.weather);
    expect(n.colour).toBe(FELT.GLAD.colour);
  });
  it("names CALM's far side AFRAID, and adds RESTLESS only once it is felt", () => {
    const n = mindNow(f({ calm: -40, restless: 5 }));
    expect(n.felt.map((x) => x.name)).toEqual(["AFRAID", "GLAD", "MAD", "SAD"]);
    expect(n.weather).toBe(FELT.AFRAID.weather);
    expect(mindNow(f({ restless: 48 })).felt[0]).toMatchObject({ name: "RESTLESS", said: "somewhat RESTLESS" });
  });
  it("keeps an ordinary sky when nothing is felt", () => {
    const n = mindNow(f({ glad: 6 }));
    expect(n.weather).toBe(ORDINARY);
    expect(n.colour).toBeNull();
    expect(n.cause).toBeNull();
  });
  it("tells the event behind the strongest push in words", () => {
    const at = "2026-11-11T08:00:00Z";
    expect(mindNow(f({ glad: 20, strongest: { kind: "feed", at, axis: "glad", now: 10 } })).cause)
      .toEqual({ said: "it ate", at, name: "GLAD" });
    expect(mindNow(f({ calm: -8, strongest: { kind: "woken", at, axis: "calm", now: -8 } })).cause?.name).toBe("AFRAID");
  });
});

const OT = 0x00ab1234;
const host = (): Host & { bytes: Uint8Array } => {
  const h = { edition: "CONTENT" as const, bytes: buildSave({ player: "ROVER", trainerId: OT, slots: [{ counter: 8, party: [
    { personality: 0x2f, otId: OT, species: 4, nickname: "LABEL", level: 9 }] }] }),
    save: { read: () => h.bytes, write: (b: Uint8Array) => { h.bytes = b; return null; } } };
  return h;
};
const night = (to: string, hours: number, stirs: number, tucked = false) =>
  checkNight({ from: new Date(Date.parse(to) - hours * 3600000).toISOString(), to, stirs, tucked }) as Night;
const who = { nickname: "LABEL", species: 4, personality: 0x2f, device: "t-watch-ultra-f351d4" };

describe("C-254: the game's dream", () => {
  it("is null before any dream is carried", () => {
    const h = host(), store = new Store(":memory:");
    sync(h, store);
    expect(gameDream(h.bytes)).toBeNull();
  });
  it("reads back the dream SYNC wrote: its title, how it went, its hours and the nights", () => {
    const h = host(), store = new Store(":memory:");
    sync(h, store);
    keepNight(store, night("2026-10-28T11:00:00Z", 3, 0), who);
    const last = keepNight(store, night("2026-10-29T11:00:00Z", 8, 1, true), who);
    sync(h, store);
    expect(gameDream(h.bytes)).toEqual({ title: DREAM_TITLES[dreamImage(last)], quality: "vivid", tucked: true, hours: 8,
                                         nights: 2, rested: 1 });
  });
});
