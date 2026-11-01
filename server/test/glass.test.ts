import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { makeServer } from "../src/api.js";
import { DEFAULTS } from "../src/config.js";
import { bodyOf, titleOf, TITLE_MAX } from "../src/glass.js";

// C-262: the T-Glass -- one screen, chosen in the app; the app's selection is what the glasses show
const server = makeServer({ ...DEFAULTS, database: ":memory:", savePath: null });
let base = "";
beforeAll(async () => {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());
const GLASS = "t-glass-a1b2c3";
const post = (path: string, body: unknown, device?: string) => fetch(base + path, { method: "POST",
  headers: { "content-type": "application/json", ...(device ? { "x-device": device } : {}) }, body: JSON.stringify(body) });
const get = (path: string, device?: string) => fetch(base + path, { headers: device ? { "x-device": device } : {} }).then((r) => r.json());

describe("a note's title is its first line (C-262)", () => {
  it("takes the first line with words, cut short, and the rest is the body", () => {
    expect(titleOf("\n  Groceries \nmilk\neggs")).toBe("Groceries");
    expect(bodyOf("\n  Groceries \nmilk\neggs")).toBe("milk\neggs");
    expect(titleOf("x".repeat(40))).toHaveLength(TITLE_MAX);
    expect(titleOf("   ")).toBe("UNTITLED");
  });
});

describe("the glasses show one thing, and the app follows them (C-262)", () => {
  it("writes, renames by the first line, shows and removes a note", async () => {
    const a = await post("/api/glass/note", { text: "Talk notes\nopen with the dream\nthen the map" }).then((r) => r.json());
    const b = await post("/api/glass/note", { text: "Groceries\nmilk" }).then((r) => r.json());
    expect((await post("/api/glass/note", { text: "  " })).status).toBe(400);
    let v = await get("/api/glass");
    expect(v.notes.map((n: any) => n.title)).toEqual(["Groceries", "Talk notes"]);   // the newest first
    expect(v.show).toBe("home");

    expect((await post("/api/glass/show", { show: "note", note: a.id })).status).toBe(200);
    let s = await get("/api/device/state", GLASS);
    expect(s.glass).toMatchObject({ show: "note", title: "Talk notes", body: "open with the dream\nthen the map" });
    v = await get("/api/glass");
    expect(v).toMatchObject({ show: "note", note: a.id });                       // the app's row stays selected

    await post("/api/glass/note", { id: a.id, text: "Talk, short\nopen with the dream" });   // renamed by its first line
    s = await get("/api/device/state", GLASS);
    expect(s.glass.title).toBe("Talk, short");

    await post("/api/glass/show", { show: "daemon" });                          // another view sends another screen
    v = await get("/api/glass");
    expect(v).toMatchObject({ show: "daemon", note: null });                   // ... and no note is selected now

    await post("/api/glass/show", { show: "note", note: b.id });
    expect((await post("/api/glass/note/remove", { id: b.id })).status).toBe(200);
    v = await get("/api/glass");
    expect(v).toMatchObject({ show: "home", note: null });                      // its note gone, the glasses go home
    expect(v.notes).toHaveLength(1);
    expect((await post("/api/glass/show", { show: "note", note: 999 })).status).toBe(400);
    expect((await post("/api/glass/show", { show: "everything" })).status).toBe(400);
  });

  it("lays a care's reaction over what is shown, and never moves the note", async () => {
    const n = await post("/api/glass/note", { text: "Keep me\nshown" }).then((r) => r.json());
    await post("/api/glass/show", { show: "note", note: n.id });
    const r = await post("/api/glass/care", { kind: "feed" });
    expect(r.status).toBe(200);
    const c = await r.json();
    expect(typeof c.said).toBe("string");
    expect(c.glass.moment).toMatchObject({ kind: "feed", line: c.said });
    const s = await get("/api/device/state", GLASS);
    expect(s.glass).toMatchObject({ show: "note", title: "Keep me", moment: { kind: "feed" } });
    expect(s.glass.moment.left).toBeGreaterThan(0);
    expect((await post("/api/glass/care", { kind: "poke" })).status).toBe(400);
  });

  it("is told only to a T-Glass, and the glasses' own button goes home or dark", async () => {
    expect((await get("/api/device/state", "t-embed-36f484")).glass).toBeUndefined();
    expect((await post("/api/device/interact", { kind: "glass", detail: "dark" }, GLASS)).status).toBe(200);
    expect((await get("/api/glass")).show).toBe("dark");
    expect((await post("/api/device/interact", { kind: "glass", detail: "home" }, GLASS)).status).toBe(200);
    expect((await get("/api/device/state", GLASS)).glass.show).toBe("home");
  });
});
