// C-244: INDEX, a spoken command -- the rules, the model's JSON checked against the list, and what the watch is told
import { describe, expect, it } from "vitest";
import { checkCommand, commandPatch, commandSaid, commandWords, ruleCommand } from "../src/commands.js";
import { Store } from "../src/db.js";
import { deviceSettings, setOwnSettings } from "../src/core.js";

describe("INDEX commands (C-244)", () => {
  it("knows a command by its first word, and only then", () => {
    expect(commandWords("INDEX, turn on low power mode.")).toBe("turn on low power mode");
    expect(commandWords("index what time is it")).toBe("what time is it");
    expect(commandWords("I read the index today")).toBeNull();
    expect(commandWords("Indexing is fun")).toBeNull();
  });

  it("reads the plain ones by rules", () => {
    expect(ruleCommand("turn on low power mode")).toEqual({ do: "lowpower", on: true });
    expect(ruleCommand("turn off low power")).toEqual({ do: "lowpower", on: false });
    expect(ruleCommand("low power mode off")).toEqual({ do: "lowpower", on: false });
    expect(ruleCommand("what time is it")).toEqual({ do: "time" });
    expect(ruleCommand("open the casino")).toEqual({ do: "page", name: "casino" });
    expect(ruleCommand("show me my last dream")).toEqual({ do: "page", name: "dream" });
    expect(ruleCommand("turn off the gps")).toEqual({ do: "setting", name: "gps", value: false });
    expect(ruleCommand("set volume to 65")).toEqual({ do: "setting", name: "volume", value: 70 });
    expect(ruleCommand("set hours to 12")).toEqual({ do: "setting", name: "hours", value: 12 });
    expect(ruleCommand("start the morning walk routine")).toEqual({ do: "routine", name: "MORNING WALK" });
    expect(ruleCommand("open the pod bay doors")).toBeNull();
    expect(ruleCommand("delete everything")).toBeNull();
  });

  it("takes only a listed command from the model", () => {
    expect(checkCommand('Sure! {"do":"lowpower","on":false}')).toEqual({ do: "lowpower", on: false });
    expect(checkCommand('{"do":"page","name":"Books"}')).toEqual({ do: "page", name: "books" });
    expect(checkCommand('{"do":"setting","name":"volume","value":55}')).toBeNull();      // not one of its values
    expect(checkCommand('{"do":"shell","run":"rm -rf"}')).toBeNull();
    expect(checkCommand("no json here")).toBeNull();
  });

  it("says it, and keeps what it changes in the watch's own settings", () => {
    expect(commandSaid({ do: "lowpower", on: true }, "")).toBe("Low power mode, on.");
    expect(commandSaid(null, "fly me to the moon")).toBe("That isn't a command I know: fly me to the moon.");
    expect(commandSaid({ do: "time" }, "", new Date("2026-10-29T15:04:00"), 12)).toBe("It's 3:04 PM.");
    const store = new Store(":memory:"), id = "t-watch-ultra-abc";
    expect(typeof setOwnSettings(store, id, commandPatch({ do: "lowpower", on: true })!)).toBe("object");
    expect(typeof setOwnSettings(store, id, commandPatch({ do: "setting", name: "gps", value: false })!)).toBe("object");
    const p = deviceSettings(store, id).power;
    expect(p).toMatchObject({ low: true, gps: false, lora: true, poll: 60 });                 // one switch at a time
    expect(deviceSettings(store, "t-watch-s3-x").power.low).toBe(false);                    // its own, not every board's
    expect(setOwnSettings(store, id, { power: { poll: 7 } })).toBe("power.poll is one of 30, 60, 120, 300, 600 seconds");
  });
});
