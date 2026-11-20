import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// C-429: everything in src/ runs on the phone (expo-sqlite, Hermes) and moves to its own repository one day, so it
// imports nothing from Node, nothing from the companion, and no package at all -- only its own files.
const SRC = fileURLToPath(new URL("../src", import.meta.url));
const files = readdirSync(SRC).filter((f) => f.endsWith(".ts"));

const imports = (code: string) =>
  [...code.matchAll(/^(?:import|export)\b[^"';]*?\bfrom\s+["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']/gm)].map((m) => m[1] ?? m[2]);

describe("the package stands alone", () => {
  it("reads imports, multi-line exports included", () => {
    expect(imports(readFileSync(join(SRC, "index.ts"), "utf8")).length).toBeGreaterThanOrEqual(8);
    expect(imports('import { x } from "node:sqlite";\nexport {\n  a,\n} from "../../server/src/store.js";')).toEqual(["node:sqlite", "../../server/src/store.js"]);
  });

  it.each(files)("%s imports only its own files", (f) => {
    const code = readFileSync(join(SRC, f), "utf8");
    const from = imports(code);
    expect(from.filter((p) => !/^\.\/[\w-]+\.js$/.test(p)), "only ./file.js").toEqual([]);
    expect(/\bnode:|\bprocess\.|\bBuffer\b|\brequire\(/.test(code.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n"))).toBe(false);
  });

  it.each(files)("%s says on its first line that it runs on the phone", (f) => {
    expect(readFileSync(join(SRC, f), "utf8").split("\n")[0]).toMatch(/runs on the phone too/);
  });
});
