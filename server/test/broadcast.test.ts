// C-134: broadcasts -- one id is one broadcast however many ways it arrives; the app speaks as a daemon away.
import { describe, expect, it } from "vitest";
import { Store } from "../src/db.js";
import { ACTS, castLine, castsForDevice, castsSince, hubTag, sendCast, takeCast } from "../src/broadcast.js";

describe("broadcasts (C-134)", () => {
  it("keeps an id once, and adds each new way it came", () => {
    const s = new Store(":memory:");
    const a = takeCast(s, { id: "a1b2c3d40001", kind: "act", act: "BOW", name: "STARR", species: 5 }, "lora");
    expect("cast" in a && a.fresh).toBe(true);
    const b = takeCast(s, { id: "A1B2C3D40001", kind: "act", act: "BOW", name: "STARR", species: 5 }, "net");
    expect("cast" in b && b.fresh).toBe(false);
    const c = takeCast(s, { id: "a1b2c3d40001", kind: "act", act: "BOW", name: "STARR", species: 5 }, "lora");
    expect("cast" in c && c.cast.via).toEqual(["lora", "net"]);
    expect(castsSince(s)).toHaveLength(1);
    const d = takeCast(s, { id: "a1b2c3d40001", kind: "act", act: "BOW" }, "lora", true);   // its own board says it sent it
    expect("cast" in d && d.cast.mine).toBe(true);
  });

  it("keeps the whole of a word whose Bluetooth copy, cut at 43 letters, came first", () => {
    const s = new Store(":memory:");
    const whole = "a word long enough that Bluetooth cut it short at forty-three";
    takeCast(s, { id: "a1b2c3d40009", kind: "say", text: whole.slice(0, 43), name: "STARR" }, "ble");
    const r = takeCast(s, { id: "a1b2c3d40009", kind: "say", text: whole, name: "STARR" }, "lora");
    expect("cast" in r && r.cast.text).toBe(whole);
    const again = takeCast(s, { id: "a1b2c3d40009", kind: "say", text: whole.slice(0, 43), name: "STARR" }, "net");
    expect("cast" in again && again.cast.text).toBe(whole);
  });

  it("refuses what is not a broadcast", () => {
    const s = new Store(":memory:");
    expect("error" in takeCast(s, { id: "nothex", kind: "act", act: "BOW" }, "net")).toBe(true);
    expect("error" in takeCast(s, { id: "a1b2c3d40002", kind: "say", text: "\u0001" }, "net")).toBe(true);
    expect("error" in takeCast(s, { id: "a1b2c3d40003", kind: "shout" as never, act: "BOW" }, "net")).toBe(true);
  });

  it("says each kind in words", () => {
    const s = new Store(":memory:");
    const bow = ACTS.find((x) => x.code === "BOW")!;
    const a = takeCast(s, { id: "a1b2c3d40004", kind: "act", act: "BOW", name: "STARR" }, "ble");
    const r = takeCast(s, { id: "0badcafe0001", kind: "reply", act: "BOW", name: "ARCHIVER", replyTo: "a1b2c3d40004" }, "lora");
    const w = takeCast(s, { id: "0badcafe0002", kind: "say", text: "hello there", name: "ARCHIVER" }, "net");
    expect("cast" in a && castLine(a.cast)).toBe(`STARR ${bow.seen}`);
    expect("cast" in r && castLine(r.cast)).toBe(`ARCHIVER ${bow.reply}`);
    expect("cast" in r && r.cast.replyTo).toBe("a1b2c3d40004");
    expect("cast" in w && castLine(w.cast)).toBe("ARCHIVER: hello there");
  });

  it("sends from the app as a daemon away, with this hub's own tag, and numbers each one", () => {
    const s = new Store(":memory:");
    const away = [{ personality: 7, species: 25, name: "STARR", nickname: "" }, { personality: 9, species: 4, name: "X", nickname: "ARCHIVER" }];
    const one = sendCast(s, away, { kind: "act", act: "WAVE", as: 9 });
    const two = sendCast(s, away, { kind: "say", text: "hi" });
    expect("cast" in one && one.cast.name).toBe("ARCHIVER");
    expect("cast" in two && two.cast.name).toBe("STARR");
    if ("cast" in one && "cast" in two) {
      expect(one.cast.from).toBe(hubTag(s));
      expect(one.cast.id).not.toBe(two.cast.id);
      expect(one.cast.mine).toBe(true);
    }
    expect("error" in sendCast(s, [], { kind: "act", act: "WAVE" })).toBe(true);
  });

  it("hands a device the last ten minutes', short", () => {
    const s = new Store(":memory:");
    const now = new Date();
    takeCast(s, { id: "a1b2c3d40005", kind: "act", act: "HUM", name: "STARR", species: 5 }, "net", false, "", new Date(now.getTime() - 20 * 60000));
    takeCast(s, { id: "a1b2c3d40006", kind: "act", act: "GLOW", name: "STARR", species: 5 }, "net", false, "", now);
    const d = castsForDevice(s, now);
    expect(d).toEqual([{ id: "a1b2c3d40006", k: "act", n: "STARR", s: 5, a: "GLOW" }]);
  });
});
