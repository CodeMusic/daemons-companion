import { describe, expect, it } from "vitest";
import { aim, DeviceHub } from "../src/device.js";

// C-168 Phase 3: several boards on the hub's cables (and more on Wi-Fi) share one hub -- a command aimed at one board is
// taken by that board alone; one aimed at none goes to the first that asks, as it always did.
describe("commands aimed at one board (C-168 Phase 3)", () => {
  it("gives an aimed command only to its board, and an unaimed one to whoever asks first", () => {
    const hub = new DeviceHub();
    const forWatch = hub.send({ ...aim({ device: "watch-51d4" }), type: "run", routine: "a/b" });
    const forAnyone = hub.send({ ...aim({}), type: "run", routine: "c/d" });
    expect(hub.take("usb", "cardputer-0a9c").map((c) => c.id)).toEqual([forAnyone]);
    expect(hub.take("usb", "watch-51d4").map((c) => c.id)).toEqual([forWatch]);
    expect(hub.take("usb", "watch-51d4")).toEqual([]);
  });

  it("still hands a Wi-Fi password down a cable only, aimed or not", () => {
    const hub = new DeviceHub();
    const id = hub.send({ ...aim({ device: "embed-f484" }), type: "wifi", ssid: "x", password: "y" });
    expect(hub.take("wifi", "embed-f484")).toEqual([]);
    expect(hub.take("usb", "embed-f484").map((c) => c.id)).toEqual([id]);
  });

  it("aims at nothing when the body's device is not a board's name", () => {
    expect(aim({ device: "../etc" })).toEqual({});
    expect(aim({ device: 7 })).toEqual({});
    expect(aim({ device: "tdeck-ffa8" })).toEqual({ to: "tdeck-ffa8" });
  });
});
