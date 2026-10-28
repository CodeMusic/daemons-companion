// C-180: the hub's Module LLM through its OpenAI-format API -- checked against a stand-in that answers as it should.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { chat, hear, kindOf, listModels, pickModels, speak } from "../src/ai/module.js";
import { fakeModule } from "./fake_module.js";

const server = fakeModule();
let base = "";
beforeAll(async () => { await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
                        base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`; });
afterAll(() => server.close());

describe("the Module LLM's API (C-180)", () => {
  it("knows a model's kind by its name", () => {
    expect(kindOf("qwen2.5-0.5B-prefill-20e")).toBe("llm");
    expect(kindOf("melotts_zh-cn")).toBe("tts");
    expect(kindOf("whisper-tiny")).toBe("stt");
    expect(kindOf("sherpa-ncnn-streaming-zipformer-20M-2023-02-17")).toBe("other");   // a live mic: a file hung the module
    expect(kindOf("single_speaker_english_fast")).toBe("tts");
  });
  it("picks the fast thinker, an English voice and Whisper, as the hub's module measured them (2026-10-28)", () => {
    const list = ["deepseek-r1-1.5B-ax630c", "llama3.2-1B-prefill-ax630c", "qwen3-0.6B-ax630c", "qwen2.5-coder-0.5B-ax630c",
                  "qwen2.5-0.5B-prefill-20e", "melotts_zh-cn", "melotts-en-us", "single_speaker_english_fast",
                  "sherpa-ncnn-streaming-zipformer-20M-2023-02-17", "whisper-tiny"].map((id) => ({ id, kind: kindOf(id) }));
    expect(pickModels(list)).toEqual({ llm: "qwen2.5-0.5B-prefill-20e", tts: "melotts-en-us", stt: "whisper-tiny" });
    expect(pickModels([...list, { id: "qwen2.5-0.5B-p256-ax630c", kind: kindOf("qwen2.5-0.5B-p256-ax630c") }]).llm).toBe("qwen2.5-0.5B-p256-ax630c");   // room for a long question
    const bare = ["llama3.2-1B-prefill-ax630c", "deepseek-r1-1.5B-ax630c", "qwen3-0.6B-ax630c", "melotts_zh-cn",
                  "sherpa-ncnn-streaming-zipformer-20M-2023-02-17"].map((id) => ({ id, kind: kindOf(id) }));
    expect(pickModels(bare)).toEqual({ llm: "qwen3-0.6B-ax630c", tts: undefined, stt: undefined });   // never slow, Chinese or sherpa
  });
  it("lists, thinks (streamed, timed to its first words), speaks and hears", async () => {
    expect((await listModels(base)).map((m) => m.kind)).toEqual(["llm", "tts", "stt"]);
    const pieces: string[] = [];
    const said = await chat(base, "qwen2.5-0.5B-prefill-20e", [{ role: "user", content: "hi" }], { onPiece: (p) => pieces.push(p) });
    expect(said.text).toBe("Good morning!");
    expect(pieces).toEqual(["Good ", "morning", "!"]);
    expect(said.firstMs).not.toBeNull();
    expect(said.totalMs).toBeGreaterThanOrEqual(said.firstMs!);
    const spoken = await speak(base, "melotts-en-default", "a line");
    expect(spoken.audio.toString()).toBe("RIFFa line");
    expect((await hear(base, "whisper-tiny", spoken.audio)).text).toBe("heard it");
  });
});
