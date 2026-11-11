import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { copyFileSync, mkdirSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeServer, today } from "../src/api.js";
import { DEFAULTS } from "../src/config.js";
import { Store } from "../src/db.js";
import { exampleBreakdown } from "../src/ai/breakdown.js";
import { buildSave } from "./build_save.js";

const dir = mkdtempSync(join(tmpdir(), "companion-"));
const savePath = join(dir, "copy.sav");
writeFileSync(savePath, buildSave({ player: "ROVER", trainerId: 7,
  slots: [{ counter: 1, party: [{ personality: 99, otId: 7, species: 1, nickname: "PIP", level: 5 }] },
          { counter: 0, party: [] }] }));
// the art the server serves at /art/ is DAEMONS' own (gfx/daemons, beside this repo on the Mac and nowhere on the hub,
// C-168), so the test gives it a folder of its own: one of our pictures under a daemon's name, and a file beside the
// folder that a path must never reach
const artDir = join(dir, "art");
mkdirSync(artDir);
copyFileSync(new URL("../data/art/rovercub.png", import.meta.url), join(artDir, "rovercub_front.png"));
writeFileSync(join(dir, "secret.png"), "not for the asking");
const cfg = { ...DEFAULTS, database: ":memory:", savePath, edition: "CONTEXT" as const, artDir };
const server = makeServer(cfg);
let base = "";

beforeAll(async () => {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

const get = (p: string) => fetch(base + p).then((r) => r.json());
const post = (p: string, b: unknown) =>
  fetch(base + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) }).then((r) => r.json());

describe("the server (C-04)", () => {
  it("adds a goal broken down, and holds one next step at a time", async () => {
    const { goal, breakdown } = await post("/api/goals", { title: "Tidy the garage", breakdown: true });
    expect(breakdown.example).toBe(true);                 // the AI is off by default: nothing was called
    expect(goal.subitems).toHaveLength(3);
    const t = await get("/api/today");
    expect(t.next.step.text).toBe("Write down what done looks like");
    const after = await post(`/api/steps/${t.next.step.id}/done`, {});
    expect(after.next.step.text).toBe("Gather what you need");
  });

  it("finishes a goal when its last step is ticked", () => {
    const s = new Store(":memory:");
    const g = s.addGoal("One thing", { subitems: [{ title: "it", steps: ["do it"] }] });
    s.completeStep(g.subitems[0].steps[0].id);
    expect(s.goal(g.id)!.done).toBe(true);
    expect(s.nextStep()).toBeNull();
  });

  it("knows the day and the edition's season", () => {
    const t = today(cfg, new Store(":memory:"), new Date(2026, 0, 4));   // a Sunday in January
    expect(t.day.day).toBe("Sunday");
    expect(t.day.note).toBe("C");
    expect(t.season).toBe("summer");                    // CONTEXT keeps the southern year
  });

  it("reads the party of the configured save copy", async () => {
    const p = await get("/api/party");
    expect(p.party[0].name).toBe("ROVERCUB");
    expect(p.party[0].nickname).toBe("PIP");
  });

  it("gives a daemon's INDEX entry in its edition's voice", async () => {
    const s = await get("/api/species/1");
    expect(s.name).toBe("ROVERCUB");
    expect(typeof s.entry).toBe("string");
    expect(s.entry.length).toBeGreaterThan(10);
  });

  it("gives what a daemon says of itself beside its entry, and speaks that when asked for its own (C-303)", async () => {
    const s = await get("/api/species/1");
    expect(s.said).toMatch(/\b(I|me|my)\b/);              // the first person; the record stays in the third
    expect(s.said).not.toBe(s.entry);
    const r = await post("/api/ai/speak", { species: 1, own: true });
    expect(r.answer).toBe(s.said);                         // the telling, not the INDEX entry
    expect((await post("/api/ai/speak", { species: 1 })).answer).toBeUndefined();   // the INDEX's reading, as before
  });

  it("refuses a goal without a title", async () => {
    expect((await post("/api/goals", {})).error).toMatch(/title/);
  });

  it("the example breakdown is marked as one", () => {
    expect(exampleBreakdown("x").example).toBe(true);
  });

  it("C-29: Settings reports the save path and its source, and setting one overrides config.json", async () => {
    const before = await get("/api/settings");
    expect(before.savePath).toBe(savePath);
    expect(before.source).toBe("config.json");
    expect(before.exists).toBe(true);
    const set = await post("/api/settings", { savePath: "/tmp/elsewhere.sav" });
    expect(set.savePath).toBe("/tmp/elsewhere.sav");
    expect(set.source).toBe("settings");
    expect(set.exists).toBe(false);                      // the party now reads the overridden path and finds nothing
    expect((await get("/api/party")).error).toMatch(/set it in Settings/);
    const cleared = await post("/api/settings", { savePath: "" });
    expect(cleared.source).toBe("config.json");          // back to config.json
    expect((await get("/api/party")).party[0].nickname).toBe("PIP");
  });
});

describe("the art (C-05)", () => {
  it("serves a daemon's art by a plain file name, and nothing else", async () => {
    const ok = await fetch(base + "/art/rovercub_front.png");
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toBe("image/png");
    expect((await fetch(base + "/art/..%2F..%2Fsecret.png")).status).toBe(404);
    expect((await fetch(base + "/art/..%2Fsecret.png")).status).toBe(404);                 // it is there, one up
    expect((await fetch(base + "/art/nobody_front.png")).status).toBe(404);
  });
});

describe("answering only what changed (C-177)", () => {
  it("tags each answer, and answers 304 with no body when the tag sent is the answer's", async () => {
    const first = await fetch(base + "/api/today");
    const tag = first.headers.get("etag");
    expect(first.status).toBe(200);
    expect(tag).toMatch(/^"[A-Za-z0-9_-]{16}"$/);
    const again = await fetch(base + "/api/today", { headers: { "if-none-match": tag! } });
    expect(again.status).toBe(304);
    expect(await again.text()).toBe("");
    expect(again.headers.get("etag")).toBe(tag);
    const stale = await fetch(base + "/api/today", { headers: { "if-none-match": '"not-this-one"' } });
    expect(stale.status).toBe(200);
    expect((await stale.json()).date).toBeDefined();
  });
});

describe("talk that never makes a device wait (C-180)", () => {
  it("answers ?async=1 at once with an id, and the answer is fetched by it", async () => {
    const r = await fetch(base + "/api/ai/speak?async=1", { method: "POST", headers: { "content-type": "application/json" },
                                                           body: JSON.stringify({ text: "A line to read." }) });
    expect(r.status).toBe(202);
    const { id, status } = await r.json();
    expect(status).toBe("waiting");
    let got: Record<string, unknown> = {};
    for (let i = 0; i < 50; i++) {
      got = await (await fetch(base + `/api/device/talk/${id}`)).json();
      if (got.status === "done" || got.status === "failed") break;
      await new Promise((ok) => setTimeout(ok, 20));
    }
    expect(["done", "failed"]).toContain(got.status);                // no n8n here: either way it ends, and says so
    expect((await fetch(base + "/api/device/talk/nothing-like-it")).status).toBe(404);
  });
});

// C-303 (the user, 2026-11-06): the phone keeps only the TRUE voice. The hub marks each voice `final` -- the Tiiny's, in
// the daemon's own recipe -- and a fallback not; and it names the voices' generation, so a phone's kept voices are made
// again when the recipes or the voice model change (ai/voices.ts VOICE_GENERATION, or MAKE THE VOICES AGAIN).
describe("the true voice, and the voices' generation (C-303)", () => {
  let tiiny: import("node:http").Server, tiinyBase = "", speechOk = true;
  const wav = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(40), Buffer.from([1, 2, 3])]);
  const asked: { input: string; instructions?: string }[] = [];   // C-323: what each voice was asked for
  beforeAll(async () => {
    const { createServer } = await import("node:http");
    tiiny = createServer((req, res) => {
      if (req.url === "/v1/models") { res.setHeader("content-type", "application/json"); return res.end(JSON.stringify({ data: [{ id: "tiiny-voice" }, { id: "tiiny-9b" }] })); }
      if (req.url === "/v1/audio/speech") {
        let raw = ""; req.on("data", (c) => { raw += c; });
        return req.on("end", () => { try { asked.push(JSON.parse(raw)); } catch { /* not ours */ }
          if (!speechOk) { res.statusCode = 503; return res.end(); } res.setHeader("content-type", "audio/wav"); res.end(wav); });
      }
      res.statusCode = 404; res.end();
    });
    await new Promise<void>((r) => tiiny.listen(0, "127.0.0.1", () => r()));
    tiinyBase = `http://127.0.0.1:${(tiiny.address() as AddressInfo).port}/v1`;
  });
  afterAll(async () => { await post("/api/talk/settings", { tiiny: { url: "" } }); tiiny.close(); });   // the tests after see no Tiiny

  it("marks the Tiiny's voice final, in the voices' generation, and a fallback not", async () => {
    const t = await post("/api/talk/settings", { tiiny: { url: tiinyBase, tts: "tiiny-voice", model: "tiiny-9b" } });
    expect(t.health.tiiny.ok).toBe(true);
    expect(t.voices).toBe("3.0");
    const r = await post("/api/ai/speak", { species: 1, own: true });
    expect(r.provider).toBe("tiiny:tiiny-voice");
    expect(r.final).toBe(true);
    expect(r.generation).toBe("3.0");
    expect(typeof r.audioBase64).toBe("string");
    speechOk = false;                                       // the Tiiny's voice away: whatever answers instead is not the voice meant
    const f = await post("/api/ai/speak", { species: 1, own: true });
    expect(f.final).toBe(false);
    expect(f.generation).toBe("3.0");
    speechOk = true;
  });

  it("reads words in the voice named, and never in parts (C-323)", async () => {
    await post("/api/talk/settings", { tiiny: { url: tiinyBase, tts: "tiiny-voice", model: "tiiny-9b" } });
    const { BOOK_VOICE } = await import("../src/ai/voiceof.js");
    asked.length = 0;
    await post("/api/ai/speak", { text: "A page of the book.", voice: "book:subtle" });
    expect(asked.at(-1)?.instructions).toBe(BOOK_VOICE.subtle);
    await post("/api/ai/speak", { text: "A page of my notes.", voice: "book:notebook" });
    expect(asked.at(-1)?.instructions).toContain("A young traveller's voice");
    await post("/api/ai/speak", { text: "A dream I had. It went on.", whole: true, voice: "player" });
    expect(asked.at(-1)?.instructions).toContain("A young traveller's voice");
    asked.length = 0;
    const r = await post("/api/ai/speak", { text: "One. Two, and then three. Four is a longer sentence than the others are.", daemon: true, stream: true });
    expect(r.stream).toMatch(/^\/api\/ai\/voice\//);
    expect(asked).toHaveLength(1);                          // the whole answer in one voice, not a voice a sentence
    expect(asked[0].input).toContain("Four is a longer sentence");
  });

  it("tells the generation on its own, and MAKE THE VOICES AGAIN moves it", async () => {
    expect((await get("/api/voices/generation")).generation).toBe("3.0");
    const t = await post("/api/talk/settings", { voicesAgain: true });
    expect(t.voices).toBe("3.1");
    expect((await post("/api/ai/speak", { species: 1, own: true })).generation).toBe("3.1");
  });
});
