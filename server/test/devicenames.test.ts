// C-405: THE ENGINE ROOM names a device as the app does (app/art/deviceSprites.tsx lookFor, Places.tsx nameOf)
import { describe, expect, it } from "vitest";
import { deviceName, kindOfId } from "../src/devicenames.js";
import { makeServer } from "../src/api.js";
import { DEFAULTS } from "../src/config.js";
import type { AddressInfo } from "node:net";

describe("a device's name (C-405)", () => {
  it("is the app's: its kind's own name, the longest kind it begins with, an alias, a widget's phone", () => {
    expect(kindOfId("t-watch-ultra-f351d4")).toBe("t-watch-ultra");
    expect(deviceName({ id: "t-watch-ultra-f351d4", kind: "t-watch-ultra" })).toBe("T-Watch Ultra");
    expect(deviceName({ id: "t-embed-si4732-8a1508" })).toBe("T-Embed SI4732");          // its kind from its id
    expect(deviceName({ id: "t-deck-plus-0a0b0c" })).toBe(deviceName({ id: "t-deck-0a0b0c" }));   // an alias
    expect(deviceName({ id: "iphone-widget-b9d63e", kind: "iphone-widget", owner: "Kit's iPhone" })).toBe("Kit's iPhone's widget");
    expect(deviceName({ id: "iphone-widget-b9d63e", kind: "iphone-widget" })).toBe("A phone's widget");
    expect(deviceName({ id: "mystery-box-123456" })).toBe("mystery-box");               // unknown: its kind, never blank
  });
  it("comes with every row of /api/devices", async () => {
    const server = makeServer({ ...DEFAULTS, database: ":memory:", savePath: null });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    await fetch(`${base}/api/device/hello?via=usb`, { method: "POST", headers: { "content-type": "application/json", "x-device": "m5-dial-3a1b24" }, body: "{}" });
    const v = await (await fetch(`${base}/api/devices`)).json();
    server.close();
    expect(v.devices.find((d: any) => d.id === "m5-dial-3a1b24")?.name).toBe("Dial");   // devices.json's own name, as the app shows it
  });
});
