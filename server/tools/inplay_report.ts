// C-478: a game in play, reported to the hub from a script -- the reporter any program can copy (the playground's page,
// an AI run-through, a handheld): a heartbeat every few seconds with the save whenever it changed, the screen now and
// then, and it stops when the hub answers {end: true} or when it is stopped (its goodbye: POST .../over).
//
//   npx tsx tools/inplay_report.ts --hub http://daemons-hearth:4730 --key KEY --source ai --id ai-1 \
//       --device "this Mac" --user "the AI" --save path/to/copy.sav --frame path/to/screen.png [--edition CONTENT] [--for 60]
//
// --save and --frame are read again at each beat, so a program that rewrites them is followed as it plays. --key is a
// paired key (KEYS in THE ENGINE ROOM); on the hub's own machine none is needed. Never the player's own save: a copy.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

const arg = (name: string) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };
const hub = (arg("hub") ?? "http://127.0.0.1:4730").replace(/\/+$/, ""), key = arg("key") ?? process.env.HUB_KEY;
const id = arg("id") ?? `${arg("source") ?? "ai"}-${Date.now().toString(36)}`, source = arg("source") ?? "ai";
const every = 5000, until = arg("for") ? Date.now() + Number(arg("for")) * 1000 : Infinity;
const auth: Record<string, string> = key ? { authorization: `Bearer ${key}` } : {};
let lastSave = "", lastFrame = "";

async function beat(): Promise<boolean> {
  const savePath = arg("save"), framePath = arg("frame");
  let save: string | undefined;
  if (savePath && existsSync(savePath)) {
    const b = readFileSync(savePath), h = createHash("sha1").update(b).digest("hex");
    if (h !== lastSave) { save = b.toString("base64"); lastSave = h; }
  }
  const r = await fetch(`${hub}/api/games/beat`, { method: "POST", headers: { "content-type": "application/json", ...auth },
    body: JSON.stringify({ id, source, device: arg("device"), user: arg("user"), edition: arg("edition"), save }) });
  const j = await r.json() as { end?: boolean; error?: string };
  if (!r.ok) throw new Error(j.error ?? `the hub said ${r.status}`);
  if (framePath && existsSync(framePath)) {
    const f = readFileSync(framePath), h = createHash("sha1").update(f).digest("hex");
    if (h !== lastFrame) {
      const type = framePath.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
      const fr = await fetch(`${hub}/api/games/${id}/frame`, { method: "POST", headers: { "content-type": type, ...auth }, body: f });
      if (fr.ok) lastFrame = h; else console.error(`frame: ${((await fr.json()) as { error?: string }).error ?? fr.status}`);
    }
  }
  return !!j.end;
}
async function bye() { try { await fetch(`${hub}/api/games/${id}/over`, { method: "POST", headers: auth }); } catch { /* the hub lets it go itself */ } }

process.on("SIGINT", () => { void bye().then(() => process.exit(0)); });
console.log(`in play as ${id} (${source}) at ${hub}`);
for (;;) {
  const end = await beat();
  if (end) { console.log("the hub asked this game to end"); await bye(); break; }
  if (Date.now() > until) { await bye(); break; }
  await new Promise((r) => setTimeout(r, every));
}
