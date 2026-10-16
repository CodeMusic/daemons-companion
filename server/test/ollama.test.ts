import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeServer } from "../src/api.js";
import { DEFAULTS } from "../src/config.js";
import { DEFAULT_MODEL, QUIET, chatReply, heard, modelOf, pick, tags, type AgentDaemon } from "../src/ollama.js";
import { buildSave } from "./build_save.js";

const d = (nickname: string): AgentDaemon => ({ model: modelOf(nickname), nickname, name: "", types: "", category: "", entry: "" });

describe("the daemon as Home Assistant's agent: Ollama's shapes (C-142)", () => {
  it("names a daemon as Ollama names a model", () => {
    expect(modelOf("PIP")).toBe("pip:latest");
    expect(modelOf("LIL ENDIAN!")).toBe("lil-endian:latest");
    expect(modelOf("??")).toBe("daemon:latest");
  });

  it("takes `daemon` as the default, any other by its name, and an unknown one as the default", () => {
    const pip = d("PIP"), label = d("LABEL");
    expect(pick(DEFAULT_MODEL, [pip, label], label)).toBe(label);
    expect(pick("daemon", [pip, label], label)).toBe(label);
    expect(pick("pip:latest", [pip, label], label)).toBe(pip);
    expect(pick("llama3:8b", [pip, label], label)).toBe(label);
    expect(tags([pip]).models.map((m) => m.name)).toEqual(["daemon:latest", "pip:latest"]);
  });

  it("hears the last thing said, with the words before it and never the system prompt or the tools", () => {
    const h = heard([
      { role: "system", content: "You are a voice assistant for Home Assistant..." },
      { role: "user", content: "hello" }, { role: "assistant", content: "hi" },
      { role: "tool", content: "{}" }, { role: "user", content: "  how are you?  " },
    ]);
    expect(h.text).toBe("how are you?");
    expect(h.history).toEqual([{ role: "user", content: "hello" }, { role: "assistant", content: "hi" }]);
    expect(heard([{ role: "system", content: "x" }]).text).toBe("");
  });

  it("answers as Ollama does: one object, or a line of words and a closing line", () => {
    const one = JSON.parse(chatReply("daemon:latest", "Hi.", false));
    expect(one).toMatchObject({ model: "daemon:latest", done: true, message: { role: "assistant", content: "Hi." } });
    const lines = chatReply("daemon:latest", "Hi.", true).trim().split("\n").map((l) => JSON.parse(l));
    expect(lines.map((l) => [l.message.content, l.done])).toEqual([["Hi.", false], ["", true]]);
  });
});

describe("Home Assistant's way in, through the companion (C-142)", () => {
  const BOX = "esp32-s3-box-3-a1b2c3";
  const save = buildSave({ player: "ROVER", trainerId: 0x00ab1234, slots: [
    { counter: 1, party: [{ personality: 0x12345678, otId: 0x00ab1234, species: 1, nickname: "PIP", level: 12, away: true },
                          { personality: 0x0000002f, otId: 0x00ab1234, species: 4, nickname: "LABEL", level: 9, away: true }] },
    { counter: 0, party: [] }] });
  const path = join(mkdtempSync(join(tmpdir(), "ollama-")), "copy.sav");
  writeFileSync(path, save);
  const server = makeServer({ ...DEFAULTS, database: ":memory:", savePath: path });
  let base = "", door = "";
  beforeAll(async () => {
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const s = await fetch(base + "/api/settings/home").then((r) => r.json());
    door = s.agent.path;
    expect(s.agent.url).toBeNull();                                        // not on the network in a test
  });
  afterAll(() => server.close());
  const chat = (body: unknown) => fetch(base + door + "/api/chat", { method: "POST", body: JSON.stringify(body) });

  it("gives SETTINGS the address to give Home Assistant, with its key", () => {
    expect(door).toMatch(/^\/ollama\/[A-Za-z0-9_-]{16,64}$/);
  });

  it("lists the daemons away as models, and answers to Ollama's checks", async () => {
    expect(await fetch(base + door + "/").then((r) => r.text())).toBe("Ollama is running");
    expect((await fetch(base + door + "/api/version").then((r) => r.json())).version).toMatch(/^\d+\.\d+/);
    const t = await fetch(base + door + "/api/tags").then((r) => r.json());
    expect(t.models.map((m: any) => m.name)).toEqual(["daemon:latest", "pip:latest", "label:latest"]);
  });

  it("is not there without its key, or through the relay", async () => {
    expect((await fetch(base + "/ollama/not-the-key-at-all-xx/api/tags")).status).toBe(404);
    expect((await fetch(base + door + "/api/tags", { headers: { "x-companion-relay": "x" } })).status).toBe(404);
  });

  it("means the BOX-3's own daemon by `daemon`, once a BOX-3 carries one", async () => {
    const who = async () => (await fetch(base + door + "/api/show", { method: "POST", body: JSON.stringify({ model: "daemon" }) })
      .then((r) => r.json())).model_info["general.basename"];
    expect(await who()).toBe("PIP");                                          // no BOX-3 yet: the first away
    await fetch(`${base}/api/device/face?device=${BOX}&via=wifi`);            // the box asks, and is given one
    await fetch(base + "/api/devices/carry", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: BOX, personality: 0x0000002f }) });
    expect(await who()).toBe("LABEL");
  });

  it("answers a chat in Ollama's stream, and still answers when the talk cannot be reached", async () => {
    const r = await chat({ model: "daemon:latest", messages: [{ role: "system", content: "..." }, { role: "user", content: "Who are you?" }] });
    expect(r.headers.get("content-type")).toBe("application/x-ndjson");
    const lines = (await r.text()).trim().split("\n").map((l) => JSON.parse(l));
    expect(lines[0].message.content).toBe(QUIET);                          // no talk server in a test
    expect(lines.at(-1).done).toBe(true);
    const one = await chat({ model: "pip:latest", stream: false, messages: [{ role: "user", content: "hi" }] }).then((x) => x.json());
    expect(one).toMatchObject({ model: "pip:latest", done: true });
  });
});
