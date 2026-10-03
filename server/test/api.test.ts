import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { writeFileSync, mkdtempSync } from "node:fs";
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
const cfg = { ...DEFAULTS, database: ":memory:", savePath, edition: "CONTEXT" as const };
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

  it("refuses a goal without a title", async () => {
    expect((await post("/api/goals", {})).error).toMatch(/title/);
  });

  it("the example breakdown is marked as one", () => {
    expect(exampleBreakdown("x").example).toBe(true);
  });
});
