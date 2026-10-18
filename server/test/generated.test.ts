// The files the companion's scripts write -- the acts (firmware/common/acts.py) and the devices' looks
// (firmware/common/device_sprites.py) -- are kept beside the lists they are written from. Run without --write, each
// script says what it would change; anything it would change means a list was edited and its files were not written
// again, so the app, the site, the Tab5 and the boards would disagree. (The code-health review, 2026-10-18.)
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRIPTS = ["firmware/common/acts.py", "firmware/common/device_sprites.py", "firmware/common/tunes.py",   // C-160: the tunes too
                 "firmware/common/casino_art.py", "firmware/common/instruments.py",
                 "firmware/common/play.py"];   // T-426: the songs, built into the boards with keys   // T-425: the harp and flute, for the Tab5   // C-158: THE CASINO's drawn pieces, and casino.cpp's drawing they were ported from

describe("the generated files are current", () => {
  for (const script of SCRIPTS) {
    it(`${script} would write nothing`, () => {
      const said = execFileSync("python3", [join(ROOT, script)], { cwd: ROOT, encoding: "utf8" });
      expect(said).not.toMatch(/would write/);
    });
  }
});
