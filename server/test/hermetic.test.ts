// C-238: THE HERMETIC LAYER -- found here at the hour's first sight (acknowledged), or in the game; written to the save at SYNC.
import { describe, expect, it } from "vitest";
const { Store } = await import("../src/db.js");
const { ackSpellcraft, firstSight, HERMETIC_FLAG, readHermetic, savedHermetic, spellcraftOf, spellcraftToWrite } = await import("../src/hermetic.js");
const { syncSave } = await import("../src/save/writer.js");
const { buildSave } = await import("./build_save.js");

const at = (h: number, m = 0) => new Date(2026, 9, 30, h, m);
const PIP = { personality: 0x12345678, otId: 0x00ab1234, species: 1, nickname: "PIP", level: 12, away: true };
const aSave = () => buildSave({ player: "ROVER", trainerId: 0x00ab1234, slots: [{ counter: 1, party: [PIP] }, { counter: 2, party: [PIP] }] });

describe("C-238: SPELLCRAFT, found two ways", () => {
  it("is the game's FLAG_GOT_HERMETIC_LAYER, in the DAEMONS block", () => {
    expect(HERMETIC_FLAG).toBe(0xcf3);
  });
  it("says what is happening the first time the hour is seen, and not after it is acknowledged", () => {
    const s = new Store(":memory:"), save = aSave();
    expect(firstSight(s, save, at(15))).toBeNull();                       // not the hour
    const m = firstSight(s, save, at(3, 12));
    expect(m?.ack).toBe("SO MOTE IT BE");
    expect(spellcraftOf(s).seenAt).toBeTruthy();
    expect(readHermetic(save, s).held).toBe(false);                        // seen is not enough: it must be said
    ackSpellcraft(s, "app", at(3, 13));
    expect(firstSight(s, save, at(3, 14))).toBeNull();
    expect(readHermetic(save, s)).toMatchObject({ held: true, how: "companion", title: "THE HERMETIC LAYER" });
  });
  it("writes the game's flag at the next SYNC, once, and then the game holds it", () => {
    const s = new Store(":memory:");
    let save = aSave();
    expect(spellcraftToWrite(s, save)).toBe(false);
    ackSpellcraft(s, "t-watch-ultra-f351d4", at(3, 5));
    expect(spellcraftToWrite(s, save)).toBe(true);
    const r = syncSave(save, { link: true, spellcraft: HERMETIC_FLAG });
    save = r.save;
    expect(savedHermetic(save)).toBe(true);
    expect(spellcraftToWrite(s, save)).toBe(false);
    expect(readHermetic(save, null)).toMatchObject({ held: true, how: "game" });
    expect(syncSave(save, { link: true, spellcraft: HERMETIC_FLAG }).changed).toBe(false);   // nothing more to write
  });
  it("opens for a preview without changing anything", () => {
    const s = new Store(":memory:");
    expect(readHermetic(aSave(), s, true)).toMatchObject({ held: true, how: "preview" });
    expect(spellcraftOf(s)).toEqual({});
  });
});

// C-240: Halloween, with THE HERMETIC LAYER held
describe("C-240: Halloween", async () => {
  const { costumeOf, halloweenOn, halloweenView, trickOrTreat, treatsOf } = await import("../src/halloween.js");
  const species = (await import("../data/species.json")).default as unknown as Record<string, { types: string[] }>;
  const fears = (await import("../data/fears.json")).default as unknown as { fears: Record<string, string[]> };
  const hw = new Date(2026, 9, 31, 14, 0);
  it("is the 31st of October, all of it", () => {
    expect([halloweenOn(new Date(2026, 9, 31, 0, 1)), halloweenOn(new Date(2026, 9, 31, 23, 59)), halloweenOn(new Date(2026, 10, 1, 0, 0))]).toEqual([true, true, false]);
  });
  it("dresses a daemon as what it fears -- a daemon of a type that beats its own, the same one all day", () => {
    const c = costumeOf(1, hw)!;                                     // ROVERCUB, GROWTH
    expect(fears.fears.GROWTH).toContain(species[String(c.species)].types[0]);
    expect(costumeOf(1, new Date(2026, 9, 31, 22, 0))).toEqual(c);
  });
  it("leaves one treat per daemon met that day, only on Halloween", () => {
    const s = new Store(":memory:");
    expect(trickOrTreat(s, "a1b2c3d4", "ROVERCUB", new Date(2026, 9, 30, 12))).toBeNull();
    const t = trickOrTreat(s, "a1b2c3d4", "ROVERCUB", hw, () => 0.9)!;
    expect(t.kind).toBe("sweet");
    expect(t.text).toMatch(/^ROVERCUB left a treat: /);
    expect(trickOrTreat(s, "a1b2c3d4", "ROVERCUB", hw)).toBeNull();
    expect(trickOrTreat(s, "0badf00d", "INKLING", hw, () => 0.1)!.kind).toBe("card");
    expect(treatsOf(s, hw)).toHaveLength(2);
    expect(halloweenView(s, 1, true, new Date(hw.getTime() + 60000))).toMatchObject({ on: 1, treats: 2 });
    expect(halloweenView(s, 1, false, hw)).toBeNull();                // without the book, an ordinary day
  });
});
