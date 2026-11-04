// C-249 / C-252: the Tiiny as a thinker, and the daemon's self in words
import { describe, expect, it } from "vitest";
import { pickThinker, tiinyChat, tiinyHear, tiinyIn, tiinyModels, tiinySpeak, tiinyUrl } from "../src/ai/tiiny.js";
import { bandOf, bondTrend, feelingsSaid, keepBondDay, selfOf } from "../src/self.js";

const settings = (o: Record<string, string>) => (k: string) => o[k] ?? null;
const at = tiinyIn(settings({ "tiiny.url": "http://tiiny.test/openai/v1", "tiiny.key": "k", "tiiny.tts": "qwen3-tts", "tiiny.asr": "qwen3-asr" }))!;

describe("the Tiiny's address", () => {
  it("takes a base that ends in /v1, either way", () => {
    expect(tiinyUrl("http://roverbyteseer:4000/v1/")).toBe("http://roverbyteseer:4000/v1");
    expect(tiinyUrl("http://10.0.0.50/openai/v1")).toBe("http://10.0.0.50/openai/v1");
    expect(tiinyUrl("http://10.0.0.50")).toBeNull();
    expect(tiinyUrl("roverbyteseer:4000/v1")).toBeNull();
  });
  it("is nothing until an address is given", () => expect(tiinyIn(settings({}))).toBeNull());
});

describe("talking to it", () => {
  it("lists its models with the key, and is null when away", async () => {
    let auth = "";
    const f = (async (_u: string, init: RequestInit) => { auth = (init.headers as Record<string, string>).authorization;
      return new Response(JSON.stringify({ data: [{ id: "Qwen3-ASR-1.7B" }, { id: "Qwen3.6-35B-A3B" }] })); }) as typeof fetch;
    const held = await tiinyModels(at, f);
    expect(held).toEqual(["Qwen3-ASR-1.7B", "Qwen3.6-35B-A3B"]);
    expect(auth).toBe("Bearer k");
    expect(pickThinker(at, held!)).toBe("Qwen3.6-35B-A3B");
    expect(await tiinyModels(at, (async () => { throw new Error("away"); }) as typeof fetch)).toBeNull();
  });
  it("sends the self as the system message and leaves out a model's thinking", async () => {
    let sent: any;
    const f = (async (_u: string, init: RequestInit) => { sent = JSON.parse(String(init.body));
      return new Response(JSON.stringify({ choices: [{ message: { content: "<think>hm</think> Good morning." } }] })); }) as typeof fetch;
    expect(await tiinyChat(at, "m", "You are PING.", [{ said: "hi", answer: "hello" }], "how are you?", f)).toBe("Good morning.");
    expect(sent.messages.map((m: { role: string }) => m.role)).toEqual(["system", "user", "assistant", "user"]);
    expect(sent.messages[0].content).toBe("You are PING.");
  });
  it("throws when it fails, so the talk goes elsewhere", async () => {
    const f = (async () => new Response("no", { status: 503 })) as typeof fetch;
    await expect(tiinyChat(at, "m", "s", [], "hi", f)).rejects.toThrow("503");
    await expect(tiinyChat(at, "", "s", [], "hi", f)).rejects.toThrow("no model");
  });
  it("speaks and hears with its own models", async () => {
    const f = (async (u: string) => u.endsWith("/audio/speech")
      ? new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "audio/wav" } })
      : new Response(JSON.stringify({ text: " hello there " }))) as typeof fetch;
    expect((await tiinySpeak(at, "hi", "", f))!.audio.length).toBe(3);
    const mislabelled = (async () => new Response(new TextEncoder().encode("RIFF\0\0\0\0WAVEfmt "), { headers: { "content-type": "audio/mpeg" } })) as typeof fetch;
    expect((await tiinySpeak(at, "hi", "", mislabelled))!.mime).toBe("audio/wav");
    expect(await tiinyHear(at, new Uint8Array([0]), f)).toBe("hello there");
    expect(await tiinySpeak({ ...at, tts: "" }, "hi", "", f)).toBeNull();
  });
  it("hands its voice DAEMON as it is said (C-270)", async () => {
    let input = "";
    const f = (async (_u: string, o: RequestInit) => { input = JSON.parse(String(o.body)).input;
      return new Response(new Uint8Array([1]), { headers: { "content-type": "audio/wav" } }); }) as typeof fetch;
    await tiinySpeak(at, "My DAEMON says hello.", "", f);
    expect(input).toBe("My Daymon says hello.");
  });
});

describe("the self", () => {
  const feel = { glad: 62, mad: 0, sad: 3, calm: -12, restless: 15, strongest: null };
  it("bands numbers into words", () => {
    expect([0, 9, 10, 29, 30, 54, 55, 79, 80, 100].map(bandOf)).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
  });
  it("says the feelings, strongest first, CALM's far side as AFRAID", () => {
    expect(feelingsSaid(feel)).toBe("very GLAD, a little RESTLESS, a little AFRAID, not SAD, and not MAD");
  });
  it("reads the bond's week", () => {
    const days = { "2026-10-24": 200, "2026-10-29": 205 };
    expect(bondTrend(days, "2026-10-31", 210)).toBe("STRONGER");
    expect(bondTrend(days, "2026-10-31", 201)).toBe("the SAME");
    expect(bondTrend({}, "2026-10-31", 201)).toBeNull();
    expect(Object.keys(keepBondDay(Object.fromEntries([...Array(12)].map((_, i) => [`2026-10-${10 + i}`, i])), "2026-10-31", 1)))
      .toHaveLength(10);
  });
  it("writes the user's template from the numbers", () => {
    const text = selfOf({ nickname: "PING", types: "SIGNAL", trainer: "TRAINER", device: "WATCH", friendship: 204, bondTrend: "STRONGER",
                          life: { fed: { today: 2 }, watered: { today: 3 }, trained: true, rested: true }, feelings: feel,
                          dream: "a long hallway of doors", yesterday: "We walked to the lake." }, "day");
    expect(text).toContain("You are PING, a DAEMON process running on a BOX (a SIGNAL daemon).");
    expect(text).toContain("You are hosted on their WATCH right now.");
    expect(text).toContain("friendship bond of 80%, and over the last week it has grown STRONGER.");
    expect(text).toContain("You are WELL fed, VERY WELL watered, and WELL trained today.");
    expect(text).toContain('this is what you dreamt: "a long hallway of doors"');
    expect(text).toContain("Yesterday: We walked to the lake.");
    expect(text).not.toContain("Over the last month");
  });
  it("keeps the short self short, and the month for the full one", () => {
    const f = { nickname: "PING", trainer: "TRAINER", feelings: feel, month: "A quiet month.", kept: ["the first walk"] };
    const short = selfOf(f, "short");
    expect(short.split(/\s+/).length).toBeLessThan(80);
    expect(short).not.toContain("TRAINER");
    expect(selfOf(f, "full")).toContain("Over the last month: A quiet month.");
    expect(selfOf(f, "full")).toContain("Moments you keep: the first walk");
  });
});
