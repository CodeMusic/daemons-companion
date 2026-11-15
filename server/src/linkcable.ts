// C-221: THE LINK CABLE (DRAFT) -- the hub's way to the two linked games `seer/linkhost/` runs (mGBA's lockstep cable,
// headless, on the always-on machine). Node only: api.ts imports it, never the phone.
//
// The hub passes on three things and nothing else: a player's screen (`/f/N`, deflated as it came, or `/v/N`, as video:
// each changed frame deflated, led by its length), the buttons a player
// holds (`/k/N/KEYS`), and the cable's state. linkhost's own `/p/` (a byte into a game's memory, the DEBUG build's warp)
// is never reachable from here. Where linkhost is: the setting `link.host`, or DAEMONS_LINKHOST, e.g.
// http://roverbyteseer:4795 -- unset, the cable is not running and the page says so.
import { request } from "node:http";
import type { ServerResponse } from "node:http";

export const PLAYERS = 2;

export function linkHost(setting: string | null | undefined, env = process.env.DAEMONS_LINKHOST): string | null {
  const v = (setting || env || "").trim().replace(/\/+$/, "");
  return /^http:\/\/[A-Za-z0-9.:[\]-]+$/.test(v) ? v : null;
}

// what the hub asks linkhost for, from what a phone asked the hub: null for anything else
export function linkTarget(path: string): string | null {
  const f = /^\/api\/link\/f\/(\d)$/.exec(path);
  if (f && Number(f[1]) < PLAYERS) return `/f/${f[1]}`;
  const v = /^\/api\/link\/v\/(\d)$/.exec(path);                 // the screen as video: changed frames, one line held open
  if (v && Number(v[1]) < PLAYERS) return `/v/${v[1]}`;
  const k = /^\/api\/link\/k\/(\d)\/(\d{1,4})$/.exec(path);
  if (k && Number(k[1]) < PLAYERS) return `/k/${k[1]}/${Number(k[2]) & 0x3ff}`;
  if (path === "/api/link/state") return "/state";
  return null;
}

// passed on as it comes -- the screen still deflated, so a phone on the tailnet gets ~2 KB, not 150
export function linkRoute(res: ServerResponse, host: string | null, path: string, acceptEncoding: string): Promise<void> | void {
  const target = linkTarget(path);
  const fail = (status: number, error: string): void => {
    if (res.headersSent) { res.end(); return; }
    res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify({ error }));
  };
  if (!target) return void fail(404, "not found");
  if (!host) return void fail(503, "the link cable is not running on the hub");   // DRAFT
  return new Promise<void>((done) => {
    const ask = request(`${host}${target}`, { headers: /deflate/.test(acceptEncoding) ? { "Accept-Encoding": "deflate" } : {}, timeout: 3000 }, (up) => {
      const headers: Record<string, string> = { "Content-Type": String(up.headers["content-type"] ?? "application/octet-stream"), "Cache-Control": "no-store" };
      if (up.headers["content-encoding"]) headers["Content-Encoding"] = String(up.headers["content-encoding"]);
      res.writeHead(up.statusCode ?? 502, headers);
      up.pipe(res);
      up.on("end", () => done());
      up.on("error", () => { res.end(); done(); });
    });
    ask.on("timeout", () => ask.destroy(new Error("timeout")));   // video sends a word every second, so 3 s quiet is gone
    ask.on("error", () => { fail(502, "the link cable did not answer"); done(); });   // DRAFT
    res.on("close", () => { if (!res.writableFinished) ask.destroy(); });   // the viewer gone: linkhost's line closed too
    ask.end();
  });
}

// C-221: a player's own save carried in and out of their seat -- in, the whole save and that game starts again from it;
// out, the save as the game holds it now (the hub keeps it as a copy by name, saves.ts, never over anyone's own file)
const SAVE_MIN = 0x10000, SAVE_MAX = 0x20000;
export function seatOk(seat: unknown): seat is number { return Number.isInteger(seat) && (seat as number) >= 0 && (seat as number) < PLAYERS; }
function carry(host: string, seat: number, method: "GET" | "PUT", bytes?: Uint8Array): Promise<Uint8Array> {
  return new Promise((done, fail) => {
    const ask = request(`${host}/s/${seat}`, { method, timeout: 5000,
      headers: bytes ? { "Content-Type": "application/octet-stream", "Content-Length": String(bytes.length) } : {} }, (up) => {
      const parts: Buffer[] = [];
      up.on("data", (b: Buffer) => parts.push(b));
      up.on("end", () => up.statusCode === 200 ? done(new Uint8Array(Buffer.concat(parts))) : fail(new Error(`linkhost answered ${up.statusCode}`)));
      up.on("error", fail);
    });
    ask.on("timeout", () => ask.destroy(new Error("the link cable did not answer")));
    ask.on("error", fail);
    ask.end(bytes ? Buffer.from(bytes) : undefined);
  });
}
export async function seatSave(host: string, seat: number, bytes: Uint8Array): Promise<void> {
  if (bytes.length < SAVE_MIN || bytes.length > SAVE_MAX) throw new Error("a whole save, 64 to 128 KiB");
  await carry(host, seat, "PUT", bytes);
}
export async function takeSave(host: string, seat: number): Promise<Uint8Array> {
  const b = await carry(host, seat, "GET");
  if (b.length < SAVE_MIN || b.length > SAVE_MAX) throw new Error("the link cable gave back no whole save");
  return b;
}

// The page a phone's GAME tab shows (the hub serves it at /link/, so its requests are the hub's own): one player's
// screen and the buttons under it. The app hands it the seat and its key before it loads (window.LINK); on this machine
// ?p=0 or ?p=1 does. Every word DRAFT.
export const LINK_PAGE = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<title>The link cable</title>
<style>
:root{--bg:#0f1115;--ink:#c9ccd3;--dim:#6b7080;--key:#1c2029;--edge:#3a3f4a;--on:#7c7}
*{box-sizing:border-box;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}
html,body{margin:0;height:100%;background:var(--bg);color:var(--ink);font:12px ui-monospace,Menlo,monospace;letter-spacing:1px;touch-action:none}
body{display:flex;flex-direction:column;align-items:center;padding:8px 16px env(safe-area-inset-bottom)}
#who{margin:4px 0 8px;color:var(--dim)}
canvas{width:100%;max-width:480px;aspect-ratio:3/2;image-rendering:pixelated;border:2px solid var(--edge);background:#000}
#said{min-height:16px;margin:6px 0;color:var(--dim);text-align:center}
.pad{width:100%;max-width:480px;display:flex;justify-content:space-between;align-items:center;margin-top:8px}
.dpad{display:grid;grid-template-columns:repeat(3,52px);grid-template-rows:repeat(3,52px)}
.k{display:flex;align-items:center;justify-content:center;background:var(--key);border:1px solid var(--edge);border-radius:6px;color:var(--ink)}
.k.held{background:var(--edge);border-color:var(--on)}
.ab{display:flex;gap:14px}.ab .k{width:64px;height:64px;border-radius:32px;font-size:16px}
.row{width:100%;max-width:480px;display:flex;justify-content:space-between;margin-top:14px}
.row .k{width:88px;height:34px;border-radius:17px}
#saves{gap:8px;align-items:center}#saves select{flex:1;min-width:0;height:34px;background:var(--key);color:var(--ink);border:1px solid var(--edge);border-radius:6px;font:inherit}
.act{padding:0 12px;height:34px;display:flex;align-items:center;border:1px solid var(--edge);border-radius:17px;background:var(--key)}
</style></head><body>
<div id="who">THE LINK CABLE · DRAFT</div>
<canvas id="c" width="240" height="160"></canvas>
<div id="said"></div>
<div class="row"><div class="k" data-b="512">L</div><div class="k" data-b="256">R</div></div>
<div class="pad">
  <div class="dpad"><span></span><div class="k" data-b="64">▲</div><span></span>
    <div class="k" data-b="32">◀</div><span></span><div class="k" data-b="16">▶</div>
    <span></span><div class="k" data-b="128">▼</div><span></span></div>
  <div class="ab"><div class="k" data-b="2">B</div><div class="k" data-b="1">A</div></div>
</div>
<div class="row"><div class="k" data-b="4">SELECT</div><div class="k" data-b="8">START</div></div>
<div class="row" id="saves"><select id="pick" aria-label="a save the companion keeps"></select><div class="act" id="sit" role="button">SIT IT HERE</div><div class="act" id="home" role="button">TAKE IT HOME</div></div>
<script>
const L = window.LINK || {}, q = new URLSearchParams(location.search);
const seat = Number(L.seat ?? q.get("p") ?? 0), auth = L.token ? { Authorization: "Bearer " + L.token } : {};
document.getElementById("who").textContent = "THE LINK CABLE · PLAYER " + (seat + 1) + (L.edition ? " · " + L.edition : "") + " · DRAFT";
const said = (t) => { document.getElementById("said").textContent = t; };
const cx = document.getElementById("c").getContext("2d"), img = new ImageData(240, 160);
let quiet = 0;
const paint = (b) => {
  for (let p = 0; p < b.length; p += 4) { img.data[p] = b[p]; img.data[p + 1] = b[p + 1]; img.data[p + 2] = b[p + 2]; img.data[p + 3] = 255; }
  cx.putImageData(img, 0, 0);
};
// the screen asked for a frame at a time: where the video below cannot be had
async function draw() {
  try {
    const r = await fetch("/api/link/f/" + seat, { headers: auth, cache: "no-store" });
    if (!r.ok) { said((await r.json().catch(() => ({}))).error || "the link cable did not answer"); quiet++; }
    else {
      paint(new Uint8Array(await r.arrayBuffer())); if (quiet) said(""); quiet = 0;
      if (lost && !still) { lost = 0; return watch(); }   // the cable answers again: back to the video
    }
  } catch (e) { said("the hub did not answer"); quiet++; }
  setTimeout(draw, quiet ? Math.min(3000, 250 * quiet) : document.hidden ? 1000 : 33);
}
// the screen as video: one line held open, each changed frame deflated and led by its length (0: the screen is still)
const inflate = async (z) => new Uint8Array(await new Response(new Blob([z]).stream().pipeThrough(new DecompressionStream("deflate"))).arrayBuffer());
let lost = 0, still = !window.DecompressionStream;   // still: a frame at a time for good (no video here or there)
async function watch() {
  if (still || lost >= 3) return draw();
  let shown = false;
  try {
    const r = await fetch("/api/link/v/" + seat, { headers: auth, cache: "no-store" });
    if (!r.ok) throw new Error(String(r.status));
    if (!r.body || !/x-daemons-frames/.test(r.headers.get("content-type") || "")) { still = true; return draw(); }   // a linkhost without video
    const rd = r.body.getReader();
    let buf = new Uint8Array(0);
    const need = async (n) => {
      while (buf.length < n) {
        const { value, done } = await rd.read();
        if (done) throw new Error("ended");
        const m = new Uint8Array(buf.length + value.length); m.set(buf); m.set(value, buf.length); buf = m;
      }
    };
    for (;;) {
      await need(4);
      const n = ((buf[0] << 24) | (buf[1] << 16) | (buf[2] << 8) | buf[3]) >>> 0;
      buf = buf.subarray(4);
      if (!n) continue;
      await need(n);
      const z = buf.slice(0, n);
      buf = buf.subarray(n);
      if (!document.hidden) paint(await inflate(z));
      if (!shown) { said(""); shown = true; lost = 0; }
    }
  } catch (e) {
    lost++; said("the picture stopped -- joining again");   // DRAFT
    setTimeout(watch, 1000);
  }
}
watch();
// the buttons sent one after another, in order; a tap is held at least 80 ms, so the game (reading them once a frame)
// sees even the quickest one
let keys = 0, line = Promise.resolve();
const send = () => { const k = keys; line = line.then(() => fetch("/api/link/k/" + seat + "/" + k, { headers: auth, cache: "no-store" }).catch(() => {})); };
const held = new Map(), since = {};
function press(el, on) {
  const b = Number(el.dataset.b);
  if (on) { since[b] = Date.now(); el.classList.add("held"); keys |= b; return send(); }
  const wait = 80 - (Date.now() - (since[b] || 0));
  setTimeout(() => { el.classList.remove("held"); keys &= ~b; send(); }, Math.max(0, wait));
}
document.querySelectorAll(".k").forEach((el) => {
  el.addEventListener("pointerdown", (e) => { e.preventDefault(); el.setPointerCapture(e.pointerId); held.set(e.pointerId, el); press(el, true); });
  const up = (e) => { if (held.get(e.pointerId) === el) { held.delete(e.pointerId); press(el, false); } };
  el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
});
// a player's own save: one the companion keeps, sat in this seat (the game starts again from it), and home again as a
// kept copy when they are done
const pick = document.getElementById("pick");
fetch("/api/saves", { headers: auth, cache: "no-store" }).then((r) => r.json()).then((j) => {
  for (const s of j.saves || []) { const o = document.createElement("option"); o.value = s.id; o.textContent = s.name + " · " + s.playTime + " · " + s.label; pick.appendChild(o); }
}).catch(() => {});
async function carry(what, b) {
  said("…");
  try {
    const r = await fetch("/api/link/" + what, { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify({ seat, ...b }) });
    const j = await r.json().catch(() => ({}));
    said(!r.ok ? (j.error || "the link cable did not answer") : what === "seat" ? j.save.name + "'s game is in this seat" : "kept on the companion as LINK CABLE · PLAYER " + (seat + 1));
  } catch (e) { said("the hub did not answer"); }
}
document.getElementById("sit").onclick = () => pick.value && confirm("This seat's game starts again from that save. Anything not saved in it is lost.") && carry("seat", { id: pick.value });
document.getElementById("home").onclick = () => carry("home", {});
const BIT = { x: 1, z: 2, Shift: 4, Enter: 8, ArrowRight: 16, ArrowLeft: 32, ArrowUp: 64, ArrowDown: 128, s: 256, a: 512 };
const bitOf = (e) => BIT[e.key.length === 1 ? e.key.toLowerCase() : e.key];
onkeydown = (e) => { const b = bitOf(e); if (b && !(keys & b)) { keys |= b; send(); } if (b) e.preventDefault(); };
onkeyup = (e) => { const b = bitOf(e); if (b) { keys &= ~b; send(); } };
</script></body></html>`;
