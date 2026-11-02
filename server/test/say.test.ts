import { describe, expect, it } from "vitest";
import { sayable } from "../src/ai/say.js";

// C-270: DAEMON as it is said, DAY-mon -- only in what a voice is handed
describe("a line made sayable", () => {
  it("respells daemon as daymon, in any case, keeping a capital as one", () => {
    expect(sayable("DAEMONS")).toBe("Daymons");
    expect(sayable("a DAEMON's INDEX entry")).toBe("a Daymon's INDEX entry");
    expect(sayable("Daemons live wild; one daemon answered.")).toBe("Daymons live wild; one daymon answered.");
  });
  it("leaves every other word alone, and changes nothing the second time", () => {
    expect(sayable("the Greek daimon, a daemonic hour")).toBe("the Greek daimon, a daemonic hour");
    expect(sayable(sayable("DAEMONS and daemons"))).toBe("Daymons and daymons");
    expect(sayable("PING is glad.")).toBe("PING is glad.");
  });
  it("respells a word that ends in daemon, keeping its front", () => {
    expect(sayable("a eudaemon, a cacodaemon")).toBe("a eudaymon, a cacodaymon");
    expect(sayable("EUDAEMONS and the Agathodaemon")).toBe("Eudaymons and the Agathodaymon");
    expect(sayable(sayable("cacodaemons"))).toBe("cacodaymons");
  });
});
