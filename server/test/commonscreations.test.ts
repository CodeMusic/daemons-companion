// C-358: COMMUNITY on THE COMMONS -- a home shares, every approved home sees it, only the sharer takes it back
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CommonsCreations, SHARE_MOST_BYTES } from "../src/commons/commonscreations.js";
import { sleepCreation } from "../src/commons/creations.js";

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });
const fresh = () => { const d = mkdtempSync(join(tmpdir(), "c358-")); dirs.push(d); return new CommonsCreations(d); };
const row = sleepCreation({ id: "c".repeat(32), species: 9, nickname: "SEEK", caption: "rain", bpm: 60, keyscale: "C major", said: "x",
                            state: "ready", asked: "2026-11-14T01:00:00Z", cover: "ready", title: "RAIN UP" }, "ROVERBYTE HOME", "", 131);

describe("COMMUNITY", () => {
  it("shares a creation with its files, lists it, serves its files, and lets only its home take it back", () => {
    const c = fresh(), home = { id: "h1", name: "ROVERBYTE HOME" };
    const r = c.share(home, row, { "phone.m4a": Buffer.from("music").toString("base64"), "cover.png": Buffer.from("png").toString("base64"),
                                    "evil.sh": "x" });
    expect("shared" in r && r.shared).toMatchObject({ uid: row.uid, title: "RAIN UP", sharedByName: "ROVERBYTE HOME", cover: "/commons/creations/1/cover.png" });
    expect(Object.keys(c.list()[0].files).sort()).toEqual(["cover.png", "phone.m4a"]);
    expect(c.file("1", "phone.m4a")?.type).toBe("audio/mp4");
    expect(c.file("1", "../index.json")).toBeNull();
    c.share(home, { ...row, title: "AGAIN" }, { "phone.m4a": "bXVzaWM=" });                 // shared again: replaced, not doubled
    expect(c.list()).toHaveLength(1);
    expect(c.list()[0].title).toBe("AGAIN");
    expect(c.unshare({ id: "h2" }, row.uid)).toBe(false);
    expect(c.unshare(home, row.uid)).toBe(true);
    expect(c.list()).toHaveLength(0);
  });
  it("refuses what is not a creation, and what is too large", () => {
    const c = fresh(), home = { id: "h1", name: "H" };
    expect(c.share(home, { uid: "x" }, {})).toHaveProperty("error");
    expect(c.share(home, row, {})).toHaveProperty("error");
    const big = Buffer.alloc(SHARE_MOST_BYTES + 1).toString("base64");
    expect(c.share(home, row, { "phone.m4a": big })).toHaveProperty("error");
  });
});
