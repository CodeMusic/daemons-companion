// C-180: the hub's Module LLM through its OpenAI-format API -- checked against a stand-in that answers as it should.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { chat, hear, kindOf, listModels, speak } from "../src/ai/module.js";
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
    expect(kindOf("sherpa-ncnn-streaming-zipformer-20M-2023-02-17")).toBe("stt");
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
