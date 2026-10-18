import { describe, expect, it } from "vitest";
import { Store } from "../src/db.js";
import { SharedRemotes } from "../src/remotes.js";

const TV = [{ p: "NEC", v: "20df10ef", b: 32, r: 0 }, { p: "NEC", v: "20df40bf", b: 32, r: 0 }, { p: "NEC", v: "20dfc03f", b: 32, r: 0 }];

describe("one list of remotes for every device (C-165)", () => {
  it("keeps a remote's codes, cleaned, and a button the library could not name is left out", () => {
    const r = new SharedRemotes(new Store(":memory:"));
    expect(r.learn({ name: "  LIVING TV  ", buttons: [{ p: "nec", v: "20DF10EF", b: 32, r: 0 }, null, { p: "UNKNOWN", v: "0", b: 0, r: 0 }] })).toBe(true);
    expect(r.full().shared).toEqual([{ name: "LIVING TV", buttons: [{ p: "NEC", v: "20df10ef", b: 32, r: 0 }, null, null] }]);
    expect(r.learn({ name: "EMPTY", buttons: [null, null, null] })).toBe(false);   // nothing to send: not a remote
  });

  it("adds what a board reports that the list has not seen, and keeps six", () => {
    const r = new SharedRemotes(new Store(":memory:"));
    r.learn({ name: "TV", buttons: TV });
    r.merge([{ name: "TV", buttons: [TV[0], null, null] }, { name: "SOUNDBAR", buttons: TV }], []);
    expect(r.full().shared.map((x) => x.name)).toEqual(["TV", "SOUNDBAR"]);
    expect(r.full().shared[0].buttons).toEqual(TV);                                   // not taught again there: ours stands
    for (let i = 0; i < 6; i++) r.learn({ name: "R" + i, buttons: TV });
    expect(r.names().remotes).toEqual(["R0", "R1", "R2", "R3", "R4", "R5"]);
  });

  it("does not let a board that has not heard yet bring a removed remote back -- one taught again does", () => {
    const r = new SharedRemotes(new Store(":memory:"));
    r.learn({ name: "OLD TV", buttons: TV });
    r.forget("OLD TV");
    r.merge([{ name: "OLD TV", buttons: TV }], []);
    expect(r.full()).toMatchObject({ shared: [], forget: ["OLD TV"] });
    r.merge([{ name: "OLD TV", buttons: TV, fresh: true }], []);
    expect(r.full()).toMatchObject({ shared: [{ name: "OLD TV" }], forget: [] });
  });

  it("removes what a board removed, and a rename moves the codes to the new name everywhere", () => {
    const r = new SharedRemotes(new Store(":memory:"));
    r.learn({ name: "TV", buttons: TV }); r.learn({ name: "FAN", buttons: [TV[0], null, null] });
    r.merge([], ["FAN"]);
    expect(r.names().remotes).toEqual(["TV"]);
    expect(r.rename("TV", "BEDROOM TV")).toBe(true);
    expect(r.full()).toMatchObject({ shared: [{ name: "BEDROOM TV", buttons: TV }], forget: ["FAN", "TV"] });
    const rev = r.rev();
    r.learn({ name: "BEDROOM TV", buttons: TV });                                     // nothing new: the revision stands
    expect(r.rev()).toBe(rev);
  });
});
