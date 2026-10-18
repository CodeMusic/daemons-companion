// A board's key opens only the device's own door (DEVICE_DOOR). Every route the boards' firmware calls must be on it, or a
// board off the cable is refused it -- POST /api/device/broadcast was, until 2026-10-17 (found while the wiki was written).
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DEVICE_DOOR } from "../src/api.js";

const SRC = join(__dirname, "..", "..", "firmware", "esp32", "src");
const calls = new Map<string, string>();           // path -> method, as the firmware's http("METHOD", "/api/device/...") calls
for (const f of readdirSync(SRC).filter((n) => /\.(cpp|h)$/.test(n)))
  for (const m of readFileSync(join(SRC, f), "utf8").matchAll(/"(GET|POST)",\s*"(\/api\/device\/[a-z/]+)/g)) calls.set(m[2], m[1]);

describe("the device's own door", () => {
  it("finds the firmware's calls", () => {
    expect(calls.size).toBeGreaterThan(10);
  });
  for (const [path, method] of calls)
    it(`lets a board ${method} ${path}`, () => {
      expect(DEVICE_DOOR.some((d) => d(method, path))).toBe(true);
    });
});
