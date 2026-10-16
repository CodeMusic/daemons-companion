// T-407: the INDEX's NATIVE on the companion says what the game's area page says (pokedex_screen.c DexScreen_PrintNative).
import { describe, expect, it } from "vitest";
import { nativeLines } from "../src/save/index.js";

describe("NATIVE", () => {
  it("says NOT IN THE WILD for a daemon no wild table holds", () => {
    expect(nativeLines(null)).toEqual(["NOT IN THE WILD"]);
  });
  it("names the region, both as the game shortens them", () => {
    expect(nativeLines({ regions: ["GAMUT"] })).toEqual(["GAMUT"]);
    expect(nativeLines({ regions: ["GAMUT", "THE MARGINS"] })).toEqual(["GAMUT, MARGINS"]);
    expect(nativeLines({ regions: ["THE MARGINS"] })).toEqual(["THE MARGINS"]);
  });
  it("names a grove's universe, without its THE, in place of the region", () => {
    expect(nativeLines({ regions: ["GAMUT"], grove: "THE HUSHVERSE" })).toEqual(["HUSHVERSE"]);
  });
  it("keeps the game's order: edition, hours, seasons", () => {
    expect(nativeLines({ regions: ["GAMUT"], editions: ["CONTENT"], hours: ["DUSK"], seasons: ["SUMMER", "WINTER"] }))
      .toEqual(["GAMUT", "CONTENT ONLY", "DUSK", "WINTER, SUMMER"]);
  });
  it("says NOT for three of four, and nothing for all four", () => {
    expect(nativeLines({ regions: ["GAMUT"], hours: ["DAY", "DUSK", "DAWN"], seasons: ["WINTER", "SPRING", "SUMMER", "AUTUMN"] }))
      .toEqual(["GAMUT", "NOT AT NIGHT"]);
    expect(nativeLines({ regions: ["GAMUT"], seasons: ["SPRING", "SUMMER", "AUTUMN"] })).toEqual(["GAMUT", "NOT IN WINTER"]);
  });
  it("leaves out an edition when both keep it", () => {
    expect(nativeLines({ regions: ["GAMUT"], editions: ["CONTENT", "CONTEXT"] })).toEqual(["GAMUT"]);
  });
});
