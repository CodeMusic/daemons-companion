// C-431: PRAXIS's SYNC over HTTP -- a phone that hosted alone pairs with a hub and loses nothing: it hands over what it
// made (praxissync.ts handOver), the hub joins the phone's LIFE to its own (goals.ts joinOthers), and from then on
// there is one LIFE, every goal numbered by the hub and every ARETE kept. And blobs, by their SHA-256.
import { createHash } from "node:crypto";
import type { AddressInfo } from "node:net";
import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { memoryBlobs } from "@daemons/praxis";
import { makeServer } from "../src/api.js";
import { DEFAULTS } from "../src/config.js";
import { Store } from "../src/db.js";
import { folderBlobs } from "../src/blobstore.js";
import { handOver, hubPeer } from "../src/praxissync.js";

const hub = new Store(":memory:");
const server = makeServer({ ...DEFAULTS, database: ":memory:", savePath: null }, hub);
let base = "";
beforeAll(async () => {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

const plan = (...steps: string[]) => ({ subitems: [{ title: "", steps }] });
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

describe("C-431: a phone that hosted alone joins a hub", () => {
  it("hands over its goals, which join the hub's LIFE numbered after the hub's own, with every ARETE kept", async () => {
    // the hub, at home: a goal, one step done
    const hg = hub.addGoal("Paint the fence", plan("Buy paint", "Sand it"));
    hub.completeStep(hg.subitems[0].steps[0].id);
    // the phone, alone, before it ever paired: a goal of its own, numbered from 1 as the hub's were
    const phone = new Store(":memory:");
    const pg = phone.addGoal("Learn the cello", plan("Rent a cello", "Find a teacher"));
    expect(pg.id).toBe(hg.id);                                       // the same numbers, made apart
    phone.completeStep(pg.subitems[0].steps[0].id);
    const earned = phone.life.arete().held + hub.life.arete().held;

    const r = await handOver(phone, hubPeer(base, null), memoryBlobs());
    expect(r).toMatchObject({ spaces: 1, ahead: 0, blobs: 0 });
    expect(r.sent).toBe(phone.life.px.missing({}).length);

    // one LIFE: the hub's goal as it was, the phone's after it, every step and its state
    const goals = hub.goals();
    expect(goals.map((g) => [g.title, g.done, g.subitems[0].steps.map((s) => [s.text, s.done])])).toEqual([
      ["Paint the fence", false, [["Buy paint", true], ["Sand it", false]]],
      ["Learn the cello", false, [["Rent a cello", true], ["Find a teacher", false]]],
    ]);
    expect(goals[1].id).toBeGreaterThan(goals[0].id);
    expect(new Set(goals.flatMap((g) => g.subitems.flatMap((s) => s.steps.map((t) => t.id)))).size).toBe(4);   // no number twice
    expect(hub.life.arete().held).toBe(earned);                      // ARETE from both, paid once each
    expect(hub.life.px.spaces().filter((s) => s.home === s.id && s.form?.name === "life")).toHaveLength(1);

    // the hub's routes name the phone's steps by their new numbers, as a board or the app would
    const step = goals[1].subitems[0].steps[1];
    const done = await fetch(`${base}/api/steps/${step.id}/done`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    expect(done.status).toBe(200);
    expect(hub.goal(goals[1].id)!.done).toBe(true);                  // its last step: the goal finished, here

    // safe to repeat: nothing new, nothing sent; and what the phone makes later, still alone, lands in the same LIFE
    expect((await handOver(phone, hubPeer(base, null))).sent).toBe(0);
    phone.addGoal("Plant garlic", plan("Buy bulbs"));
    expect((await handOver(phone, hubPeer(base, null))).sent).toBeGreaterThan(0);
    expect(hub.goals().map((g) => g.title)).toEqual(["Paint the fence", "Learn the cello", "Plant garlic"]);
  });

  it("hands over nothing from a phone that never made a goal", async () => {
    expect(await handOver(new Store(":memory:"), hubPeer(base, null))).toEqual({ spaces: 0, sent: 0, ahead: 0, blobs: 0 });
  });

  it("answers the exchange's calls, and refuses what is not one", async () => {
    const peer = hubPeer(base, null);
    const have = await peer.have();
    expect(Object.keys(have)).toContain(hub.life.life);
    const events = await peer.missing({});
    expect(events.length).toBe(hub.life.px.missing({}).length);
    const post = (name: string, b: unknown) => fetch(`${base}/api/praxis/${name}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });
    expect((await post("missing", { have: "everything" })).status).toBe(400);
    expect((await post("receive", { events: "all" })).status).toBe(400);
    expect((await post("receive", { events: [{ id: "x" }] }).then((r) => r.json())).received).toMatchObject({ rejected: 1 });
    expect((await post("explode", {})).status).toBe(404);
    expect((await fetch(`${base}/api/praxis/have`)).status).toBe(405);
    // never through the relay
    expect((await fetch(`${base}/api/praxis/have`, { method: "POST", headers: { "x-companion-relay": "a guess" }, body: "{}" })).status).toBe(403);
  });
});

describe("C-431: blobs, by their SHA-256", () => {
  it("keeps bytes under their own name only, and serves them back", async () => {
    const peer = hubPeer(base, null);
    const bytes = new TextEncoder().encode("the garden in May"), h = sha("the garden in May");
    expect(await peer.blob(h)).toBeNull();
    expect(await peer.putBlob(sha("something else"), bytes)).toBe(false);   // not what the name says
    expect(await peer.holds([h])).toEqual([]);
    expect(await peer.putBlob(h, bytes)).toBe(true);
    expect(await peer.holds([h, sha("never")])).toEqual([h]);
    expect(new TextDecoder().decode((await peer.blob(h))!)).toBe("the garden in May");
    expect((await fetch(`${base}/api/praxis/blob/${h}`, { method: "POST" })).status).toBe(405);
  });

  it("keeps the hub's in a folder beside its database, each file under its hash, written whole", () => {
    const dir = mkdtempSync(join(tmpdir(), "blobs-"));
    const store = folderBlobs(dir), bytes = new TextEncoder().encode("a song");
    store.put(sha("a song"), bytes);
    store.put(sha("a song"), bytes);
    expect(readdirSync(join(dir, sha("a song").slice(0, 2)))).toEqual([sha("a song")]);   // once, and no part left behind
    expect(new TextDecoder().decode(store.get(sha("a song"))!)).toBe("a song");
    expect(store.has(sha("no song"))).toBe(false);
    expect(store.get("../../etc/passwd")).toBeNull();
  });
});
