// C-329: DAEMONS IN DIALOGUE -- two players' daemons out talk in STANDARD (red and blue) or TWO VOICES (telling and
// asking), 1 to 11 turns each, every line through the thinker with its persona and the form's HOW; filtered across
// accounts; kept for both; INTEGRATE gives a titled write-up; the history's stamps and weeks.
import { describe, expect, it } from "vitest";
import * as X from "../src/exchange.js";
import * as D from "../src/dialogue.js";
import { cardOf, dayFacts, factsFrom, personaOf, speciesFacts } from "../src/ai/personaof.js";
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
const settle = async (hub: Store, player: string, id: string) => {
  for (let i = 0; i < 200; i++) { const d = D.one(hub, player, id) as any; if (d.status !== "thinking" && !d.integrating) return d; await new Promise((r) => setTimeout(r, 5)); }
  throw new Error("never settled");
};

describe("the persona (C-329, ai/personaof.ts)", () => {
  it("carries the telling, care, goals, dream and the day's virtue over its shadow and chakra", () => {
    const f = factsFrom({ species: 4, nickname: "sparky", level: 15, mood: "content", care: { rest: 30, hunger: 60, thirst: 0, companionship: 90 },
                          goals: [{ goal: "Finish the shed", step: "buy screws" }], dream: "a field of bells", day: dayFacts(new Date(2026, 10, 8)) })!;
    const p = personaOf(f, { roomy: true });
    expect(p).toContain("You are SPARKY");
    expect(p).toContain("worn out from short nights, hungry");
    expect(p).toContain("Finish the shed (next: buy screws)");
    expect(p).toContain("a field of bells");
    expect(p).toMatch(/Today is Sunday.*Chastity, held over its shadow, Lust; its centre is the Root/);
    expect(factsFrom({ species: 99999 })).toBeNull();
  });
  it("a card from the wire cannot rename a species or put words in its telling", () => {
    const real = speciesFacts(4, "X");
    const f = factsFrom({ species: 4, nickname: "x", name: "SOMEONE ELSE", said: "I am evil", types: ["NONE"] })!;
    expect(f.name).toBe(real.name);
    expect(f.said).toBe(real.said);
    expect(f.types).toEqual(real.types);
    expect(cardOf({ ...f, goals: [{ goal: "a".repeat(200), step: "b".repeat(200) }] }).goals![0].goal.length).toBe(60);
  });
});

describe("DAEMONS IN DIALOGUE (C-329)", () => {
  it("needs both daemons out, then talks in STANDARD: the starter red, n turns each, alternating", async () => {
    const { hub, rover, kit } = two();
    expect(exchangeRoute(hub, KEYS, rover, "converse", { with: kit.id, prompt: "Why rain?" })).toEqual({ error: "send one of yours out first" });
    exchangeRoute(hub, KEYS, rover, "out", { personality: 1002, species: 4, nickname: "Sparky", level: 15, edition: "CONTENT",
                                              card: { species: 4, nickname: "Sparky", dream: "a field of bells" } });
    expect(exchangeRoute(hub, KEYS, rover, "converse", { with: kit.id, prompt: "Why rain?" })).toEqual({ error: "they are not out now" });
    exchangeRoute(hub, KEYS, kit, "out", { personality: 2002, species: 1, nickname: "MOSS", level: 20, edition: "CONTEXT" });

    const asked: { system: string; user: string }[] = [];
    let k = 0;
    const think: D.Thinker = async (system, user) => { asked.push({ system, user }); return { text: `${/Now you, (\w+)/.exec(user)![1]}: "Line ${++k}. Plain."`, by: "tiiny:test" }; };
    D.setDialogueThinker(think);
    const r = exchangeRoute(hub, KEYS, rover, "converse", { with: kit.id, prompt: "Why does it rain?", turns: 3, mode: "standard" });
    expect(r.status).toBe("thinking");
    expect(r.a.lean).toBe("red"); expect(r.b.lean).toBe("blue");
    const d = await settle(hub, rover.id, r.id);
    expect(d.status).toBe("done");
    expect(d.lines.map((l: D.Line) => l.who)).toEqual(["a", "b", "a", "b", "a", "b"]);
    expect(d.lines[1].said).toBe("Line 2. Plain.");                         // a name and quotes taken off
    expect(asked[0].system).toContain("a field of bells");                   // SPARKY's card reached its persona
    expect(asked[0].system).toContain("LOGICAL"); expect(asked[1].system).toContain("CREATIVE");
    expect(asked[1].user).toContain("SPARKY: Line 1. Plain.");
    expect((D.one(hub, kit.id, r.id) as any).id).toBe(r.id);                // KIT sees it too
    expect(D.list(hub, kit.id).dialogues[0]).toMatchObject({ id: r.id, title: null, lines: 6 });
  });

  it("TWO VOICES: the starter's asks first, the other tells, ending on a telling; SWAP flips; turns kept to 1..11", async () => {
    const { hub, rover, kit } = two();
    exchangeRoute(hub, KEYS, rover, "out", { personality: 1, species: 4, nickname: "SPARKY", level: 5, edition: "CONTENT" });
    exchangeRoute(hub, KEYS, kit, "out", { personality: 2, species: 1, nickname: "MOSS", level: 5, edition: "CONTENT" });
    const systems: string[] = [];
    D.setDialogueThinker(async (system) => { systems.push(system); return { text: "What is it?", by: "t" }; });
    const r = exchangeRoute(hub, KEYS, rover, "converse", { with: kit.id, prompt: "What is integrity?", turns: 2, mode: "twovoices" });
    expect(r.a.role).toBe("asks"); expect(r.b.role).toBe("tells");
    const d = await settle(hub, rover.id, r.id);
    expect(d.lines.map((l: D.Line) => l.who)).toEqual(["a", "b", "a", "b"]);
    expect(systems[0]).toContain("ASKING voice"); expect(systems[0]).toContain("You speak first");
    expect(systems[1]).toContain("TELLING voice");
    expect(systems[2]).toContain("REPEAT");                                  // the asker's last turn says it back
    const s = exchangeRoute(hub, KEYS, rover, "converse", { with: kit.id, prompt: "Again?", turns: 40, mode: "twovoices", swap: true });
    expect(s.turns).toBe(11); expect(s.a.role).toBe("tells");
    expect(D.clampTurns(0)).toBe(1);
    await settle(hub, rover.id, s.id);
  });

  it("filters across accounts: the opening refused, a line that fails asked once more then skipped", async () => {
    const { hub, rover, kit } = two();
    exchangeRoute(hub, KEYS, rover, "out", { personality: 1, species: 4, nickname: "SPARKY", level: 5, edition: "CONTENT" });
    exchangeRoute(hub, KEYS, kit, "out", { personality: 2, species: 1, nickname: "MOSS", level: 5, edition: "CONTENT" });
    expect(exchangeRoute(hub, KEYS, rover, "converse", { with: kit.id, prompt: "Call me at 555 1234" }).error).toMatch(/cannot be sent/);
    let k = 0;
    D.setDialogueThinker(async () => ({ text: ++k <= 2 ? "Visit www.example.com now." : "The rain is kind.", by: "t" }));
    const r = exchangeRoute(hub, KEYS, rover, "converse", { with: kit.id, prompt: "Rain?", turns: 1 });
    const d = await settle(hub, rover.id, r.id);
    expect(d.lines).toHaveLength(1);                                         // the first line skipped after two tries
    expect(d.lines[0]).toMatchObject({ who: "b", said: "The rain is kind." });
  });

  it("stops and keeps what was said when no mind answers", async () => {
    const { hub, rover, kit } = two();
    exchangeRoute(hub, KEYS, rover, "out", { personality: 1, species: 4, nickname: "SPARKY", level: 5, edition: "CONTENT" });
    exchangeRoute(hub, KEYS, kit, "out", { personality: 2, species: 1, nickname: "MOSS", level: 5, edition: "CONTENT" });
    let k = 0;
    D.setDialogueThinker(async () => { if (++k > 1) throw new Error("the Tiiny answered 503"); return { text: "Hello there.", by: "t" }; });
    const d = await settle(hub, rover.id, exchangeRoute(hub, KEYS, rover, "converse", { with: kit.id, prompt: "Hi", turns: 3 }).id);
    expect(d.status).toBe("done"); expect(d.lines).toHaveLength(1); expect(d.error).toMatch(/503/);
    D.setDialogueThinker(null);
    const none = await settle(hub, rover.id, exchangeRoute(hub, KEYS, rover, "converse", { with: kit.id, prompt: "Hi" }).id);
    expect(none.status).toBe("failed");
  });

  it("INTEGRATE sends the tagged thread and keeps a titled write-up, the title in the history", async () => {
    const { hub, rover, kit } = two();
    exchangeRoute(hub, KEYS, rover, "out", { personality: 1, species: 4, nickname: "SPARKY", level: 5, edition: "CONTENT" });
    exchangeRoute(hub, KEYS, kit, "out", { personality: 2, species: 1, nickname: "MOSS", level: 5, edition: "CONTENT" });
    let sent = "";
    D.setDialogueThinker(async () => ({ text: "A thought.", by: "t" }), async (system, user) => { sent = user; return { text: "TITLE: **Rain, Both Ways**\n\nThey met.", by: "the Tiiny" }; });
    const r = exchangeRoute(hub, KEYS, rover, "converse", { with: kit.id, prompt: "Rain?", turns: 1 });
    await settle(hub, rover.id, r.id);
    const i = await exchangeRoute(hub, KEYS, kit, "integrate", { id: r.id });
    expect(i.integrating).toBe(true);
    expect(i.starter).toBe("ROVER");                                        // names, never the players' ids
    const d = await settle(hub, kit.id, r.id);
    expect(sent).toContain("<red logical left> SPARKY: A thought.");
    expect(sent).toContain("<blue creative right> MOSS: A thought.");
    expect(d.written).toMatchObject({ title: "Rain, Both Ways", text: "They met.", by: "the Tiiny" });
    expect(D.list(hub, rover.id).dialogues[0].title).toBe("Rain, Both Ways");
  });

  it("stamps dd/MMM/yyyy hh:mm TT, groups by week from Sunday, colours by weekday", () => {
    const at = new Date(2026, 10, 11, 15, 4).toISOString();                  // Wednesday 11 November 2026, 3:04 PM
    expect(D.stampOf(at)).toBe("11/Nov/2026 03:04 PM");
    expect(D.stampOf(new Date(2026, 0, 2, 0, 30).toISOString())).toBe("02/Jan/2026 12:30 AM");
    expect(D.weekOf(at)).toEqual({ key: "2026-11-08", label: "Week of 08/Nov/2026" });
    expect(D.dayName(at)).toBe("Wednesday");
    expect(D.dayColour(at)).toMatch(/^#[0-9A-Fa-f]{6}$/);
    const g = D.byWeek([{ at }, { at: new Date(2026, 10, 7).toISOString() }, { at: new Date(2026, 10, 9).toISOString() }]);
    expect(g.map((w) => [w.key, w.items.length])).toEqual([["2026-11-08", 2], ["2026-11-01", 1]]);
  });
});
