// C-342 (the user, 2026-11-11: "commands like (./syncCompanion.sh site) ... we should have abilities to run that from the
// engine room -- basically that site should handle anything we might have had to do with the commandline before"):
// THE ENGINE ROOM's JOBS (DRAFT). A job is asked for on the hub; THE HANDS -- a helper on the computer that holds the save,
// DAEMONS' art and the releases (hands_main.ts, hub/hands.sh) -- dials out, takes the next, runs it and sends back what it
// printed. Only the jobs named here run, each a fixed command; the one thing a job is given is checked against its pattern.
// The queue is kept in the store, so a restart keeps what was asked and what was said.
import type { Store } from "./store.js";

export type JobKind = { said: string; group: string; arg?: { pattern: string; said: string }; danger?: boolean;
                        run: string[] };                     // argv from the computer's checkout; "$ARG" is the one argument
// $HUB and $COMMONS come from .hub beside syncCompanion.sh (never committed): how this computer reaches the hub and THE
// COMMONS' machine by ssh. Every word DRAFT.
const SH = (line: string) => ["/bin/bash", "-c", `set -a; [ -f .hub ] && . ./.hub; set +a; ${line}`];
export const JOBS: Record<string, JobKind> = {
  "save-status": { group: "THE SAVE", said: "Which side changed -- this computer's save or the hub's", run: ["./syncCompanion.sh", "status"] },
  "save-sync":   { group: "THE SAVE", said: "Keep them in step: whichever side changed goes to the other", run: ["./syncCompanion.sh"] },
  "save-push":   { group: "THE SAVE", said: "This computer's save to the hub, over a change there (kept aside)", danger: true, run: ["./syncCompanion.sh", "push"] },
  "save-pull":   { group: "THE SAVE", said: "The hub's save to this computer, over a change here (kept aside; the emulator closed)", danger: true, run: ["./syncCompanion.sh", "pull"] },
  "art":         { group: "TO THE HUB", said: "DAEMONS' own art, for the hub's pictures", run: ["./syncCompanion.sh", "art"] },
  "debug":       { group: "TO THE HUB", said: "The newest DEBUG patches from the ROM release", run: ["./syncCompanion.sh", "debug"] },
  "site":        { group: "TO THE HUB", said: "Build the site on this computer and send it (it also comes by itself from every push)", run: ["./syncCompanion.sh", "site"] },
  "backups":     { group: "FROM THE HUB", said: "The hub's nightly backups, to this computer", run: ["./syncCompanion.sh", "backups"] },
  "deploy":      { group: "THE HUB", said: "Bring the hub's server up to date with main, and restart it", run: SH(`ssh "$HUB" 'sudo -n /usr/local/sbin/daemons-companion-deploy'`) },
  "commons-homes":   { group: "THE COMMONS", said: "Every home, approved or waiting (the keeper's list)", run: SH(`ssh "$COMMONS" 'cd ~/Projects/daemons-companion && zsh hub/commons.sh homes'`) },
  "commons-approve": { group: "THE COMMONS", said: "Let a home in", arg: { pattern: "^[A-Za-z0-9_-]{1,40}$", said: "the home's id" },
                       run: SH(`ssh "$COMMONS" "cd ~/Projects/daemons-companion && zsh hub/commons.sh approve $ARG"`) },
  "commons-refuse":  { group: "THE COMMONS", said: "Let a home out", arg: { pattern: "^[A-Za-z0-9_-]{1,40}$", said: "the home's id" }, danger: true,
                       run: SH(`ssh "$COMMONS" "cd ~/Projects/daemons-companion && zsh hub/commons.sh refuse $ARG"`) },
  "commons-update":  { group: "THE COMMONS", said: "Bring THE COMMONS up to date with main, and restart it", run: SH(`ssh "$COMMONS" 'cd ~/Projects/daemons-companion && zsh hub/commons.sh update'`) },
};
// the argv a job runs, its argument put in place (already checked against its pattern)
export const argvOf = (k: JobKind, arg: string | null) => k.run.map((a) => a.replace(/\$ARG/g, arg ?? ""));

export type Job = { id: string; name: string; arg: string | null; by: string; state: "waiting" | "running" | "done" | "failed" | "called off";
                    asked: string; started?: string; ended?: string; exit?: number | null; output: string };
const KEY = "engine.jobs", HANDS = "engine.hands", KEEP = 40, MOST = 64 * 1024;
const load = (s: Store): Job[] => { try { return JSON.parse(s.getSetting(KEY) ?? "[]"); } catch { return []; } };
const save = (s: Store, js: Job[]) => s.setSetting(KEY, JSON.stringify(js.slice(0, KEEP)));

export function ask(s: Store, name: unknown, arg: unknown, by: string, now = new Date()): Job | { error: string } {
  const k = typeof name === "string" ? JOBS[name] : undefined;
  if (!k) return { error: "no such job" };
  const a = typeof arg === "string" ? arg.trim() : "";
  if (k.arg && !new RegExp(k.arg.pattern).test(a)) return { error: `it needs ${k.arg.said}` };
  const job: Job = { id: `j${now.getTime().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name: name as string,
                     arg: k.arg ? a : null, by, state: "waiting", asked: now.toISOString(), output: "" };
  save(s, [job, ...load(s)]);
  return job;
}
export function list(s: Store) { return load(s); }
export function callOff(s: Store, id: string): boolean {
  const js = load(s), j = js.find((x) => x.id === id);
  if (!j || j.state !== "waiting") return false;
  j.state = "called off"; j.ended = new Date().toISOString(); save(s, js); return true;
}
// THE HANDS take the oldest waiting job; a job left running by hands that went away (an hour) is said to have failed
export function next(s: Store, hands: string, now = new Date()): (Job & { argv: string[] }) | null {
  s.setSetting(HANDS, JSON.stringify({ name: hands, seen: now.toISOString() }));
  const js = load(s);
  for (const j of js) if (j.state === "running" && j.started && now.getTime() - Date.parse(j.started) > 3600e3) {
    j.state = "failed"; j.ended = now.toISOString(); j.output += "\n(the hands went quiet)";
  }
  const j = [...js].reverse().find((x) => x.state === "waiting");
  if (!j) { save(s, js); return null; }
  j.state = "running"; j.started = now.toISOString(); save(s, js);
  return { ...j, argv: argvOf(JOBS[j.name], j.arg) };
}
// what a running job printed, sent as it goes; done with its exit code at the end
export function report(s: Store, id: string, out: string, exit?: number | null, now = new Date()): boolean {
  const js = load(s), j = js.find((x) => x.id === id);
  if (!j || j.state !== "running") return false;
  j.output = (j.output + out).slice(-MOST);
  if (exit !== undefined) { j.exit = exit; j.state = exit === 0 ? "done" : "failed"; j.ended = now.toISOString(); }
  save(s, js); return true;
}
export function hands(s: Store): { name: string; seen: string } | null {
  try { return JSON.parse(s.getSetting(HANDS) ?? "null"); } catch { return null; }
}
export const kinds = () => Object.entries(JOBS).map(([name, k]) => ({ name, said: k.said, group: k.group, arg: k.arg?.said ?? null, danger: !!k.danger }));
