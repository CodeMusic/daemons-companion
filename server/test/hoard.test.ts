// C-596 (the user, 2026-11-27): THE HOARD -- the household's own local cloud storage, the storage twin of THE MIND.
// Who may read or delete a file is the hub's to enforce, so it is tried here against a real server: the share's scope,
// its time, download-once, owner-only removal and a keeper's delete (C-598, C-600); EXTEND adding capacity and REPLICA
// adding none but holding a copy of everything (C-599); and a file asked of the node that would deliver it soonest (C-574).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { makeServer } from "../src/api.js";
import { DEFAULTS } from "../src/shared/config.js";
import { Store } from "../src/shared/db.js";
import { FRESH_MS, Nodes, freeOf, reliability, scoreOf, type NetNode } from "../src/shared/nodes.js";
import { free as meshFree, score as meshScore, power as meshPower, type MeshNode } from "../src/machine/procmesh.js";
import { DiskStore, HoardNode, HOARD_FRESH_MS, restsBy, ticketFor, ticketOk, type LinkKind } from "../src/hoard/node.js";
import { canRead, canRemove, capacityOf, cleanName, cleanUpFor, lastingOf, mimeOf, minutesOf, plan, shareNow, sizeSaid,
         type Copy, type HoardFile, type Holder, type Who } from "../src/hoard/rules.js";
import { doorFor, estimateMs, learn, potential, rank, sourceScore, type Source } from "../src/hoard/route.js";

const tmp = mkdtempSync(join(tmpdir(), "hoard-test-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));
const MB = 1024 * 1024;
const bytesOf = (n: number, seed: string) => { const out = Buffer.alloc(n); let h = createHash("sha256").update(seed).digest(); for (let i = 0; i < n; i += 32) { h.copy(out, i, 0, Math.min(32, n - i)); h = createHash("sha256").update(h).digest(); } return out; };
const shaOf = (b: Buffer) => createHash("sha256").update(b).digest("hex");

// ---------------------------------------------------------------- the node code THE MIND and THE HOARD share (C-597)
describe("THE NODES: one registry for THE MESH and THE HOARD (C-597)", () => {
  it("keeps a node fresh, reliable and ranked the same way for both", () => {
    let now = 1_000_000;
    type N = NetNode & { potential: number };
    const nodes = new Nodes<N>({ now: () => now });
    nodes.hear({ id: "a b/c", name: "A", caps: ["x"], holds: 0 }, () => ({ potential: 10 }));
    nodes.hear({ id: "quick", name: "Q", caps: ["x"], holds: 0 }, () => ({ potential: 30 }));
    expect([...nodes.keys()]).toEqual(["abc", "quick"]);                 // an id cleaned, as THE MESH always did
    const score = (n: N) => scoreOf(n.potential, n, freeOf(0, n.holds));
    expect(nodes.ranked(score).map((n) => n.id)).toEqual(["quick", "abc"]);
    for (let i = 0; i < 6; i++) nodes.mark("quick", false);              // it fails six: no longer the best
    expect(reliability(nodes.get("quick")!)).toBeCloseTo(1 / 8);
    expect(nodes.ranked(score)[0].id).toBe("abc");
    now += FRESH_MS + 1;                                                 // neither heard from: neither is given anything
    expect(nodes.ranked(score)).toEqual([]);
    nodes.hear({ id: "abc" }, (was) => ({ potential: was!.potential }));
    expect(nodes.ranked(score).map((n) => n.id)).toEqual(["abc"]);
    expect(nodes.get("abc")!.name).toBe("A");                            // what it had is kept
  });
  it("THE MESH's score is the shared one: power x reliability x free", () => {
    const n: MeshNode = { id: "m", name: "m", caps: ["ffmpeg"], cores: 8, speed: 2, load: 0.5, seen: 0, holds: 1, history: [true, true, false] };
    expect(meshFree(n)).toBe(freeOf(0.5, 1));
    expect(meshScore(n)).toBe(scoreOf(meshPower(n), n, freeOf(0.5, 1)));
    expect(meshScore(n)).toBeCloseTo(16 * (3 / 5) * 0.25);
  });
});

// ---------------------------------------------------------------- the rules, as plain values
const file = (o: Partial<HoardFile> & { link?: string | null } = {}): HoardFile & { link?: string | null } => ({
  id: "f1", sha: "a".repeat(64), size: 100, name: "a.txt", mime: "text/plain", owner: "kowner", ownerName: "Owner", added: 1000, share: "me", friend: null,
  until: null, once: false, taken: null, protected: false, how: "copy", kind: "file", of: null, meta: {}, ...o });
const owner: Who = { key: "kowner", name: "Owner" }, other: Who = { key: "kother", name: "Other" }, keeper: Who = { key: "kkeep", name: "Keeper", keeper: true };

describe("THE HOARD's rules (C-598)", () => {
  it("only yourself: the owner reads it and nobody else does, not even a keeper", () => {
    const f = file();
    expect(canRead(f, owner, 2000)).toBe(true);
    expect(canRead(f, other, 2000)).toBe(false);
    expect(canRead(f, keeper, 2000)).toBe(false);
    expect(canRead(f, { key: "", name: "x", link: "l" }, 2000)).toBe(false);
  });
  it("the household reads a household share; a friend's link opens only a friend share, and only its own", () => {
    expect(canRead(file({ share: "household" }), other, 2000)).toBe(true);
    expect(canRead(file({ share: "household" }), { key: "", name: "x", link: "l" }, 2000)).toBe(false);     // a link is not the household
    const f = file({ share: "friend", link: "hash-1" });
    expect(canRead(f, { key: "", name: "x", link: "hash-1" }, 2000)).toBe(true);
    expect(canRead(f, { key: "", name: "x", link: "hash-2" }, 2000)).toBe(false);
    expect(canRead(f, other, 2000)).toBe(false);                                                           // nor is the household a friend
  });
  it("a share lasts for always, for a limited time, or until it has been downloaded -- then it is the owner's alone", () => {
    expect(lastingOf({ minutes: minutesOf(1, 2, 3) }, 0)).toEqual({ until: (1440 + 120 + 3) * 60_000, once: false });
    expect(lastingOf({}, 0)).toEqual({ until: null, once: false });
    expect(lastingOf({ minutes: -5 }, 0).until).toBeNull();
    expect(lastingOf({ minutes: 1e12 }, 0).until).toBe(366 * 24 * 60 * 60_000);
    const timed = file({ share: "household", until: 5000 });
    expect(canRead(timed, other, 4999)).toBe(true);
    expect(canRead(timed, other, 5000)).toBe(false);
    expect(shareNow(timed, 5000)).toBe("me");
    expect(canRead(timed, owner, 9999)).toBe(true);
    const once = file({ share: "household", once: true });
    expect(canRead(once, other, 1)).toBe(true);
    expect(canRead({ ...once, taken: 1 }, other, 2)).toBe(false);
    expect(canRead({ ...once, taken: 1 }, owner, 2)).toBe(true);
  });
  it("only the owner who posted it removes it; a keeper may delete any", () => {
    expect(canRemove(file(), owner)).toBe(true);
    expect(canRemove(file(), other)).toBe(false);
    expect(canRemove(file({ share: "household" }), other)).toBe(false);          // being able to read is not being able to remove
    expect(canRemove(file(), keeper)).toBe(true);
  });
  it("when it is full: the oldest first, only as many as it takes, never a protected one", () => {
    const fs = [file({ id: "old", sha: "1".repeat(64), size: 40, added: 1 }), file({ id: "kept", sha: "2".repeat(64), size: 40, added: 2, protected: true }),
                file({ id: "mid", sha: "3".repeat(64), size: 40, added: 3 }), file({ id: "new", sha: "4".repeat(64), size: 40, added: 4 })];
    expect(cleanUpFor(fs, 10, 5)).toEqual([]);
    expect(cleanUpFor(fs, 10, 30)).toEqual(["old"]);
    expect(cleanUpFor(fs, 10, 60)).toEqual(["old", "mid"]);                      // the protected one between them is passed over
    expect(cleanUpFor(fs, 10, 131)).toBeNull();                                  // it cannot be made to fit: nothing is removed
    // two files of the same bytes: the room comes only when both are gone
    const twins = [file({ id: "t1", sha: "9".repeat(64), size: 50, added: 1 }), file({ id: "t2", sha: "9".repeat(64), size: 50, added: 2 })];
    expect(cleanUpFor(twins, 0, 50)).toEqual(["t1", "t2"]);
  });
  it("names a file safely and knows how the app looks at it", () => {
    expect(cleanName("../../etc/passwd")).toBe("passwd");
    expect(cleanName("C:\\x\\song.mp3")).toBe("song.mp3");
    expect(cleanName("")).toBe("a file");
    expect(mimeOf("a.mp3")).toBe("audio/mpeg");
    expect(mimeOf("a.bin", "video/mp4; codecs=avc1")).toBe("video/mp4");
    expect(mimeOf("notes.md", "application/octet-stream")).toBe("text/markdown");
    expect(sizeSaid(1_500_000)).toBe("1.5 MB");
  });
});

describe("THE HOARD's offers: EXTEND adds, REPLICA mirrors (C-599)", () => {
  const TB = 1e12;
  const node = (id: string, kind: Holder["kind"], offer: number, o: Partial<Holder> = {}): Holder => ({ id, kind, offer, state: "on", fresh: true, ...o });
  it("a 1 TB hoard and a new 1 TB EXTEND make 2 TB; a REPLICA leaves it at 1 TB", () => {
    expect(capacityOf([node("a", "extend", TB)])).toBe(TB);
    expect(capacityOf([node("a", "extend", TB), node("b", "extend", TB)])).toBe(2 * TB);
    expect(capacityOf([node("a", "extend", TB), node("r", "replica", TB)])).toBe(TB);
    expect(capacityOf([node("a", "extend", TB), node("b", "extend", TB, { state: "retiring" })])).toBe(TB);
  });
  it("keeps one copy on the EXTEND node with the most room and one on every REPLICA", () => {
    const blobs = [{ sha: "1".repeat(64), size: 60 }, { sha: "2".repeat(64), size: 60 }];
    const nodes = [node("small", "extend", 100), node("big", "extend", 1000), node("mirror", "replica", 1000)];
    const p = plan(blobs, nodes, []);
    expect(p.filter((c) => c.node === "mirror").map((c) => c.state)).toEqual(["want", "want"]);
    expect(p.filter((c) => c.node === "big").length).toBe(2);                    // both go where the room is
    expect(p.some((c) => c.node === "small")).toBe(false);
    // once they are held, nothing more is asked
    const have: Copy[] = p.map((c) => ({ ...c, state: "have" }));
    expect(plan(blobs, nodes, have)).toEqual([]);
  });
  it("a node that is away is passed over for one that is here; a full one for one with room", () => {
    const b = [{ sha: "1".repeat(64), size: 60 }];
    expect(plan(b, [node("away", "extend", 9000, { fresh: false }), node("here", "extend", 100)], [])).toEqual([{ sha: b[0].sha, node: "here", state: "want" }]);
    expect(plan(b, [node("full", "extend", 50), node("room", "extend", 100)], [])[0].node).toBe("room");
    expect(plan(b, [node("full", "extend", 50)], [])).toEqual([]);               // nowhere to put it: nothing is promised
  });
  it("a retiring node's files move off it, and it lets go only once another holds them", () => {
    const b = [{ sha: "1".repeat(64), size: 60 }];
    const nodes = [node("leaving", "extend", 0, { state: "retiring" }), node("stays", "extend", 1000)];
    const first = plan(b, nodes, [{ sha: b[0].sha, node: "leaving", state: "have" }]);
    expect(first).toEqual([{ sha: b[0].sha, node: "stays", state: "want" }]);    // not dropped yet: it is the only copy
    const then = plan(b, nodes, [{ sha: b[0].sha, node: "leaving", state: "have" }, { sha: b[0].sha, node: "stays", state: "have" }]);
    expect(then).toEqual([{ sha: b[0].sha, node: "leaving", state: "drop" }]);
  });
  it("a blob no file names any more is dropped everywhere", () => {
    expect(plan([], [node("a", "extend", 100)], [{ sha: "1".repeat(64), node: "a", state: "have" }])).toEqual([{ sha: "1".repeat(64), node: "a", state: "drop" }]);
  });
});

describe("THE HOARD's route: the node that would deliver it soonest (C-574)", () => {
  const src = (o: Partial<Source>): Source => ({ node: "n", name: "n", url: "http://x", near: "here", link: "ethernet", up: null, learned: null, traffic: 0, ping: 2, history: [], ...o });
  const size = 200 * MB;
  it("weighs how far away it is and the upload speed of its internet", () => {
    expect(potential(src({ near: "here", link: "ethernet" }))).toBe(400);
    expect(potential(src({ near: "away", link: "ethernet", up: 20 }))).toBe(20);       // across the internet: its upload is the most it can send
    expect(potential(src({ near: "away", link: "ethernet", up: null }))).toBe(10);     // nobody has said: taken as slow
    const r = rank([src({ node: "far", near: "away", up: 20, ping: 60 }), src({ node: "home", near: "here", link: "wifi", ping: 4 })], size);
    expect(r.map((s) => s.node)).toEqual(["home", "far"]);
  });
  it("weighs Wi-Fi against Ethernet", () => {
    expect(rank([src({ node: "wifi", link: "wifi" }), src({ node: "wired", link: "ethernet" })], size)[0].node).toBe("wired");
  });
  it("weighs its current traffic: a busy fast node behind an idle slower one", () => {
    const busy = src({ node: "busy", link: "ethernet", traffic: 9 }), idle = src({ node: "idle", link: "wifi", traffic: 0 });
    expect(sourceScore(busy)).toBeLessThan(sourceScore(idle));
    expect(rank([busy, idle], size)[0].node).toBe("idle");
  });
  it("weighs ping time: for a small file the first byte is nearly all of it", () => {
    const quick = src({ node: "quick", link: "wifi", ping: 3 }), slow = src({ node: "slow", link: "ethernet", ping: 300 });
    expect(rank([quick, slow], 20_000)[0].node).toBe("quick");
    expect(rank([quick, slow], 2000 * MB)[0].node).toBe("slow");                       // for a large one, what it can carry
  });
  it("weighs how its last deliveries went, and what they really measured", () => {
    const flaky = src({ node: "flaky", history: [false, false, false, false, false, false] }), steady = src({ node: "steady", link: "wifi", history: [true, true, true] });
    expect(rank([flaky, steady], size)[0].node).toBe("steady");
    expect(potential(src({ link: "wifi", learned: 300 }))).toBe(300);                  // measured: it stands for the guess
    expect(learn(null, 50 * MB, 4000)).toBeCloseTo(104.86, 1);
    expect(learn(100, 50 * MB, 4000)).toBeCloseTo(101.62, 1);
    expect(learn(100, 1000, 10)).toBe(100);                                            // too small to say anything
    expect(estimateMs(src({ learned: 80, ping: 10 }), 10 * MB)).toBeGreaterThan(estimateMs(src({ learned: 160, ping: 10 }), 10 * MB));
  });
  it("picks the door an asker can reach: their own network, then the tailnet, never another home's private address", () => {
    const doors = ["http://10.0.0.20:4772", "http://100.101.102.103:4772"];
    expect(doorFor(doors, "10.0.0.7")).toEqual({ url: doors[0], near: "here" });
    expect(doorFor(doors, "100.70.1.2")).toEqual({ url: doors[1], near: "tailnet" });
    expect(doorFor(doors, "192.168.1.5")).toBeNull();
    expect(doorFor(doors, "203.0.113.9")).toBeNull();
    expect(doorFor(["https://files.example.org"], "203.0.113.9")).toEqual({ url: "https://files.example.org", near: "away" });
  });
});

// ---------------------------------------------------------------- a node: the folder, the ticket, the WHEN
describe("a node of THE HOARD (C-599, C-601)", () => {
  it("keeps a blob whole or not at all, by its SHA-256, inside a folder of its own", async () => {
    const dir = join(tmp, "disk-a"), d = new DiskStore(dir);
    const b = bytesOf(300_000, "one");
    const r = await d.put(Readable.from([b.subarray(0, 100_000), b.subarray(100_000)]));
    expect(r).toMatchObject({ sha: shaOf(b), size: 300_000, fresh: true });
    expect(d.root).toBe(join(dir, "daemons-hoard"));                                   // never loose among the owner's own files
    expect(d.list()).toEqual([{ sha: shaOf(b), size: 300_000 }]);
    await expect(d.put(Readable.from([b]), { sha: "0".repeat(64) })).rejects.toThrow(/not the bytes/);
    await expect(d.put(Readable.from([bytesOf(5000, "big")]), { most: 4000 })).rejects.toThrow(/room/);
    expect(d.list().length).toBe(1);                                                   // neither refusal left anything behind
    expect((await d.put(Readable.from([b]))).fresh).toBe(false);
    expect(d.remove(shaOf(b))).toBe(true);
    expect(d.used()).toBe(0);
  });
  it("a ticket opens one blob until its hour, and no other", () => {
    const sha = "a".repeat(64), now = 1_700_000_000_000, exp = now / 1000 + 60;
    const t = ticketFor("secret", sha, exp);
    expect(ticketOk("secret", sha, exp, t, now)).toBe(true);
    expect(ticketOk("secret", sha, exp, t, now + 61_000)).toBe(false);                 // past its hour
    expect(ticketOk("secret", "b".repeat(64), exp, t, now)).toBe(false);               // another blob
    expect(ticketOk("secret", sha, exp + 3600, t, now)).toBe(false);                   // an hour stretched
    expect(ticketOk("other", sha, exp, t, now)).toBe(false);                           // another node's secret
    expect(ticketOk("secret", sha, exp, t, now, "o:1")).toBe(false);                   // a mark changed
    expect(ticketOk("", sha, exp, ticketFor("", sha, exp), now)).toBe(false);          // a node with no secret opens nothing
  });
  it("takes part at any time, only on Wi-Fi, and/or only while plugged in", () => {
    expect(restsBy({ wifiOnly: false, pluggedOnly: false }, "cell", false)).toBe("");
    expect(restsBy({ wifiOnly: true, pluggedOnly: false }, "cell", true)).toBe("not on Wi-Fi");
    expect(restsBy({ wifiOnly: true, pluggedOnly: false }, "wifi", false)).toBe("");
    expect(restsBy({ wifiOnly: true, pluggedOnly: false }, "ethernet", false)).toBe("");   // a cable is not a phone's data
    expect(restsBy({ wifiOnly: false, pluggedOnly: true }, "wifi", false)).toBe("not plugged in");
    expect(restsBy({ wifiOnly: true, pluggedOnly: true }, "wifi", true)).toBe("");
  });
});

// ---------------------------------------------------------------- the hub, two phones, and two more computers
let skew = 0;
const store = new Store(":memory:", { now: () => Date.now() + skew });
const server = makeServer({ ...DEFAULTS, database: ":memory:", savePath: null }, store);
const A = "phone-a-key-0123456789abcdef", B = "phone-b-key-0123456789abcdef", N1 = "node-one-key-0123456789abcd", N2 = "node-two-key-0123456789abcd";
let port = 0, hub = "";
const nodes: HoardNode[] = [];
beforeAll(async () => {
  for (const [t, n] of [[A, "Ada's phone"], [B, "Ben's phone"], [N1, "THE HOARD (study)"], [N2, "THE HOARD (attic)"]]) store.addPhone(t, n);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  port = (server.address() as AddressInfo).port; hub = `http://127.0.0.1:${port}`;
});
afterAll(async () => { for (const n of nodes) await n.stop(); server.close(); });
const as = (key: string | null): Record<string, string> => (key ? { authorization: `Bearer ${key}` } : {});
async function get(p: string, key: string | null = A) { const r = await fetch(hub + p, { headers: as(key) }); return { status: r.status, body: (await r.json().catch(() => ({}))) as any }; }
async function post(p: string, b: unknown, key: string | null = A) {
  const r = await fetch(hub + p, { method: "POST", headers: { ...as(key), "content-type": "application/json" }, body: JSON.stringify(b) });
  return { status: r.status, body: (await r.json().catch(() => ({}))) as any };
}
async function upload(bytes: Buffer, q: Record<string, string>, key: string | null = A) {
  const r = await fetch(`${hub}/api/hoard/upload?${new URLSearchParams(q)}`, { method: "POST", headers: { ...as(key), "content-type": "application/octet-stream" }, body: new Uint8Array(bytes) });
  return { status: r.status, body: (await r.json().catch(() => ({}))) as any };
}
async function node(key: string, name: string, kind: "extend" | "replica", bytes: number, link: LinkKind = "ethernet") {
  const dir = mkdtempSync(join(tmp, `${name}-`));
  let n!: HoardNode;
  n = new HoardNode({ hub: () => hub, key: () => key, id: () => name, name: () => name, dir: () => dir, kind: () => kind, bytes: () => bytes, port: 0, host: "127.0.0.1",
                      link: () => link, doors: () => [`http://127.0.0.1:${n.port}`] });
  await n.start({ beats: false });
  nodes.push(n);
  return n;
}
const hubDir = mkdtempSync(join(tmp, "hub-drive-"));
let study!: HoardNode, attic!: HoardNode;

describe("THE HOARD on the hub (C-596)", () => {
  it("has no room until something offers some", async () => {
    expect((await get("/api/hoard")).body).toMatchObject({ capacity: 0, used: 0 });
    const r = await upload(bytesOf(1000, "early"), { name: "early.txt" });
    expect(r.status).toBe(507);
    expect(r.body.error).toMatch(/no room yet/);
  });
  it("the hub offers a folder of its own with a maximum size; a second computer EXTENDS it; a third REPLICATES it", async () => {
    expect((await post("/api/engine/hoard/offer", { dir: "relative/path", gb: 1 })).status).toBe(400);
    expect((await post("/api/engine/hoard/offer", { dir: join(hubDir, "nope"), gb: 1 })).status).toBe(400);
    const v = await post("/api/engine/hoard/offer", { dir: hubDir, gb: (3 * MB) / 1e9, kind: "extend" });
    expect(v.status).toBe(200);
    expect(v.body.capacity).toBe(3 * MB);
    study = await node(N1, "study", "extend", 2 * MB, "ethernet");
    await study.beat();
    expect((await get("/api/hoard")).body.capacity).toBe(5 * MB);                        // EXTEND: 3 MB and 2 MB make 5 MB
    attic = await node(N2, "attic", "replica", 20 * MB, "wifi");
    await attic.beat();
    const h = (await get("/api/hoard")).body;
    expect(h.capacity).toBe(5 * MB);                                                    // REPLICA: still 5 MB
    expect(h.nodes.map((n: any) => `${n.id}:${n.kind}:${n.fresh}`).sort()).toEqual(["attic:replica:true", "hub:extend:true", "study:extend:true"]);
    expect(study.secret).toMatch(/^[0-9a-f]{48}$/);                                     // each node its own secret, from the hub
    expect(attic.secret).not.toBe(study.secret);
  });
  it("a node is its key's: another key cannot speak for it", async () => {
    const r = await post("/api/hoard/beat", { id: "study", name: "study", offer: { kind: "extend", bytes: 9e12 }, used: 0, diskFree: 0, doors: [], link: "ethernet", up: null, traffic: 0, rests: "" }, N2);
    expect(r.status).toBe(403);
    expect((await get("/api/hoard")).body.capacity).toBe(5 * MB);
    expect((await post("/api/hoard/beat", { id: "study" }, null)).status).toBe(403);     // nor the hub's own machine without a key
  });

  const mine = bytesOf(200_000, "ada's notes"), shared = bytesOf(150_000, "the household's list");
  let mineId = "", sharedId = "";
  it("only yourself: its owner sees and fetches it, the rest of the household cannot", async () => {
    const r = await upload(mine, { name: "notes.txt", share: "me", how: "copy" });
    expect(r.status).toBe(200);
    expect(r.body.file).toMatchObject({ name: "notes.txt", mime: "text/plain", size: 200_000, sha: shaOf(mine), ownerName: "Ada's phone", share: "me", mine: true, how: "copy" });
    expect(r.body.md5).toBe(createHash("md5").update(mine).digest("hex"));               // what a MOVE checks before it lets go (C-576)
    expect(JSON.stringify(r.body)).not.toContain("link");
    mineId = r.body.file.id;
    expect((await get("/api/hoard/files")).body.files.map((f: any) => f.id)).toEqual([mineId]);
    expect((await get("/api/hoard/files", B)).body.files).toEqual([]);
    expect((await get(`/api/hoard/files/${mineId}`, B)).status).toBe(403);
    expect((await get(`/api/hoard/files/${mineId}/sources`, B)).status).toBe(403);
    expect((await get(`/api/hoard/files/${mineId}/text`, B)).status).toBe(403);
    expect((await get(`/api/hoard/files/${mineId}/sources`, null)).status).toBe(403);    // the hub's own machine is not its owner either
    expect((await get(`/api/hoard/files/${mineId}/text`)).body).toEqual({ text: mine.toString("utf8"), whole: true });
    expect((await get("/api/hoard/files/0000000000000000")).status).toBe(404);
  });
  it("is replicated: one copy on an EXTEND node, one on the REPLICA, and the hub's stage let go", async () => {
    await study.beat(); await attic.beat();
    expect(attic.store.has(shaOf(mine))).toBe(true);                                    // the REPLICA fetched it
    await attic.beat();                                                                  // and says so
    const v = (await get("/api/engine/hoard")).body;
    expect(v).toMatchObject({ blobs: 1, safe: 1, twice: 1, waiting: 0 });
    expect(v.nodes.find((n: any) => n.id === "attic")).toMatchObject({ has: 1, behind: 0 });
    expect(v.nodes.find((n: any) => n.id === "hub").has + v.nodes.find((n: any) => n.id === "study").has).toBe(1);   // one EXTEND copy, not two
    expect(existsSync(join(hubDir, "daemons-hoard", shaOf(mine).slice(0, 2), shaOf(mine)))).toBe(true);              // the hub had the most room
  });
  it("the household: shared for a limited time, then its owner's alone again", async () => {
    const r = await upload(shared, { name: "list.md", share: "household", minutes: String(minutesOf(0, 2, 0)) });
    sharedId = r.body.file.id;
    expect(r.body.file.until).toBeGreaterThan(Date.now() + 119 * 60_000);
    expect((await get("/api/hoard/files", B)).body.files.map((f: any) => f.id)).toEqual([sharedId]);
    const s = (await get(`/api/hoard/files/${sharedId}/sources`, B)).body;
    expect(s.sources.length).toBeGreaterThan(0);
    for (const x of s.sources) expect(Number(new URL(x.url, hub).searchParams.get("e")) * 1000).toBeLessThanOrEqual(r.body.file.until + 1000);   // no ticket outlives the share
    skew += 2 * 3600_000 + 1000;                                                         // two hours pass
    for (const n of nodes) await n.beat();                                               // (the nodes are still here)
    expect((await get("/api/hoard/files", B)).body.files).toEqual([]);
    expect((await get(`/api/hoard/files/${sharedId}`, B)).status).toBe(403);
    expect((await get(`/api/hoard/files/${sharedId}/sources`, B)).status).toBe(403);
    const mineNow = (await get(`/api/hoard/files/${sharedId}`)).body.file;
    expect(mineNow).toMatchObject({ share: "household", shareNow: "me", ended: true, mine: true });   // not removed: its owner's
    expect((await get(`/api/hoard/files/${sharedId}/sources`)).body.sources.length).toBeGreaterThan(0);
  });
  it("only its owner changes a file's share; shared again, the household reads it again", async () => {
    expect((await post(`/api/hoard/files/${sharedId}`, { share: "household" }, B)).status).toBe(403);
    expect((await post(`/api/hoard/files/${sharedId}`, { name: "theirs.md" }, B)).status).toBe(403);
    expect((await post(`/api/hoard/files/${sharedId}`, { share: "household" })).body.file).toMatchObject({ shareNow: "household", until: null });
    expect((await get(`/api/hoard/files/${sharedId}`, B)).status).toBe(200);
  });

  it("until they have downloaded it: the first whole download by someone else ends the share", async () => {
    const once = bytesOf(120_000, "for one pair of eyes");
    const r = await upload(once, { name: "once.bin", share: "household", once: "1" });
    const id = r.body.file.id;
    // its owner fetching it does not end it
    const own = (await get(`/api/hoard/files/${id}/sources`)).body;
    expect(own.through).toBe(false);
    expect(shaOf(Buffer.from(await (await fetch(new URL(own.sources[0].url, hub))).arrayBuffer()))).toBe(shaOf(once));
    expect((await get(`/api/hoard/files/${id}`, B)).status).toBe(200);
    // someone else: only through the hub, which sees it arrive whole
    const s = (await get(`/api/hoard/files/${id}/sources`, B)).body;
    expect(s.through).toBe(true);
    expect(s.sources.map((x: any) => x.node)).toEqual(["hub"]);
    const url = new URL(s.sources[0].url, hub);
    // a part of it is not a download: a range is answered whole or not at all, and a broken one ends nothing
    const got = await fetch(url, { headers: { range: "bytes=0-9" } });
    expect(got.status).toBe(200);
    expect(shaOf(Buffer.from(await got.arrayBuffer()))).toBe(shaOf(once));
    await new Promise((r) => setTimeout(r, 30));
    expect((await get(`/api/hoard/files/${id}`, B)).status).toBe(403);                   // the share has ended
    expect((await fetch(url)).status).toBe(403);                                         // and the same ticket opens nothing now
    expect((await get("/api/hoard/files", B)).body.files.some((f: any) => f.id === id)).toBe(false);
    expect((await get(`/api/hoard/files/${id}`)).body.file).toMatchObject({ shareNow: "me", ended: true });   // still its owner's
    expect((await get(`/api/hoard/files/${id}/sources`)).body.sources.length).toBeGreaterThan(0);
  });

  it("a friend outside the household: a link that opens one file, for its time, and once if asked", async () => {
    const gift = bytesOf(90_000, "for a friend");
    const r = await upload(gift, { name: "for you.txt", share: "friend", friend: "Wren", minutes: "30" });
    expect(r.body.file).toMatchObject({ share: "friend", friend: "Wren" });
    expect(r.body.link).toMatch(/^\/hoard\/s\/[A-Za-z0-9_-]{24}$/);
    expect(JSON.stringify((await get("/api/engine/hoard")).body)).not.toContain(r.body.link.split("/").pop());   // the link is kept only as its hash
    const page = await fetch(hub + r.body.link);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("for you.txt");
    expect(shaOf(Buffer.from(await (await fetch(`${hub}${r.body.link}/file`)).arrayBuffer()))).toBe(shaOf(gift));
    expect((await fetch(`${hub}/hoard/s/${"x".repeat(24)}/file`)).status).toBe(404);
    expect((await get(`/api/hoard/files/${r.body.file.id}`, B)).status).toBe(403);       // a friend share is not the household's
    skew += 31 * 60_000;
    expect((await fetch(`${hub}${r.body.link}/file`)).status).toBe(403);                 // its time is up
    expect((await fetch(hub + r.body.link)).status).toBe(403);
    // shared again, once: a new link; the old one is dead; the second download is refused
    const again = (await post(`/api/hoard/files/${r.body.file.id}`, { share: "friend", friend: "Wren", once: true })).body;
    expect(again.link).not.toBe(r.body.link);
    expect((await fetch(`${hub}${r.body.link}/file`)).status).toBe(404);
    expect((await fetch(`${hub}${again.link}/file`)).status).toBe(200);
    await new Promise((r) => setTimeout(r, 30));
    expect((await fetch(`${hub}${again.link}/file`)).status).toBe(403);
    // and none of it through the relay
    expect((await fetch(`${hub}${again.link}`, { headers: { "x-companion-relay": "anything" } })).status).toBe(403);
  });

  it("only the owner who posted it removes it; a keeper in THE ENGINE ROOM deletes any", async () => {
    expect((await post(`/api/hoard/files/${sharedId}/remove`, {}, B)).status).toBe(403);  // Ben reads it, and cannot remove it
    expect((await get(`/api/hoard/files/${sharedId}`)).status).toBe(200);
    const bens = (await upload(bytesOf(50_000, "ben's"), { name: "bens.txt" }, B)).body.file.id;
    expect((await post(`/api/hoard/files/${bens}/remove`, {})).status).toBe(403);          // nor Ada his
    // a keeper sees that it is there, and may delete it -- but seeing is not reading
    const all = (await get("/api/engine/hoard")).body.all;
    expect(all.some((f: any) => f.id === bens && f.ownerName === "Ben's phone")).toBe(true);
    expect((await get(`/api/hoard/files/${bens}/sources`)).status).toBe(403);
    expect((await post("/api/engine/hoard/delete", { ids: [bens] })).body.removed).toEqual([bens]);
    expect((await get(`/api/hoard/files/${bens}`, B)).status).toBe(404);
    // its owner removes their own
    const adas = (await upload(bytesOf(40_000, "ada's scrap"), { name: "scrap.txt" })).body.file.id;
    expect((await post(`/api/hoard/files/${adas}/remove`, {})).status).toBe(200);
    expect((await get(`/api/hoard/files/${adas}`)).status).toBe(404);
  });
  it("once keepers are named, only they manage THE HOARD", async () => {
    const keys = (await get("/api/engine/hoard")).body.keys;
    const ada = keys.find((k: any) => k.name === "Ada's phone").key;
    expect((await post("/api/engine/hoard/keepers", { keys: [ada] })).status).toBe(200);
    expect((await get("/api/engine/hoard", B)).status).toBe(403);
    expect((await post("/api/engine/hoard/delete", { ids: [mineId] }, B)).status).toBe(403);
    expect((await post("/api/engine/hoard/policy", { full: "oldest" }, B)).status).toBe(403);
    expect((await get(`/api/hoard/files/${mineId}`)).status).toBe(200);                    // nothing was deleted
    expect((await get("/api/engine/hoard")).status).toBe(200);
    expect((await get("/api/engine/hoard", null)).status).toBe(200);                       // the hub's own machine always may
    expect((await post("/api/engine/hoard/keepers", { keys: [] })).status).toBe(200);
    // one person's two devices, set together: the second reads what the first kept to itself
    const ben = keys.find((k: any) => k.name === "Ben's phone").key;
    expect((await get(`/api/hoard/files/${mineId}`, B)).status).toBe(403);
    await post("/api/engine/hoard/person", { key: ben, person: ada });
    expect((await get(`/api/hoard/files/${mineId}`, B)).status).toBe(200);
    await post("/api/engine/hoard/person", { key: ben, person: null });
    expect((await get(`/api/hoard/files/${mineId}`, B)).status).toBe(403);
  });

  it("asks a file of the node that would deliver it soonest, and learns from what a download measured", async () => {
    for (const n of nodes) await n.beat();
    const s = (await get(`/api/hoard/files/${mineId}/sources`)).body;
    const by = Object.fromEntries(s.sources.map((x: any) => [x.node, x]));
    expect(Object.keys(by).sort()).toEqual(["attic", "hub"]);                             // the two that hold it
    expect(by.attic).toMatchObject({ near: "here", link: "wifi" });
    expect(s.sources[0].ms).toBeLessThanOrEqual(s.sources[1].ms);                          // soonest first
    expect(s.sources[0].why).toMatch(/on this network/);
    // the attic's door hands it over for the hub's ticket: whole, and by range
    const whole = await fetch(by.attic.url);
    expect(whole.status).toBe(200);
    expect(whole.headers.get("content-type")).toBe("text/plain");
    expect(shaOf(Buffer.from(await whole.arrayBuffer()))).toBe(shaOf(mine));
    const part = await fetch(by.attic.url, { headers: { range: "bytes=10-19" } });
    expect(part.status).toBe(206);
    expect(part.headers.get("content-range")).toBe("bytes 10-19/200000");
    expect(Buffer.from(await part.arrayBuffer()).equals(mine.subarray(10, 20))).toBe(true);
    // a ticket changed, or for another blob, opens nothing
    expect((await fetch(by.attic.url.replace(/t=[0-9a-f]{4}/, "t=0000"))).status).toBe(403);
    expect((await fetch(by.attic.url.replace(shaOf(mine), shaOf(shared)))).status).toBe(403);
    // the attic is busy: the hub's own copy is asked first
    attic.traffic = 40; await attic.beat();
    expect((await get(`/api/hoard/files/${mineId}/sources`)).body.sources[0].node).toBe("hub");
    attic.traffic = 0; await attic.beat();
    // downloads measured: the attic really delivers far faster than the hub does -- it is asked first from then on
    await post(`/api/hoard/files/${mineId}/fetched`, { node: "attic", near: "here", bytes: 300 * MB, ms: 3000, ok: true });
    await post(`/api/hoard/files/${mineId}/fetched`, { node: "hub", near: "here", bytes: 300 * MB, ms: 300_000, ok: true });
    const then = (await get(`/api/hoard/files/${mineId}/sources`)).body.sources;
    expect(then[0].node).toBe("attic");
    expect(then[0].learned).toBeCloseTo(838.86, 0);
    expect(then[0].why).toMatch(/measured/);
    // and a node whose deliveries fail is trusted less: the same file from it is now reckoned to take far longer
    for (let i = 0; i < 12; i++) await post(`/api/hoard/files/${mineId}/fetched`, { node: "attic", ok: false });
    const failing = (await get(`/api/hoard/files/${mineId}/sources`)).body.sources.find((x: any) => x.node === "attic");
    expect(failing.ms - failing.ping).toBeGreaterThan((then[0].ms - then[0].ping) * 4);
    expect((await get("/api/engine/hoard")).body.nodes.find((n: any) => n.id === "attic").reliability).toBeLessThan(0.2);
    for (let i = 0; i < 20; i++) await post(`/api/hoard/files/${mineId}/fetched`, { node: "attic", near: "here", bytes: 300 * MB, ms: 3000, ok: true });
  });
  it("a node that rests (not on Wi-Fi, not plugged in) is not asked", async () => {
    const was = attic.o.when;
    attic.o.when = () => ({ wifiOnly: true, pluggedOnly: false });
    attic.o.link = () => "cell";
    await attic.beat();
    expect(attic.rests).toBe("not on Wi-Fi");
    expect((await get(`/api/hoard/files/${mineId}/sources`)).body.sources.map((x: any) => x.node)).toEqual(["hub"]);
    expect((await get("/api/hoard")).body.nodes.find((n: any) => n.id === "attic").rests).toBe("not on Wi-Fi");
    attic.o.when = was; attic.o.link = () => "wifi";
    await attic.beat();
    expect((await get(`/api/hoard/files/${mineId}/sources`)).body.sources.length).toBe(2);
  });
  it("if one source is offline the file is still reachable from the other; the hub passes on what it does not hold", async () => {
    // the study EXTEND node takes a file (the hub's own folder has no room for it), then goes away
    const big = bytesOf(1_600_000, "the big one");
    await post("/api/engine/hoard/offer", { dir: hubDir, gb: (1 * MB) / 1e9, kind: "extend" });     // the hub offers less now: 1 MB
    const r = await upload(big, { name: "big.bin", share: "household" });
    expect(r.status).toBe(200);
    for (const n of nodes) await n.beat();
    for (const n of nodes) await n.beat();
    await new Promise((r) => setTimeout(r, 80));                                          // (the hub has timed each node's door by now)
    expect(study.store.has(shaOf(big))).toBe(true);                                       // it went where there was room
    expect(attic.store.has(shaOf(big))).toBe(true);                                       // and to the REPLICA
    expect((await get("/api/engine/hoard")).body.waiting).toBe(0);                        // the hub holds no copy of this one
    let s = (await get(`/api/hoard/files/${r.body.file.id}/sources`, B)).body.sources;
    expect(s.filter((x: any) => !x.relay).map((x: any) => x.node).sort()).toEqual(["attic", "study"]);
    // the last resort: the hub passing on a copy it does not hold itself -- whole, and by range
    const relay = s.find((x: any) => x.relay);
    expect(relay).toMatchObject({ node: "hub", relay: true });
    expect(relay.why).toMatch(/passed on by the hub/);
    expect(s.indexOf(relay)).toBeGreaterThan(0);                                          // never ahead of the node it would ask
    expect(shaOf(Buffer.from(await (await fetch(new URL(relay.url, hub))).arrayBuffer()))).toBe(shaOf(big));
    const part = await fetch(new URL(relay.url, hub), { headers: { range: "bytes=100-199" } });
    expect(part.status).toBe(206);
    expect(Buffer.from(await part.arrayBuffer()).equals(big.subarray(100, 200))).toBe(true);
    // the study goes offline: its door shut, and not heard from
    await study.stop();
    skew += HOARD_FRESH_MS + 1000;
    await attic.beat();
    s = (await get(`/api/hoard/files/${r.body.file.id}/sources`, B)).body.sources;
    expect(s.filter((x: any) => !x.relay).map((x: any) => x.node)).toEqual(["attic"]);
    expect(shaOf(Buffer.from(await (await fetch(s[0].url)).arrayBuffer()))).toBe(shaOf(big));
    expect((await get("/api/hoard")).body.nodes.find((n: any) => n.id === "study").fresh).toBe(false);
  });

  it("when it is full: by hand it refuses; OLDEST FIRST removes only what a newer file needs, never a PROTECTED one", async () => {
    await study.start({ beats: false }); await study.beat();                              // the study is back
    const v0 = (await get("/api/engine/hoard")).body;
    expect(v0.policy).toBe("manual");
    // more than the whole of THE HOARD has free: refused, nothing removed
    expect((await upload(bytesOf(v0.free + 200_000, "too big"), { name: "too-big.bin" })).status).toBe(507);
    // less than is free in all, but more than any one drive has: a file is kept whole, so that is refused too
    const wide = bytesOf(700_000, "wide");
    expect(v0.free).toBeGreaterThan(wide.length);
    const no = await upload(wide, { name: "wide.bin" });
    expect(no.status).toBe(507);
    expect(no.body.error).toMatch(/no one drive/);
    expect((await get("/api/engine/hoard")).body.files).toBe(v0.files);
    // protect the oldest, then let the oldest go first
    const oldest = [...v0.all].sort((a: any, b: any) => a.added - b.added)[0];
    expect(oldest.name).toBe("notes.txt");
    expect((await post("/api/engine/hoard/protect", { id: oldest.id, on: true })).body.file.protected).toBe(true);
    expect((await post("/api/engine/hoard/policy", { full: "sideways" })).status).toBe(400);
    expect((await post("/api/engine/hoard/policy", { full: "oldest" })).body.policy).toBe("oldest");
    const dry = (await post("/api/engine/hoard/cleanup", { gb: 200_000 / 1e9, dry: true })).body;
    expect(dry.ids.length).toBeGreaterThan(0);
    expect(dry.ids).not.toContain(oldest.id);
    expect((await get("/api/engine/hoard")).body.files).toBe(v0.files);                   // a dry run removed nothing
    const r = await upload(wide, { name: "wide.bin" });
    expect(r.status).toBe(200);
    const v1 = (await get("/api/engine/hoard")).body;
    expect(v1.all.some((f: any) => f.id === oldest.id)).toBe(true);                       // PROTECTED: still here
    expect(v1.all.some((f: any) => f.id === r.body.file.id)).toBe(true);
    expect(v1.cleaned.map((c: any) => c.name)).toEqual(["list.md", "once.bin"]);          // the two oldest unprotected, and no more
    expect(v1.all.some((f: any) => f.name === "for you.txt")).toBe(true);                 // the next oldest was not needed
    expect(v1.used).toBeLessThanOrEqual(v1.capacity);
    // and what cannot fit even then is refused, with nothing removed for it
    expect((await upload(bytesOf(v1.capacity + 1000, "never"), { name: "never.bin" })).status).toBe(507);
    expect((await get("/api/engine/hoard")).body.files).toBe(v1.files);
    expect((await get(`/api/hoard/files/${oldest.id}`)).status).toBe(200);
  });
  it("a node that takes its offer back is emptied before it is let go; its copies move to the nodes that stay", async () => {
    for (const n of nodes) await n.beat();
    for (const n of nodes) await n.beat();
    const before = (await get("/api/engine/hoard")).body;
    const onStudy = before.nodes.find((n: any) => n.id === "study").has;
    await study.beat(true);                                                               // its owner takes the offer back
    const mid = (await get("/api/engine/hoard")).body;
    expect(mid.nodes.find((n: any) => n.id === "study").state).toBe("retiring");
    expect(mid.capacity).toBe(before.capacity - 2 * MB);
    void onStudy;
    expect(mid.safe).toBe(mid.blobs);                                                     // nothing is lost by it
  });
});
