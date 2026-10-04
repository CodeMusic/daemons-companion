import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeServer, ENTRY_LIMIT, EXP_PER_STEP } from "../src/api.js";
import { DEFAULTS } from "../src/config.js";
import { buildSave } from "./build_save.js";

const dir = mkdtempSync(join(tmpdir(), "goal-"));
const savePath = join(dir, "copy.sav");
writeFileSync(savePath, buildSave({ player: "ROVER", trainerId: 7, slots: [
  { counter: 1, party: [{ personality: 31, otId: 7, species: 1, nickname: "PIP", level: 3, away: true }] }, { counter: 0, party: [] }] }));
const server = makeServer({ ...DEFAULTS, database: ":memory:", savePath });
let base = "";
beforeAll(async () => { await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r())); base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; });
afterAll(() => server.close());
const get = (p: string) => fetch(base + p).then((r) => r.json());
const post = (p: string, b: unknown) =>
  fetch(base + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) })
    .then(async (r) => ({ status: r.status, json: await r.json() }));

describe("one goal, built from milestones and steps (C-46)", () => {
  it("keeps one goal at a time, each entry short on purpose", async () => {
    expect((await post("/api/goal", { title: "x".repeat(ENTRY_LIMIT + 1) })).status).toBe(400);
    expect((await post("/api/goal", { title: "Clean the house" })).status).toBe(201);
    expect((await post("/api/goal", { title: "Another" })).status).toBe(409);
  });

  it("holds milestones with their own steps, and loose steps beside them", async () => {
    const bath = (await post("/api/goal/milestone", { title: "BATHROOM" })).json.goal.subitems[0].id;
    await post("/api/goal/step", { text: "Mop the floor", milestone: bath });
    await post("/api/goal/step", { text: "Scrub the toilet", milestone: bath });
    const g = (await post("/api/goal/step", { text: "Take out the bins" })).json.goal;
    expect(g.subitems.map((s: any) => [s.title, s.steps.map((t: any) => t.text)])).toEqual([
      ["BATHROOM", ["Mop the floor", "Scrub the toilet"]], ["", ["Take out the bins"]]]);
  });

  it("shows the next step with its milestone, subtly", async () => {
    const s = await get("/api/device/state");
    expect(s.step).toMatchObject({ text: "Mop the floor", milestone: { title: "BATHROOM", at: 1, of: 2 } });
  });
});

describe("doing a step, and undoing it (C-47, C-49, C-50)", () => {
  it("gives one experience point a step, and an undo takes it back with its meal", async () => {
    const s = await get("/api/device/state");
    const r = await post("/api/device/ticks", { steps: [s.step.id] });
    expect(r.json.celebrate).toBe("step");
    expect(r.json.state.daemon.grown.exp).toBe(EXP_PER_STEP);
    expect(r.json.state.step.text).toBe("Scrub the toilet");            // the next step, at once
    const u = await post("/api/device/untick", { step: s.step.id });
    expect(u.json.state.daemon.grown.exp).toBe(0);
    expect(u.json.state.step.text).toBe("Mop the floor");
    expect(u.json.state.daemon.life.fed.today).toBe(0);
  });

  it("celebrates a milestone, then the whole goal", async () => {
    let s = await get("/api/device/state");
    await post("/api/device/ticks", { steps: [s.step.id] });
    s = await get("/api/device/state");
    expect((await post("/api/device/ticks", { steps: [s.step.id] })).json.celebrate).toBe("milestone");
    s = await get("/api/device/state");
    expect((await post("/api/device/ticks", { steps: [s.step.id] })).json.celebrate).toBe("goal");
    expect((await get("/api/goal")).goal).toBeNull();
  });
});

describe("a walking goal (C-48)", () => {
  it("is 10,000 a day unless set, and reaching it is activity and experience, once", async () => {
    expect(await get("/api/walk")).toMatchObject({ goal: 10000, steps: 0, reached: false });
    expect((await post("/api/walk", { goal: 50 })).status).toBe(400);
    await post("/api/walk", { goal: 8000 });
    const before = (await get("/api/device/state")).daemon.grown.exp;
    expect((await post("/api/walk", { steps: 8500 })).json.reached).toBe(true);
    await post("/api/walk", { steps: 9000 });                        // reached again the same day: nothing more
    expect((await get("/api/device/state")).daemon.grown.exp).toBe(before + 1);
    expect((await get("/api/daemon/life")).trained).toBe(true);
  });
});
