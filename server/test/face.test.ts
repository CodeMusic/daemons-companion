import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import { makeServer } from "../src/api.js";
import { DEFAULTS } from "../src/config.js";
import { den } from "../src/dens.js";
import { EXPRESSIONS, faceOf } from "../src/expressions.js";
import { FRAMES, PHASES, SCREEN, faceRev, lookFor, renderFace } from "../src/face.js";
import { buildSave } from "./build_save.js";

// renderFace's PNG back to its RGB rows (it writes them unfiltered)
function rgbOf(png: Buffer) {
  expect(png.subarray(1, 4).toString("latin1")).toBe("PNG");
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([SCREEN.w, SCREEN.h]);
  let at = 8; const idat: Buffer[] = [];
  while (at < png.length) { const len = png.readUInt32BE(at); if (png.toString("latin1", at + 4, at + 8) === "IDAT") idat.push(png.subarray(at + 8, at + 8 + len)); at += 12 + len; }
  return inflateSync(Buffer.concat(idat));
}
const sprite = (name: string) => readFileSync(new URL(`../data/art/${name}.png`, import.meta.url));

describe("the BOX-3's faces, a picture a voice phase (C-138)", () => {
  it("draws every phase in both frames as a whole 320x240 screen", () => {
    for (const phase of PHASES) for (let f = 0; f < FRAMES; f++) {
      const raw = rgbOf(renderFace(sprite("codemusai"), EXPRESSIONS.awake, faceOf("codemusai"), den(["CONTENT"]), phase, f));
      expect(raw.length).toBe((SCREEN.w * 3 + 1) * SCREEN.h);
    }
  });

  it("blinks when idle, and only on the second frame", () => {
    expect(lookFor(EXPRESSIONS.awake, "idle", 0, false).eyes).toBeNull();
    expect(lookFor(EXPRESSIONS.awake, "idle", 1, false).eyes).toBe("closed");
    const face = faceOf("caremusai")!;
    const a = renderFace(sprite("caremusai"), EXPRESSIONS.awake, face, den([]), "idle", 0);
    const b = renderFace(sprite("caremusai"), EXPRESSIONS.awake, face, den([]), "idle", 1);
    expect(a.equals(b)).toBe(false);                                        // its eyes closed: the picture changed
  });

  it("wakes to answer, and stays asleep when idle or muted", () => {
    expect(lookFor(EXPRESSIONS.asleep, "thinking", 0, false).e.name).toBe("awake");
    expect(lookFor(EXPRESSIONS.asleep, "idle", 0, false).e.name).toBe("asleep");
    expect(lookFor(EXPRESSIONS.asleep, "muted", 0, false).e.name).toBe("asleep");
    expect(lookFor(EXPRESSIONS.glad, "listening", 0, false).e.name).toBe("glad");   // a feeling is kept
  });

  it("speaks with its mouth where one is known, and with a speech bubble where not", () => {
    expect(lookFor(EXPRESSIONS.awake, "replying", 0, true)).toMatchObject({ mouth: "open", mark: null });
    expect(lookFor(EXPRESSIONS.awake, "replying", 1, true).mouth).toBeNull();
    expect(lookFor(EXPRESSIONS.awake, "replying", 0, false).mark?.rows).toHaveLength(8);
    const face = { ...faceOf("caremusai")!, mouth: [30, 30, 4, 1] as [number, number, number, number] };
    const open = renderFace(sprite("caremusai"), EXPRESSIONS.awake, face, den([]), "replying", 0);
    const plain = renderFace(sprite("caremusai"), EXPRESSIONS.awake, { ...face, mouth: undefined }, den([]), "replying", 0);
    expect(open.equals(plain)).toBe(false);
  });

  it("gives every phase's marks eight rows of eight", () => {
    for (const phase of PHASES) for (let f = 0; f < FRAMES; f++) {
      const m = lookFor(EXPRESSIONS.awake, phase, f, false).mark;
      if (m) for (const r of m.rows) expect(r).toMatch(/^[.#o]{8}$/);
    }
  });

  it("changes its revision when anything drawn would", () => {
    const d = den(["CONTENT"]), base = faceRev({ artKey: "1-0.0.0.0", expression: "awake", den: d });
    expect(faceRev({ artKey: "1-0.0.0.0", expression: "awake", den: d })).toBe(base);
    expect(faceRev({ artKey: "1-5.0.0.0", expression: "awake", den: d })).not.toBe(base);
    expect(faceRev({ artKey: "1-0.0.0.0", expression: "glad", den: d })).not.toBe(base);
  });

  it("draws an empty den when no daemon is carried", () => {
    expect(rgbOf(renderFace(null, EXPRESSIONS.awake, null, den([]), "idle", 0)).length).toBe((SCREEN.w * 3 + 1) * SCREEN.h);
  });
});

describe("the BOX-3 through the device's own door (C-138)", () => {
  const BOX = "esp32-s3-box-3-a1b2c3";
  const save = buildSave({ player: "ROVER", trainerId: 0x00ab1234, slots: [
    { counter: 1, party: [{ personality: 0x12345678, otId: 0x00ab1234, species: 1, nickname: "PIP", level: 12, away: true }] },
    { counter: 0, party: [] }] });
  const path = join(mkdtempSync(join(tmpdir(), "face-")), "copy.sav");
  writeFileSync(path, save);
  const server = makeServer({ ...DEFAULTS, database: ":memory:", savePath: path });
  let base = "";
  beforeAll(async () => {
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => server.close());

  it("answers its face's revision, its daemon's name and its den's colours", async () => {
    const f = await fetch(`${base}/api/device/face?device=${BOX}&via=wifi`).then((r) => r.json());
    expect(f).toMatchObject({ has: true, name: "PIP" });
    expect(f.rev).toMatch(/^[0-9a-f]{10}$/);
    expect(f.wall).toMatch(/^#[0-9a-f]{6}$/);
    const again = await fetch(`${base}/api/device/face?device=${BOX}&via=wifi`).then((r) => r.json());
    expect(again.rev).toBe(f.rev);
  });

  it("serves each phase's picture, and nothing else", async () => {
    const r = await fetch(`${base}/art/face/thinking-1.png?device=${BOX}`);
    expect(r.headers.get("content-type")).toBe("image/png");
    expect(Number(r.headers.get("content-length"))).toBeGreaterThan(100);    // never chunked: the BOX-3 needs its length
    rgbOf(Buffer.from(await r.arrayBuffer()));
    expect((await fetch(`${base}/art/face/dancing-0.png?device=${BOX}`)).status).toBe(404);
    expect((await fetch(`${base}/art/face/idle-2.png?device=${BOX}`)).status).toBe(404);
  });

  it("is listed among the devices once it has asked", async () => {
    const v = await fetch(base + "/api/devices").then((r) => r.json());
    expect(v.devices.some((d: any) => d.id === BOX)).toBe(true);
  });
});
