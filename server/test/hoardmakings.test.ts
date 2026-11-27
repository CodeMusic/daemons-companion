// C-605, C-603, C-577, C-604, C-606 (C-596; the user, 2026-11-27): THE HOARD's MAKINGS -- a text read aloud, a picture
// that speaks with its mouth moving, a sequence of pictures with music or a song, a file asked a question -- queued,
// built one at a time, each a JOB with its step and progress, each finished one a CREATION. Made here with stand-ins for
// the models (the seeing model, the writer, the voice, the hearing, the music door), and with real ffmpeg where this
// machine has one.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { inflateSync } from "node:zlib";
import { makeServer } from "../src/api.js";
import { DEFAULTS } from "../src/shared/config.js";
import { Store } from "../src/shared/db.js";
import { Hoard } from "../src/hoard/hoard.js";
import { Makings, breaths, type Makers } from "../src/hoard/makings.js";
import { FPS, LEVELS, SIDE, jawOpen, jawStills, joinArgs, joinWavs, mouthLevels, pngOf, selectCommands, speakArgs, squareArgs, wavPcm } from "../src/hoard/render.js";
import type { Who } from "../src/hoard/rules.js";
import { argvFor, safeArgs } from "../src/machine/procmesh.js";
import { pickSeer, seeImage } from "../src/machine/seeing.js";
import { FOUND_FFMPEG } from "../src/machine/voice.js";
import { askedAsk, imagineAsk, jsonIn, mouthOf, readImagined, readSeen, sequenceSongAsk, textVoiceAsk, type Seen } from "../src/psyche/photovoice.js";

const tmp = mkdtempSync(join(tmpdir(), "hoard-makings-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

/** a WAV of a tone that swells and falls `beats` times: something with a loudness to follow */
function tone(seconds: number, rate = 8000, beats = 2): Buffer {
  const n = Math.round(seconds * rate), b = Buffer.alloc(44 + n * 2);
  b.write("RIFF", 0, "latin1"); b.writeUInt32LE(36 + n * 2, 4); b.write("WAVEfmt ", 8, "latin1"); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write("data", 36, "latin1"); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin((i / rate) * 2 * Math.PI * 220) * 26000 * Math.abs(Math.sin((i / n) * Math.PI * beats))), 44 + i * 2);
  return b;
}

// ---------------------------------------------------------------- the mind's words (psyche/photovoice.ts)
describe("THE PHOTO'S VOICE: what is asked, and how the answers are read (C-577)", () => {
  it("reads what a seeing model said, through its usual slips", () => {
    const s = readSeen('<think>hm</think>Here: {"tag":"person","faces":1,"description":"A woman laughs at a kitchen table.","colours":"amber, cream, green","mood":"warm",\n "mouth":{"x":0.52,"y":0.41,"w":0.11},}');
    expect(s).toMatchObject({ tag: "person", faces: 1, mood: "warm", mouth: { x: 0.52, y: 0.41, w: 0.11 } });
    expect(s.mouth!.chin).toBeCloseTo(0.099);                           // where a face that wide would have its chin
    expect(readSeen('{tag: "spaceship", faces: "two", description: "A red kettle on a hob.", colours: "red", mood: "homely", mouth: null}')).toMatchObject({ tag: "thing", faces: 0, mouth: null });
    expect(() => readSeen("I cannot see pictures.")).toThrow(/no JSON/);
    expect(() => readSeen('{"tag":"thing","description":""}')).toThrow(/not described/);
    expect(mouthOf({ x: 52, y: 41, w: 11 })).toMatchObject({ x: 0.52, y: 0.41, w: 0.11 });   // a model that answers in percent
    expect(mouthOf({ x: 0.5, y: 0.5, w: 0 })!.w).toBe(0.12);                                 // a mouth of no width is given one
    expect(mouthOf({ x: "left" })).toBeNull();
    expect(jsonIn('{"a": "“quoted”"}')).toBeTruthy();
  });
  it("asks for a voice that sounds as the picture looks, and for what the picture itself would say", () => {
    const seen: Seen = { tag: "food", faces: 0, description: "A loaf cooling on a rack.", colours: "brown, gold", mood: "patient", mouth: null };
    const a = imagineAsk(seen);
    expect(a.user).toContain("A loaf cooling on a rack.");
    expect(a.system).toMatch(/spoken by the dish/);                     // what is wanted, and its shape, are asked first
    expect(a.system).toMatch(/"persona"/);
    expect(a.user.length).toBeLessThan(1000);                           // what a quick thinker reads of a message
    expect(readImagined('{"persona":"An older, flour-soft voice, slow and kind.","phrase":"I rose slowly, and waited for you."}')).toEqual({ persona: "An older, flour-soft voice, slow and kind.", phrase: "I rose slowly, and waited for you." });
    // the person's own words: only the voice is asked for, and their words are what is said
    const mine = imagineAsk(seen, { words: "Happy birthday, from the bread." });
    expect(mine.user).toContain("Happy birthday, from the bread.");
    expect(mine.system).not.toMatch(/"phrase"/);
    expect(readImagined('{"persona":"A warm baker."}', { words: "Happy birthday, from the bread." }).phrase).toBe("Happy birthday, from the bread.");
    // a daemon speaking: it is itself, and says what it sees
    const d = imagineAsk(seen, { as: "You are SPARK, a small quick daemon." });
    expect(d.system).toContain("You are SPARK");
    expect(d.system).not.toMatch(/"persona"/);
    expect(() => readImagined('{"phrase":"hello"}')).toThrow(/no voice/);
  });
  it("casts a text's reader from the file's own facts, and lets a file answer as itself", () => {
    const t = textVoiceAsk({ name: "shopping.txt", kind: "text/plain", words: 12, opening: "eggs, flour, a lemon", added: "2026-11-27" });
    expect(t.user).toContain('"shopping.txt"');
    expect(t.user).toContain("eggs, flour, a lemon");
    const q = askedAsk({ name: "loaf.jpg", what: "a picture", description: "A loaf cooling on a rack.", said: "I rose slowly.", persona: "A warm baker." }, "  How long did you bake?  ");
    expect(q.system).toContain("A loaf cooling on a rack.");
    expect(q.system).toContain("I rose slowly.");
    expect(q.user).toBe("How long did you bake?");
    expect(sequenceSongAsk(["a loaf", "a table"], "slow folk").user).toMatch(/1\. a loaf\n2\. a table/);
    expect(t.system).toMatch(/Write JSON only/);
  });
  it("shows a picture only to the house's own models", async () => {
    const held = ["tiiny-35b", "or-gemma3-27b", "qwen3-vl-4b", "minicpm-v-4-6", "or-nemotron-omni"];
    expect(pickSeer(held)).toBe("qwen3-vl-4b");
    expect(pickSeer(held, "minicpm-v-4-6")).toBe("minicpm-v-4-6");
    expect(pickSeer(held, "or-gemma3-27b")).toBe("qwen3-vl-4b");       // one on someone else's machines is never picked, even when asked for
    expect(pickSeer(["tiiny-35b", "or-nemotron-omni"])).toBeNull();
    await expect(seeImage({ url: "http://x/v1", key: "" }, "or-gemma3-27b", new Uint8Array(4), "?")).rejects.toThrow(/own models/);
    // the door is asked with the picture inside the request, and once more plainly if it refuses the shape
    const asked: any[] = [];
    const f = (async (_u: string, init: any) => { asked.push(JSON.parse(init.body)); return asked.length === 1 ? new Response("no response_format here", { status: 400 }) : new Response(JSON.stringify({ choices: [{ message: { content: '{"tag":"thing"}' } }] })); }) as unknown as typeof fetch;
    expect(await seeImage({ url: "http://x/v1", key: "k" }, "qwen3-vl-4b", new Uint8Array([1, 2, 3]), "look", { schema: {}, f })).toBe('{"tag":"thing"}');
    expect(asked[0].messages[0].content[0].image_url.url).toBe("data:image/jpeg;base64,AQID");
    expect(asked[0].response_format).toBeTruthy();
    expect(asked[1].response_format).toBeUndefined();
  });
});

// ---------------------------------------------------------------- the renderer (hoard/render.ts)
describe("a mouth that moves, by arithmetic (C-577)", () => {
  const W = 64, H = 64, rgb = new Uint8Array(W * H * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const p = (y * W + x) * 3; rgb[p] = x * 4; rgb[p + 1] = y * 4; rgb[p + 2] = 128; }
  const mouth = { x: 32, y: 36, w: 16, chin: 14 };
  it("opens the jaw: the picture under the mouth moves down, a dark gap opens, the rest stays", () => {
    expect(Buffer.from(jawOpen(rgb, W, H, mouth, 0)).equals(Buffer.from(rgb))).toBe(true);        // shut: the picture itself
    const open = jawOpen(rgb, W, H, mouth, 1);
    expect(open.length).toBe(rgb.length);
    const at = (b: Uint8Array, x: number, y: number) => [b[(y * W + x) * 3], b[(y * W + x) * 3 + 1], b[(y * W + x) * 3 + 2]];
    expect(at(open, 2, 2)).toEqual(at(rgb, 2, 2));                                                // far from the mouth: untouched
    expect(at(open, 32, 60)).toEqual(at(rgb, 32, 60));
    const gap = at(open, 32, 38);                                                                 // between the lips: dark
    expect(gap[0] + gap[1] + gap[2]).toBeLessThan(120);
    const chin = at(open, 32, 46);                                                                // below: what was above it (green is the row)
    expect(chin[1]).toBeLessThan(at(rgb, 32, 46)[1]);
    const stills = jawStills(rgb, W, H, mouth);
    expect(stills.length).toBe(LEVELS);
    const changed = stills.map((s) => { let n = 0; for (let i = 0; i < s.length; i++) if (s[i] !== rgb[i]) n++; return n; });
    expect(changed[0]).toBe(0);
    for (let i = 1; i < LEVELS; i++) expect(changed[i]).toBeGreaterThan(changed[i - 1]);          // each a little wider
  });
  it("writes a PNG that is the picture", () => {
    const png = pngOf(rgb, W, H);
    expect(png.subarray(1, 4).toString("latin1")).toBe("PNG");
    expect(png.readUInt32BE(16)).toBe(W); expect(png.readUInt32BE(20)).toBe(H);
    const idat = png.indexOf("IDAT"), len = png.readUInt32BE(idat - 4), raw = inflateSync(png.subarray(idat + 4, idat + 4 + len));
    expect(raw.length).toBe(H * (W * 3 + 1));
    expect(raw[0]).toBe(0);
    expect(Buffer.from(rgb.subarray(0, W * 3)).equals(raw.subarray(1, 1 + W * 3))).toBe(true);
    expect(() => pngOf(rgb, W + 1, H)).toThrow();
  });
  it("follows the voice: shut in the quiet, open in the loud, and told only where it changes", () => {
    const wav = tone(2, 8000, 2);
    expect(wavPcm(wav)).toMatchObject({ rate: 8000, channels: 1 });
    const { levels, seconds } = mouthLevels(wav);
    expect(seconds).toBeCloseTo(2);
    expect(levels.length).toBe(2 * FPS);
    expect(levels[0]).toBeLessThanOrEqual(1);                              // it begins in quiet
    expect(Math.max(...levels)).toBe(LEVELS - 1);                          // and opens wide at its loudest
    expect(levels[Math.round(levels.length / 2)]).toBeLessThan(Math.max(...levels));   // falling between the two swells
    const cmds = selectCommands(levels);
    expect(cmds.split(";").length).toBeLessThan(levels.length);
    expect(cmds).toMatch(/^\d+\.\d{3} streamselect map \d(;\d+\.\d{3} streamselect map \d)*$/);
    expect(selectCommands([0, 0, 2, 2, 2, 0])).toBe("0.167 streamselect map 2;0.417 streamselect map 0");
    expect(selectCommands([0, 3, 3])).toBe("0.083 streamselect map 3;0.250 streamselect map 0");   // shut when the voice ends
    expect(mouthLevels(new Uint8Array([1, 2, 3])).levels).toEqual([]);     // not a WAV: nothing to follow
  });
  it("joins breaths of one voice into one, and asks ffmpeg only for files THE MESH may name", () => {
    const a = tone(1), b = tone(0.5), j = joinWavs([a, b], 250)!;
    expect(wavPcm(j)!.seconds).toBeCloseTo(1.75);
    expect(joinWavs([a])).toBe(a);
    expect(joinWavs([a, tone(1, 16000)])).toBeNull();                      // two rates are not one voice
    for (const args of [squareArgs(), speakArgs(selectCommands([0, 2, 4, 1])), joinArgs(3, "under"), joinArgs(2, "song"), joinArgs(1, "none")]) expect(safeArgs(args)).toBe(true);
    expect(speakArgs("").join(" ")).not.toContain("sendcmd");
    expect(joinArgs(3, "under").filter((x) => x.startsWith("@in:"))).toEqual(["@in:scene0", "@in:scene1", "@in:scene2", "@in:music"]);
    expect(breaths("One. Two. Three.", 8)).toEqual(["One.", "Two.", "Three."]);
    expect(breaths("a\n\nb\n\nc", 100)).toEqual(["a b c"]);                 // short lines are said in one breath
    expect(breaths("x".repeat(250), 100).every((p) => p.length <= 100)).toBe(true);
  });
});

// ---------------------------------------------------------------- the queue, with stand-ins for the models
const A: Who = { key: "kaaaaaaaaaaaa", name: "Ada" }, B: Who = { key: "kbbbbbbbbbbbb", name: "Ben" };
let skew = 0;
const store = new Store(":memory:", { now: () => Date.now() + skew });
const H = new Hoard(store, join(tmp, "hub"));
const drive = mkdtempSync(join(tmp, "drive-"));
H.setHere({ dir: drive, bytes: 200e6, kind: "extend" });
const calls = { see: 0, write: [] as { title: string; system: string; user: string; quick?: boolean }[], speak: [] as { text: string; recipe: string }[], hear: 0,
                ffmpeg: [] as { args: string[]; ins: string[]; outs: string[] }[], music: [] as any[] };
let gate: Promise<void> | null = null, live = 0, most = 0, seeAnswer: string | null = null;
const SEEN = '{"tag":"food","faces":0,"description":"A loaf of bread cooling on a wire rack.","colours":"brown, gold, grey","mood":"patient","mouth":{"x":0.5,"y":0.6,"w":0.2}}';
const makers: Makers = {
  see: async () => { calls.see++; return seeAnswer ?? SEEN; },
  write: async (title, system, user, _most, _signal, quick) => {
    calls.write.push({ title, system, user, quick });
    if (/its song/.test(title)) return '{"title":"Bread Song","style":"slow folk, guitar","lyrics":"[verse]\\nThe loaf is cooling\\n[chorus]\\nWait for me"}';
    if (/its answer/.test(title)) return '"About an hour, and I was worth it."';
    if (/what .* says/.test(title)) return '{"phrase":"That smells better than a battery."}';
    if (/"phrase"/.test(system)) return '{"persona":"An older, flour-soft voice, slow and kind.","phrase":"I rose slowly, and waited for you."}';
    return '{"persona":"A clear, unhurried reader in her forties."}';
  },
  speak: async (text, recipe, signal) => {
    calls.speak.push({ text, recipe });
    live++; most = Math.max(most, live);
    try { if (gate) await Promise.race([gate, new Promise((_, no) => signal.addEventListener("abort", () => no(new Error("stopped")), { once: true }))]); }
    finally { live--; }
    return tone(Math.max(0.4, Math.min(3, text.length / 40)));
  },
  hear: async () => { calls.hear++; return "what do you remember"; },
  ffmpeg: async (args, ins, outs, o) => {
    calls.ffmpeg.push({ args, ins: Object.keys(ins), outs: Object.keys(outs) });
    if (!safeArgs(args)) throw new Error("an argument THE MESH would refuse");
    for (const [k, p] of Object.entries(ins)) if (!existsSync(p)) throw new Error(`its input ${k} is not there`);
    for (const [k, p] of Object.entries(outs)) writeFileSync(p, k === "pixels" ? Buffer.alloc(SIDE * SIDE * 3, 90) : k === "wav" ? tone(1, 16000) : Buffer.from(`${k} of ${o.title}`));
  },
  music: async (p) => { calls.music.push({ ...p, to: undefined }); writeFileSync(p.to, Buffer.from("music")); },
  daemon: (name, device) => (name === "daemon" && device !== "dev1" ? null : name === "daemon:999" ? null
    : { recipe: "A small bright voice, quick and curious.", persona: "You are SPARK, a small quick daemon.", name: "SPARK" }),
};
const M = new Makings(H, store, join(tmp, "makings"), makers);
const put = async (bytes: Buffer | string, name: string, who: Who, share = "me", more: Record<string, unknown> = {}) =>
  (await H.take(Readable.from([Buffer.from(bytes)]), { name, share, ...more }, who)).file;
const jobOf = (id: string, who: Who) => M.list(who).jobs.find((j) => j.id === id)!;
const creation = (id: string, who: Who) => H.list(who).find((f) => f.id === id)!;
const reset = () => { calls.see = 0; calls.write = []; calls.speak = []; calls.hear = 0; calls.ffmpeg = []; calls.music = []; most = 0; };

describe("THE HOARD's makings (C-605)", () => {
  let note: Awaited<ReturnType<typeof put>>, loaf: Awaited<ReturnType<typeof put>>;
  beforeAll(async () => {
    note = await put("A note for the house.\n\nThe daemons keep what they are given. They hand it back from wherever is nearest.", "note.txt", A);
    loaf = await put(Buffer.from("not really a jpeg, the stand-in ffmpeg does not mind"), "loaf.jpg", A);
  });

  it("reads a text aloud in the voice of the daemon on the device that asked (the default), one job at a time", async () => {
    reset();
    let open!: () => void;
    gate = new Promise<void>((r) => (open = r));
    const first = M.ask("spoken", { of: note.id }, A, "dev1"), second = M.ask("spoken", { of: note.id, voice: "auto" }, A, "dev1");
    expect(first).toMatchObject({ kind: "spoken", state: "waiting", title: '"note.txt" read aloud', args: { voice: "daemon" } });
    await new Promise((r) => setTimeout(r, 60));
    // the first is being made and says what it is doing; the second waits its turn
    const mid = M.list(A);
    expect(mid.now).toBe(first.id);
    expect(mid.jobs.map((j) => `${j.id === first.id ? "first" : "second"}:${j.state}`)).toEqual(["first:making", "second:waiting"]);
    expect(mid.jobs[0].step).toBe("reading it aloud");
    expect(mid.jobs.map((j) => j.stage)).toEqual(["voice", "waiting"]);       // where each is, for whoever draws it
    expect(mid.jobs[0].progress).toBeGreaterThan(0);
    expect(mid.jobs[0].progress).toBeLessThan(1);
    open(); gate = null;
    await M.idle();
    expect(most).toBe(1);                                                    // never two at once
    const done = jobOf(first.id, A);
    expect(done).toMatchObject({ state: "done", progress: 1, mine: true });
    const c = creation(done.result!, A);
    expect(c).toMatchObject({ kind: "spoken", of: note.id, name: "note (read aloud).m4a", mime: "audio/mp4", owner: A.key, share: "me", mine: true });
    expect(c.meta).toMatchObject({ voice: "daemon", by: "SPARK", whole: true, persona: "A small bright voice, quick and curious." });
    expect(calls.speak[0].recipe).toBe("A small bright voice, quick and curious.");
    expect(calls.speak[0].text).toContain("The daemons keep what they are given.");
    // the second: a voice cast from the file itself -- its name and how it opens were what the writer was shown
    const auto = creation(jobOf(second.id, A).result!, A);
    expect(auto.meta).toMatchObject({ voice: "auto", by: "its own voice", persona: "A clear, unhurried reader in her forties." });
    const asked = calls.write.find((w) => /its voice/.test(w.title))!;
    expect(asked.user).toContain('"note.txt"');
    expect(asked.user).toContain("A note for the house.");
    expect(calls.speak.at(-1)!.recipe).toBe("A clear, unhurried reader in her forties.");
  });
  it("a daemon the reader picks reads it; one that is not theirs, or no daemon on the device, fails plainly", async () => {
    reset();
    const picked = M.ask("spoken", { of: note.id, voice: "daemon:25" }, A, "");
    const none = M.ask("spoken", { of: note.id, voice: "daemon" }, A, "another-device");
    const notMine = M.ask("spoken", { of: note.id, voice: "daemon:999" }, A, "dev1");
    await M.idle();
    expect(jobOf(picked.id, A).state).toBe("done");
    expect(jobOf(none.id, A)).toMatchObject({ state: "failed", error: "no daemon is on that device to read it" });
    expect(jobOf(notMine.id, A)).toMatchObject({ state: "failed", error: "that daemon is not one of yours" });
    expect(() => M.ask("spoken", { of: note.id, voice: "a celebrity" }, A)).toThrow(/a voice is/);
    expect(() => M.ask("spoken", { of: loaf.id }, A)).toThrow(/only a text file/);
    expect(() => M.ask("poem", { of: note.id }, A)).toThrow(/spoken, magic, video or answer/);
  });
  it("a long text is said in breaths of one voice, and only so much of it", async () => {
    reset();
    const long = await put(Array.from({ length: 400 }, (_, i) => `Sentence number ${i} goes on for a little while longer than it needs to.`).join(" "), "long.txt", A);
    const j = M.ask("spoken", { of: long.id, voice: "auto" }, A);
    await M.idle();
    const c = creation(jobOf(j.id, A).result!, A);
    expect(calls.speak.length).toBeGreaterThan(5);
    expect(new Set(calls.speak.map((s) => s.recipe)).size).toBe(1);          // one voice throughout
    expect(calls.speak.every((s) => s.text.length <= 1000)).toBe(true);
    expect(c.meta.whole).toBe(false);                                        // it says it did not read all of it
  });

  it("makes a picture speak: looked at once, given words and a voice, its mouth moved by the voice (C-577)", async () => {
    reset();
    const j = M.ask("magic", { of: loaf.id }, A);
    expect(j.title).toBe('"loaf.jpg" speaks');
    await M.idle();
    const c = creation(jobOf(j.id, A).result!, A);
    expect(c).toMatchObject({ kind: "magic", of: loaf.id, name: "loaf (speaking).mp4", mime: "video/mp4", share: "me" });
    expect(c.meta).toMatchObject({ phrase: "I rose slowly, and waited for you.", persona: "An older, flour-soft voice, slow and kind.", tag: "food", by: "its own voice",
                                   description: "A loaf of bread cooling on a wire rack.", mouth: { x: 0.5, y: 0.6, w: 0.2 } });
    expect(calls.see).toBe(1);
    expect(calls.speak).toEqual([{ text: "I rose slowly, and waited for you.", recipe: "An older, flour-soft voice, slow and kind." }]);
    // ffmpeg: the square picture, its pixels, then the stills played by the voice
    expect(calls.ffmpeg.map((f) => f.outs.join())).toEqual(["square", "pixels", "video"]);
    const speak = calls.ffmpeg[2];
    expect(speak.ins).toEqual(["still0", "still1", "still2", "still3", "still4", "voice"]);
    expect(speak.args.join(" ")).toContain("sendcmd=c='");
    expect(speak.args.join(" ")).toContain("streamselect=inputs=5");
    // made again in the person's own words, by a daemon they picked: the picture is not looked at again
    reset();
    const mine = M.ask("magic", { of: loaf.id, words: "Happy birthday, from the bread.", voice: "daemon:25" }, A);
    await M.idle();
    expect(calls.see).toBe(0);
    expect(creation(jobOf(mine.id, A).result!, A).meta).toMatchObject({ phrase: "Happy birthday, from the bread.", by: "SPARK", persona: "A small bright voice, quick and curious." });
    expect(calls.write).toEqual([]);                                          // nothing to write: the words and the voice were both given
    // their own words in the picture's own voice: only the voice is cast
    reset();
    const own = M.ask("magic", { of: loaf.id, words: "Come and eat." }, A);
    await M.idle();
    expect(creation(jobOf(own.id, A).result!, A).meta).toMatchObject({ phrase: "Come and eat.", persona: "A clear, unhurried reader in her forties." });   // what the stand-in casts when asked for a voice alone
    expect(calls.write.length).toBe(1);
    expect(calls.write[0].system).not.toMatch(/"phrase"/);
  });
  it("a picture with no mouth still speaks: it brightens with its voice instead", async () => {
    reset();
    seeAnswer = '{"tag":"nature","faces":0,"description":"Fog over a field at dawn.","colours":"grey, pale gold","mood":"hushed","mouth":null}';
    const fog = await put(Buffer.from("fog"), "fog.png", A);
    const j = M.ask("magic", { of: fog.id }, A);
    await M.idle();
    seeAnswer = null;
    expect(jobOf(j.id, A).state).toBe("done");
    expect(creation(jobOf(j.id, A).result!, A).meta.mouth).toBeNull();
  });
  it("is asked a model's answer twice when the first cannot be read, and fails plainly when the second cannot either", async () => {
    reset();
    const was = makers.write;
    let n = 0;
    makers.write = async (t, s, u, m, sig) => (++n === 1 ? "Sure! Here is a voice for you." : was(t, s, u, m, sig));
    const j = M.ask("spoken", { of: note.id, voice: "auto" }, A);
    await M.idle();
    expect(jobOf(j.id, A).state).toBe("done");
    makers.write = async () => "no JSON, ever";
    const k = M.ask("spoken", { of: note.id, voice: "auto" }, A);
    await M.idle();
    expect(jobOf(k.id, A)).toMatchObject({ state: "failed", error: "no JSON in the answer" });
    makers.write = was;
    // made again once the mind is itself again
    expect(M.again(k.id, A).state).toBe("waiting");
    await M.idle();
    expect(jobOf(k.id, A).state).toBe("done");
    expect(() => M.again(k.id, A)).toThrow(/only a failed or stopped/);
  });

  it("makes a magic video: each picture speaking by magic, in your words, or as a daemon -- with music under them (C-604)", async () => {
    reset();
    const table = await put(Buffer.from("table"), "table.jpg", A);
    const j = M.ask("video", { title: "Sunday", music: "under", musicPrompt: "", scenes: [{ of: loaf.id, say: "auto" }, { of: table.id, say: "words", words: "Sit down, all of you." },
                                                                                          { of: loaf.id, say: "daemon", species: 25 }] }, A);
    await M.idle();
    const c = creation(jobOf(j.id, A).result!, A);
    expect(c).toMatchObject({ kind: "video", name: "Sunday.mp4", mime: "video/mp4", of: null });
    expect(c.meta.scenes).toEqual([{ of: loaf.id, phrase: "I rose slowly, and waited for you.", by: "its own voice" }, { of: table.id, phrase: "Sit down, all of you.", by: "its own voice" },
                                   { of: loaf.id, phrase: "That smells better than a battery.", by: "SPARK" }]);
    expect(calls.speak.map((s) => s.text)).toEqual(["I rose slowly, and waited for you.", "Sit down, all of you.", "That smells better than a battery."]);
    expect(calls.speak[2].recipe).toBe("A small bright voice, quick and curious.");
    expect(calls.write.find((w) => /what SPARK says/.test(w.title))!.system).toContain("You are SPARK");
    // music without words, asked for from the pictures' moods, as long as the voices
    expect(calls.music).toEqual([expect.objectContaining({ song: false, caption: expect.stringContaining("no vocals") })]);
    expect(calls.music[0].caption).toContain("patient");
    const join_ = calls.ffmpeg.at(-1)!;
    expect(join_.ins).toEqual(["scene0", "scene1", "scene2", "music"]);
    expect(join_.args.join(" ")).toContain("amix=inputs=2");
  });
  it("with no speakers, a song carries the words: its lyrics from what the pictures hold", async () => {
    reset();
    const j = M.ask("video", { music: "song", musicPrompt: "slow folk", scenes: [{ of: loaf.id }, { of: loaf.id }] }, A);
    expect(j.title).toBe("a magic video of 2 pictures");
    await M.idle();
    expect(jobOf(j.id, A).state).toBe("done");
    expect(calls.speak).toEqual([]);                                          // nobody speaks
    expect(calls.music[0]).toMatchObject({ song: true, caption: "slow folk", lyrics: expect.stringContaining("The loaf is cooling") });
    expect(calls.write.find((w) => /its song/.test(w.title))!.user).toContain("A loaf of bread cooling on a wire rack.");
    expect(calls.write.find((w) => /its song/.test(w.title))!.quick).toBe(false);          // the one long piece: the writer's whole thought
    expect(creation(jobOf(j.id, A).result!, A).meta).toMatchObject({ music: "song", song: { title: "Bread Song" } });
    expect(calls.ffmpeg.at(-1)!.args.join(" ")).not.toContain("amix");
    // a song is offered only when no picture has a speaker
    expect(() => M.ask("video", { music: "song", scenes: [{ of: loaf.id, say: "words", words: "hello" }] }, A)).toThrow(/only when no picture has a speaker/);
    expect(() => M.ask("video", { scenes: [] }, A)).toThrow(/1 to 24 pictures/);
    expect(() => M.ask("video", { scenes: [{ of: loaf.id, say: "words", words: " " }] }, A)).toThrow(/write what that picture says/);
    expect(() => M.ask("video", { scenes: [{ of: loaf.id, say: "daemon" }] }, A)).toThrow(/pick the daemon/);
    expect(() => M.ask("video", { scenes: [{ of: note.id }] }, A)).toThrow(/made of pictures/);
  });

  it("ASK A FILE: typed or spoken, a picture answers as itself in its own voice (C-606)", async () => {
    reset();
    const j = M.ask("answer", { of: loaf.id, text: "How long did you bake?" }, A);
    await M.idle();
    const c = creation(jobOf(j.id, A).result!, A);
    expect(c).toMatchObject({ kind: "answer", of: loaf.id, name: "loaf (answer).m4a", mime: "audio/mp4" });
    expect(c.meta).toMatchObject({ question: "How long did you bake?", answer: "About an hour, and I was worth it." });
    const ask = calls.write.find((w) => /its answer/.test(w.title))!;
    expect(ask.system).toContain('a picture called "loaf.jpg"');
    expect(ask.system).toContain("A loaf of bread cooling on a wire rack.");
    expect(ask.user).toBe("How long did you bake?");
    expect(calls.write.every((w) => w.quick === true)).toBe(true);            // someone is waiting on an answer: the quick thinker
    expect(calls.speak.at(-1)).toEqual({ text: "About an hour, and I was worth it.", recipe: "An older, flour-soft voice, slow and kind." });
    // spoken: the recording is heard first, and is not kept
    reset();
    const said = join(M.inbox(), "said-test");
    writeFileSync(said, tone(1));
    const s = M.ask("answer", { of: loaf.id, said }, A);
    expect(s.title).toBe('"loaf.jpg" asked aloud');
    await M.idle();
    expect(calls.hear).toBe(1);
    expect(creation(jobOf(s.id, A).result!, A).meta.question).toBe("what do you remember");
    expect(existsSync(said)).toBe(false);
    // what was heard is kept with the job as its words, so it can be made again though the recording is gone
    expect(JSON.parse((store.db.prepare("SELECT args FROM hoard_jobs WHERE id = ?").get(s.id) as { args: string }).args)).toMatchObject({ text: "what do you remember", said: "" });
    // a creation is asked as what it is; a recording by what is heard in it
    reset();
    const magic = H.list(A).find((f) => f.kind === "magic")!;
    const m = M.ask("answer", { of: magic.id, text: "Who are you?" }, A);
    const rec = await put(tone(1), "memo.wav", A);
    const r = M.ask("answer", { of: rec.id, text: "What is in you?" }, A);
    await M.idle();
    expect(calls.write.find((w) => /its answer/.test(w.title) && /a picture that speaks/.test(w.system))).toBeTruthy();
    expect(calls.write.find((w) => /a recording called "memo.wav"/.test(w.system))!.system).toContain("what do you remember");
    expect(jobOf(m.id, A).state).toBe("done"); expect(jobOf(r.id, A).state).toBe("done");
    expect(() => M.ask("answer", { of: loaf.id, text: "  " }, A)).toThrow(/ask it something/);
    const zip = await put(Buffer.from("PK"), "things.zip", A);
    expect(() => M.ask("answer", { of: zip.id, text: "hello?" }, A)).toThrow(/a picture, a recording, a text or a creation/);
  });

  it("makes only of what the asker may read; what they make is theirs alone", async () => {
    reset();
    expect(() => M.ask("spoken", { of: note.id }, B)).toThrow(/not shared with you/);
    expect(() => M.ask("answer", { of: loaf.id, text: "hello" }, B)).toThrow(/not shared with you/);
    expect(() => M.ask("video", { scenes: [{ of: loaf.id }] }, B)).toThrow(/not shared with you/);
    const shared = await put("For everyone at home.", "all.txt", A, "household", { minutes: 60 });
    const j = M.ask("spoken", { of: shared.id, voice: "auto" }, B);
    await M.idle();
    const made = jobOf(j.id, B).result!;
    expect(creation(made, B)).toMatchObject({ owner: B.key, ownerName: "Ben", share: "me" });      // Ben's own
    expect(H.list(A).some((f) => f.id === made)).toBe(false);                                       // not Ada's to read, though it was made of her file
    // another's making is shown as there, never by its name
    let open!: () => void;
    gate = new Promise<void>((r) => (open = r));
    const hers = M.ask("spoken", { of: note.id, voice: "auto" }, A);
    await new Promise((r) => setTimeout(r, 40));
    const seenByBen = M.list(B).jobs.find((x) => x.id === hers.id)!;
    expect(seenByBen).toMatchObject({ title: "someone else's making", step: "", mine: false, result: null });
    expect(() => M.stop(hers.id, B)).toThrow(/only the one who asked/);
    // a share that ends while a job waits: it is not made
    const late = M.ask("spoken", { of: shared.id, voice: "auto" }, B);
    skew += 61 * 60_000;
    open(); gate = null;
    await M.idle();
    expect(jobOf(late.id, B)).toMatchObject({ state: "failed", error: "that file is no longer shared with you" });
    expect(M.list(B).jobs.some((x) => x.id === hers.id)).toBe(false);                               // finished: no longer Ben's to see at all
  });
  it("a waiting job is taken out of the queue; the one in hand is given up; either can be made again", async () => {
    reset();
    let open!: () => void;
    gate = new Promise<void>((r) => (open = r));
    const first = M.ask("spoken", { of: note.id, voice: "auto" }, A), second = M.ask("spoken", { of: note.id, voice: "auto" }, A);
    await new Promise((r) => setTimeout(r, 40));
    expect(M.stop(second.id, A)).toBe(true);
    expect(jobOf(second.id, A).state).toBe("stopped");
    expect(M.stop(first.id, A)).toBe(true);                                   // the voice was being made: it is given up
    await M.idle();
    expect(jobOf(first.id, A)).toMatchObject({ state: "stopped", error: null, result: null });
    open(); gate = null;
    expect(M.stop(first.id, A)).toBe(false);                                  // nothing left to stop
    M.again(first.id, A);
    await M.idle();
    expect(jobOf(first.id, A).state).toBe("done");
  });
  it("one that was being made when the hub stopped is made again from its start", async () => {
    const id = "f".repeat(16);
    store.db.prepare("INSERT INTO hoard_jobs (id, kind, title, state, step, progress, at, started, owner, owner_name, device, args) VALUES (?, 'spoken', 't', 'making', 'reading it aloud', 0.5, ?, ?, ?, 'Ada', '', ?)")
      .run(id, Date.now(), Date.now(), A.key, JSON.stringify({ of: note.id, voice: "auto" }));
    const again = new Makings(H, store, join(tmp, "makings2"), makers);
    await new Promise((r) => setTimeout(r, 600));
    await again.idle();
    expect(again.list(A).jobs.find((j) => j.id === id)).toMatchObject({ state: "done", progress: 1 });
  });
  it("a making that cannot be kept (THE HOARD is full) fails saying so", async () => {
    const small = new Store(":memory:"), HS = new Hoard(small, join(tmp, "hub-small")), d = mkdtempSync(join(tmp, "small-"));
    HS.setHere({ dir: d, bytes: 1024 * 1024, kind: "extend" });
    const n = (await HS.take(Readable.from([Buffer.from("words to read")]), { name: "n.txt" }, A)).file;
    const big: Makers = { ...makers, see: makers.see, music: makers.music,
      ffmpeg: async (_a, _i, outs) => { for (const p of Object.values(outs)) writeFileSync(p, Buffer.alloc(2 * 1024 * 1024, 1)); } };
    const MS = new Makings(HS, small, join(tmp, "makings-small"), big);
    const j = MS.ask("spoken", { of: n.id, voice: "auto" }, A);
    await MS.idle();
    expect(MS.list(A).jobs.find((x) => x.id === j.id)).toMatchObject({ state: "failed", error: expect.stringMatching(/full|room/) });
  });
});

// ---------------------------------------------------------------- with real ffmpeg, where this machine has one
describe.skipIf(!FOUND_FFMPEG)("a picture that speaks, made with real ffmpeg (C-577)", () => {
  it("renders a real video whose mouth follows the voice", async () => {
    const dir = mkdtempSync(join(tmp, "real-")), s2 = new Store(":memory:"), H2 = new Hoard(s2, join(dir, "hub"));
    H2.setHere({ dir: mkdtempSync(join(dir, "drive-")), bytes: 200e6, kind: "extend" });
    // a real picture: a grey square with a lighter face-ish block, written by the PNG writer under test
    const W = 96, rgb = new Uint8Array(W * W * 3).fill(70);
    for (let y = 20; y < 80; y++) for (let x = 24; x < 72; x++) { const p = (y * W + x) * 3; rgb[p] = 210; rgb[p + 1] = 170; rgb[p + 2] = 140; }
    const photo = (await H2.take(Readable.from([pngOf(rgb, W, W)]), { name: "face.png" }, A)).file;
    const run = (args: string[], ins: Record<string, string>, outs: Record<string, string>) => new Promise<void>((ok, no) => {
      const files = { ...Object.fromEntries(Object.entries(ins).map(([k, v]) => [`in:${k}`, v])), ...Object.fromEntries(Object.entries(outs).map(([k, v]) => [`out:${k}`, v])) };
      execFile(FOUND_FFMPEG!, ["-hide_banner", "-loglevel", "error", "-y", ...argvFor(args, files)], (e, _o, err) => (e ? no(new Error(String(err).slice(-300))) : ok()));
    });
    const real: Makers = { ...makers, see: async () => '{"tag":"person","faces":1,"description":"A plain face on grey.","colours":"tan, grey","mood":"calm","mouth":{"x":0.5,"y":0.62,"w":0.18}}',
                           music: null, ffmpeg: run, speak: async () => tone(1.5, 24000, 3) };
    const M2 = new Makings(H2, s2, join(dir, "makings"), real);
    const j = M2.ask("magic", { of: photo.id }, A);
    await M2.idle();
    const done = M2.list(A).jobs.find((x) => x.id === j.id)!;
    expect(done.error).toBeNull();
    expect(done.state).toBe("done");
    const made = H2.list(A).find((f) => f.id === done.result)!;
    const bytes = readFileSync(H2.find(made.sha)!);
    expect(bytes.subarray(4, 8).toString("latin1")).toBe("ftyp");            // an MP4
    expect(bytes.length).toBeGreaterThan(3000);
    expect(made.meta.seconds).toBeGreaterThanOrEqual(1);
    // and a file asked a question with real ffmpeg making its voice a file
    const a = M2.ask("answer", { of: photo.id, text: "Are you well?" }, A);
    await M2.idle();
    const ans = H2.list(A).find((f) => f.id === M2.list(A).jobs.find((x) => x.id === a.id)!.result)!;
    expect(readFileSync(H2.find(ans.sha)!).subarray(4, 8).toString("latin1")).toBe("ftyp");
  }, 60_000);
});

// ---------------------------------------------------------------- through the hub's requests
describe("THE HOARD's makings, asked of the hub (C-605)", () => {
  const st = new Store(":memory:"), server = makeServer({ ...DEFAULTS, database: ":memory:", savePath: null }, st);
  const KA = "phone-a-key-0123456789abcdef", KB = "phone-b-key-0123456789abcdef";
  let hub = "";
  beforeAll(async () => {
    st.addPhone(KA, "Ada's phone"); st.addPhone(KB, "Ben's phone");
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    hub = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    await fetch(`${hub}/api/engine/hoard/offer`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ dir: mkdtempSync(join(tmp, "api-")), gb: 0.01 }) });
  });
  afterAll(() => server.close());
  const call = async (p: string, key: string, body?: unknown, raw?: Buffer) => {
    const r = await fetch(hub + p, { method: body !== undefined || raw ? "POST" : "GET", headers: { authorization: `Bearer ${key}`, "content-type": raw ? "application/octet-stream" : "application/json" },
                                     body: raw ? new Uint8Array(raw) : body !== undefined ? JSON.stringify(body) : undefined });
    return { status: r.status, body: (await r.json().catch(() => ({}))) as any };
  };
  it("queues a making for whoever may read the file, shows it under JOBS, and refuses the rest", async () => {
    const text = (await call("/api/hoard/upload?name=n.txt", KA, undefined, Buffer.from("some words"))).body.file;
    const made = await call("/api/hoard/make", KA, { kind: "spoken", of: text.id, voice: "auto" });
    expect(made.status).toBe(200);
    expect(made.body.job).toMatchObject({ kind: "spoken", state: "waiting", title: '"n.txt" read aloud' });
    expect((await call("/api/hoard/jobs", KA)).body.jobs.map((j: any) => j.id)).toEqual([made.body.job.id]);
    expect((await call("/api/hoard/jobs", KB)).body.jobs[0]).toMatchObject({ title: "someone else's making", mine: false });
    expect((await call("/api/hoard/make", KB, { kind: "spoken", of: text.id })).status).toBe(403);
    expect((await call(`/api/hoard/files/${text.id}/ask`, KB, { text: "hello" })).status).toBe(403);
    expect((await call(`/api/hoard/jobs/${made.body.job.id}/stop`, KB, {})).status).toBe(403);
    expect((await call(`/api/hoard/jobs/${made.body.job.id}/stop`, KA, {})).body).toEqual({ ok: true });
    // asked aloud: the recording is the request's body
    const asked = await call(`/api/hoard/files/${text.id}/ask?spoken=1`, KA, undefined, tone(0.5));
    expect(asked.status).toBe(200);
    expect(asked.body.job).toMatchObject({ kind: "answer", title: '"n.txt" asked aloud' });
    expect((await call(`/api/hoard/files/${text.id}/ask?spoken=1`, KA, undefined, Buffer.from("x"))).status).toBe(400);
    // no model that sees is set up on this hub: a picture's making says so at once
    const pic = (await call("/api/hoard/upload?name=p.png", KA, undefined, Buffer.from("png"))).body.file;
    const no = await call("/api/hoard/make", KA, { kind: "magic", of: pic.id });
    expect(no.status).toBe(503);
    expect(no.body.error).toMatch(/no model that sees/);
  });
});
