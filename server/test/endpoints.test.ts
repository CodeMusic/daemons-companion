// C-280 (1): ENDPOINTS on the hub -- kept, shown without their keys, checked, and walked after the Tiiny, before the boards
import { afterEach, describe, expect, it, vi } from "vitest";
import { House } from "../src/ai/house.js";
import { preferTiiny } from "../src/ai/tiinyfirst.js";
import type { TiinyAt } from "../src/ai/tiiny.js";
import { atHome, checkEndpoints, endpointsIn, endpointsNow, endpointsView, forgetEndpoint, keepEndpoint, moveEndpoint,
         type Endpoint } from "../src/ai/endpoints.js";

const store = () => { const m = new Map<string, string>();
  return { get: (k: string) => m.get(k) ?? null, set: (k: string, v: string | null) => { if (v === null) m.delete(k); else m.set(k, v); } }; };
let n = 0;
const id = () => `e${++n}`;

describe("the endpoints kept", () => {
  it("keeps one, never shows its key, keeps the key when changed without one", () => {
    const s = store();
    const r = keepEndpoint(s.get, s.set, { name: "Home Ollama", url: "http://10.0.0.5:11434/v1/", key: "sk-1", model: "qwen3" }, id);
    expect(Array.isArray(r)).toBe(true);
    const v = endpointsView(s.get);
    expect(v).toEqual([{ id: v[0].id, name: "Home Ollama", url: "http://10.0.0.5:11434/v1", model: "qwen3", keySet: true, home: true }]);
    expect(JSON.stringify(v)).not.toContain("sk-1");
    keepEndpoint(s.get, s.set, { id: v[0].id, model: "llama3" }, id);
    expect(endpointsIn(s.get)[0]).toMatchObject({ key: "sk-1", model: "llama3", name: "Home Ollama" });
  });
  it("refuses an address without /v1, and an id it does not know", () => {
    const s = store();
    expect(keepEndpoint(s.get, s.set, { url: "https://example.com/api" }, id)).toMatch(/\/v1/);
    expect(keepEndpoint(s.get, s.set, { id: "nope", url: "https://example.com/v1" }, id)).toMatch(/no endpoint/);
  });
  it("names one by its host when not named, moves and forgets", () => {
    const s = store();
    keepEndpoint(s.get, s.set, { url: "https://openrouter.ai/api/v1", key: "k" }, id);
    keepEndpoint(s.get, s.set, { name: "B", url: "http://box:8000/v1" }, id);
    const [a, b] = endpointsIn(s.get);
    expect(a.name).toBe("openrouter.ai");
    moveEndpoint(s.get, s.set, b.id, -1);
    expect(endpointsIn(s.get).map((e) => e.name)).toEqual(["B", "openrouter.ai"]);
    forgetEndpoint(s.get, s.set, b.id);
    expect(endpointsIn(s.get).map((e) => e.name)).toEqual(["openrouter.ai"]);
  });
  it("says what is at home", () => {
    for (const u of ["http://localhost:1234/v1", "http://roverbyteseer:4000/v1", "http://192.168.1.4/v1", "http://100.90.1.2/v1", "https://x.tail1.ts.net/v1"])
      expect(atHome(u)).toBe(true);
    for (const u of ["https://openrouter.ai/api/v1", "https://api.openai.com/v1", "http://8.8.8.8/v1", "nonsense"]) expect(atHome(u)).toBe(false);
  });
});

const ep = (name: string, url: string, model = ""): Endpoint => ({ id: name, name, url, key: "k", model });

describe("the endpoints asked", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("checks each, and asks only those answering -- and, for the home ring, only those at home", async () => {
    const f = vi.fn(async (u: string) => u.startsWith("http://dead")
      ? new Response("", { status: 502 }) : new Response(JSON.stringify({ data: [{ id: "whisper-1" }, { id: "gpt-x" }] })));
    const list = [ep("away", "https://api.example.com/v1"), ep("dead", "http://dead:1/v1"), ep("home", "http://10.0.0.9/v1", "mine")];
    const h = await checkEndpoints(list, f as unknown as typeof fetch);
    expect(h.map((x) => x.ok)).toEqual([true, false, true]);
    expect(endpointsNow(list, h).map((x) => [x.e.name, x.model])).toEqual([["away", "gpt-x"], ["home", "mine"]]);
    expect(endpointsNow(list, h, true).map((x) => x.e.name)).toEqual(["home"]);
    expect(endpointsNow(list, undefined)).toEqual([]);
  });
});

describe("the hub's chain: the Tiiny, the endpoints, the boards", () => {
  const at: TiinyAt = { url: "http://tiiny.test/v1", key: "k", model: "tiiny-35b", quick: "", tts: "", asr: "", voice: "" };
  const boards = () => {
    const h = new House(() => []);
    h.talk = vi.fn(async () => ({ answer: "from the board", heard: null, audio: null, provider: "module:hub", firstMs: 1 }));
    h.voice = vi.fn(async () => ({ audio: new Uint8Array([9]), provider: "module:hub" }));
    h.write = vi.fn(async () => "written on the board");
    h.transcribe = vi.fn(async () => "heard on the board");
    return h;
  };
  const sent: { u: string; body: any }[] = [];
  const up = (down: string[]) => vi.stubGlobal("fetch", vi.fn(async (u: string, init: RequestInit) => {
    sent.push({ u, body: JSON.parse(String(init.body)) });
    if (down.some((d) => u.startsWith(d))) return new Response("", { status: 503 });
    return new Response(JSON.stringify({ choices: [{ message: { content: `from ${new URL(u).hostname}` } }] }));
  }));
  afterEach(() => { sent.length = 0; });
  const away = { e: ep("Away", "https://api.example.com/v1"), model: "gpt-x", home: false };
  const home = { e: ep("Home", "http://10.0.0.9/v1"), model: "mine", home: true };
  const others = (homeOnly: boolean) => [away, home].filter((x) => !homeOnly || x.home);

  it("walks to the first endpoint when the Tiiny fails, and says which answered", async () => {
    up(["http://tiiny.test"]);
    const h = preferTiiny(boards(), () => ({ at, model: "tiiny-35b" }), undefined, others);
    const r = await h.talk({ text: "hi", history: [], daemon: { nickname: "PING" }, speak: true });
    expect(r).toMatchObject({ answer: "from api.example.com", provider: "endpoint:Away:gpt-x" });
    expect(r.audio).toEqual(new Uint8Array([9]));                  // said by the house, the Tiiny having no voice model
    expect(sent[1].body.chat_template_kwargs).toBeUndefined();     // a public API is not sent what it may refuse
  });
  it("keeps to endpoints at home for the home ring, and sends them the template's switch", async () => {
    up(["http://tiiny.test"]);
    const h = preferTiiny(boards(), () => null, undefined, others);
    const r = await h.talk({ text: "hi", history: [], daemon: { nickname: "PING" }, speak: false, home: true });
    expect(r.provider).toBe("endpoint:Home:mine");
    expect(sent.map((x) => x.u)).toEqual(["http://10.0.0.9/v1/chat/completions"]);
    expect(sent[0].body.chat_template_kwargs).toEqual({ enable_thinking: false });
  });
  it("falls to the boards when every endpoint fails, and writes on an endpoint before the boards", async () => {
    up(["http://tiiny.test", "https://api.example.com", "http://10.0.0.9"]);
    const h = preferTiiny(boards(), () => ({ at, model: "tiiny-35b" }), undefined, others);
    expect((await h.talk({ text: "hi", history: [], daemon: { nickname: "PING" }, speak: false })).provider).toBe("module:hub");
    vi.unstubAllGlobals(); sent.length = 0; up(["http://tiiny.test"]);
    expect(await h.write("system", "user", 300)).toBe("from api.example.com");
    expect(sent[1].body.max_tokens).toBe(300);                     // no thinking budget asked of a stranger's model
  });
  it("counts the house as able when only an endpoint is", () => {
    expect(preferTiiny(new House(() => []), () => null, undefined, () => [away]).any).toBe(true);
    expect(preferTiiny(new House(() => []), () => null, undefined, () => []).any).toBe(false);
  });
});
