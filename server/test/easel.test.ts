// C-338: THE EASEL -- each daemon's style, what it decides to paint, the image model's graph; THE PERSONA OF THE DAY;
// and the hub painting end to end against a stand-in mind and a stand-in ComfyUI
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { createServer, type Server } from "node:http";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { comfyPaint, imagePromptOf, kleinGraph, moodOfPaint, ownTouch, paintStyle, readPainting, TOUCHES, TYPE_STYLE } from "../src/ai/easel.js";
import { buildPersona, lastWake, nextWake, personaFresh, personaText, signatureOf, withToday, type DayPersonaFacts } from "../src/persona.js";
import { dayFacts, speciesFacts } from "../src/ai/personaof.js";
import { makeServer } from "../src/api.js";
import { DEFAULTS } from "../src/config.js";
import { Store } from "../src/db.js";
import { buildSave } from "./build_save.js";

const feel = (o: Partial<Record<"glad" | "sad" | "mad" | "calm" | "restless", number>>) =>
  ({ glad: 0, sad: 0, mad: 0, calm: 0, restless: 0, strongest: null, ...o }) as any;

describe("how a daemon paints", () => {
  it("in its type's medium, with a touch of its own, its mood in the colours", () => {
    expect(paintStyle({ types: ["FLOW"], species: 7 })).toContain("watercolour");
    expect(paintStyle({ types: ["FLOW"], species: 7 })).not.toBe(paintStyle({ types: ["FLOW"], species: 8 }));
    expect(paintStyle({ types: ["LEGACY", "FLOW"], species: 7 })).toContain("with something of flowing watercolour");
    expect(paintStyle({ types: ["FLOW"], species: 7 }, feel({ glad: 80 }))).toContain("sunny");
    expect(paintStyle({ types: ["FLOW"], species: 7 }, null, "  my own way  ")).toBe("my own way");
    expect(moodOfPaint(feel({ glad: 10 }))).toBe("");
    expect(Object.keys(TYPE_STYLE)).toHaveLength(18);
  });
  it("no two species below 1280 share a touch", () => {
    const seen = new Set(Array.from({ length: TOUCHES }, (_, i) => ownTouch(i)));
    expect(seen.size).toBe(TOUCHES);
    expect(ownTouch(null)).toBe("");
  });
  it("reads what it decided to paint, or makes do", () => {
    expect(readPainting('<think>hm</think>{"title":"Bridge at Dawn","scene":"A small bridge.","about":"I like bridges."}', "x"))
      .toEqual({ title: "Bridge at Dawn", scene: "A small bridge.", about: "I like bridges." });
    const plain = readPainting("A quiet field under snow.", "a snowy field please");
    expect(plain.scene).toBe("A quiet field under snow.");
    expect(plain.title).toBe("A SNOWY FIELD PLEASE");
    expect(imagePromptOf("A field.", "watercolour")).toMatch(/^A painting on canvas, watercolour\. A field\..*no text/);
  });
  it("asks the image model with FLUX.2 klein's graph, and fetches what it made", async () => {
    const g = kleinGraph("a field", 42) as Record<string, { class_type: string; inputs: any }>;
    expect(g["12"].inputs.noise_seed).toBe(42);
    expect(g["1"].inputs.unet_name).toBe("flux-2-klein-4b.safetensors");
    let looks = 0;
    const f = (async (u: string) => {
      if (u.endsWith("/prompt")) return new Response(JSON.stringify({ prompt_id: "p1" }));
      if (u.includes("/history/")) return new Response(JSON.stringify(++looks < 2 ? {} : { p1: { outputs: { "15": { images: [{ filename: "a.png", subfolder: "", type: "output" }] } } } }));
      if (u.includes("/view?")) return new Response(new Uint8Array([137, 80, 78, 71]));
      return new Response("", { status: 404 });
    }) as typeof fetch;
    expect([...await comfyPaint("http://easel", "a field", 1, f, undefined, 1)]).toEqual([137, 80, 78, 71]);
    const broken = (async (u: string) => u.endsWith("/prompt") ? new Response(JSON.stringify({ prompt_id: "p" }))
      : new Response(JSON.stringify({ p: { status: { status_str: "error" } } }))) as typeof fetch;
    await expect(comfyPaint("http://easel", "x", 1, broken, undefined, 1)).rejects.toThrow("could not paint");
  });
});

describe("the persona of the day", () => {
  const at = new Date(2026, 10, 11, 14, 0);
  const facts = (o: Partial<DayPersonaFacts> = {}): DayPersonaFacts =>
    ({ ...speciesFacts(25, "SPARK"), mood: "content", goals: [{ goal: "Finish the shed", step: "buy screws" }], day: dayFacts(at),
       forecast: { day: "2026-11-11", kind: "rain", hiC: 9, loC: 3, rain: 80, city: "Toronto" }, ...o });
  it("belongs to the wake at 05:30, until the next", () => {
    expect(lastWake(at).toString()).toBe(new Date(2026, 10, 11, 5, 30).toString());
    expect(lastWake(new Date(2026, 10, 11, 5, 0)).toString()).toBe(new Date(2026, 10, 10, 5, 30).toString());
    expect(nextWake(at).toString()).toBe(new Date(2026, 10, 12, 5, 30).toString());
  });
  it("says the common persona, the weather and what it wrote of today", () => {
    const t = personaText(facts(), "I woke to rain on the roof.");
    expect(t).toContain("You are SPARK");
    expect(t).toContain("its virtue is");
    expect(t).toContain("Finish the shed (next: buy screws)");
    expect(t).toContain("The forecast for Toronto today: rain, 3 to 9 degrees, a 80% chance of rain.");
    expect(t).toContain("How you meet today, in your own words: I woke to rain on the roof.");
  });
  it("stays fresh until the next wake, and is built again early when what matters moves", () => {
    const p = buildPersona("persona.1", facts(), at);
    expect(personaFresh(p, signatureOf(facts()), new Date(2026, 10, 11, 22, 0))).toBe(true);
    expect(personaFresh(p, signatureOf(facts()), new Date(2026, 10, 12, 6, 0))).toBe(false);                 // a new wake
    expect(personaFresh(p, signatureOf(facts({ mood: "sad" })), at)).toBe(false);                             // its mood moved
    expect(personaFresh(p, signatureOf(facts({ goals: [{ goal: "Finish the shed", step: "paint it" }] })), at)).toBe(false);   // a step done
    expect(personaFresh(p, signatureOf(facts({ forecast: null })), at)).toBe(false);                          // the sky changed
    expect(personaFresh(p, signatureOf(facts({ care: { hunger: 10 } })), at)).toBe(true);                     // a small need is not a new day
  });
  it("keeps what it wrote of today only for the same wake and the same self", () => {
    const p = withToday(buildPersona("k", facts(), at), facts(), "Rain again.");
    expect(buildPersona("k", facts(), new Date(2026, 10, 11, 15, 0), p).today).toBe("Rain again.");
    expect(buildPersona("k", facts({ mood: "sad" }), at, p).today).toBeNull();
    expect(buildPersona("k", facts(), new Date(2026, 10, 12, 7, 0), p).today).toBeNull();
  });
});

describe("the hub's easel (C-338)", () => {
  const dir = mkdtempSync(join(tmpdir(), "easel-"));
  const savePath = join(dir, "copy.sav");
  writeFileSync(savePath, buildSave({ player: "ROVER", trainerId: 7, slots: [
    { counter: 1, party: [{ personality: 4242, otId: 7, species: 25, nickname: "SPARK", level: 9, away: true }] }, { counter: 0, party: [] }] }));
  const store = new Store(join(dir, "companion.sqlite"));
  const server = makeServer({ ...DEFAULTS, database: join(dir, "companion.sqlite"), savePath, edition: "CONTENT" as const }, store);
  const asked: { system: string; user: string }[] = [];
  let base = "", fake: Server;
  beforeAll(async () => {
    fake = createServer((req, res) => {   // the Tiiny's mind, and ComfyUI, in one stand-in
      let raw = ""; req.on("data", (c) => { raw += c; });
      req.on("end", () => {
        const u = req.url ?? "";
        if (u === "/v1/models") { res.setHeader("content-type", "application/json"); return res.end(JSON.stringify({ data: [{ id: "tiiny-9b" }] })); }
        if (u === "/v1/chat/completions") {
          const b = JSON.parse(raw), sys = b.messages[0].content as string, user = b.messages.at(-1).content as string;
          asked.push({ system: sys, user });
          const text = sys.includes("small creature who paints") ? '{"title":"Rain on the Shed","scene":"A little shed in the rain.","about":"It rained all day."}'
                                                                  : "I woke to the sound of rain.";
          res.setHeader("content-type", "application/json");
          return res.end(JSON.stringify({ choices: [{ message: { content: text } }] }));
        }
        if (u === "/prompt") { res.setHeader("content-type", "application/json"); return res.end(JSON.stringify({ prompt_id: "pp" })); }
        if (u.startsWith("/history/")) { res.setHeader("content-type", "application/json");
          return res.end(JSON.stringify({ pp: { outputs: { "15": { images: [{ filename: "x.png", subfolder: "", type: "output" }] } } } })); }
        if (u.startsWith("/view?")) return res.end(Buffer.from([137, 80, 78, 71, 1, 2]));
        res.statusCode = 404; res.end();
      });
    });
    await new Promise<void>((r) => fake.listen(0, "127.0.0.1", () => r()));
    const at = `http://127.0.0.1:${(fake.address() as AddressInfo).port}`;
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    store.setSetting("easel.host", at);
    await fetch(base + "/api/talk/settings", { method: "POST", headers: { "content-type": "application/json" },
                                                body: JSON.stringify({ tiiny: { url: `${at}/v1`, model: "tiiny-9b" } }) });
  });
  afterAll(() => { server.close(); fake.close(); });
  const post = (p: string, b: unknown) => fetch(base + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });

  it("builds the persona of the day, and has the daemon write how it meets it", async () => {
    const r = await fetch(`${base}/api/persona?personality=4242`).then((x) => x.json());
    expect(r.persona.text).toContain("You are SPARK");
    for (let i = 0; i < 50 && !JSON.parse(store.getSetting("persona.4242") ?? "{}").today; i++) await new Promise((x) => setTimeout(x, 20));
    expect(JSON.parse(store.getSetting("persona.4242")!).today).toBe("I woke to the sound of rain.");
    expect((await fetch(`${base}/api/persona?personality=1`)).status).toBe(404);
  });
  it("paints what it is asked, in its style, with its persona, and keeps it in the gallery", async () => {
    const r = await post("/api/paint", { prompt: "the shed in the rain", personality: 4242 }).then((x) => x.json());
    expect(r.painting.state).toBe("painting");
    expect(r.painting.nickname).toBe("SPARK");
    let p: any = null;
    for (let i = 0; i < 100; i++) { p = (await fetch(`${base}/api/paintings/${r.painting.id}`).then((x) => x.json())).painting; if (p.state !== "painting") break; await new Promise((x) => setTimeout(x, 30)); }
    expect(p.state).toBe("done");
    expect(p.title).toBe("Rain on the Shed");
    expect(p.about).toBe("It rained all day.");
    const ask = asked.find((a) => a.system.includes("small creature who paints"))!;
    expect(ask.user).toContain("You are SPARK");                       // its persona of the day
    expect(ask.user).toContain("You were asked to paint: the shed in the rain");
    const png = await fetch(`${base}/art/paintings/${p.id}.png`);
    expect(png.status).toBe(200);
    expect([...new Uint8Array(await png.arrayBuffer())].slice(0, 4)).toEqual([137, 80, 78, 71]);
    expect((await fetch(`${base}/api/art?painting=${p.id}`).then((x) => x.json())).png).toBe(Buffer.from([137, 80, 78, 71, 1, 2]).toString("base64"));
    expect((await fetch(`${base}/api/paintings`).then((x) => x.json())).paintings[0].id).toBe(p.id);
    expect((await post("/api/paintings/forget", { id: p.id })).status).toBe(200);
    expect((await fetch(`${base}/art/paintings/${p.id}.png`)).status).toBe(404);
  });
  it("says what is missing", async () => {
    expect((await post("/api/paint", { prompt: "  " })).status).toBe(400);
    expect((await post("/api/paint", { prompt: "x", personality: 1 })).status).toBe(409);
    expect((await fetch(`${base}/art/paintings/../../x.png`)).status).toBe(404);
  });
});
