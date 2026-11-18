// C-413: a cover's small copy -- made once, beside the picture, again when the picture is newer, never half-written
import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dropSmall, smallCover, smallOf } from "../src/thumbs.js";
import { FOUND_FFMPEG } from "../src/ai/voice.js";

const dir = () => mkdtempSync(join(tmpdir(), "thumbs-"));
// a stand-in for ffmpeg: writes its last argument (the part file), counting the runs
const fake = () => {
  const made: string[] = [];
  const make = async (argv: string[]) => { made.push(argv[1]); writeFileSync(argv[argv.length - 1], "jpeg"); };
  return { made, make };
};

describe("a cover's small copy (C-413)", () => {
  it("is named beside its picture, a painting's by its own name", () => {
    expect(smallOf("/x/abc/cover.png")).toBe("/x/abc/cover-small.jpg");
    expect(smallOf("/x/paintings/0123456789abcdef.png")).toBe("/x/paintings/0123456789abcdef-small.jpg");
  });

  it("is made once, the same answer to every ask meanwhile, and kept", async () => {
    const d = dir(), full = join(d, "cover.png"), f = fake();
    writeFileSync(full, "png");
    const [a, b] = await Promise.all([smallCover(full, f.make), smallCover(full, f.make)]);
    expect(a).toBe(join(d, "cover-small.jpg"));
    expect(b).toBe(a);
    expect(f.made).toEqual([full]);
    expect(await smallCover(full, f.make)).toBe(a);
    expect(f.made.length).toBe(1);
    expect(existsSync(`${a}.part.jpg`)).toBe(false);
  });

  it("is made again when the picture is painted again", async () => {
    const d = dir(), full = join(d, "cover.png"), f = fake();
    writeFileSync(full, "png");
    const small = (await smallCover(full, f.make))!;
    const later = statSync(small).mtimeMs / 1000 + 5;
    utimesSync(full, later, later);
    await smallCover(full, f.make);
    expect(f.made.length).toBe(2);
  });

  it("says null when it cannot be made, and leaves nothing half-written", async () => {
    const d = dir(), full = join(d, "cover.png");
    writeFileSync(full, "png");
    const broken = async (argv: string[]) => { writeFileSync(argv[argv.length - 1], "half"); throw new Error("ffmpeg failed"); };
    expect(await smallCover(full, broken)).toBeNull();
    expect(existsSync(join(d, "cover-small.jpg"))).toBe(false);
    expect(existsSync(join(d, "cover-small.jpg.part.jpg"))).toBe(false);
    expect(await smallCover(join(d, "none.png"), broken)).toBeNull();
  });

  it("goes when its picture is let go", async () => {
    const d = dir(), full = join(d, "0123456789abcdef.png"), f = fake();
    writeFileSync(full, "png");
    const small = (await smallCover(full, f.make))!;
    dropSmall(full);
    expect(existsSync(small)).toBe(false);
  });

  it.skipIf(!FOUND_FFMPEG)("is a 256px JPEG, far smaller than the painting, when ffmpeg makes it", async () => {
    const d = dir(), full = join(d, "cover.png");
    execFileSync(FOUND_FFMPEG!, ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=size=768x768", "-frames:v", "1", full]);
    const small = (await smallCover(full))!;
    const jpg = readFileSync(small);
    expect([jpg[0], jpg[1]]).toEqual([0xff, 0xd8]);
    expect(jpg.length).toBeLessThan(statSync(full).size / 4);
  });
});
