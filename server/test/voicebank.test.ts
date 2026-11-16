import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { renderAhead, VoiceBank } from "../src/voicebank.js";

const dirs: string[] = [];
const bank = () => { const d = mkdtempSync(join(tmpdir(), "bank-")); dirs.push(d); return new VoiceBank(d); };
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });
const wav = (n: number) => new Uint8Array([82, 73, 70, 70, n]);

describe("C-251: the voice bank", () => {
  it("keeps a reading by its words, recipe and generation", () => {
    const b = bank(), k = VoiceBank.key("a line", "a voice", 1);
    expect(b.get(k)).toBeNull();
    b.put(k, wav(1), "tiiny:tiiny-voice");
    expect(b.get(k)).toEqual({ audio: Buffer.from(wav(1)), provider: "tiiny:tiiny-voice" });
    expect(VoiceBank.key("a line", "a voice", 2)).not.toBe(k);
    expect(VoiceBank.key("a line", "another voice", 1)).not.toBe(k);
  });

  it("renders ahead only what is missing, only the Tiiny's voice, and stops when the Tiiny is wanted", async () => {
    const b = bank(), lines = ["one", "two", "three", "four"].map((text) => ({ text, recipe: "r" }));
    b.put(VoiceBank.key("one", "r", 1), wav(9), "tiiny:x");
    const asked: string[] = [];
    let ready = 2;
    const made = await renderAhead({ bank: b, generation: () => 1, lines: () => lines, ready: () => ready-- > 0,
      speak: async (t) => { asked.push(t); return { audio: wav(t.length), provider: "tiiny:x" }; }, wait: async () => {} });
    expect(asked).toEqual(["two", "three"]);
    expect(made).toBe(2);
    // a fallback voice is never kept, and ends the round
    const made2 = await renderAhead({ bank: b, generation: () => 1, lines: () => lines, ready: () => true,
      speak: async () => ({ audio: wav(1), provider: "module:melotts" }), wait: async () => {} });
    expect(made2).toBe(0);
    expect(b.has(VoiceBank.key("four", "r", 1))).toBe(false);
  });
});
