// C-541: the Pi program built by the household's volunteers -- THE MESH's build jobs and THE SHELF
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ProcMesh } from "../src/machine/procmesh.js";
import { newestCommit, PiBuilds, BOARDS } from "../src/machine/pibuilds.js";

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });
const dir = () => { const d = mkdtempSync(join(tmpdir(), "builds-")); dirs.push(d); return d; };
const C1 = "a".repeat(40), C2 = "b".repeat(40);
const host = (mesh: ProcMesh, id: string, caps = ["ffmpeg", "build:pizero"]) => mesh.heard({ id, name: id, caps, cores: 10, speed: 5, load: 0 });
// what a host does with a build: write its three outputs where the hub said, then say done
function buildAs(mesh: ProcMesh, node: string, lie = false) {
  const j = mesh.take(node);
  if (!j || j.kind !== "build") return null;
  const [, commit, board] = j.args, tar = Buffer.from(`program for ${board} at ${commit}`);
  const sha = createHash("sha1").update(lie ? Buffer.from("other") : tar).digest("hex");
  writeFileSync(mesh.outputPart(j.id, node, "tar")!, tar);
  writeFileSync(mesh.outputPart(j.id, node, "deb")!, "deb");
  writeFileSync(mesh.outputPart(j.id, node, "json")!, JSON.stringify({ board, commit, at: "2026-11-24T00:00:00Z", sha1: sha, file: `daemons-zero-${board}.tar.gz` }));
  mesh.done(j.id, node, true);
  return j;
}
const settle = () => new Promise((r) => setTimeout(r, 10));

describe("THE MESH's builds", () => {
  it("waits for a node that names the recipe; the hub never builds, and a node without the cap is not given one", async () => {
    const mesh = new ProcMesh(null, { speed: 1 }), d = dir();
    host(mesh, "plain", ["ffmpeg"]);
    const p = mesh.build("pizero", C1, "gamehat", { tar: join(d, "t"), deb: join(d, "d"), json: join(d, "j") }, { title: "a build" });
    expect(mesh.take("plain")).toBeNull();
    expect(mesh.take("hub")).toBeNull();
    host(mesh, "seer");
    const j = buildAs(mesh, "seer");
    expect(j?.args).toEqual(["pizero", C1, "gamehat"]);
    expect(await p).toBe("seer");
    expect(readFileSync(join(d, "t"), "utf8")).toContain("gamehat");
  });
  it("refuses a recipe, commit or board it does not know", async () => {
    const mesh = new ProcMesh(null, { speed: 1 });
    await expect(mesh.build("rm -rf", C1, "x", {}, { title: "x" })).rejects.toThrow();
    await expect(mesh.build("pizero", "main", "x", {}, { title: "x" })).rejects.toThrow();
  });
  it("a failed build goes to another able node, and fails when none is left", async () => {
    const mesh = new ProcMesh(null, { speed: 1 });
    host(mesh, "one"); host(mesh, "two");
    const p = mesh.build("pizero", C1, "uconsole", {}, { title: "a build" });
    const a = mesh.take("one")!; mesh.done(a.id, "one", false, "the compiler fell over");
    expect(mesh.take("one")).toBeNull();                              // not given back to the one that failed it
    const b = mesh.take("two")!; expect(b.id).toBe(a.id);
    mesh.done(b.id, "two", false, "again");
    await expect(p).rejects.toThrow("again");
  });
  it("gives up a build no volunteer takes", async () => {
    const mesh = new ProcMesh(null, { speed: 1 });
    const p = mesh.build("pizero", C1, "gamepi20", {}, { title: "a build" });
    const id = [...mesh.jobs.keys()][0];
    expect(mesh.drop(id, "no volunteer took it")).toBe(true);
    await expect(p).rejects.toThrow("no volunteer");
  });
});

describe("THE SHELF", () => {
  it("builds every board of a new commit, checks each, and publishes them together in GitHub's shape", async () => {
    const mesh = new ProcMesh(null, { speed: 1 }), shelf = new PiBuilds(dir(), mesh, () => "volunteers");
    host(mesh, "seer");
    const done = shelf.queue(C1);
    for (let i = 0; i < BOARDS.length; i++) { await settle(); buildAs(mesh, "seer"); }
    const m = await done;
    expect(Object.keys(m!.boards).sort()).toEqual([...BOARDS].sort());
    expect(m!.commit).toBe(C1);
    expect(m!.boards.gamehat.builder).toBe("seer");
    expect(shelf.file("daemons-zero-gamehat.tar.gz")).toBeTruthy();
    expect(shelf.file("daemons-zero-gamehat.deb")).toBeTruthy();
    expect(shelf.file("manifest.json")).toBeTruthy();
    expect(shelf.file("../etc/passwd")).toBeNull();
  });
  it("throws away a board whose result is not what its builder said, and keeps that board's older entry", async () => {
    const mesh = new ProcMesh(null, { speed: 1 }), shelf = new PiBuilds(dir(), mesh, () => "volunteers");
    host(mesh, "seer");
    let done = shelf.queue(C1);
    for (let i = 0; i < BOARDS.length; i++) { await settle(); buildAs(mesh, "seer"); }
    await done;
    done = shelf.queue(C2);
    for (let i = 0; i < BOARDS.length; i++) { await settle(); const j = mesh.take("seer")!; mesh.done(j.id, "seer", false, "x"); void j; }
    await settle();
    expect(await done).toBeNull();                                   // nothing new built: the old manifest stands
    expect(shelf.manifest()!.commit).toBe(C1);
    done = shelf.queue(C2);
    await settle(); buildAs(mesh, "seer", true);                     // one board lies about its SHA-1
    for (let i = 1; i < BOARDS.length; i++) { await settle(); buildAs(mesh, "seer"); }
    const m = await done;
    expect(m!.commit).toBe(C2);
    expect(Object.values(m!.boards).filter((e) => e.commit === C1)).toHaveLength(1);   // the lying board's older entry kept
    expect(shelf.file(`daemons-zero-${Object.values(m!.boards).find((e) => e.commit === C1)!.board}.tar.gz`)).toBeTruthy();
  });
  it("asks GitHub only when its source is volunteers, for the later of the program's two paths", async () => {
    const asked: string[] = [];
    const get = (async (url: string) => { asked.push(url); const later = url.includes("patches");
      return new Response(JSON.stringify([{ sha: later ? C2 : C1, commit: { committer: { date: later ? "2026-11-24T10:00:00Z" : "2026-11-23T10:00:00Z" } } }])); }) as unknown as typeof fetch;
    expect((await newestCommit(get))?.sha).toBe(C2);
    const off = new PiBuilds(dir(), new ProcMesh(null, { speed: 1 }), () => null, get);
    asked.length = 0; await off.check();
    expect(asked).toHaveLength(0);
    expect(off.source()).toBe("github");
  });
});
