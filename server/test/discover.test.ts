// C-180: finding the modules -- the hub's link, the addresses the user gave, those added by hand; only the ones that answer kept
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { fakeModule } from "./fake_module.js";
import { candidates, discoverModules, moduleUrl } from "../src/ai/discover.js";

let board: Server, port = 0;
beforeAll(async () => { board = fakeModule(); await new Promise<void>((d) => board.listen(0, "127.0.0.1", () => d())); port = (board.address() as AddressInfo).port; });
afterAll(() => { board.close(); });

const storeOf = (init: Record<string, string>) => {
  const s = new Map(Object.entries(init));
  return { getSetting: (k: string) => s.get(k) ?? null, setSetting: (k: string, v: string) => { s.set(k, v); } };
};

describe("discovery", () => {
  it("reads an address as a module url", () => {
    expect(moduleUrl("10.0.0.40")).toBe("http://10.0.0.40:8000");
    expect(moduleUrl(" http://board.local:9000/ ")).toBe("http://board.local:9000");
    expect(moduleUrl("")).toBeNull();
  });
  it("asks the link, the addresses and the hand-added, once each", () => {
    const st = storeOf({ "ai.moduleAddresses": "10.0.0.40, 10.0.0.40:8000",
                         "ai.modules": JSON.stringify([{ url: "http://10.0.0.9:8000", name: "by hand" }]) });
    expect(candidates(st).map((m) => m.found ?? m.name)).toEqual(["link", "address", "by hand"]);
  });
  it("keeps only the modules that answer", async () => {
    const st = storeOf({ "ai.moduleLink": `http://127.0.0.1:1`, "ai.moduleAddresses": `127.0.0.1:${port}` });
    const r = await discoverModules(st);
    expect(r.kept.map((m) => m.name)).toEqual(["dev board"]);
    expect(JSON.parse(st.getSetting("ai.modules")!)[0].url).toBe(`http://127.0.0.1:${port}`);
  });
});
