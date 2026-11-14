// C-362: THE DAEMON SINGS -- what the daemon is asked, and how its answer becomes a song
import { describe, expect, it } from "vitest";
import { captionOf, lyricWords, musicWords, readSong, singAsk } from "../src/songs.js";
import { songCreation } from "../src/creations.js";

describe("the song's words", () => {
  it("reads the daemon's JSON, and keeps your own lyrics as they are", () => {
    const said = '{"title":"Moss at Dawn","style":"gentle folk, guitar, warm voice","lyrics":"[verse]\\nI woke in moss\\n[chorus]\\nStay","about":"For you."}';
    expect(readSong(said, "prompt", "dawn", "")).toEqual({ title: "Moss at Dawn", style: "gentle folk, guitar, warm voice",
                                                         lyrics: "[verse]\nI woke in moss\n[chorus]\nStay", about: "For you." });
    const mine = readSong("not json at all", "lyrics", "Hold the light\nhold it near", "slow piano");
    expect(mine.lyrics).toBe("[verse]\nHold the light\nhold it near");
    expect(mine.style).toBe("slow piano");
    expect(mine.title).toBe("HOLD THE LIGHT");
  });
  it("asks for each way in, and keeps the words and style to what a music model takes", () => {
    expect(singAsk("own", "I am MOSS.", "a soft voice", "", "")).toMatch(/of your own/);
    expect(singAsk("lyrics", "I am MOSS.", "a soft voice", "my words", "folk")).toMatch(/exactly as they are[\s\S]*my words[\s\S]*folk/);
    expect(musicWords("folk <script> & {x}")).toBe("folk script & x");
    expect(lyricWords("[verse]\nhi <b>there</b>\n\n\n\nyes")).toBe("[verse]\nhi bthere/b\n\nyes".replace("/", ""));
    expect(captionOf("folk", "a soft voice")).toMatch(/vocals: a soft voice/);
    expect(lyricWords("I\u2019ll hum")).toBe("I'll hum");
  });
  it("shows as a creation, its files once sung", () => {
    const c = songCreation({ id: "d".repeat(32), mode: "own", title: "Moss", style: "folk", lyrics: "[verse]\nhi", about: "", request: "",
                             species: 3, nickname: "MOSS", state: "singing", asked: "2026-11-14T00:00:00Z" }, "HOME");
    expect(c).toMatchObject({ kind: "song", state: "making", files: {} });
    expect(songCreation({ ...(c as any), id: c.id, state: "ready", mode: "own", style: "", lyrics: "", request: "", species: 3, nickname: "MOSS", asked: c.made, title: "Moss", about: "" }, "HOME").files["phone.m4a"]).toMatch(/\/api\/song\//);
  });
});
