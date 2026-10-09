// C-21 / C-22: the one SYNC, on synthetic saves built as the game builds them. Never the user's own save.
import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import P from "../data/profile_layout.json" with { type: "json" };
import { sync } from "../src/api.js";
import { DEFAULTS } from "../src/config.js";
import { Store } from "../src/db.js";
import { readSave, readSlot } from "../src/save/reader.js";
import { buildSave, type DaemonSpec } from "./build_save.js";

const flagAt = (f: number) => ({ byte: P.sb2.daemons_flags + ((f - P.flags.daemons_flags_start) >> 3),
                                 mask: 1 << ((f - P.flags.daemons_flags_start) & 7) });
const LINKED = flagAt(P.flags.companion_linked), RECALLED = flagAt(P.flags.companion_recalled);

function saveFile(party: DaemonSpec[], opts: { player?: string; trainerId?: number; recalled?: boolean } = {}) {
  const save = buildSave({ player: opts.player ?? "ROVER", trainerId: opts.trainerId ?? 0x00ab1234,
    slots: [{ counter: 1, party }, { counter: 2, party }],
    edit: (sb2) => { if (opts.recalled) sb2[RECALLED.byte] |= RECALLED.mask; } });
  const path = join(mkdtempSync(join(tmpdir(), "sync-")), "copy.sav");
  writeFileSync(path, save);
  return { path, cfg: { ...DEFAULTS, savePath: path } };
}

// The flag byte of the slot the game would load, read back from the written file.
function flags(path: string) {
  const file = new Uint8Array(readFileSync(path));
  const slot = [readSlot(file, 0), readSlot(file, 1)].filter(Boolean).sort((a, b) => b!.counter - a!.counter)[0]!;
  const sb2 = slot.sections.get(0)!;
  return { linked: !!(sb2[LINKED.byte] & LINKED.mask), recalled: !!(sb2[RECALLED.byte] & RECALLED.mask) };
}

const PIP = { personality: 0x12345678, otId: 0x00ab1234, species: 1, nickname: "PIP", level: 12 };
const LABEL = { personality: 0x0000002f, otId: 0x00ab1234, species: 4, nickname: "LABEL", level: 9 };
const HUNCH = { personality: 0x00000a11, otId: 0x00ab1234, species: 7, nickname: "HUNCH", level: 8 };

describe("SYNC (C-21) and the married save (C-22)", () => {
  it("marries the first save and links it, so the game shows SEND", () => {
    const { path, cfg } = saveFile([PIP]);
    const store = new Store(":memory:");
    const r = sync(cfg, store);
    expect(r.sameGame).toBe(true);
    expect(r.firstSave).toBe(true);
    expect(r.firstLink).toBe(true);
    expect(store.married()).toEqual({ name: "ROVER", trainerId: 0x1234, secretId: 0x00ab });
    expect(flags(path)).toEqual({ linked: true, recalled: false });
    expect(r.backup && existsSync(r.backup)).toBe(true);
    expect(sync(cfg, store).backup).toBeNull();                 // linked already: nothing more to write
  });

  it("receives a daemon the game asked to send", () => {
    const { path, cfg } = saveFile([{ ...PIP, asked: true }, LABEL]);
    const r = sync(cfg, new Store(":memory:"));
    expect(r.received).toEqual(["PIP"]);
    expect(readSave(new Uint8Array(readFileSync(path))).party.map((d) => [d.nickname, d.away, d.asked]))
      .toEqual([["PIP", true, false], ["LABEL", false, false]]);
  });

  it("sends a second daemon while one is away: a daemon in each device (C-80)", () => {
    const { path, cfg } = saveFile([{ ...PIP, away: true }, { ...LABEL, asked: true }, HUNCH]);
    const r = sync(cfg, new Store(":memory:"));
    expect(r.received).toEqual(["LABEL"]);
    expect(r.refused).toEqual([]);
    const party = readSave(new Uint8Array(readFileSync(path))).party;
    expect(party.map((d) => [d.nickname, d.away, d.asked])).toEqual([["PIP", true, false], ["LABEL", true, false], ["HUNCH", false, false]]);
  });

  it("never sends the last one home: one always stays in the party (T-397)", () => {
    const { path, cfg } = saveFile([{ ...PIP, away: true }, { ...LABEL, asked: true }, { ...HUNCH, asked: true }]);
    const r = sync(cfg, new Store(":memory:"));
    expect(r.received).toEqual(["LABEL"]);
    expect(r.refused).toEqual(["HUNCH stays: one daemon always stays in the party."]);
    const party = readSave(new Uint8Array(readFileSync(path))).party;
    expect(party.map((d) => [d.nickname, d.away, d.asked])).toEqual([["PIP", true, false], ["LABEL", true, false], ["HUNCH", false, true]]);
  });

  it("settles a daemon brought home without the app", () => {
    const { path, cfg } = saveFile([PIP], { recalled: true });
    const r = sync(cfg, new Store(":memory:"));
    expect(r.recalledSeen).toBe(true);
    expect(flags(path)).toEqual({ linked: true, recalled: false });
  });

  it("shows another game's save, and writes nothing to it", () => {
    const store = new Store(":memory:");
    sync(saveFile([PIP]).cfg, store);                            // married to ROVER's game
    const other = saveFile([{ ...LABEL, asked: true }], { player: "AL", trainerId: 0x00cd5678 });
    const before = readFileSync(other.path);
    const r = sync(other.cfg, store);
    expect(r.sameGame).toBe(false);
    expect(r.received).toEqual([]);
    expect(Buffer.compare(readFileSync(other.path), before)).toBe(0);
  });
});
