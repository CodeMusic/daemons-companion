import { describe, expect, it } from "vitest";
import { mirrorChoice } from "../src/game/mirror.js";

describe("the device's save and its mirror (C-188)", () => {
  it("nothing to do when they match", () => expect(mirrorChoice("a", "a", "z")).toBe("same"));
  it("a SYNC on the companion comes back while the device's save is as agreed", () => expect(mirrorChoice("b", "a", "a")).toBe("take"));
  it("a device with no save takes the mirror", () => expect(mirrorChoice("b", "", "")).toBe("take"));
  it("when both moved the companion's is the truth, the device's set aside (C-365)", () => expect(mirrorChoice("b", "c", "a")).toBe("replace"));
  it("when both moved and the truth is the device's, the device's wins", () => expect(mirrorChoice("b", "c", "a", "device")).toBe("keep"));
});
