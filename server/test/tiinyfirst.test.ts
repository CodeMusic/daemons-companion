// C-249: the house's AI work goes to the Tiiny first when one is set up and answering, the boards after
import { afterEach, describe, expect, it, vi } from "vitest";
import { House } from "../src/ai/house.js";
import { preferTiiny } from "../src/ai/tiinyfirst.js";
import type { TiinyAt } from "../src/ai/tiiny.js";

const at: TiinyAt = { url: "http://tiiny.test/v1", key: "k", model: "tiiny-35b", quick: "", tts: "tiiny-voice", asr: "", voice: "" };
const boards = () => {
  const h = new House(() => []);
  h.talk = vi.fn(async () => ({ answer: "from the board", heard: null, audio: null, provider: "module:hub", firstMs: 1 }));
  h.voice = vi.fn(async () => ({ audio: new Uint8Array([9]), provider: "module:hub" }));
  h.write = vi.fn(async () => "written on the board");
  h.transcribe = vi.fn(async () => "heard on the board");
  return h;
};
const sent: any[] = [];
const tiinyUp = () => vi.stubGlobal("fetch", vi.fn(async (u: string, init: RequestInit) => {
  sent.push({ u, body: JSON.parse(String(init.body)) });
  return u.endsWith("/audio/speech")
    ? new Response(new TextEncoder().encode("RIFF\0\0\0\0WAVE"), { headers: { "content-type": "audio/mpeg" } })
    : new Response(JSON.stringify({ choices: [{ message: { content: "from the Tiiny" } }] }));
}));
afterEach(() => { vi.unstubAllGlobals(); sent.length = 0; });

describe("the Tiiny first", () => {
  it("answers a talk, with thinking off and the daemon's voice", async () => {
    tiinyUp();
    const h = preferTiiny(boards(), () => ({ at, model: "tiiny-35b" }));
    const r = await h.talk({ text: "hello", history: [], daemon: { nickname: "PING", types: "SIGNAL" }, speak: true });
    expect(r.answer).toBe("from the Tiiny");
    expect(r.provider).toBe("tiiny:tiiny-35b");
    expect(r.audio?.length).toBeGreaterThan(0);
    expect(sent[0].body.chat_template_kwargs).toEqual({ enable_thinking: false });
    expect(sent[1].body.instructions).toContain("small, bright, clear voice");
  });
  it("reads the INDEX in its own voice, and writes", async () => {
    tiinyUp();
    const h = preferTiiny(boards(), () => ({ at, model: "tiiny-35b" }), () => "the INDEX's voice");
    expect((await h.voice("an entry"))!.provider).toBe("tiiny:tiiny-voice");
    expect(sent[0].body.instructions).toBe("the INDEX's voice");
    expect(await h.write("system", "user", 300)).toBe("from the Tiiny");
    expect(sent[1].body.max_tokens).toBe(300 + 4096);   // what it may say, and what it may reason first
  });
  it("reads what a daemon says of itself in the recipe it is given, not the INDEX's (C-303)", async () => {
    tiinyUp();
    const h = preferTiiny(boards(), () => ({ at, model: "tiiny-35b" }), () => "the INDEX's voice");
    expect((await h.voice("I go where I am carried.", "a fresh, earnest, young voice"))!.provider).toBe("tiiny:tiiny-voice");
    expect(sent[0].body.instructions).toBe("a fresh, earnest, young voice");
    expect(sent[0].body.input).toBe("I go where I am carried.");
  });
  it("talks on the quick thinker, thinking off; writes on the big one, thinking on", async () => {
    tiinyUp();
    const h = preferTiiny(boards(), () => ({ at, model: "tiiny-35b", quick: "tiiny-9b" }));
    expect((await h.talk({ text: "hi", history: [], daemon: { nickname: "PING" }, speak: false })).provider).toBe("tiiny:tiiny-9b");
    expect(sent[0].body).toMatchObject({ model: "tiiny-9b", chat_template_kwargs: { enable_thinking: false } });
    await h.write("system", "user", 300);
    expect(sent[1].body).toMatchObject({ model: "tiiny-35b", chat_template_kwargs: { enable_thinking: true } });
    expect(sent[1].body.max_tokens).toBeGreaterThan(300);
  });
  it("hears on the board when the Tiiny has no hearing model", async () => {
    tiinyUp();
    expect(await preferTiiny(boards(), () => ({ at, model: "m" })).transcribe(new Uint8Array([1]))).toBe("heard on the board");
  });
  it("leaves everything to the boards when the Tiiny is not set up, or fails", async () => {
    const off = preferTiiny(boards(), () => null);
    expect((await off.talk({ text: "hi", history: [], daemon: { nickname: "PING" }, speak: false })).answer).toBe("from the board");
    expect(off.any).toBe(false);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 503 })));
    const failing = preferTiiny(boards(), () => ({ at, model: "m" }));
    expect(failing.any).toBe(true);
    expect((await failing.talk({ text: "hi", history: [], daemon: { nickname: "PING" }, speak: false })).answer).toBe("from the board");
    expect(await failing.write("s", "u")).toBe("written on the board");
  });
});
