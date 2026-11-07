// C-299 (DAEMONS T-519 item 3): THE UNITY BOOK, the halves mended -- held only with the game's FLAG_UNITY_MENDED or as a
// preview; eleven sections, BALANCE at the crease after THE FOLDS; its ATTESTATION's observer's line as the lead reads it.
import { describe, expect, it } from "vitest";
import unity from "../data/unity.json" with { type: "json" };
import { LENS_DAWN, LENS_NIGHT, readUnity, savedUnity, UNITY_FLAG } from "../src/unity.js";
import eudaimon from "../data/eudaimon.json" with { type: "json" };
import { savedEudaimon } from "../src/eudaimon.js";
import profile from "../data/profile_layout.json" with { type: "json" };
import { buildSave } from "./build_save.js";

const raw = (unity as any).sections.flatMap((s: any) => s.entries).flatMap((e: any) => e.paragraphs).find((p: any) => p.voice === "observer");
const observer = (lead?: "good" | "as it is" | "low") =>
  (readUnity(null, true, lead).sections ?? []).flatMap((s) => s.entries).flatMap((e) => e.paragraphs).filter((p) => p.voice === "observer").map((p) => p.text);

describe("C-299: THE UNITY BOOK", () => {
  it("is not held without the game's flag, and is held as a preview: eleven sections, BALANCE after THE FOLDS", () => {
    expect(readUnity(null)).toEqual({ held: false });
    const b = readUnity(null, true);
    expect(b).toMatchObject({ held: true, how: "preview", title: "THE UNITY BOOK", subtitle: "AN ATTESTATION" });
    expect(b.sections).toHaveLength(11);
    expect(b.sections!.map((s) => s.label).slice(3, 5)).toEqual(["THE FOLDS", "BALANCE"]);
  });
  it("is held from the save once the game sets FLAG_UNITY_MENDED (DAEMONS v11.340.2), apart from either half's flag", () => {
    expect(UNITY_FLAG).toBe(1213);
    const PIP = { personality: 0x12345678, otId: 0x00ab1234, species: 1, nickname: "PIP", level: 12 };
    const slots = [{ counter: 1, party: [PIP] }, { counter: 2, party: [PIP] }];
    const save = buildSave({ player: "ROVER", trainerId: 0x00ab1234, slots });
    expect(savedUnity(save)).toBe(false);
    const f = 1213;                                                        // a vanilla flag (FLAG_0x4BD): SaveBlock1's flags
    expect(f).toBeLessThan(profile.flags.daemons_flags_start);
    const mended = buildSave({ player: "ROVER", trainerId: 0x00ab1234, slots, edit: (_, sb1) => { sb1[profile.sb1.flags + (f >> 3)] |= 1 << (f & 7); } });
    expect(savedUnity(mended)).toBe(true);
    expect(savedEudaimon(mended)).toBe(false);
    expect(readUnity(mended)).toMatchObject({ held: true, how: "game" });
  });
  it("reads its ATTESTATION's observer's line as the lead daemon's spirits choose it, and sends no readings", () => {
    expect(raw).toBeTruthy();
    expect(observer("good")).toEqual([raw.readings.good]);
    expect(observer("as it is")).toEqual([raw.readings.as_is]);
    expect(observer("low")).toEqual([raw.readings.low]);
    expect(observer()).toEqual([raw.readings.as_is]);
    expect(JSON.stringify(readUnity(null, true, "good"))).not.toContain("readings");
  });
});

// C-304 (DAEMONS T-529, vision 4.40): the lens -- each section re-read in place as either half words it; BALANCE has no other reading
describe("C-304: THE UNITY BOOK's lens", () => {
  const labels = (xs: ({ label: string } | null)[]) => xs.map((s) => s?.label ?? null);
  it("pairs every section but BALANCE with the night half's and the dawn half's, in order", () => {
    const whole = (unity as any).sections.map((s: any) => s.label);
    expect(labels(LENS_NIGHT)).toEqual(whole.map((l: string) => l === "BALANCE" ? null : l));
    // the dawn half names the same ten sections, THE FOLDS read from the other side as THE UNFOLDING
    expect(labels(LENS_DAWN)).toEqual(whole.map((l: string) => l === "BALANCE" ? null : l === "THE FOLDS" ? "THE UNFOLDING" : l));
    expect(LENS_NIGHT.filter(Boolean)).toHaveLength(10);
    expect(LENS_DAWN.filter(Boolean)).toHaveLength(10);
  });
  it("comes with the book, its observer's lines as the lead reads them and no readings sent", () => {
    expect(readUnity(null).lens).toBeUndefined();
    const b = readUnity(null, true, "low");
    expect(b.lens!.night).toHaveLength(11);
    expect(b.lens!.dawn).toHaveLength(11);
    const raw = (eudaimon as any).sections.flatMap((s: any) => s.entries).flatMap((e: any) => e.paragraphs).find((p: any) => p.voice === "observer");
    const dawnObserver = b.lens!.dawn.flatMap((s) => s?.entries ?? []).flatMap((e) => e.paragraphs).filter((p) => p.voice === "observer").map((p) => p.text);
    expect(dawnObserver).toEqual([raw.readings.low]);
    expect(JSON.stringify(b.lens)).not.toContain("readings");
  });
});
