// C-180: the module's thinking through StackFlow -- the persona as the setup prompt, only what was said inferred; one
// thinker per persona, set up once (the first talk LATE while it is), at most two alive. A stand-in StackFlow on TCP.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:net";
import type { AddressInfo } from "node:net";
import { House, type TalkAsk } from "../src/ai/house.js";
import { LATE } from "../src/ai/module.js";
import { firstSentences, StackFlow } from "../src/ai/stackflow.js";
import { fakeModule } from "./fake_module.js";
import { GUIDE_SETUP } from "../src/guideask.js";

const seen: { action: string; data?: any; work_id?: string }[] = [];
let n = 1000;
const alive = new Set<string>(["llm.0999"]);              // an orphan, left by a server before a restart (a deploy)
const prompts = new Map<string, string>();
let slowFree = false;                                     // an exit's slot free only a moment later, as on the module
const flow: Server = createServer((s) => {
  let buf = "";
  s.on("data", (c) => {
    buf += c.toString();
    // the client writes whole objects back to back with no newline, as the module takes them
    for (let m: RegExpMatchArray | null; (m = buf.match(/^\{.*?\}(?=\{|$)/)); buf = buf.slice(m[0].length)) {
      let o: any; try { o = JSON.parse(m[0]); } catch { break; }
      seen.push(o);
      const out = (x: object) => s.write(JSON.stringify(x) + "\n");
      if (o.action === "taskinfo") out({ request_id: o.request_id, work_id: "llm", data: [...alive], error: { code: 0 } });
      if (o.action === "setup") {
        if (alive.size >= 2) { out({ request_id: o.request_id, work_id: "llm", error: { code: -21, message: "task full" } }); continue; }
        const w = `llm.${++n}`; alive.add(w); prompts.set(w, o.data.prompt);
        out({ request_id: o.request_id, work_id: w, error: { code: 0 } });
      }
      if (o.action === "inference") {
        if (!alive.has(o.work_id)) { out({ work_id: o.work_id, error: { code: -9, message: "unit not found" } }); continue; }
        const who = /You are (\w+)/.exec(prompts.get(o.work_id) ?? "")?.[1];
        out({ work_id: o.work_id, data: { delta: `I am ${who}`, index: 0, finish: false }, error: { code: 0 } });
        out({ work_id: o.work_id, data: { delta: ".", index: 1, finish: true }, error: { code: 0 } });
      }
      if (o.action === "exit") {
        const w = o.work_id;
        if (slowFree) setTimeout(() => alive.delete(w), 300); else alive.delete(w);
        out({ work_id: w, error: { code: 0 } });
      }
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
  it("lets go the instances a server before it left (a deploy) -- and never holds more than the two slots", async () => {
    expect(alive.has("llm.0999")).toBe(false);              // let go on the first talk above
    expect(alive.size).toBeLessThanOrEqual(2);
  });
  it("keeps one thinker per daemon, at most two, letting the oldest go", async () => {
    const sf = new StackFlow("127.0.0.1", port);
    const h = new House(() => [{ url: modUrl, name: "m" }], undefined, () => sf);
    expect((await h.talk(ask("STARR"), null)).answer).toBe("I am STARR.");
    expect((await h.talk(ask("EMBER"), null)).answer).toBe("I am EMBER.");
    expect((await h.talk(ask("ROVERCUB"), null)).answer).toBe("I am ROVERCUB.");   // the oldest let go first: no "task full"
    expect(alive.size).toBeLessThanOrEqual(2);
  });
  it("on task full, lets go what is not its own and tries once more", async () => {
    const sf = new StackFlow("127.0.0.1", port);
    const h = new House(() => [{ url: modUrl, name: "m" }], undefined, () => sf);
    await h.talk(ask("STARR"), null);                        // its first look: orphans let go, one thinker of its own
    alive.add("llm.0998"); alive.add("llm.0997");            // then two strays take the slots (another server, the plugin)
    expect((await h.talk(ask("EMBER"), null)).answer).toBe("I am EMBER.");
    expect(h.faults.taskFull).toBe(1);
  });
  it("a new daemon after two: the slot let go is asked for again until it is free -- never n8n's error at once", async () => {
    slowFree = true;
    try {
      const sf = new StackFlow("127.0.0.1", port);
      const h = new House(() => [{ url: modUrl, name: "m" }], undefined, () => sf);
      for (const who of ["SEEKMUSAI", "CODEMUSAI", "STARR", "EMBER"]) expect((await h.talk(ask(who), null)).answer).toBe(`I am ${who}.`);
    } finally { slowFree = false; }
  });
  it("with nowhere else to go, two talks at once both answer: the second waits for the module", async () => {
    const sf = new StackFlow("127.0.0.1", port);
    const h = new House(() => [{ url: modUrl, name: "m" }], undefined, () => sf);
    const [a, b] = await Promise.all([h.talk(ask("SEEKMUSAI"), null), h.talk(ask("CODEMUSAI"), null)]);
    expect([a.answer, b.answer]).toEqual(["I am SEEKMUSAI.", "I am CODEMUSAI."]);
  });
  it("C-209: one GUIDE thinker, set up once with a short prompt; the pages ride with each question", async () => {
    const sf = new StackFlow("127.0.0.1", port);
    const h = new House(() => [{ url: modUrl, name: "m" }], undefined, () => sf);
    const before = seen.filter((x) => x.action === "setup").length;
    const guide = (q: string) => ({ ...ask("SEEKMUSAI"), text: q, guide: (heard: string) => `Page "${heard}": words` });
    await h.talk(guide("sleep"), null);
    await h.talk(guide("dreams"), null);
    const setups = seen.filter((x) => x.action === "setup").slice(before);
    expect(setups).toHaveLength(1);
    expect(setups[0].data.prompt).toBe(GUIDE_SETUP);
    expect(seen.filter((x) => x.action === "inference").at(-1)!.data).toBe('From THE GUIDE: Page "dreams": words Question: dreams');
  });
  it("warms the daemon carried and the GUIDE ahead, so the first talk keeps its deadline; never over one talked to lately", async () => {
    const sf = new StackFlow("127.0.0.1", port);
    let t = 1_000_000;
    const h = new House(() => [{ url: modUrl, name: "m" }], () => t, () => sf);
    await h.warm([ask("WARMED"), { ...ask("x"), guide: () => "" }]);
    t += 1000;
    expect((await h.talk(ask("WARMED"))).answer).toBe("I am WARMED.");        // within the deadline: no LATE
    expect((await h.talk(ask("OTHER"), null)).answer).toBe("I am OTHER.");    // the GUIDE, never talked to, let go
    const before = seen.filter((x) => x.action === "setup").length;
    await h.warm([{ ...ask("x"), guide: () => "" }]);                       // both talked to just now: left be
    expect(seen.filter((x) => x.action === "setup").length).toBe(before);
    t += 31 * 60_000;
    await h.warm([{ ...ask("x"), guide: () => "" }]);                       // half an hour on: the GUIDE warmed again
    expect(seen.filter((x) => x.action === "setup").length).toBe(before + 1);
  });
  it("a thinker gone under it (the llm unit restarted) is set up again, and the talk still answers", async () => {
    const sf = new StackFlow("127.0.0.1", port);
    const h = new House(() => [{ url: modUrl, name: "m" }], undefined, () => sf);
    expect((await h.talk(ask("PHOENIX"), null)).answer).toBe("I am PHOENIX.");
    alive.clear();                                                           // systemd brought llm-llm back: nothing alive
    expect((await h.talk(ask("PHOENIX"), null)).answer).toBe("I am PHOENIX.");
  });
  it("after its own restart (a deploy) takes up the thinkers it set up, instead of setting them up again", async () => {
    const kept = new Map<string, any>();
    const store = { load: (u: string) => kept.get(u) ?? [], save: (u: string, h: any) => kept.set(u, JSON.parse(JSON.stringify(h))) };
    const first = new House(() => [{ url: modUrl, name: "m" }], undefined, () => sf1, store), sf1 = new StackFlow("127.0.0.1", port);
    expect((await first.talk(ask("KEEPER"), null)).answer).toBe("I am KEEPER.");
    sf1.reset();                                                            // the server went away
    const before = seen.filter((x) => x.action === "setup").length;
    const sf2 = new StackFlow("127.0.0.1", port), again = new House(() => [{ url: modUrl, name: "m" }], undefined, () => sf2, store);
    expect((await again.talk(ask("KEEPER"))).answer).toBe("I am KEEPER.");   // within the deadline: no setup, no LATE
    expect(seen.filter((x) => x.action === "setup").length).toBe(before);
  });
  it("thinks through the plugin as before when there is no StackFlow there", async () => {
    const h = new House(() => [{ url: modUrl, name: "m" }], undefined, () => new StackFlow("127.0.0.1", 9));
    expect((await h.talk(ask("SEEKMUSAI"), null)).answer).toBe("Good morning!");
  });
});

describe("an answer cut to its first sentences (p256 runs on)", () => {
  it("gives the first two once both are finished and more follows, and whatever there is at the end", () => {
    expect(firstSentences("Hello there. I dreamt of", 2)).toBeNull();
    expect(firstSentences("Hello there. I dreamt of rain.", 2)).toBeNull();          // still streaming: the end may grow
    expect(firstSentences("Hello there. I dreamt of rain. And then", 2)).toBe("Hello there. I dreamt of rain.");
    expect(firstSentences("Hello there! Is it 3.5 degrees? Yes.", 2, true)).toBe("Hello there! Is it 3.5 degrees?");
    expect(firstSentences("Only one", 2, true)).toBe("Only one");
    expect(firstSentences("\u201cHi.\u201d Then more. More.", 2, true)).toBe("\u201cHi.\u201d Then more.");
    const long = "I walked along the shore all morning and counted every shell the tide had left for me. Then I slept.";
    expect(firstSentences(long, 2)).toBe("I walked along the shore all morning and counted every shell the tide had left for me.");   // long: one
    expect(firstSentences("word ".repeat(50), 2)).toMatch(/^(word ){33}word\u2026$/);                                        // never ends: cut
    expect(firstSentences("Hi. Me too", 2, true)).toBe("Hi.");                                                                 // the end: whole ones
  });
});
