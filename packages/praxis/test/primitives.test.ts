import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { between, Clock, derivedId, hlcString, parseHlc, sha256hex, utf8, uuidTime, uuidv7 } from "../src/index.js";
import { seeded } from "./helpers.js";

describe("ids", () => {
  it("hashes as Node's SHA-256 does, at every padding boundary and in any script", () => {
    const r = seeded(7);
    const texts = ["", "abc", "praxis", "日本語の言葉", "emoji 🜂 and 𝄞", ...Array.from({ length: 130 }, (_, n) => "x".repeat(n))];
    for (let i = 0; i < 40; i++) texts.push(Array.from({ length: r.int(300) }, () => String.fromCodePoint(32 + r.int(0x2fff))).join(""));
    for (const t of texts) expect(sha256hex(t)).toBe(createHash("sha256").update(t, "utf8").digest("hex"));
    for (const t of texts) expect(Buffer.from(utf8(t)).equals(Buffer.from(t, "utf8"))).toBe(true);
  });

  it("makes UUIDv7s: their version and variant, their time, and in order through a burst in one millisecond", () => {
    const make = uuidv7(() => 1_763_500_000_000, seeded(1).bytes);
    const ids = Array.from({ length: 6000 }, make);
    for (const id of ids.slice(0, 50)) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect([...ids].sort()).toEqual(ids);
    expect(new Set(ids).size).toBe(ids.length);
    expect(uuidTime(ids[0])).toBe(1_763_500_000_000);
  });

  it("keeps order when the clock steps back", () => {
    let t = 2_000;
    const make = uuidv7(() => t, seeded(2).bytes);
    const a = make(); t = 1_000; const b = make(); t = 3_000; const c = make();
    expect([a, b, c].sort()).toEqual([a, b, c]);
  });

  it("derives the same UUIDv8 from the same parts, and another from any other", () => {
    expect(derivedId("ledger", "i", "award", "finish:1")).toBe(derivedId("ledger", "i", "award", "finish:1"));
    expect(derivedId("ledger", "i", "award", "finish:1")).not.toBe(derivedId("ledger", "i", "award", "finish:2"));
    expect(derivedId("a", "bc")).not.toBe(derivedId("ab", "c"));
    expect(derivedId("x")).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe("the hybrid logical clock", () => {
  it("moves forward when the wall clock stands still or goes back, and its text sorts as its time", () => {
    let t = 5_000;
    const c = new Clock("A", () => t);
    const a = c.tick(), b = c.tick(); t = 4_000; const d = c.tick(); t = 9_000; const e = c.tick();
    expect([a, b, d, e]).toEqual([a, b, d, e].slice().sort());
    expect(new Set([a, b, d, e]).size).toBe(4);
    expect(parseHlc(e)).toEqual({ ms: 9_000, count: 0, replica: "A" });
    expect(parseHlc(hlcString({ ms: 12, count: 35, replica: "x.y" }))).toEqual({ ms: 12, count: 35, replica: "x.y" });
  });

  it("comes after anything it has seen, however far behind its own clock is", () => {
    const behind = new Clock("B", () => 1_000);
    const ahead = new Clock("A", () => 99_000).tick();
    behind.observe(ahead);
    const next = behind.tick();
    expect(next > ahead).toBe(true);
    expect(parseHlc(next)!.ms).toBe(99_000);
  });
});

describe("positions", () => {
  it("always finds a place between two others, never ending in 0", () => {
    const r = seeded(3);
    const keys: string[] = [];
    for (let i = 0; i < 2000; i++) {
      const at = r.int(keys.length + 1);
      const k = between(keys[at - 1] ?? null, keys[at] ?? null);
      expect(k.endsWith("0")).toBe(false);
      if (at > 0) expect(k > keys[at - 1]).toBe(true);
      if (at < keys.length) expect(k < keys[at]).toBe(true);
      keys.splice(at, 0, k);
    }
    // always at the front, or always at the back (a list made in order): the keys stay short
    let first: string | null = null, last: string | null = null;
    for (let i = 0; i < 1000; i++) {
      const f = between(null, first), l = between(last, null);
      if (first !== null) expect(f < first).toBe(true);
      if (last !== null) expect(l > last).toBe(true);
      expect(f.endsWith("0") || l.endsWith("0")).toBe(false);
      first = f; last = l;
    }
    expect(first!.length).toBeLessThan(40);
    expect(last!.length).toBeLessThan(40);
    expect(() => between("b", "a")).toThrow();
  });
});
