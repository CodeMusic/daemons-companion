// C-180: the modules in the house -- a talk on the first free module, LATE when none is free or no first words come in
// time, setModules keeping only modules that answer, and a module's WAV made the boards' 16 kHz without ffmpeg
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { fakeModule } from "./fake_module.js";
import { checkModules, House, persona, setModules, type ModuleAt, type TalkAsk } from "../src/ai/house.js";
import { LATE } from "../src/ai/module.js";
import { devicePcmOf } from "../src/ai/wav.js";

let quick: Server, slow: Server, qUrl = "", sUrl = "";
const up = (s: Server) => new Promise<string>((done) => s.listen(0, "127.0.0.1", () => done(`http://127.0.0.1:${(s.address() as AddressInfo).port}`)));
beforeAll(async () => { quick = fakeModule(); slow = fakeModule({ firstDelayMs: 400 }); qUrl = await up(quick); sUrl = await up(slow); });
afterAll(() => { quick.close(); slow.close(); });

const ask: TalkAsk = { text: "Good morning", history: [], daemon: { nickname: "ROVERCUB", types: "MIND", entry: "Keeps watch." },
                       day: { day: "Tuesday" }, goal: null, speak: true };

describe("the house", () => {
  it("talks on a module: words and a voice", async () => {
    const h = new House(() => [{ url: qUrl, name: "hub module" }]);
    const r = await h.talk(ask);
    expect(r.answer).toBe("Good morning!");
    expect(r.provider).toBe("module:hub module");
    expect(new TextDecoder().decode(r.audio!.subarray(0, 4))).toBe("RIFF");
  });
  it("hears a recording first", async () => {
    const h = new House(() => [{ url: qUrl, name: "m" }]);
    const r = await h.talk({ ...ask, text: undefined, wav: new Uint8Array(64) });
    expect(r.heard).toBe("heard it");
    expect(r.answer).toBe("Good morning!");
  });
  it("is LATE when the module cannot hear, and asks it to hear no more for a while -- but still to think", async () => {
    const deafSrv = fakeModule({ busyHearing: true }), url = await up(deafSrv);
    try {
      const h = new House(() => [{ url, name: "busy ears" }]);
      await expect(h.talk({ ...ask, text: undefined, wav: new Uint8Array(64) })).rejects.toThrow(LATE);
      await expect(h.talk({ ...ask, text: undefined, wav: new Uint8Array(64) })).rejects.toThrow(LATE);   // not asked again
      expect((await h.talk(ask)).answer).toBe("Good morning!");                                         // words still thought
    } finally { deafSrv.close(); }
  });
  it("fails, never answers silence, when the module says nothing (its LLM after an update)", async () => {
    const quiet = fakeModule({ silent: true }), url = await up(quiet);
    const h = new House(() => [{ url, name: "quiet" }]);
    try { await expect(h.talk(ask)).rejects.toThrow("answered nothing"); expect(h.faults.empty).toBe(1); }
    finally { quiet.close(); }
  });
  it("keeps the words before the plugin's pasted parse error, and counts it", async () => {
    const g = fakeModule({ garbled: true }), url = await up(g);
    const h = new House(() => [{ url, name: "garbled" }]);
    try { expect((await h.talk(ask)).answer).toBe("Hello, RO"); expect(h.faults.garbled).toBe(1); }
    finally { g.close(); }
  });
  it("is LATE when no first words come before the deadline, and waits when told to", async () => {
    const h = new House(() => [{ url: sUrl, name: "slow" }]);
    await expect(h.talk(ask, 100)).rejects.toThrow(LATE);
    expect((await h.talk(ask, null)).answer).toBe("Good morning!");
  });
  it("is LATE when every module is busy, and uses a second module when the first is", async () => {
    const one = new House(() => [{ url: sUrl, name: "a" }]);
    const first = one.talk(ask, null);
    await new Promise((r) => setTimeout(r, 50));
    await expect(one.talk(ask)).rejects.toThrow(LATE);
    await first;
    const two = new House(() => [{ url: sUrl, name: "a" }, { url: qUrl, name: "b" }]);
    const a = two.talk(ask, null);
    await new Promise((r) => setTimeout(r, 50));
    expect((await two.talk(ask)).provider).toBe("module:b");
    expect((await a).provider).toBe("module:a");
  });
  it("keeps only modules that answer", async () => {
    const kept: Record<string, string> = {};
    const r = await setModules({ setSetting: (k, v) => { kept[k] = v; } },
      [{ url: qUrl, name: "here" }, { url: "http://127.0.0.1:9", name: "gone" }] as ModuleAt[]);
    expect(r.kept.map((m) => m.name)).toEqual(["here"]);
    expect(r.dropped[0].url).toBe("http://127.0.0.1:9");
    expect(JSON.parse(kept["ai.modules"])).toHaveLength(1);
    expect(checkModules([{ url: "ftp://x" }])).toMatch(/url/);
  });
  it("sends the same system message every time, and who the daemon is with each question (M5's pool keeps the first)", async () => {
    const asked: any[] = [], m = fakeModule({ asked }), url = await up(m);
    try {
      const h = new House(() => [{ url, name: "m" }]);
      await h.talk({ ...ask, daemon: { nickname: "SEEKMUSAI", types: "VECTOR", level: 50, mood: "happy", dream: "a library whose books read themselves aloud" } });
      await h.talk({ ...ask, daemon: { nickname: "STARR", types: "SIGNAL" } });
      expect(asked[0][0]).toEqual(asked[1][0]);                      // the system message: identical
      expect(asked[0][0].content).not.toMatch(/SEEKMUSAI|STARR/);
      const last = (i: number) => asked[i][asked[i].length - 1].content as string;
      expect(last(0)).toMatch(/^\[You are SEEKMUSAI, a VECTOR daemon, level 50.*dreamt: a library.*\]\nThey say: Good morning$/s);
      expect(last(1)).toMatch(/^\[You are STARR/);
      expect(last(1)).not.toMatch(/SEEKMUSAI/);
    } finally { m.close(); }
  });
  it("tells the model who it is, briefly", () => {
    const p = persona(ask);
    expect(p).toContain("ROVERCUB");
    expect(p).toContain("Tuesday");
    expect(p.length).toBeLessThan(600);
  });
});

describe("a WAV as the boards play it", () => {
  const wav = (rate: number, channels: number, samples: number[]) => {
    const data = new Uint8Array(samples.length * 2), d = new DataView(data.buffer);
    samples.forEach((s, i) => d.setInt16(i * 2, s, true));
    const h = new Uint8Array(44), v = new DataView(h.buffer), put = (at: number, t: string) => [...t].forEach((c, i) => { h[at + i] = c.charCodeAt(0); });
    put(0, "RIFF"); v.setUint32(4, 36 + data.length, true); put(8, "WAVEfmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
    v.setUint16(22, channels, true); v.setUint32(24, rate, true); v.setUint32(28, rate * channels * 2, true); v.setUint16(32, channels * 2, true);
    v.setUint16(34, 16, true); put(36, "data"); v.setUint32(40, data.length, true);
    const out = new Uint8Array(44 + data.length); out.set(h); out.set(data, 44); return out;
  };
  it("keeps 16 kHz mono as it is", () => {
    const pcm = devicePcmOf(wav(16000, 1, [0, 1000, -1000, 32767]))!;
    expect([...new Int16Array(pcm.buffer)]).toEqual([0, 1000, -1000, 32767]);
  });
  it("mixes stereo down and halves 32 kHz", () => {
    const pcm = devicePcmOf(wav(32000, 2, [1000, 3000, 1000, 3000, 2000, 2000, 2000, 2000]))!;
    expect([...new Int16Array(pcm.buffer)]).toEqual([2000, 2000]);
  });
  it("refuses what is not a WAV", () => { expect(devicePcmOf(new TextEncoder().encode("RIFFnope"))).toBeNull(); });
});
