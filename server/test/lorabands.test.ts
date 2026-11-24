import { describe, it, expect } from "vitest";
import { parseLoraRadio, loraApart } from "../src/devices/lorabands.js";

describe("C-175: every LoRa chip and band", () => {
  it("reads a board's chip and band, and nothing else", () => {
    expect(parseLoraRadio("SX1262 868")).toEqual({ chip: "SX1262", band: 868 });
    expect(parseLoraRadio("SX1280 2400")).toEqual({ chip: "SX1280", band: 2400 });
    expect(parseLoraRadio("LLCC68 920")).toEqual({ chip: "LLCC68", band: 920 });
    for (const bad of ["", "SX1262", "868", "sx1262 868", "SX1262 868; rm", 868, null, undefined]) expect(parseLoraRadio(bad)).toBeNull();
  });
  it("says nothing while every board is on one band, or a board has not said", () => {
    expect(loraApart([])).toBeNull();
    expect(loraApart([{ id: "a", radio: { chip: "SX1262", band: 868 } }, { id: "b", radio: { chip: "SX1276", band: 868 } },
                      { id: "c", radio: null }])).toBeNull();
  });
  it("names who is on which band when they differ, 2.4 GHz by its name", () => {
    const s = loraApart([{ id: "watch", radio: { chip: "SX1262", band: 868 } }, { id: "fire", radio: { chip: "SX1278", band: 433 } },
                         { id: "deck", radio: { chip: "SX1262", band: 868 } }, { id: "tiny", radio: { chip: "SX1280", band: 2400 } }]);
    expect(s).toBe("fire on 433 MHz; watch, deck on 868 MHz; tiny on 2.4 GHz: boards on different bands cannot hear each other.");
  });
});
