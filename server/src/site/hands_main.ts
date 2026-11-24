// C-342: THE HANDS (DRAFT) -- THE ENGINE ROOM's helper on the computer that holds the save, DAEMONS' art and the releases.
// It dials out to the hub (nothing new listens here), takes the next job asked for in THE ENGINE ROOM, runs it from this
// checkout -- only the commands jobs.ts names, never anything the hub sends -- and sends back what it printed as it goes.
// Run by hub/hands.sh as a LaunchAgent; its settings are environment variables:
//   HANDS_HUB   the hub, http://<hub>:4730          HANDS_KEY   a paired key (hub/hands.sh install pairs one)
//   HANDS_ROOT  the checkout the jobs run from (the folder holding syncCompanion.sh and .hub)
import { spawn } from "node:child_process";
import { JOBS, argvOf } from "./jobs.js";

const HUB = (process.env.HANDS_HUB ?? "").replace(/\/+$/, ""), KEY = process.env.HANDS_KEY ?? "", ROOT = process.env.HANDS_ROOT ?? "";
if (!HUB || !KEY || !ROOT) { console.error("hands: HANDS_HUB, HANDS_KEY and HANDS_ROOT are needed (hub/hands.sh install)"); process.exit(2); }
const say = (...a: unknown[]) => console.log(new Date().toISOString(), ...a);
const call = async (path: string, body: unknown) => {
  const r = await fetch(HUB + path, { method: "POST", headers: { authorization: `Bearer ${KEY}`, "content-type": "application/json" },
                                      body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
  if (r.status === 401 || r.status === 403) throw new Error(`the hub refused THE HANDS' key (${r.status}) -- hub/hands.sh install pairs again`);
  return r.json() as Promise<any>;
};

async function runJob(job: { id: string; name: string; arg: string | null }) {
  const kind = JOBS[job.name];
  if (!kind) return call("/api/engine/report", { id: job.id, output: "THE HANDS do not know this job -- update this checkout\n", exit: 127 });
  if (kind.arg && !new RegExp(kind.arg.pattern).test(job.arg ?? ""))     // checked again here: the hub is not trusted to have
    return call("/api/engine/report", { id: job.id, output: "refused: its argument is not of the right kind\n", exit: 2 });
  const argv = argvOf(kind, job.arg);                                      // the command is this checkout's, not the hub's
  say("run", job.name, job.arg ?? "");
  let buf = `$ ${job.name}${job.arg ? ` ${job.arg}` : ""}\n`, sending = Promise.resolve();
  const flush = () => { const out = buf; buf = ""; if (out) sending = sending.then(() => call("/api/engine/report", { id: job.id, output: out })).catch(() => {}); };
  const tick = setInterval(flush, 2000);
  const exit = await new Promise<number | null>((done) => {
    const p = spawn(argv[0], argv.slice(1), { cwd: ROOT, env: { ...process.env, PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH ?? ""}` } });
    p.stdout.on("data", (d) => { buf += d; }); p.stderr.on("data", (d) => { buf += d; });
    const kill = setTimeout(() => { buf += "\n(stopped after 30 minutes)\n"; p.kill("SIGTERM"); }, 30 * 60_000);
    p.on("error", (e) => { buf += `\n${e.message}\n`; clearTimeout(kill); done(127); });
    p.on("close", (code) => { clearTimeout(kill); done(code); });
  });
  clearInterval(tick); flush(); await sending;
  await call("/api/engine/report", { id: job.id, output: "", exit });
  say("done", job.name, "exit", exit);
}

// ask every five seconds; a hub not answering (asleep, away, restarting) is asked again a little later
let quiet = 0;
for (;;) {
  try {
    const { job } = await call("/api/engine/next", {});
    quiet = 0;
    if (job) { await runJob(job); continue; }
  } catch (e) {
    if (quiet++ % 60 === 0) say("the hub did not answer:", (e as Error).message);
  }
  await new Promise((r) => setTimeout(r, 5000));
}
