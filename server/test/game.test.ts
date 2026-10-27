// C-187: our patch applied on the device -- checked against the real thing where this machine has it: pret's
// byte-identical builds of retail (~/.cache/daemons, as romrelease.py uses) and a release's own patches.
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { applyBps, PatchError } from "../src/game/bps.js";
import { crc32Hex, sha1 } from "../src/game/hash.js";
import { patchFor, releaseOf, releasedAs } from "../src/game/patches.js";

describe("the hashes (C-187)", () => {
  it("are the standard ones", () => {
    const abc = new TextEncoder().encode("abc");
    expect(sha1(abc)).toBe("a9993e364706816aba3e25717850c26c9cd0d89d");
    expect(sha1(new Uint8Array())).toBe("da39a3ee5e6b4b0d3255bfef95601890afd80709");
    expect(crc32Hex(new TextEncoder().encode("123456789"))).toBe("CBF43926");
    const big = new Uint8Array(1_000_003).map((_, i) => (i * 31) & 0xff);
    expect(sha1(big)).toBe(createHash("sha1").update(big).digest("hex"));
  });
});

describe("a BPS patch (C-187)", () => {
  it("refuses what is not a patch, or the wrong ROM", () => {
    expect(() => applyBps(new Uint8Array(8), new Uint8Array(8))).toThrow(PatchError);
  });
});

const CACHE = join(homedir(), ".cache/daemons/pokefirered-upstream");
const RELEASES = fileURLToPath(new URL("../../../DAEMONS/ROM RELEASE/", import.meta.url));
const local = (() => {
  if (!existsSync(join(CACHE, "pokefirered.gba")) || !existsSync(RELEASES)) return null;
  for (const group of readdirSync(RELEASES).filter((g) => /^v\d/.test(g)).sort().reverse())
    for (const rel of readdirSync(join(RELEASES, group)).filter((r) => /^v\d/.test(r)).sort().reverse()) {
      const bps = join(RELEASES, group, rel, "PATCHES", "DAEMONS CONTENT for FireRed 1.0.bps");
      if (existsSync(bps) && releaseOf(rel)) return { rel, bps };
    }
  return null;
})();
describe.skipIf(!local)("on this machine's own retail build and release (C-187)", () => {
  it("knows the ROM, makes the release's CONTENT byte for byte, and knows it again", () => {
    const rom = new Uint8Array(readFileSync(join(CACHE, "pokefirered.gba")));
    const p = patchFor(sha1(rom), local!.rel)!;
    expect(p.edition).toBe("CONTENT");
    expect(crc32Hex(rom)).toBe(p.source.crc32.toUpperCase());
    const out = applyBps(rom, new Uint8Array(readFileSync(local!.bps)));
    expect(sha1(out)).toBe(p.target.sha1);
    expect(releasedAs(sha1(out))?.release).toBe(local!.rel.replace(/^v/, ""));
    expect(patchFor(sha1(out))).toBeNull();                          // a patched ROM is never patched again
    const leaf = new Uint8Array(readFileSync(join(CACHE, "pokeleafgreen.gba")));
    expect(() => applyBps(leaf, new Uint8Array(readFileSync(local!.bps)))).toThrow(/not the ROM/);
  }, 60_000);
});

describe("the live patch list (usePatches)", () => {
  it("takes a newer list, never a broken or older one", async () => {
    const m = await import("../src/game/patches.js");
    const now = m.latestRelease(), r = m.releaseOf()!;
    expect(m.usePatches({ nope: 1 })).toBe(false);
    expect(m.usePatches({ latest: "1.0.0", releases: [{ ...r, version: "1.0.0" }] })).toBe(false);
    expect(m.latestRelease()).toBe(now);
    const next = now.split(".").map(Number); next[next.length - 1]++;
    const v = next.join(".");
    expect(m.usePatches({ latest: v, releases: [{ ...r, version: v }, r] })).toBe(true);
    expect(m.latestRelease()).toBe(v);
    expect(m.patchFor(r.patches[0].source.sha1)?.file).toBe(r.patches[0].file);
  });
});
