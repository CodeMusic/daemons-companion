// C-419 (3), DAEMONS T-598: play a daemon's OPENING in PLAY FREELY, on its key's wheel, and it comes -- octave-blind, as
// the game's DaemonSong_Listen hears it; only a daemon the INDEX has seen; never caught. On synthetic saves only.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeServer } from "../src/api.js";
import { DEFAULTS } from "../src/shared/config.js";
import { SONGS, summonHeard, summonsFor } from "../src/damagotchi/ownsong.js";
import { syncSave } from "../src/game/save/writer.js";
import { buildSave } from "./build_save.js";

const ROVERCUB = 1;
// its opening as MIDI, in two octaves at once (octave-blind) -- F major's wheel
const play = (pcs: (number | null)[], base = 60) => pcs.map((p, i) => base + (p ?? 0) + (i % 2 ? 12 : 0));

describe("PLAY FREELY hears a daemon's opening (ownsong.ts)", () => {
  const [wheel, opening] = SONGS.summons![String(ROVERCUB)];
  it("carries every daemon's opening from DAEMONS' generator", () => {
    expect(Object.keys(SONGS.summons!).length).toBeGreaterThan(390);
    expect([wheel, opening.length]).toEqual([5, 7]);                       // ROVERCUB: F major, its seven-note hook (T-613)
    expect(Object.values(SONGS.summons!).every(([, n]) => n.length === 7)).toBe(true);
  });
  it("comes when the played notes end with it, on its wheel, any octave, after anything", () => {
    const all = summonsFor([ROVERCUB, 2, 4]);
    expect(summonHeard(wheel, [62, 64, 65, ...play(opening)], all)?.species).toBe(ROVERCUB);
    expect(summonHeard(wheel, play(opening, 48), all)?.name).toBe("ROVERCUB");
  });
  it("does not come on another wheel, cut short, with a wrong note, or before the INDEX has seen it", () => {
    const all = summonsFor([ROVERCUB]);
    expect(summonHeard((wheel + 2) % 12, play(opening), all)).toBeNull();
    expect(summonHeard(wheel, play(opening).slice(0, -1), all)).toBeNull();
    expect(summonHeard(wheel, [...play(opening).slice(0, -1), 61], all)).toBeNull();
    expect(summonHeard(wheel, play(opening), summonsFor([]))).toBeNull();
  });
  it("lets any note stand where the wheel cannot play one", () => {
    // T-613's hooks are all in their keys, so none needs it today; the rule still holds for one that would
    const wild = { species: 999, name: "WILD", wheel: 5, notes: [5, 7, null, 0, 2, 4, 5] };
    expect(summonHeard(5, play([5, 7, 3, 0, 2, 4, 5]), [wild])?.species).toBe(999);
    expect(summonHeard(5, play([5, 7, 3, 0, 2, 4, 7]), [wild])).toBeNull();
  });
});

describe("a daemon comes to its song, through the API (C-419 (3))", () => {
  const PIP = { personality: 0x12345678, otId: 0x00ab1234, species: 1, nickname: "PIP", level: 12 };
  const plain = buildSave({ player: "ROVER", trainerId: 0x00ab1234, slots: [{ counter: 1, party: [PIP] }, { counter: 2, party: [PIP] }] });
  const met = syncSave(plain, { link: false, met: { seen: [ROVERCUB], friendship: 0 } }).save;   // ROVERCUB met in the game
  const path = join(mkdtempSync(join(tmpdir(), "summon-")), "copy.sav");
  writeFileSync(path, met);
  const server = makeServer({ ...DEFAULTS, database: ":memory:", savePath: path });
  let base = "";
  beforeAll(async () => {
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => server.close());
  const post = (b: unknown) => fetch(base + "/api/play/summoned", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });

  it("tells PLAY which daemons may come, keeps one that came, and refuses one not yet seen", async () => {
    let p = await fetch(base + "/api/play").then((r) => r.json());
    expect(p.summonable).toContain(ROVERCUB);
    expect(p.summoned).toEqual([]);
    const r = await post({ species: ROVERCUB }).then((x) => x.json());
    expect([r.name, r.quotation]).toEqual(["ROVERCUB", null]);                 // T-599: no words yet
    expect((await post({ species: ROVERCUB })).status).toBe(200);              // a second time: kept once
    p = await fetch(base + "/api/play").then((x) => x.json());
    expect(p.summoned.map((s: any) => s.species)).toEqual([ROVERCUB]);
    expect((await post({ species: 7 })).status).toBe(400);                     // not met
  });
});
