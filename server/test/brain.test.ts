import { describe, expect, it } from "vitest";
import { Cerebellum, candidates, checkSignal, relay, ringAllows, type Host, type Question, type Signal } from "../src/machine/brain/signal.js";

// THE BRAIN's proof (docs/BRAIN.md 8): one signal, the same everywhere, relayed by the thalamus to a host for its region
const sig = (over: Partial<Signal>): Signal => ({ id: "s1", region: "salience", verb: "appraise", mode: "cognition", ring: "home",
  from: "cardputer-zero", at: "2026-11-24T20:00:00Z", ...over });

const HOSTS: Host[] = [
  { name: "kit", at: "body", regions: { salience: { power: 2 }, "cortex.language": { power: 2 } } },
  { name: "tiiny", at: "home", regions: { salience: { power: 30 }, "cortex.language": { power: 40 } } },
  { name: "jev", at: "world", regions: { salience: { power: 100 } } },
];

describe("THE BRAIN's signal", () => {
  it("knows its regions' verbs, and refuses anything else", () => {
    expect(typeof checkSignal(sig({}))).toBe("object");
    expect(checkSignal(sig({ verb: "speak" }))).toBe("salience has no verb speak");
    expect(checkSignal({ ...sig({}), region: "pineal" })).toBe("no region pineal");
    expect(checkSignal(sig({ salience: 2 }))).toBe("salience is 0..1");
  });

  it("keeps the blood-brain barrier: a home signal never reaches the world", () => {
    expect(ringAllows("home", "world")).toBe(false);
    expect(ringAllows("world", "home")).toBe(true);
    expect(candidates(sig({}), HOSTS, new Cerebellum()).map((h) => h.name)).toEqual(["tiiny", "kit"]);
    expect(candidates(sig({ ring: "world" }), HOSTS, new Cerebellum())[0].name).toBe("jev");
    expect(candidates(sig({ ring: "body" }), HOSTS, new Cerebellum()).map((h) => h.name)).toEqual(["kit"]);
  });

  it("relays a low-road appraisal and a high-road talk, each to the best host that answers", async () => {
    const c = new Cerebellum();
    const questions: Question[] = [{ kind: "choice", ask: "what is this?", options: ["care", "goal", "game", "small talk"] }];
    const ask = async (h: Host, s: Signal) => {
      if (h.name === "tiiny" && s.region === "salience") throw new Error("asleep");
      return s.region === "salience" ? [{ choice: "care", confidence: 0.8 }] : "a line";
    };
    const low = await relay(sig({ body: { state: "fed me", questions } }), HOSTS, c, ask);
    expect(low).toMatchObject({ ok: true, by: "kit" });
    const high = await relay(sig({ id: "s2", region: "cortex.language", verb: "speak", body: { length: "day" } }), HOSTS, c, ask);
    expect(high).toMatchObject({ ok: true, by: "tiiny", body: "a line" });
    expect(c.predict("tiiny", "salience").p).toBeLessThan(0.5);   // it failed once: the cerebellum remembers
  });

  it("passes a host the cerebellum expects to miss the deadline", () => {
    const c = new Cerebellum();
    for (let i = 0; i < 5; i++) { c.learn("tiiny", "salience", 9000, true); c.learn("kit", "salience", 300, true); }
    expect(candidates(sig({ deadlineMs: 1000 }), HOSTS, c)[0].name).toBe("kit");
    expect(candidates(sig({}), HOSTS, c)[0].name).toBe("tiiny");
  });

  it("says so when no host may take it", async () => {
    const r = await relay(sig({ region: "basal_ganglia", verb: "act" }), HOSTS, new Cerebellum(), async () => "never");
    expect(r).toMatchObject({ ok: false, by: "thalamus" });
  });
});
