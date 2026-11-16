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

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FirmwareImages, imageOk } from "../src/firmwareimages.js";
describe("the watch updated from its card (C-335)", () => {
  it("keeps one image a board, checked as an ESP32 image, and opens only the asking to a board", () => {
    const f = new FirmwareImages(mkdtempSync(join(tmpdir(), "fw-")));
    const bin = new Uint8Array(4096); bin[0] = 0xe9;
    expect(imageOk(new Uint8Array(4096))).toMatch(/not an ESP32/);
    expect(f.keep("../x", "b", bin)).toMatchObject({ error: expect.any(String) });
    const img = f.keep("t-watch-ultra", "abc123 11-16 10:00", bin) as any;
    expect(img).toMatchObject({ board: "t-watch-ultra", size: 4096, sha256: expect.stringMatching(/^[0-9a-f]{64}$/) });
    expect(f.latest("t-watch-ultra")?.build).toBe("abc123 11-16 10:00");
    expect(f.file("t-watch-s3")).toBeNull();
    const open = (m: string, p: string) => DEVICE_DOOR.some((d) => d(m, p));
    expect(open("GET", "/api/firmware")).toBe(true);
    expect(open("GET", "/api/firmware/image")).toBe(true);
    expect(open("POST", "/api/firmware")).toBe(false);
  });
});
