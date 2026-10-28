// C-200, C-174: a watch's night and its fixes taken by the shared rules (routes.ts) -- what a phone hosting alone runs
import { describe, expect, it } from "vitest";
import { route, takeFix, takeNight } from "../src/routes.js";
import { Store } from "../src/db.js";
import type { Host } from "../src/core.js";

const h: Host = { edition: "CONTENT", save: { read: () => null, write: () => null } };
const watch = "t-watch-ultra-f351d4";
const ask = (store: Store, method: string, path: string, body: any = {}, query: Record<string, string> = {}) =>
  route(h, store, { method, path, body, deviceId: query.device ?? "", query });

describe("a watch's night and its fixes, on the shared rules", () => {
  it("keeps a night with its written dream, with no save and no module", () => {
    const store = new Store(":memory:");
    const to = Math.floor(Date.parse("2026-10-29T07:00:00Z") / 1000);
    expect(takeNight(h, store, "x y", watch)).toBe("a night needs from and to (ISO times)");
    const r = takeNight(h, store, `${to - 8 * 3600} ${to} 1 1`, watch);
    if (typeof r === "string") throw new Error(r);
    expect(r).toMatchObject({ carried: false, dream: { quality: "vivid", by: "words", tucked: true } });
    expect((ask(store, "GET", "/api/dreams").body as any).dreams.map((d: any) => d.id)).toEqual([r.dream.id]);
  });
  it("keeps a fix, lists it for its device, and FIND rides that device alone", () => {
    const store = new Store(":memory:");
    expect(takeFix(store, "0 0 5", watch)).toBe("a fix is <lat> <lon> <metres>");
    expect(takeFix(store, "43.65 -79.38 12", watch)).toMatchObject({ lat: 43.65, lon: -79.38, metres: 12, device: watch });
    expect((ask(store, "GET", "/api/where", {}, { device: watch }).body as any).fixes).toHaveLength(1);
    expect((ask(store, "GET", "/api/where", {}, { device: "t-deck-000001" }).body as any).fixes).toHaveLength(0);
    expect(ask(store, "POST", "/api/where/find", { id: "no" }).status).toBe(400);
    expect(ask(store, "POST", "/api/where/find", { id: watch }).body).toEqual({ asked: true });
    expect(store.getSetting(`find.${watch}`)).toBeTruthy();
  });
});
