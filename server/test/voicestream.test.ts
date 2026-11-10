// C-317: a voice streamed -- the Tiiny's PCM turned to MP3 as it comes, followed from its first bytes
import { describe, expect, it } from "vitest";
import { tiinySpeakStream, type TiinyAt } from "../src/ai/tiiny.js";
import { CAN_CONVERT, FIRST_PART, mp3Into, streamMp3, streamParts, voiceParts, VoiceStreams } from "../src/ai/voice.js";

const at: TiinyAt = { url: "http://tiiny.test/v1", key: "k", model: "m", quick: "", tts: "tiiny-voice", asr: "", voice: "" };
// half a second of a 440 Hz tone, 24 kHz 16-bit mono, sent in pieces of odd sizes (a sample split between two)
const tone = () => { const b = Buffer.alloc(24000); for (let i = 0; i < 12000; i++) b.writeInt16LE(Math.round(8000 * Math.sin(i * 2 * Math.PI * 440 / 24000)), i * 2); return b; };
const sent = (bytes: Buffer, sizes = [101, 999, 4097]) => {
  let i = 0, k = 0;
  return new ReadableStream<Uint8Array>({ pull(c) { if (i >= bytes.length) return c.close(); const n = sizes[k++ % sizes.length]; c.enqueue(new Uint8Array(bytes.subarray(i, i + n))); i += n; } });
};

describe("the shelf", () => {
  it("gives a late follower what is made, then what comes, then the end", () => {
    const s = new VoiceStreams(), id = s.open(), got: string[] = [];
    s.push(id, Buffer.from("a"));
    s.follow(id, (c) => got.push(c.toString()), () => got.push("END"));
    s.push(id, Buffer.from("b")); s.end(id); s.push(id, Buffer.from("c"));
    expect(got).toEqual(["a", "b", "END"]);
    expect(s.whole(id)?.toString()).toBe("ab");
    expect(s.follow("nope", () => {}, () => {})).toBe(false);
  });
  it("forgets a voice ten minutes on", () => {
    let t = 0; const s = new VoiceStreams(() => t), id = s.open();
    t = 11 * 60_000; s.open();
    expect(s.has(id)).toBe(false);
  });
});

describe("the Tiiny's voice, streamed", () => {
  it("asks for PCM, streamed, and says what came", async () => {
    let asked: any;
    const f = (async (_u: string, init: RequestInit) => { asked = JSON.parse(String(init.body)); return new Response(sent(tone())); }) as unknown as typeof fetch;
    const s = await tiinySpeakStream(at, "Hello there.", "a soft voice", f);
    expect(asked).toMatchObject({ model: "tiiny-voice", response_format: "pcm", stream: true, instructions: "a soft voice" });
    expect(s?.kind).toBe("pcm");
    expect(s!.first.length).toBeGreaterThanOrEqual(64);
  });
  it("is null when refused, or with no voice model", async () => {
    const f = (async () => new Response("", { status: 500 })) as unknown as typeof fetch;
    expect(await tiinySpeakStream(at, "x", "", f)).toBeNull();
    expect(await tiinySpeakStream({ ...at, tts: "" }, "x", "", f)).toBeNull();
  });
  it.skipIf(!CAN_CONVERT)("turns it to MP3 on the shelf", async () => {
    const f = (async () => new Response(sent(tone()))) as unknown as typeof fetch;
    const s = (await tiinySpeakStream(at, "Hello.", "", f))!, shelf = new VoiceStreams(), id = shelf.open();
    await streamMp3(shelf, id, s.first, s.rest, s.kind);
    const mp3 = shelf.whole(id)!;
    expect(mp3.length).toBeGreaterThan(1000);
    expect(mp3[0] === 0xff && (mp3[1] & 0xe0) === 0xe0).toBe(true);   // a frame first: no ID3, no Xing to say "no length"
  });
});

describe("the voice in growing parts", () => {
  const T = "The gray sky outside matches the heaviness in my bones, making the dust motes dancing in the shafts of weak light seem like a quiet mockery. I wonder if you would have called for me in this rain. Still, you came, and that is something. Tell me what you saw today.";
  it("cuts a short first part, at a clause, and longer ones after, losing no word", () => {
    const p = voiceParts(T);
    expect(p[0].endsWith(",") || p[0].endsWith(".") || p[0].length <= FIRST_PART * 1.3).toBe(true);
    expect(p[0].length).toBeLessThanOrEqual(FIRST_PART * 1.3);
    expect(p.length).toBeGreaterThan(1);
    expect(p.join(" ")).toBe(T);
    for (let i = 1; i < p.length - 1; i++) expect(p[i].length).toBeGreaterThan(p[i - 1].length);
  });
  it("keeps a short answer whole", () => expect(voiceParts("Hello there.")).toEqual(["Hello there."]));
  it.skipIf(!CAN_CONVERT)("says every part into one MP3, in order", async () => {
    const asked: string[] = [];
    const f = (async (_u: string, init: RequestInit) => { asked.push(JSON.parse(String(init.body)).input); return new Response(sent(tone())); }) as unknown as typeof fetch;
    const parts = voiceParts(T), shelf = new VoiceStreams(), id = shelf.open();
    const ask = (x: string) => tiinySpeakStream(at, x, "", f);
    await streamParts(shelf, id, mp3Into(shelf, id), (await ask(parts[0]))!, parts.slice(1), ask);
    expect(asked).toEqual(parts);
    expect(shelf.whole(id)!.length).toBeGreaterThan(parts.length * 3000);   // half a second of each, at 64 kbit
  });
});
