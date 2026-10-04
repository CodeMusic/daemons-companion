import { describe, expect, it } from "vitest";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readSave, readSlot } from "../src/save/reader.js";
import { answerRequests } from "../src/save/writer.js";
import { answerAway } from "../src/api.js";
import { DEFAULTS } from "../src/config.js";
import { buildSave } from "./build_save.js";

const SENDING = { personality: 0x12345678, otId: 0x00ab1234, species: 1, nickname: "PIP", level: 12, asked: true };
const STAYING = { personality: 0x0000002f, otId: 0x00ab1234, species: 4, nickname: "LABEL", level: 9 };
const RETURNING = { personality: 0x00000101, otId: 0x00ab1234, species: 7, nickname: "CLUSTER", level: 20, away: true, asked: true };

describe("answering the game's AWAY requests (C-10)", () => {
  const save = () => buildSave({ player: "ROVER", trainerId: 0x00ab1234,
    slots: [{ counter: 7, party: [STAYING] }, { counter: 8, party: [SENDING, STAYING, RETURNING] }] });

  it("sends an asked daemon away, brings an AWAY one home, and clears every request", () => {
    const { save: out, answered } = answerRequests(save());
    expect(answered.map((a) => [a.nickname, a.now])).toEqual([["PIP", "away"], ["CLUSTER", "home"]]);
    const r = readSave(out);
    expect(r.counter).toBe(8);                                  // the same slot, answered in place
    expect(r.party.map((d) => [d.nickname, d.away, d.asked])).toEqual(
      [["PIP", true, false], ["LABEL", false, false], ["CLUSTER", false, false]]);
  });

  it("re-signs the sector, so the game still accepts the slot", () => {
    const { save: out } = answerRequests(save());
    expect(readSlot(out, 1)).not.toBeNull();                    // every section's checksum holds
    expect(readSlot(out, 0)).not.toBeNull();                    // and the older slot is untouched
  });

  it("changes nothing when nothing was asked", () => {
    const once = answerRequests(save()).save;
    const twice = answerRequests(once);
    expect(twice.answered).toEqual([]);
    expect(Buffer.compare(Buffer.from(twice.save), Buffer.from(once))).toBe(0);
  });

  it("keeps a backup and writes only when something was answered", () => {
    const dir = mkdtempSync(join(tmpdir(), "away-"));
    const path = join(dir, "copy.sav");
    writeFileSync(path, save());
    const cfg = { ...DEFAULTS, savePath: path };
    const first = answerAway(cfg, new Date("2026-10-03T21:00:00Z"));
    expect(first.answered).toHaveLength(2);
    expect(readdirSync(join(dir, "companion-backups"))).toHaveLength(1);
    expect(readSave(new Uint8Array(readFileSync(path))).party[0].away).toBe(true);
    const second = answerAway(cfg, new Date("2026-10-03T21:01:00Z"));
    expect(second).toEqual({ answered: [], backup: null });
    expect(readdirSync(join(dir, "companion-backups"))).toHaveLength(1);
  });
});
