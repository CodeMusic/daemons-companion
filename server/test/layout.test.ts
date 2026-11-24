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
// a folder is named when `name/` appears in the map as a word of its own (`today/`, `src/psyche/`, `| `hub/` |`)
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

// C-387: mind and machine -- LAYOUT.md's "Mind and machine" table names which side each module is on. A MIND module never
// imports a MACHINE one and never calls a model itself (no fetch, no node:*): it is handed a thinker, or writes a recipe.
describe("mind and machine", () => {
  const row = (side: string) => {
    const line = MAP.split("\n").find((l) => l.startsWith(`| **${side}** |`));
    if (!line) throw new Error(`LAYOUT.md has no ${side} row under "Mind and machine"`);
    return [...line.matchAll(/`([\w./-]+\.tsx?)`/g)].map((m) => m[1].startsWith("app/") ? m[1] : `server/src/${m[1]}`);
  };
  const MIND = row("MIND"), MACHINE = row("MACHINE");
  const machine = new Set(MACHINE.map((f) => f.replace(/\.tsx?$/, "")));
  const code = (f: string) => readFileSync(join(ROOT, f), "utf8").split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
  // every relative import, as a repository path without its extension
  const importsOf = (f: string) => [...code(f).matchAll(/(?:from|import\(|require\()\s*["'](\.{1,2}\/[^"']+)["']/g)]
    .map((m) => join(f, "..", m[1]).replace(/\.(js|tsx?)$/, ""));

  it("names files that exist, each on one side", () => {
    const gone = [...MIND, ...MACHINE].filter((f) => !existsSync(join(ROOT, f)));
    expect(gone, `LAYOUT.md names modules that no longer exist: ${gone.join(", ")}`).toEqual([]);
    const both = MIND.filter((f) => MACHINE.includes(f));
    expect(both, `on both sides: ${both.join(", ")}`).toEqual([]);
  });

  it("names every file in server/src/machine/ MACHINE and every file in server/src/psyche/ MIND (C-428)", () => {
    const loose = (dir: string, side: string[]) => readdirSync(join(ROOT, "server/src", dir)).filter((f) => /\.tsx?$/.test(f))
      .map((f) => `server/src/${dir}/${f}`).filter((f) => !side.includes(f));
    expect(loose("machine", MACHINE), `name these MACHINE in LAYOUT.md's "Mind and machine"`).toEqual([]);
    expect(loose("psyche", MIND), `name these MIND in LAYOUT.md's "Mind and machine"`).toEqual([]);
  });

  it("keeps every MIND module off the machine", () => {
    const crossings = MIND.flatMap((f) => importsOf(f).filter((d) => machine.has(d)).map((d) => `${f} -> ${d}`));
    expect(crossings, "a MIND module imports a MACHINE one: hand it a thinker, or move the words to MIND").toEqual([]);
    const calls = MIND.filter((f) => /\bfetch\s*\(|from\s+["']node:/.test(code(f)));
    expect(calls, "a MIND module calls a model or the machine itself: hand it the call instead").toEqual([]);
  });

  // C-428: the folders say it now. psyche/, damagotchi/ and lifemanagement/ are MIND, whole: nothing in them, at any
  // depth, imports anything in machine/ (docs/PROJECTS.md 3).
  it("keeps psyche/, damagotchi/ and lifemanagement/ off machine/", () => {
    const filesIn = (rel: string): string[] => readdirSync(join(ROOT, rel), { withFileTypes: true }).flatMap((d) =>
      d.isDirectory() ? filesIn(`${rel}/${d.name}`) : /\.tsx?$/.test(d.name) ? [`${rel}/${d.name}`] : []);
    const crossings = ["psyche", "damagotchi", "lifemanagement"].flatMap((dir) => filesIn(`server/src/${dir}`))
      .flatMap((f) => importsOf(f).filter((d) => d.startsWith("server/src/machine/")).map((d) => `${f} -> ${d}`));
    expect(crossings, "a MIND folder imports the machine: hand it a thinker, or move the words to MIND").toEqual([]);
  });
});
