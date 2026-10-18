// C-149: THE CASINO's coins are the save's money -- what a board won or lost waits here until SYNC writes it into the
// married save. On synthetic saves built as the game builds them; never the user's own.
import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import P from "../data/profile_layout.json" with { type: "json" };
import { deviceState, sync } from "../src/api.js";
import { DEFAULTS } from "../src/config.js";
import { Store } from "../src/db.js";
import { blocks } from "../src/save/reader.js";
import { readProfile } from "../src/save/profile.js";
import { casinoPending, casinoSeen, parseResult } from "../src/casino.js";
import { buildSave } from "./build_save.js";

const KEY = 0x5a3c96e1;   // the save's encryption key: the money is kept XOR it, as the game keeps it
const PIP = { personality: 0x12345678, otId: 0x00ab1234, species: 1, nickname: "PIP", level: 12, away: true };
const LABEL = { personality: 0x0000002f, otId: 0x00ab1234, species: 4, nickname: "LABEL", level: 9 };

function saveFile(money: number) {
  const save = buildSave({ player: "ROVER", trainerId: 0x00ab1234, slots: [{ counter: 1, party: [PIP, LABEL] }, { counter: 2, party: [PIP, LABEL] }],
    edit: (sb2, sb1) => {
      new DataView(sb2.buffer, sb2.byteOffset).setUint32(P.sb2.encryption_key, KEY, true);
      new DataView(sb1.buffer, sb1.byteOffset).setUint32(P.sb1.money, (money ^ KEY) >>> 0, true);
    } });
  const path = join(mkdtempSync(join(tmpdir(), "casino-")), "copy.sav");
  writeFileSync(path, save);
  return { path, cfg: { ...DEFAULTS, savePath: path } };
}
const moneyIn = (path: string) => readProfile(new Uint8Array(readFileSync(path))).money;
const played = (store: Store, delta: number, seq: number, boot = "a1b2", device = "m5-core-36f484", spins = 3) =>
  store.logInteraction("casino", `${delta} ${boot}.${seq} ${device} ${spins}`);

describe("the CASINO's coins (C-149)", () => {
  it("reads the money through the save's key", () => {
    const { path } = saveFile(3120);
    expect(moneyIn(path)).toBe(3120);
    const { sb1 } = blocks(new Uint8Array(readFileSync(path)));
    expect(new DataView(sb1.buffer, sb1.byteOffset).getUint32(P.sb1.money, true)).toBe((3120 ^ KEY) >>> 0);   // never plain
  });

  it("writes a win into the money at SYNC, sealed with the key, and settles it", () => {
    const { path, cfg } = saveFile(3000);
    const store = new Store(":memory:");
    played(store, 500, 1); played(store, -120, 2);
    const r = sync(cfg, store);
    expect(r.casino).toEqual({ won: 380, spins: 6, from: 3000, to: 3380 });
    expect(moneyIn(path)).toBe(3380);
    const { sb1 } = blocks(new Uint8Array(readFileSync(path)));
    expect(new DataView(sb1.buffer, sb1.byteOffset).getUint32(P.sb1.money, true)).toBe((3380 ^ KEY) >>> 0);
    expect(casinoPending(store).delta).toBe(0);                     // written once: the next SYNC has nothing to add
    expect(sync(cfg, store).casino).toBeNull();
    expect(moneyIn(path)).toBe(3380);
  });

  it("takes a loss out of the money", () => {
    const { path, cfg } = saveFile(3000);
    const store = new Store(":memory:");
    played(store, -700, 1);
    expect(sync(cfg, store).casino).toMatchObject({ won: -700, from: 3000, to: 2300 });
    expect(moneyIn(path)).toBe(2300);
  });

  it("never takes the money below 0", () => {
    const { path, cfg } = saveFile(200);
    const store = new Store(":memory:");
    played(store, -900, 1);
    expect(sync(cfg, store).casino).toMatchObject({ won: -900, from: 200, to: 0 });
    expect(moneyIn(path)).toBe(0);
    expect(casinoPending(store).delta).toBe(0);                     // the clamp settles it: it is not owed later
  });

  it("never takes the money above 999999", () => {
    const { path, cfg } = saveFile(999000);
    const store = new Store(":memory:");
    played(store, 5000, 1);
    expect(sync(cfg, store).casino).toMatchObject({ from: 999000, to: 999999 });
    expect(moneyIn(path)).toBe(999999);
  });

  it("counts a report sent twice once", () => {
    const { path, cfg } = saveFile(1000);
    const store = new Store(":memory:");
    played(store, 250, 7); played(store, 250, 7);                   // the outbox tried again: the same boot and seq
    played(store, 250, 7, "c3d4");                                   // a new start of the board counts on its own
    expect(casinoPending(store).delta).toBe(500);
    sync(cfg, store);
    expect(moneyIn(path)).toBe(1500);
    played(store, 250, 7);                                           // a copy that arrives after the SYNC wrote it
    expect(casinoPending(store).delta).toBe(0);
  });

  it("refuses a result its pulls could not come to (C-157)", () => {
    expect(parseResult(1, "49000 a1.1 m5-core-1 1")).not.toBeNull();   // the biggest bet's jackpot, less the bet
    expect(parseResult(1, "49001 a1.1 m5-core-1 1")).toBeNull();
    expect(parseResult(1, "-1000 a1.1 m5-core-1 1")).not.toBeNull();   // the biggest bet, lost
    expect(parseResult(1, "-1001 a1.1 m5-core-1 1")).toBeNull();
    expect(parseResult(1, "500 a1.1 m5-core-1 0")).toBeNull();         // no pulls, no coins
    expect(parseResult(1, "500 a1.1 m5-core-1")).toBeNull();           // nor a report that does not say how many
  });

  it("refuses a result that is not one", () => {
    expect(parseResult(1, "lots a1.1 m5-core-1")).toBeNull();
    expect(parseResult(1, "99999999 a1.1 m5-core-1")).toBeNull();   // past what one report can carry
    expect(parseResult(1, "-40 a1.2 m5-core-1 4")).toEqual({ id: 1, delta: -40, boot: "a1", seq: 2, device: "m5-core-1", spins: 4 });
  });

  it("tells a board its balance, what waits, which of its reports are in it, and the party's other daemons", () => {
    const { cfg } = saveFile(3000);
    const store = new Store(":memory:");
    played(store, 100, 1); played(store, 50, 2); played(store, 10, 9, "a1b2", "t-embed-111111");
    const st = deviceState(cfg, store, new Date(), "m5-core-36f484") as any;
    expect(st.casino).toMatchObject({ money: 3000, pending: 160, balance: 3160, seen: "a1b2.2", friends: [1], table: [] });   // PIP is carried
    expect(st.casino.context.rtp).toBeGreaterThanOrEqual(0.9); expect(st.casino.context.rtp).toBeLessThanOrEqual(1);   // C-158
    expect(casinoSeen(store, "nobody")).toBe("");
  });

  it("leaves a different game's save alone", () => {
    const { path, cfg } = saveFile(3000);
    const store = new Store(":memory:");
    store.marry({ name: "OTHER", trainerId: 1, secretId: 2 });
    played(store, 500, 1);
    expect(sync(cfg, store).casino).toBeNull();
    expect(moneyIn(path)).toBe(3000);
    expect(casinoPending(store).delta).toBe(500);                   // kept for the game it belongs to
  });
});

describe("the CASINO's table (C-151)", () => {
  it("lists our other boards at the reels, by the daemon each carries, and forgets one that got up or went quiet", () => {
    const { cfg } = saveFile(3000);
    const store = new Store(":memory:");
    store.setSetting("carry", JSON.stringify({ "t-deck-aaaaaa": PIP.personality }));
    const now = Date.now();
    store.logInteraction("table", "here t-deck-aaaaaa", new Date(now - 30000));
    store.logInteraction("table", "here m5go-bbbbbb", new Date(now - 200000));      // three minutes ago: gone quiet
    store.logInteraction("table", "here t-embed-cccccc", new Date(now - 40000));
    store.logInteraction("table", "gone t-embed-cccccc", new Date(now - 10000));    // got up
    store.logInteraction("table", "here m5-fire-a708a4", new Date(now - 5000));     // the board asking: never itself
    const st = deviceState(cfg, store, new Date(now), "m5-fire-a708a4") as any;
    expect(st.casino.table).toEqual([{ name: "PIP", device: "t-deck-aaaaaa", species: 1 }]);
  });
});

describe("each device's own settings (C-159)", () => {
  it("keeps a device's own over the shared, clears one given null, and refuses a bad one", async () => {
    const { setOwnSettings, deviceSettings, ownSettings } = await import("../src/core.js");
    const store = new Store(":memory:");
    expect(deviceSettings(store, "t-watch-s3-77bef4").wakeSound).toBe("power");      // the jingle at power-up, by default
    expect(setOwnSettings(store, "t-watch-s3-77bef4", { sound: false, wakeSound: "every", band: 868 })).toMatchObject({ sound: false, wakeSound: "every", band: 433 });
    expect(deviceSettings(store, "t-watch-s3-77bef4").sound).toBe(false);
    expect(deviceSettings(store, "t-deck-09ffa8").sound).toBe(true);                   // another's untouched
    expect(ownSettings(store, "t-watch-s3-77bef4")).toEqual({ sound: false, wakeSound: "every" });   // the band is the companion's
    setOwnSettings(store, "t-watch-s3-77bef4", { sound: null });
    expect(deviceSettings(store, "t-watch-s3-77bef4").sound).toBe(true);
    expect(setOwnSettings(store, "t-watch-s3-77bef4", { volume: 400 })).toBe("volume is 0 to 100");
  });

  it("gives a device its own settings in its state", () => {
    const { cfg } = saveFile(3000);
    const store = new Store(":memory:");
    store.setSetting("device.m5-fire-a708a4", JSON.stringify({ sound: false }));
    expect((deviceState(cfg, store, new Date(), "m5-fire-a708a4") as any).settings.sound).toBe(false);
    expect((deviceState(cfg, store, new Date(), "t-deck-09ffa8") as any).settings.sound).toBe(true);
  });
});
