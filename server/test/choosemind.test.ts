// C-480 (the user, 2026-11-22, by multiple choice): the daemon chooses its mind -- it weighs the job's size and kind, how
// each mind has been doing, the job's privacy and cost; with none fitting, the job waits for one (LATER). Off, as before.
import { beforeEach, describe, expect, it } from "vitest";
import { choose, COOL_MS, forgetHistory, MIND_POWER, order, record, speedOf, type Mind } from "../src/machine/thoughtroute.js";
import { preferTiiny } from "../src/machine/tiinyfirst.js";
import type { House } from "../src/machine/house.js";

const said = (t: string) => async () => t;
const TIINY: Mind = { name: "the Tiiny", power: MIND_POWER.tiiny, home: true, ask: said("tiiny") };
const CLOUD: Mind = { name: "OpenRouter", power: MIND_POWER.endpoint, home: false, paid: true, ask: said("cloud") };
const STUDIO: Mind = { name: "the studio", power: MIND_POWER.endpoint, home: true, ask: said("studio") };
const PHONE: Mind = { name: "a phone", power: MIND_POWER.phone, home: true, ask: said("phone") };
const MODULE: Mind = { name: "the house's module", power: MIND_POWER.module, home: true, ask: said("module") };
const none = () => 0, names = (m: Mind[]) => m.map((x) => x.name);

describe("C-480: the daemon chooses its mind", () => {
  beforeEach(() => forgetHistory());
  it("a private job goes only to minds at home", () => {
    expect(names(choose([CLOUD, TIINY, PHONE], none, { size: 100, private: true }))).toEqual(["the Tiiny", "a phone"]);
    expect(names(choose([CLOUD], none, { size: 100, private: true }))).toEqual([]);              // none: it waits
  });
  it("a mind that may cost goes after every free one, however strong", () => {
    expect(names(choose([CLOUD, MODULE], none, { size: 100 }))).toEqual(["the house's module", "OpenRouter"]);
    expect(names(order([CLOUD, MODULE], none))).toEqual(["OpenRouter", "the house's module"]);   // off: as before
  });
  it("a mind whose last three failed rests a while, then is asked again", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) record("the Tiiny", false, undefined, t0);
    expect(names(choose([TIINY, PHONE], none, { size: 100 }, t0 + 1000))).toEqual(["a phone"]);
    expect(names(choose([TIINY, PHONE], none, { size: 100 }, t0 + COOL_MS + 1))[0]).toBe("the Tiiny");
  });
  it("someone waiting: the quickest lately is worth more; a long write: the most power", () => {
    for (let i = 0; i < 3; i++) { record("the studio", true, 1500); record("the Tiiny", true, 40_000); }
    expect(speedOf("the studio")).toBe(1500);
    expect(names(choose([TIINY, STUDIO], none, { size: 100, quick: true }))[0]).toBe("the studio");
    expect(names(choose([TIINY, STUDIO], none, { size: 20_000 }))[0]).toBe("the Tiiny");
  });
  it("in the house's write: off keeps the score's order; on, a private write waits (LATER) until it is stopped", async () => {
    class FakeHouse { get any() { return true; } async talk() { return {}; } async voice() { return null; } async transcribe() { return null; }
                      async write() { return "module"; } }
    const house = new FakeHouse() as unknown as House;
    let on = false;
    const cloud = [{ e: { id: "c", name: "OpenRouter", url: "https://openrouter.ai/api/v1", key: "k", model: "m" }, model: "m", home: false }];
    preferTiiny(house, () => null, undefined, () => cloud as any, () => [], () => 0, () => on);
    const ctl = new AbortController(), hops: string[] = [];
    on = true;
    const w = house.write("s".repeat(3000), "u".repeat(3000), 100, { private: true, signal: ctl.signal, by: (m) => hops.push(m) });
    await new Promise((r) => setTimeout(r, 50));
    expect(hops).toEqual(["LATER: waiting for a fitting mind"]);   // too long for the module, and the cloud is not home
    ctl.abort();
    await expect(w).rejects.toThrow(/stopped/);
  });
});
