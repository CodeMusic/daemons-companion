// C-360: THE MESH for processing -- each job to the most reliable node with the most potential free, hedged
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { argvFor, free, keepSpeed, ProcMesh, reliability, safeArgs, score, SPEED_READINGS, type MeshNode } from "../src/machine/procmesh.js";

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });
const dir = () => { const d = mkdtempSync(join(tmpdir(), "mesh-")); dirs.push(d); return d; };
const node = (o: Partial<MeshNode>): MeshNode => ({ id: "n", name: "n", caps: ["ffmpeg"], cores: 1, speed: 1, load: 0, seen: Date.now(), holds: 0, history: [], ...o });
const tone = ["-f", "lavfi", "-i", "sine=frequency=440:duration=0.2", "-f", "wav", "@out:wav"];

describe("the score", () => {
  it("ranks by power, reliability and how free a node is now", () => {
    const seer = node({ id: "seer", cores: 12, speed: 8 }), hub = node({ id: "hub", cores: 1, speed: 1 });
    expect(score(seer)).toBeGreaterThan(score(hub));
    const busy = node({ id: "seer", cores: 12, speed: 8, load: 0.97, holds: 3 });
    expect(free(busy)).toBeLessThan(0.05);
    expect(reliability(node({ history: [false, false, false, false] }))).toBeLessThan(0.2);
    expect(reliability(node({ history: [] }))).toBe(0.5);
  });
  it("lets a job name files only as @in/@out", () => {
    expect(safeArgs(["-i", "@in:piece", "-af", "afade=t=out:st=1:d=1", "@out:mp3"])).toBe(true);
    expect(safeArgs(["-i", "/etc/passwd", "@out:x"])).toBe(false);
    expect(safeArgs(["-i", "@in:x", "http://evil/x"])).toBe(false);
    expect(safeArgs(["-i", "../../x"])).toBe(false);
    expect(argvFor(["-i", "@in:a", "@out:b"], { "in:a": "/t/a", "out:b": "/t/b" })).toEqual(["-i", "/t/a", "/t/b"]);
  });
});

describe("routing", () => {
  it("gives a job to the strongest free node, and that node's output reaches the hub's path", async () => {
    const d = dir(), mesh = new ProcMesh(null, { speed: 1 });
    mesh.heard({ id: "seer", name: "roverbyteseer", caps: ["ffmpeg"], cores: 12, speed: 8, load: 0.1 });
    const out = join(d, "out.wav"), done = mesh.ffmpeg(tone, {}, { wav: out }, { title: "a tone" });
    const j = mesh.take("seer");
    expect(j?.title).toBe("a tone");
    expect(mesh.take("seer")).toBeNull();                                // taken once
    const part = mesh.outputPart(j!.id, "seer", "wav")!;
    writeFileSync(part, "made on seer");
    expect(mesh.done(j!.id, "seer", true)).toBe(true);
    await done;
    expect(readFileSync(out, "utf8")).toBe("made on seer");
    expect(mesh.view().find((n) => n.id === "seer")?.reliability).toBeGreaterThan(0.5);
  });
  it("runs it on the hub when no other node can, or the others have gone quiet", async () => {
    const d = dir(), mesh = new ProcMesh(null, { speed: 1 });
    mesh.heard({ id: "old", caps: ["ffmpeg"], cores: 12, speed: 8 });
    mesh.nodes.get("old")!.seen = Date.now() - 60_000;                   // not heard for a minute: not trusted
    await mesh.ffmpeg(tone, {}, { wav: join(d, "here.wav") }, { title: "here" });
    expect(existsSync(join(d, "here.wav"))).toBe(true);
  });
  it("gives a failed job to the next, and the hub last", async () => {
    const d = dir(), mesh = new ProcMesh(null, { speed: 1 });
    mesh.heard({ id: "seer", caps: ["ffmpeg"], cores: 12, speed: 8 });
    const p = mesh.ffmpeg(tone, {}, { wav: join(d, "x.wav") }, { title: "x" });
    const j = mesh.take("seer")!;
    mesh.done(j.id, "seer", false, "no disk");                           // seer fails it: the hub makes it
    await p;
    expect(existsSync(join(d, "x.wav"))).toBe(true);
    expect(mesh.nodes.get("seer")!.history).toEqual([false]);
  });
  it("throws a hedged loser's copy away", async () => {
    const d = dir(), mesh = new ProcMesh(null, { speed: 1 });
    mesh.heard({ id: "a", caps: ["ffmpeg"], cores: 12, speed: 8 });
    const out = join(d, "y.wav"), p = mesh.ffmpeg(tone, {}, { wav: out }, { title: "y" });
    const j = mesh.take("a")!;
    writeFileSync(mesh.outputPart(j.id, "a", "wav")!, "first");
    mesh.done(j.id, "a", true);
    await p;
    expect(mesh.outputPart(j.id, "a", "wav")).toBeNull();                // done: nothing more is taken for it
    expect(readFileSync(out, "utf8")).toBe("first");
  });
  it("refuses a job that reaches outside its files", async () => {
    const mesh = new ProcMesh(null, { speed: 1 });
    await expect(mesh.ffmpeg(["-i", "/etc/hosts", "@out:x"], {}, { x: "/tmp/never" }, { title: "bad" })).rejects.toThrow();
  });
});

describe("a node's speed", () => {
  it("is the best of its last few readings, so a reading taken while busy does not stand", () => {
    let k = keepSpeed([], 0.49);
    expect(k.speed).toBe(0.49);
    k = keepSpeed(k.readings, 7.4);
    expect(k.speed).toBe(7.4);
    k = keepSpeed(k.readings, 2.17);
    expect(k.speed).toBe(7.4);
    for (let i = 0; i < SPEED_READINGS; i++) k = keepSpeed(k.readings, 3);   // the old best ages out
    expect(k.speed).toBe(3);
    expect(k.readings).toHaveLength(SPEED_READINGS);
    expect(keepSpeed([], Number.NaN).speed).toBe(0.1);
  });
});
