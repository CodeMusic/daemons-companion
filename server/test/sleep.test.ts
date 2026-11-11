// C-334: sleep sounds -- the recipe from a daemon's context, and the hub making, converting and keeping a piece
import { execFileSync } from "node:child_process";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cleanImage, moodBand, sleepRecipe, sleepSaid, TYPE_SOUND } from "../src/sleepsound.js";
import { SleepTracks, sleepDoor } from "../src/sleeptracks.js";
import { FOUND_FFMPEG } from "../src/ai/voice.js";
import { TYPE_VOICE } from "../src/ai/voices.js";

const care = { rest: 60, hunger: 20, thirst: 20, companionship: 60 };

describe("sleepRecipe", () => {
  it("has a sound for every type that has a voice", () => {
    expect(Object.keys(TYPE_SOUND).sort()).toEqual(Object.keys(TYPE_VOICE).sort());
  });
  it("is the same piece for the same context, and a new one when a band moves", () => {
    const a = sleepRecipe({ species: 7, types: ["FLOW"], feelings: { glad: 10 }, care });
    const b = sleepRecipe({ species: 7, types: ["FLOW"], feelings: { glad: 12 }, care: { ...care, rest: 65 } });
    expect(b.key).toBe(a.key);                         // a tick of a feeling is not a new piece
    const sad = sleepRecipe({ species: 7, types: ["FLOW"], feelings: { sad: 70 }, care });
    expect(sad.key).not.toBe(a.key);
    expect(sad.keyscale).toBe("G minor");
    expect(a.keyscale).toBe("G major");
    const far = sleepRecipe({ species: 7, types: ["FLOW"], feelings: { glad: 10 }, care: { ...care, companionship: 10 } });
    expect(far.key).not.toBe(a.key);
    expect(far.caption).toMatch(/faraway/);
    expect(sleepRecipe({ species: 8, types: ["FLOW"], care }).key).not.toBe(a.key);   // each kind its own
  });
  it("steers the music words from the type, the mood and the care", () => {
    const r = sleepRecipe({ species: 3, types: "STRATUM/FROZEN", feelings: { calm: -60 }, care: { rest: 10, hunger: 80, thirst: 90, companionship: 90 } });
    expect(r.caption).toMatch(/^deep cello drone/);
    expect(r.caption).toMatch(/a touch of crystalline bells/);
    expect(r.caption).toMatch(/sheltering/);
    expect(r.caption).toMatch(/sparse/);
    expect(r.caption).toMatch(/rain/);
    expect(r.caption).toMatch(/hearth/);
    expect(r.caption).toMatch(/close, intimate lullaby/);
    expect(r.caption).toMatch(/instrumental, ambient sleep music/);
    expect(r.bpm).toBe(52);
    expect(moodBand({ restless: 50, glad: 20 })).toBe("restless");
    expect(moodBand(null)).toBe("still");
  });
  it("takes one image from a talker, cleaned to music words", () => {
    expect(cleanImage('"Wind through a pine forest."\nmore')).toBe("wind through a pine forest");
    expect(cleanImage("")).toBeNull();
    expect(sleepRecipe({ species: 1, types: ["LOGIC"] }, "waves on a shingle shore").caption).toMatch(/waves on a shingle shore/);
  });
  it("says why, by its name, never the trainer's", () => {
    const r = sleepRecipe({ species: 1, types: ["LOGIC"], feelings: { glad: 80 }, care });
    expect(sleepSaid(r, "PIP")).toBe("Made for PIP as tonight finds them: glad, rested, near you.");
  });
});

describe("sleepDoor", () => {
  it("is the setting, else the Tiiny's LiteLLM host on :4002", () => {
    const get = (m: Record<string, string>) => (k: string) => m[k] ?? null;
    expect(sleepDoor(get({ "tiiny.url": "http://roverbyteseer:4000/v1", "tiiny.key": "k" }))).toEqual({ base: "http://roverbyteseer:4002", key: "k" });
    expect(sleepDoor(get({ "sleep.url": "http://x:9/", "tiiny.url": "http://roverbyteseer:4000/v1" }))?.base).toBe("http://x:9");
    expect(sleepDoor(get({ "tiiny.url": "http://192.168.1.9/openai/v1" }))).toBeNull();
  });
});

describe.skipIf(!FOUND_FFMPEG)("SleepTracks", () => {
  let door: Server, base = "", flac = Buffer.alloc(0), asked: any[] = [], deleted = 0;
  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), "sleep-src-"));
    execFileSync(FOUND_FFMPEG!, ["-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=220:duration=3", "-ac", "2", "-ar", "44100", join(dir, "s.flac")]);
    flac = readFileSync(join(dir, "s.flac"));
    let polls = 0;
    door = createServer((req, res) => {
      if (req.headers.authorization !== "Bearer the-key") { res.writeHead(401); return res.end(); }
      if (req.method === "POST" && req.url === "/v1/sleep/make") {
        let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => { asked.push(JSON.parse(b)); res.writeHead(202); res.end(JSON.stringify({ job: "j1" })); });
        return;
      }
      if (req.url === "/v1/sleep/job/j1") { res.writeHead(200); return res.end(JSON.stringify(++polls < 2 ? { state: "making" } : { state: "done", seconds: 3 })); }
      if (req.url === "/v1/sleep/file/j1.flac") { res.writeHead(200, { "content-type": "audio/flac" }); return res.end(flac); }
      if (req.method === "DELETE") { deleted++; res.writeHead(200); return res.end("{}"); }
      res.writeHead(404); res.end();
    });
    await new Promise<void>((r) => door.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(door.address() as AddressInfo).port}`;
  });
  afterAll(() => door.close());

  it("asks once, converts to the phone's and the watch's files, and keeps it by its key", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sleep-"));
    const kept = new SleepTracks(dir, () => ({ base, key: "the-key" }), async () => {}, 0);
    const r = sleepRecipe({ species: 5, types: ["GROWTH"], care });
    const t = kept.ask(r, { species: 5, nickname: "PIP", said: "DRAFT" });
    expect(t.state).toBe("making");
    expect(kept.ask(r, { species: 5, nickname: "PIP", said: "DRAFT" }).id).toBe(t.id);   // asked twice, made once
    for (let i = 0; i < 1000 && kept.byId(t.id)?.state === "making"; i++) await new Promise((x) => setTimeout(x, 50));
    const done = kept.byId(t.id)!;
    expect(done.error).toBeUndefined();
    expect(done.state).toBe("ready");
    expect(asked).toHaveLength(1);
    expect(asked[0]).toMatchObject({ caption: r.caption, bpm: r.bpm, keyscale: r.keyscale, seconds: 300, seed: r.seed });
    expect(deleted).toBe(1);                                                  // nothing left on roverbyteseer
    const watch = readFileSync(kept.file(t.id, "watch.wav")!);
    expect(watch.toString("latin1", 0, 4)).toBe("RIFF");
    expect(watch.readUInt16LE(22)).toBe(1);                                   // mono
    expect(watch.readUInt32LE(24)).toBe(16000);                               // 16 kHz
    expect(watch.readUInt16LE(20)).toBe(1);                                   // PCM
    expect(readFileSync(kept.file(t.id, "watch-adpcm.wav")!).readUInt16LE(20)).toBe(0x11);   // IMA ADPCM
    expect(existsSync(kept.file(t.id, "phone.m4a")!)).toBe(true);
    expect(existsSync(join(dir, t.id, "source.flac"))).toBe(false);
    expect(kept.file(t.id, "../tracks.json")).toBeNull();
    expect(kept.file("nope", "watch.wav")).toBeNull();
    // kept across a restart
    expect(new SleepTracks(dir, () => null).byId(t.id)?.state).toBe("ready");
  }, 60000);   // three ffmpeg runs: slow on a busy machine
  it("waits on its job again after a restart, and drops one never sent", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sleep-"));
    const { writeFileSync } = await import("node:fs");
    const was = (id: string, job?: string) => ({ id, key: `k${id}`, species: 9, nickname: "", caption: "", bpm: 60, keyscale: "C major", said: "",
                                                  state: "making", asked: new Date().toISOString(), ...(job ? { job } : {}) });
    writeFileSync(join(dir, "tracks.json"), JSON.stringify([was("a".repeat(32), "j1"), was("b".repeat(32))]));
    const kept = new SleepTracks(dir, () => ({ base, key: "the-key" }), async () => {}, 0);
    expect(kept.byId("b".repeat(32))?.state).toBe("failed");
    for (let i = 0; i < 1000 && kept.byId("a".repeat(32))?.state === "making"; i++) await new Promise((x) => setTimeout(x, 50));
    expect(kept.byId("a".repeat(32))?.state).toBe("ready");
    expect(kept.byId("a".repeat(32))?.job).toBeUndefined();
  }, 60000);
  it("converts a piece already fetched when it restarts, without asking roverbyteseer", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sleep-"));
    const { writeFileSync, mkdirSync } = await import("node:fs");
    const id = "c".repeat(32);
    mkdirSync(join(dir, id));
    writeFileSync(join(dir, id, "source.flac"), flac);
    writeFileSync(join(dir, "tracks.json"), JSON.stringify([{ id, key: "kc", species: 9, nickname: "", caption: "", bpm: 60, keyscale: "C major",
                                                               said: "", state: "making", asked: new Date().toISOString(), job: "gone" }]));
    const kept = new SleepTracks(dir, () => ({ base, key: "the-key" }), async () => {}, 0);
    for (let i = 0; i < 1000 && kept.byId(id)?.state === "making"; i++) await new Promise((x) => setTimeout(x, 50));
    expect(kept.byId(id)?.error).toBeUndefined();
    expect(kept.byId(id)?.state).toBe("ready");
    expect(existsSync(join(dir, id, "source.flac"))).toBe(false);
  }, 60000);
  it("says so when no music maker is set up", () => {
    const kept = new SleepTracks(mkdtempSync(join(tmpdir(), "sleep-")), () => null);
    expect(() => kept.ask(sleepRecipe({ species: 1 }), { species: 1, nickname: "", said: "" })).toThrow(/music maker/);
  });
});
