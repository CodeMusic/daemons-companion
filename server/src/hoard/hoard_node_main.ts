// BRAIN: none -- storage: a node of THE HOARD started by hand
// C-599 (C-596): a node of THE HOARD on any computer, as mesh_worker_main.ts is a node of THE MESH -- for a machine that
// runs the companion's code but not the standalone server (which carries the same node, CodeMusic/daemons-server).
// It dials out to the hub with a paired key and offers a folder. Settings, from the environment:
//   HOARD_HUB   the hub, http://<hub>:4730          HOARD_KEY   a paired key (as hub/mesh.sh install pairs one)
//   HOARD_DIR   the drive or folder offered         HOARD_GB    the most it will share, in gigabytes
//   HOARD_KIND  extend (adds capacity) or replica (a copy of everything)       HOARD_NAME  how THE ENGINE ROOM names it
//   HOARD_PORT  its door (4772)     HOARD_UP  its internet's upload, megabits a second, if known
//   HOARD_WIFI_ONLY=1, HOARD_PLUGGED_ONLY=1   the owner's WHEN (C-601)
import { hostname } from "node:os";
import { HoardNode, DOOR_PORT } from "./node.js";

const env = process.env;
const HUB = (env.HOARD_HUB ?? "").replace(/\/+$/, ""), KEY = env.HOARD_KEY ?? "", DIR = env.HOARD_DIR ?? "";
if (!HUB || !KEY || !DIR) { console.error("hoard: HOARD_HUB, HOARD_KEY and HOARD_DIR are needed"); process.exit(2); }
const NAME = env.HOARD_NAME || hostname().replace(/\.local$/, "");
const ID = `hoard-${NAME.toLowerCase().replace(/[^a-z0-9._-]/g, "-")}`.slice(0, 40);
const say = (...a: unknown[]) => console.log(new Date().toISOString(), ...a);
const node = new HoardNode({
  hub: () => HUB, key: () => KEY, id: () => ID, name: () => NAME, dir: () => DIR,
  kind: () => (env.HOARD_KIND === "replica" ? "replica" : "extend"), bytes: () => Math.round((Number(env.HOARD_GB) || 1) * 1e9),
  port: Number(env.HOARD_PORT) || DOOR_PORT, up: () => Number(env.HOARD_UP) || null,
  when: () => ({ wifiOnly: env.HOARD_WIFI_ONLY === "1", pluggedOnly: env.HOARD_PLUGGED_ONLY === "1" }), log: say,
});
await node.start();
say(`hoard: ${NAME} (${ID}) offers ${env.HOARD_GB || 1} GB of ${DIR} as ${env.HOARD_KIND === "replica" ? "a REPLICA" : "an EXTEND"}; its door on ${node.port}; the hub ${HUB}`);
let last = "";
setInterval(() => { const s = node.state(); const now = s.lastError || s.rests || `${s.files} files, ${s.used} bytes`; if (now !== last) { say(now); last = now; } }, 5000);
for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => { void node.stop().then(() => process.exit(0)); });
