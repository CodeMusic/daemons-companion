// C-180: the module's thinking through StackFlow -- the persona as the setup prompt, only what was said inferred; one
// thinker per persona, set up once (the first talk LATE while it is), at most two alive. A stand-in StackFlow on TCP.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:net";
import type { AddressInfo } from "node:net";
import { House, type TalkAsk } from "../src/ai/house.js";
import { LATE } from "../src/ai/module.js";
import { StackFlow } from "../src/ai/stackflow.js";
import { fakeModule } from "./fake_module.js";

const seen: { action: string; data?: any; work_id?: string }[] = [];
let n = 1000;
const flow: Server = createServer((s) => {
  let buf = "";
  s.on("data", (c) => {
    buf += c.toString();
    // the client writes whole objects back to back with no newline, as the module takes them
    for (let m: RegExpMatchArray | null; (m = buf.match(/^\{.*?\}(?=\{|$)/)); buf = buf.slice(m[0].length)) {
      let o: any; try { o = JSON.parse(m[0]); } catch { break; }
      seen.push(o);
      const out = (x: object) => s.write(JSON.stringify(x) + "\n");
      if (o.action === "setup") out({ request_id: o.request_id, work_id: `llm.${++n}`, error: { code: 0 } });
      if (o.action === "inference") {
        const who = /You are (\w+)/.exec(seen.find((x) => x.action === "setup" && `llm.${1000 + seen.filter((y) => y.action === "setup").indexOf(x) + 1}` === o.work_id)?.data.prompt ?? "")?.[1];
        out({ work_id: o.work_id, data: { delta: `I am ${who}`, index: 0, finish: false }, error: { code: 0 } });
        out({ work_id: o.work_id, data: { delta: ".", index: 1, finish: true }, error: { code: 0 } });
      }
      if (o.action === "exit") out({ work_id: o.work_id, error: { code: 0 } });
    }
  });
});
let mod: import("node:http").Server, modUrl = "", port = 0;
beforeAll(async () => {
  await new Promise<void>((r) => flow.listen(0, "127.0.0.1", () => r())); port = (flow.address() as AddressInfo).port;
  mod = fakeModule(); await new Promise<void>((r) => mod.listen(0, "127.0.0.1", () => r()));
  modUrl = `http://127.0.0.1:${(mod.address() as AddressInfo).port}`;
});
afterAll(() => { flow.close(); mod.close(); });

const ask = (nickname: string): TalkAsk => ({ text: "What is your name?", history: [], speak: false,
  daemon: { nickname, types: "VECTOR", mood: "happy", fed: "fed 3" }, day: { day: "Wednesday" } });

describe("thinking through StackFlow (C-180)", () => {
  it("sets a daemon up with its persona once, LATE the first time when there is a deadline, then answers as it", async () => {
    const sf = new StackFlow("127.0.0.1", port);
    const h = new House(() => [{ url: modUrl, name: "m" }], undefined, () => sf);
    await expect(h.talk(ask("SEEKMUSAI"))).rejects.toThrow(LATE);          // setting up, in the background
    const r = await h.talk(ask("SEEKMUSAI"), null);
    expect(r.answer).toBe("I am SEEKMUSAI.");
    const setup = seen.find((x) => x.action === "setup")!;
    expect(setup.data.prompt).toMatch(/^You are SEEKMUSAI/);
    expect(setup.data.prompt).not.toMatch(/happy|fed 3/);                    // what changes within a day stays out
    expect(seen.find((x) => x.action === "inference")!.data).toBe("What is your name?");
    await h.talk(ask("SEEKMUSAI"));                                          // set up already: within the deadline
    expect(seen.filter((x) => x.action === "setup")).toHaveLength(1);
  });
  it("keeps one thinker per daemon, at most two, letting the oldest go", async () => {
    const sf = new StackFlow("127.0.0.1", port);
    const h = new House(() => [{ url: modUrl, name: "m" }], undefined, () => sf);
    expect((await h.talk(ask("STARR"), null)).answer).toBe("I am STARR.");
    expect((await h.talk(ask("EMBER"), null)).answer).toBe("I am EMBER.");
    await h.talk(ask("ROVERCUB"), null);
    await new Promise((r) => setTimeout(r, 50));
    expect(seen.filter((x) => x.action === "exit").length).toBeGreaterThanOrEqual(1);
  });
  it("thinks through the plugin as before when there is no StackFlow there", async () => {
    const h = new House(() => [{ url: modUrl, name: "m" }], undefined, () => new StackFlow("127.0.0.1", 9));
    expect((await h.talk(ask("SEEKMUSAI"), null)).answer).toBe("Good morning!");
  });
});
