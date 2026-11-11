import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// C-292: LAYOUT.md is the repository's map, and stays true -- every folder that exists is named in it, and every folder
// it names exists. A commit that adds, moves or removes a folder (or a file at the root) updates LAYOUT.md with it.
const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const MAP = readFileSync(join(ROOT, "LAYOUT.md"), "utf8");
const SKIP = new Set(["node_modules", "ios", "android", "dist", "build", "web-build", ".pio"]);

const dirsIn = (rel: string) => readdirSync(join(ROOT, rel), { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith(".") && !SKIP.has(d.name)).map((d) => d.name);
// a folder is named when `name/` appears in the map as a word of its own (`today/`, `src/ai/`, `| `hub/` |`)
const names = (dir: string) => new RegExp(`[\\s\`/(]${dir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/`).test(MAP);

describe("LAYOUT.md", () => {
  // the folders whose children the map lists, one by one
  const LISTED = ["", "app", "app/screens", "server", "server/src", "firmware"];

  for (const parent of LISTED) {
    it(`names every folder in ${parent || "the root"}`, () => {
      const missing = dirsIn(parent).filter((d) => !names(d));
      expect(missing, `add these to LAYOUT.md: ${missing.map((d) => join(parent, d)).join(", ")}`).toEqual([]);
    });
  }

  it("names every file at the root", () => {
    // the files git keeps there (a stray log or a scratch file is not part of the layout); without git, every file
    let tracked: Set<string> | null = null;
    try { tracked = new Set(execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" }).split("\n").filter((f) => f && !f.includes("/"))); } catch { /* no git */ }
    const files = readdirSync(ROOT, { withFileTypes: true })
      .filter((d) => d.isFile() && !d.name.startsWith(".") && (!tracked || tracked.has(d.name))).map((d) => d.name);
    const missing = files.filter((f) => !MAP.includes(`\`${f}\``));
    expect(missing, `add these to LAYOUT.md: ${missing.join(", ")}`).toEqual([]);
  });

  it("names no folder that is gone", () => {
    const bases = [...LISTED, "app/targets", "app/modules", "hub"];
    const named = [...MAP.matchAll(/`([\w.<>-]+(?:\/[\w.-]+)*)\/`/g)].map((m) => m[1]).filter((p) => !p.includes("<"));
    const gone = [...new Set(named)].filter((p) => !bases.some((b) => {
      const at = join(ROOT, b, p);
      return existsSync(at) && statSync(at).isDirectory();
    }));
    expect(gone, `LAYOUT.md names folders that no longer exist: ${gone.join(", ")}`).toEqual([]);
  });
});
