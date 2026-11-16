// C-332: the published tracks, read safely (an id is a file's name on the hub)
import { describe, expect, it } from "vitest";
import { readTracks, trackId } from "../src/gamemusic.js";
import { DEVICE_DOOR } from "../src/api.js";

describe("the game's music on the watch (C-332)", () => {
  it("reads tracks.json, keeping only ids that are safe file names", () => {
    const t = readTracks({ tracks: [{ id: "slatecity", title: "SLATE CITY", place: "SLATE CITY", seconds: 92.4 }, { id: "../x", title: "no" }, { title: "none" }] });
    expect(t).toEqual([{ id: "slatecity", title: "SLATE CITY", place: "SLATE CITY", seconds: 92 }]);
    expect(readTracks(null)).toEqual([]);
    expect(trackId("a/b")).toBe("");
  });
  it("opens the device's door to the music and to BATTLE (C-328)", () => {
    const open = (m: string, p: string) => DEVICE_DOOR.some((d) => d(m, p));
    expect(open("GET", "/api/music")).toBe(true);
    expect(open("GET", "/api/music/track")).toBe(true);
    expect(open("GET", "/api/battle")).toBe(true);
    expect(open("POST", "/api/battle/choose")).toBe(true);
    expect(open("POST", "/api/battle/nothing")).toBe(false);
  });
});
