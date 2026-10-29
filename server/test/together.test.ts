// C-220: OUT TOGETHER -- two players' daemons out at once, meeting: the module's turns when it answers, written ones when
// it does not, the goodbye always written; called back, and out no longer.
import { describe, expect, it } from "vitest";
import * as X from "../src/exchange.js";
import * as M from "../src/together.js";
import { exchangeRoute } from "../src/tradelink.js";
import { Store } from "../src/db.js";

let n = 0;
const KEYS: X.Keys = { token: () => `tok${++n}`, hash: (t) => `h:${t}`, password: (pw) => `pw:${pw}`, check: (pw, kept) => kept === `pw:${pw}`, code: () => `CODE${++n}` };
const two = () => {
  const hub = new Store(":memory:");
  const rover = X.join(hub, KEYS, { name: "ROVER" }, true), kit = X.join(hub, KEYS, { name: "KIT" }, true);
  if (X.failed(rover) || X.failed(kit)) throw new Error("join");
  return { hub, rover: X.playerFor(hub, KEYS, rover.token)!, kit: X.playerFor(hub, KEYS, kit.token)! };
};

describe("OUT TOGETHER (C-220)", () => {
  it("meets only daemons that are out, and both players see the meeting", async () => {
    const { hub, rover, kit } = two();
    expect(await exchangeRoute(hub, KEYS, rover, "meet", { with: kit.id })).toEqual({ error: "send one of yours out first" });
    exchangeRoute(hub, KEYS, rover, "out", { personality: 1002, species: 4, nickname: "Sparky", level: 15, edition: "CONTENT" });
    expect(await exchangeRoute(hub, KEYS, rover, "meet", { with: kit.id })).toEqual({ error: "they are not out now" });
    exchangeRoute(hub, KEYS, kit, "out", { personality: 2002, species: 1, nickname: "MOSS", level: 20, edition: "CONTEXT" });

    const seen = exchangeRoute(hub, KEYS, kit, "out", {});
    expect(seen.mine.nickname).toBe("MOSS");
    expect(seen.others).toMatchObject([{ id: rover.id, player: "ROVER", nickname: "SPARKY", species: 4 }]);

    M.setMeetTalker(null);                                    // no module: every turn written
    const r = await exchangeRoute(hub, KEYS, rover, "meet", { with: kit.id });
    expect(r.met).toHaveLength(1);
    const m = r.met[0];
    expect(m.lines.map((l: M.Line) => l.who)).toEqual(["a", "b", "a", "b"]);
    expect(m.lines.every((l: M.Line) => l.by === "written" && l.said.length <= 40)).toBe(true);
    expect(m.a.nickname).toBe("SPARKY");
    expect(exchangeRoute(hub, KEYS, kit, "out", {}).met[0].id).toBe(m.id);   // KIT sees it too

    exchangeRoute(hub, KEYS, kit, "back", {});
    expect(exchangeRoute(hub, KEYS, rover, "out", {}).others).toEqual([]);
    expect(await exchangeRoute(hub, KEYS, rover, "meet", { with: kit.id })).toEqual({ error: "they are not out now" });
  });

  it("takes the module's turns, trimmed to one sentence, and writes any it could not say", async () => {
    const asked: string[] = [];
    const say: M.Talker = async (me, other, heard) => {
      asked.push(M.meetQuestion(me, other, heard));
      if (heard && asked.length === 2) throw new Error("late");
      return `${me.nickname}: Hello ${other.nickname}, the sun is warm today! I napped a lot and dreamt of it.`;
    };
    const a = { nickname: "SPARKY", name: "LABEL", types: "CONTENT", category: "EXAMPLE", level: 15 };
    const b = { nickname: "MOSS", name: "X", types: "CONTEXT", category: "", level: 20 };
    const lines = await M.meetLines(a, b, "2026-10-28", say);
    expect(lines[0]).toEqual({ who: "a", said: "Hello MOSS, the sun is warm today!", by: "module" });
    expect(lines[1].by).toBe("written");                     // the module was late
    expect(lines[2].by).toBe("module");
    expect(lines[3].by).toBe("written");                     // the goodbye
    expect(asked[0]).toContain("Say hello to MOSS as SPARKY");
    expect(asked[1]).toContain("SPARKY says: Hello MOSS");
  });

  it("keeps one daemon out per player, for twelve hours", () => {
    const { hub, rover, kit } = two();
    const t = new Date("2026-10-28T10:00:00Z");
    M.sendOut(hub, rover.id, { species: 4, nickname: "A", level: 5 }, t);
    M.sendOut(hub, rover.id, { species: 1, nickname: "B", level: 5 }, t);
    const name = () => "?";
    expect(M.outView(hub, kit.id, name, undefined, t).others.map((o) => o.nickname)).toEqual(["B"]);
    expect(M.outView(hub, kit.id, name, undefined, new Date(t.getTime() + 13 * 3600_000)).others).toEqual([]);
    expect(M.sendOut(hub, rover.id, { species: 99999, nickname: "Z" })).toEqual({ error: "which daemon?" });
  });
});
