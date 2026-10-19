// C-167: what the house kept, written into the save's own count of it at SYNC (DAEMONS T-427, P.sb1.house_take) -- on
// synthetic saves, never the user's own. The layout is given the field here, at a place the synthetic save leaves empty,
// as companion_export.py will give it once the game has it.
import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const AT = 0x2f00;
vi.mock("../data/profile_layout.json", async (real) => {
  const P = ((await real()) as { default: { sb1: Record<string, unknown> } }).default;
  return { default: { ...P, sb1: { ...P.sb1, house_take: AT } } };
});

const P = (await import("../data/profile_layout.json")).default as { sb1: { money: number }; sb2: { encryption_key: number } };
const { sync } = await import("../src/api.js");
const { DEFAULTS } = await import("../src/config.js");
const { Store } = await import("../src/db.js");
const { blocks, readSlot } = await import("../src/save/reader.js");
const { HOUSE_AT, syncSave } = await import("../src/save/writer.js");
const { buildSave } = await import("./build_save.js");

const KEY = 0x5a3c96e1;
const PIP = { personality: 0x12345678, otId: 0x00ab1234, species: 1, nickname: "PIP", level: 12, away: true };
function saveFile(money: number, house = 0) {
  const save = buildSave({ player: "ROVER", trainerId: 0x00ab1234, slots: [{ counter: 1, party: [PIP] }, { counter: 2, party: [PIP] }],
    edit: (sb2, sb1) => {
      new DataView(sb2.buffer, sb2.byteOffset).setUint32(P.sb2.encryption_key, KEY, true);
      new DataView(sb1.buffer, sb1.byteOffset).setUint32(P.sb1.money, (money ^ KEY) >>> 0, true);
      new DataView(sb1.buffer, sb1.byteOffset).setInt32(AT, house, true);
    } });
  const path = join(mkdtempSync(join(tmpdir(), "house-")), "copy.sav");
  writeFileSync(path, save);
  return { path, cfg: { ...DEFAULTS, savePath: path } };
}
const houseIn = (path: string) => { const { sb1 } = blocks(new Uint8Array(readFileSync(path))); return new DataView(sb1.buffer, sb1.byteOffset).getInt32(AT, true); };
const played = (store: InstanceType<typeof Store>, delta: number, seq: number, device = "m5-core-36f484", spins = 3) =>
  store.logInteraction("casino", `${delta} a1b2.${seq} ${device} ${spins}`);

describe("the house's take in the save (C-167)", () => {
  it("reads the field's place from the layout", () => expect(HOUSE_AT).toBe(AT));

  it("adds plainly, signed, little-endian, and the sector still checks", () => {
    const { path } = saveFile(3000, 40);
    const r = syncSave(new Uint8Array(readFileSync(path)), { link: false, house: -140 });
    expect(r.house).toEqual({ from: 40, to: -100 });
    const { sb1 } = blocks(r.save);
    expect(new DataView(sb1.buffer, sb1.byteOffset).getInt32(AT, true)).toBe(-100);
    expect(readSlot(r.save, 0) ?? readSlot(r.save, 1)).toBeTruthy();       // every sector it touched re-signed
    expect(syncSave(new Uint8Array(readFileSync(path)), { link: false, house: 50, houseAt: null }).house).toBeNull();   // no field, no write
  });

  it("brings the history in at the first SYNC, then only what is new -- beside what the game adds itself", () => {
    const { path, cfg } = saveFile(3000, 25);                               // 25 the game's own GAME CORNER put there
    const store = new Store(":memory:");
    played(store, -700, 1);
    sync(cfg, store);
    expect(houseIn(path)).toBe(25 + 700);
    sync(cfg, store);
    expect(houseIn(path)).toBe(725);                                        // nothing new, nothing added
    played(store, 200, 2);
    sync(cfg, store);
    expect(houseIn(path)).toBe(525);                                        // the player won 200 back
  });

  it("adds only what the money really moved when a SYNC clamps it", () => {
    const { path, cfg } = saveFile(200);
    const store = new Store(":memory:");
    played(store, -900, 1);
    sync(cfg, store);
    expect(houseIn(path)).toBe(200);
  });

  it("adds the history a SYNC settled before the save had the field, once", () => {
    const { path, cfg } = saveFile(2500);                                   // an earlier SYNC took the 500 out of 3000 ...
    const store = new Store(":memory:");
    played(store, -500, 1);
    store.setSetting("casino.applied", String(store.kindAll("casino").at(-1)!.id));   // ... before there was a field to count it in
    sync(cfg, store);
    expect(houseIn(path)).toBe(500);                                        // the history, at the first SYNC that can write it
    sync(cfg, store);
    expect(houseIn(path)).toBe(500);                                        // and never again
  });
});
