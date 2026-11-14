// C-360: a node of THE MESH (procmesh.ts) -- run on roverbyteseer and THE HANDS' Mac by hub/mesh.sh as a LaunchAgent.
// It dials out to the hub (nothing new listens here), says what it can do, how much (cores x its measured speed) and how
// busy it is now, takes the jobs the hub gives it, runs them -- only ffmpeg, only with the job's own files, in a folder
// of its own -- and sends the outputs back. Settings, from the environment:
//   MESH_HUB   the hub, http://<hub>:4730       MESH_KEY   a paired key (hub/mesh.sh install pairs one)
//   MESH_NAME  how THE MIND AT WORK names it    MESH_MOST  jobs at once (default: a quarter of its cores, at least 1)
import { execFileSync } from "node:child_process";
import { createReadStream, createWriteStream, mkdtempSync, rmSync, statSync } from "node:fs";
import { cpus, hostname, loadavg, tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { argvFor, measureSpeed, runFfmpeg, safeArgs, type ProcJob } from "./procmesh.js";
import { FOUND_FFMPEG } from "./ai/voice.js";

const HUB = (process.env.MESH_HUB ?? "").replace(/\/+$/, ""), KEY = process.env.MESH_KEY ?? "";
const NAME = process.env.MESH_NAME || hostname().replace(/\.local$/, "");
if (!HUB || !KEY) { console.error("mesh: MESH_HUB and MESH_KEY are needed (hub/mesh.sh install)"); process.exit(2); }
const ID = NAME.toLowerCase().replace(/[^a-z0-9._-]/g, "-").slice(0, 40);
const CORES = cpus().length, MOST = Math.max(1, Number(process.env.MESH_MOST) || Math.floor(CORES / 4));
const SPEED = measureSpeed();
const CAPS = FOUND_FFMPEG ? ["ffmpeg"] : [];
const say = (...a: unknown[]) => console.log(new Date().toISOString(), ...a);
const auth = { authorization: `Bearer ${KEY}` };
let holds = 0;

// C-360: a node takes no work while its own memory is under pressure -- roverbyteseer restarted (2026-11-14) with its
// swap all but full; macOS says how much memory is free (memory_pressure) and how much swap is used (vm.swapusage).
// Asked every quarter minute; elsewhere (no such commands) it is never under pressure.
let strained = { at: 0, yes: false, said: "" };
function underPressure(): { yes: boolean; said: string } {
  if (Date.now() - strained.at < 15_000) return strained;
  let yes = false, said = "";
  try {
    const free = Number(/(\d+)%/.exec(execFileSync("memory_pressure", ["-Q"], { encoding: "utf8", timeout: 5000 }))?.[1] ?? 100);
    const sw = execFileSync("sysctl", ["-n", "vm.swapusage"], { encoding: "utf8", timeout: 5000 });
    const total = Number(/total = ([\d.]+)M/.exec(sw)?.[1] ?? 0), used = Number(/used = ([\d.]+)M/.exec(sw)?.[1] ?? 0);
    if (free < 20) { yes = true; said = `${free}% of memory free`; }
    else if (total > 0 && used / total > 0.85) { yes = true; said = `swap ${Math.round((100 * used) / total)}% used`; }
  } catch { /* not a Mac */ }
  strained = { at: Date.now(), yes, said };
  return strained;
}

async function post(path: string, body: unknown): Promise<any> {
  const r = await fetch(HUB + path, { method: "POST", headers: { ...auth, "content-type": "application/json" }, body: JSON.stringify(body),
                                      signal: AbortSignal.timeout(20000) });
  if (r.status === 401 || r.status === 403) throw new Error(`the hub refused this node's key (${r.status}) -- hub/mesh.sh install pairs again`);
  return r.json();
}

async function work(job: ProcJob) {
  const t0 = Date.now(), dir = mkdtempSync(join(tmpdir(), "daemons-mesh-"));
  try {
    if (job.kind !== "ffmpeg" || !safeArgs(job.args)) throw new Error("refused: not a job this node runs");
    const files: Record<string, string> = {};
    for (const name of Object.keys(job.inputs)) {
      const safe = name.replace(/[^A-Za-z0-9._-]/g, "_"), to = join(dir, `in-${safe}`);
      const r = await fetch(`${HUB}/api/mesh/in/${job.id}/${encodeURIComponent(name)}`, { headers: auth, signal: AbortSignal.timeout(10 * 60000) });
      if (!r.ok || !r.body) throw new Error(`its input ${name} did not come (${r.status})`);
      await pipeline(Readable.fromWeb(r.body as any), createWriteStream(to));
      files[`in:${name}`] = to;
    }
    for (const name of Object.keys(job.outputs)) files[`out:${name}`] = join(dir, `out-${name.replace(/[^A-Za-z0-9._-]/g, "_")}`);
    await runFfmpeg(argvFor(job.args, files));
    for (const name of Object.keys(job.outputs)) {
      const f = files[`out:${name}`];
      const r = await fetch(`${HUB}/api/mesh/out/${job.id}/${encodeURIComponent(name)}?node=${ID}`, {
        method: "PUT", headers: { ...auth, "content-type": "application/octet-stream", "content-length": String(statSync(f).size) },
        body: Readable.toWeb(createReadStream(f)) as any, duplex: "half", signal: AbortSignal.timeout(10 * 60000) } as RequestInit);
      if (!r.ok) throw new Error(`the hub did not take its output ${name} (${r.status})`);
    }
    await post("/api/mesh/done", { id: job.id, node: ID, ok: true, ms: Date.now() - t0 });
    say(`done ${job.title} in ${Math.round((Date.now() - t0) / 1000)} s`);
  } catch (e) {
    say(`failed ${job.title}: ${(e as Error).message}`);
    await post("/api/mesh/done", { id: job.id, node: ID, ok: false, error: (e as Error).message.slice(0, 200) }).catch(() => {});
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

say(`mesh: ${NAME} (${ID}) -- ${CORES} cores, speed ${SPEED}, ${MOST} at once, caps ${CAPS.join(", ") || "none"}; the hub ${HUB}`);
for (;;) {
  try {
    const p = underPressure();
    if (p.yes) { if (!strained.said.startsWith("!")) { say(`resting: ${p.said}`); strained.said = `!${p.said}`; } await new Promise((r) => setTimeout(r, 15000)); continue; }
    if (holds < MOST) {
      const r = await post("/api/mesh/take", { id: ID, name: NAME, caps: CAPS, cores: CORES, speed: SPEED,
                                                load: Math.round((loadavg()[0] / CORES) * 100) / 100, holds });
      if (r.job) { holds++; void work(r.job).finally(() => { holds--; }); continue; }
    }
  } catch (e) { say(`the hub: ${(e as Error).message}`); await new Promise((r) => setTimeout(r, 10000)); }
  await new Promise((r) => setTimeout(r, 2000));
}
