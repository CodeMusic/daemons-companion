// C-330: THE ENGINE ROOM (DRAFT) -- the hub's admin in one web app, one navigation for all of it:
//   THE HUB      what the hub is running, and what is done on its own machine only
//   THE MIND     THE MIND AT WORK for everyone, and LATER (C-319) -- the app keeps only its player's own; THE MESH to walk into (C-363)
//   THE HOUSE    the casino's odds and why, everyone at the reels, what the house keeps, the weather's city (C-158, C-167)
//   VOICES       MAKE THE VOICES AGAIN (C-303)
//   DEVICES      every device heard, what it carries, forgetting one (C-80)
//   EXCHANGE     its players, and an invite code for a new one (C-218)
//   THE COMMONS  this home's link to the commons, and its keeper's list (C-222), run by THE HANDS
//   KEYS         pairing codes, the paired phones, the relay, Home Assistant (C-342: once the hub's own machine's alone)
//   JOBS         the site built at every push, THE HANDS on the computer, the command line's jobs (C-342)
//   CREATIONS    what the daemons made that the hub keeps -- sleep sounds, paintings -- each let go, or many (C-361)
//   SAVES        the trail of every save that moved, going back to one, and whose copy goes on (C-364, C-365)
// The page holds nothing of the user's: it asks the hub's API, with a paired key kept in this browser (on the hub's own
// machine none is needed). Every word DRAFT.
const KEY = "engine-room.key";
const keyNow = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
const keep = (k) => { try { k ? localStorage.setItem(KEY, k) : localStorage.removeItem(KEY); } catch { /* a private window */ } };

class Refused extends Error {}
// C-401: the hub not answering at all -- a deploy restarts it for a few seconds -- is not an error to show, only a wait
class Away extends Error {}
async function api(path, body) {
  const headers = { "content-type": "application/json" }, k = keyNow();
  if (k) headers.authorization = `Bearer ${k}`;
  let r;
  try { r = await fetch(path, body === undefined ? { headers } : { method: "POST", headers, body: JSON.stringify(body) }); }
  catch { throw new Away("the hub is not answering"); }
  if (r.status === 502 || r.status === 503 || r.status === 504) throw new Away(`the hub said ${r.status}`);
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 || (r.status === 403 && /pair this phone/.test(j.error ?? ""))) throw new Refused(j.error ?? "not paired");
  if (!r.ok) throw new Error(j.error ?? `the hub said ${r.status}`);
  return j;
}

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
// C-405: devices by their names, as the app says them -- learned from /api/devices, at most once a minute
let NAMES = {}, namesAt = 0;
async function learnNames() {
  if (Date.now() - namesAt < 60000) return;
  namesAt = Date.now();
  try { NAMES = Object.fromEntries((await api("/api/devices")).devices.map((d) => [d.id, d.name || d.id])); } catch { namesAt = 0; }
}
const dn = (id) => (id && NAMES[id]) || id;
const $page = document.getElementById("page"), $nav = document.getElementById("nav");
const ago = (iso, now = Date.now()) => {
  if (!iso) return "never";
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)}m ago` : s < 86400 ? `${Math.round(s / 3600)}h ago` : `${Math.round(s / 86400)}d ago`;
};
const took = (ms) => (ms === undefined || ms === null ? "" : ms < 1000 ? `${ms}ms` : ms < 60000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms / 60000)}m`);

// ---- the pages, in the navigation's order ----
const PAGES = [
  { id: "hub", glyph: "⌂", label: "THE HUB", short: "HUB", draw: drawHub },
  { id: "mind", glyph: "◎", label: "THE MIND", short: "MIND", draw: drawMind, every: 3000 },
  { id: "house", glyph: "♣", label: "THE HOUSE", short: "HOUSE", draw: drawHouse, every: 15000 },
  { id: "voices", glyph: "♪", label: "VOICES", short: "VOICES", draw: drawVoices },
  { id: "devices", glyph: "▣", label: "DEVICES", short: "DEVICES", draw: drawDevices, every: 20000 },
  { id: "exchange", glyph: "⇄", label: "EXCHANGE", short: "EXCHANGE", draw: drawExchange },
  { id: "commons", glyph: "◇", label: "THE COMMONS", short: "COMMONS", draw: drawCommons },
  { id: "keys", glyph: "◈", label: "KEYS", short: "KEYS", draw: drawKeys },                    // C-342
  { id: "jobs", glyph: "▶", label: "JOBS", short: "JOBS", draw: drawJobs, every: 3000 },       // C-342
  { id: "creations", glyph: "❖", label: "CREATIONS", short: "MADE", draw: drawCreations },     // C-361
  { id: "saves", glyph: "⟲", label: "SAVES", short: "SAVES", draw: drawSaves },               // C-364
];
let timer = null, ui = {}, drawing = null;          // ui: what a page keeps between its redraws (a filter, a task picked, a note)
// a page asked for before another was opened, answering after it: it writes nothing
const stale = () => pageNow() !== drawing;
const pageNow = () => PAGES.find((p) => p.id === location.hash.slice(1)) ?? PAGES[0];

function drawNav() {
  const now = pageNow();
  $nav.innerHTML = PAGES.map((p) => `<a href="#${p.id}" class="${p === now ? "on" : ""}" ${p === now ? 'aria-current="page"' : ""}>` +
    `<span class="glyph" aria-hidden="true">${p.glyph}</span><span class="long">${p.label}</span><span class="short">${p.short}</span></a>`).join("");
}
// C-401 (the user, 2026-11-14: "I noticed that /admin/ isnt running"): while the hub does not answer, a band under the
// header says so, the page keeps what it last drew, and it asks again every two seconds until the hub is back
const $away = document.createElement("div");
$away.className = "away"; $away.setAttribute("role", "status"); $away.hidden = true;
document.querySelector(".top").after($away);
let awaySince = null;
function markAway(on) {
  if (!on) { if (awaySince !== null) { awaySince = null; $away.hidden = true; } return; }
  awaySince ??= Date.now();
  const s = Math.round((Date.now() - awaySince) / 1000);
  $away.hidden = false;
  $away.innerHTML = s < 90 ? `<b>THE HUB IS RESTARTING</b> · back in a moment${s >= 5 ? ` (${s}s)` : ""}`
                           : `<b>THE HUB ISN'T ANSWERING</b> · ${Math.round(s / 60)}m · still asking every two seconds`;
}
// C-399: each show() is numbered; only the newest may set the next redraw, so a button pressed while a redraw is on its
// way does not leave two redraws running side by side
let shown = 0;
async function show(again = false) {
  clearTimeout(timer);
  const p = pageNow(), n = ++shown;
  drawing = p;
  if (!again) { ui = {}; drawNav(); $page.innerHTML = `<p class="small">Asking the hub…</p>`; }
  // a redraw waits while something is being typed into the page (a home's id, an address)
  const typing = again && document.activeElement?.matches?.("input") && $page.contains(document.activeElement);
  try { if (!typing) { await learnNames(); await p.draw(again && !ui.waiting); markAway(false); } }
  catch (e) {
    if (e instanceof Refused) { markAway(false); return drawPair(e.message); }
    if (e instanceof Away) {
      markAway(true);
      // nothing drawn yet: say why the page is empty; drawn already: leave it as it was
      if (!again || ui.waiting) { ui.waiting = true; $page.innerHTML = `<h1>${esc(p.label)}</h1><p class="small">Waiting for the hub to answer…</p>`; }
      if (pageNow() === p && n === shown) timer = setTimeout(() => show(true), 2000);
      return;
    }
    markAway(false);
    if (!again || ui.waiting) $page.innerHTML = `<h1>${esc(p.label)}</h1><div class="card bad">${esc(e.message)}</div>`;
  }
  ui.waiting = false;
  if (p.every && pageNow() === p && n === shown) timer = setTimeout(() => show(true), p.every);
}
window.addEventListener("hashchange", () => show());
// a button anywhere: data-act names what it does, data-* what it does it to
$page.addEventListener("click", async (ev) => {
  const el = ev.target.closest("[data-act]");
  if (!el) return;
  const fn = ACTS[el.dataset.act];
  if (!fn) return;
  el.disabled = true;
  try { await fn(el.dataset, el); }
  catch (e) {
    if (e instanceof Refused) return drawPair(e.message);
    if (e instanceof Away) { markAway(true); ui.note = "The hub is restarting -- nothing was done. Try again when it is back."; }
    else ui.note = e.message;
  }
  await show(true);
});
const ACTS = {};
const note = () => `<div class="note" role="status">${esc(ui.note ?? "")}</div>`;
const said = (s) => { ui.note = s; };

// ---- pairing: a code from the hub's own screen (hold its button), kept in this browser ----
function drawPair(why) {
  clearTimeout(timer); keep(null);
  $nav.innerHTML = "";
  $page.innerHTML = `<div class="pair card">
    <p class="eyebrow">PAIR THIS BROWSER</p>
    <p>THE ENGINE ROOM runs the hub, so it asks for a paired key, as a phone does.</p>
    <p class="small">Hold the hub's button until its screen shows a code, and type it here. (On the hub's own machine,
      or from the companion's site there, it opens without one.)</p>
    <form id="pairform" class="row"><input id="code" class="text mono" inputmode="numeric" autocomplete="one-time-code"
      placeholder="the code on the hub's screen" aria-label="pairing code" required><button class="btn">PAIR</button></form>
    <div class="note" id="pairnote">${esc(why && !/pair this phone|not paired/.test(why) ? why : "")}</div></div>`;
  document.getElementById("pairform").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const code = document.getElementById("code").value.trim();
    try {
      const r = await fetch("/api/pair", { method: "POST", headers: { "content-type": "application/json" },
                                          body: JSON.stringify({ code, name: "THE ENGINE ROOM" }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.token) throw new Error(j.error ?? "that did not pair");
      keep(j.token); show();
    } catch (e) { document.getElementById("pairnote").textContent = e.message; }
  });
}
ACTS.unpair = () => { throw new Refused(""); };   // drawPair forgets the key

// ---- THE HUB ----
async function drawHub() {
  const h = await api("/api/hub");
  document.getElementById("where").textContent = `${location.host} · ${String(h.server ?? "").slice(0, 7)}`;
  const mods = h.ai?.modules ?? [];
  if (stale()) return;
  $page.innerHTML = `<h1>THE HUB</h1>
    <p class="lede">Everything that runs the house, in one place. Each page here is the hub's; the app keeps only each player's own.</p>
    <div class="grid">
      <div class="card"><p class="eyebrow">THE SERVER</p><div class="big mono">${esc(String(h.server ?? "?").slice(0, 7))}</div>
        <div class="small">${h.onHub ? "on the hub" : "on a computer"} · the save's mirror ${h.mirror?.on ? `kept, ${esc(ago(h.mirror.at))}` : "off"}</div></div>
      <div class="card"><p class="eyebrow">THE HOUSE BOARDS</p><div class="big">${mods.filter((m) => m.answering).length} / ${mods.length}</div>
        <div class="small">${mods.length ? mods.map((m) => `<span class="${m.answering ? "good" : "bad"}">●</span> ${esc(m.name)}`).join(" · ") : "none found"}</div></div>
    </div>
    <div class="grid" style="margin-top:12px">${PAGES.slice(1).map((p) => `<a class="card" style="text-decoration:none;color:inherit" href="#${p.id}">
      <p class="eyebrow">${p.glyph} ${p.label}</p><div class="small">${esc(BLURB[p.id])}</div></a>`).join("")}</div>
    <div class="card" style="margin-top:12px"><p class="eyebrow">WHAT IS STILL THE COMMAND LINE'S</p>
      <p class="small">Flashing or linking a board on a cable (<span class="mono">updateCompanion.sh</span>,
      <span class="mono">linkCompanion.sh</span>), renaming the hub (<span class="mono">hub/rename.sh</span>, its password),
      and installing THE HANDS once (<span class="mono">hub/hands.sh install</span>). Everything else is here.</p></div>
    <div class="card"><p class="eyebrow">ADD TO THE HOME SCREEN</p>
      <p class="small">On the iPhone: Safari's share button, then <b>Add to Home Screen</b>. On Android: the menu, then
      <b>Install app</b>. It opens on its own, without the browser around it.</p>
      <button class="btn quiet" data-act="unpair">FORGET THIS BROWSER'S KEY</button></div>`;
}
const BLURB = {
  mind: "Every mind's work, for everyone: stop, try again, forget; and LATER, the hub's plans.",
  house: "The casino's odds today and why, who is at the reels, what the house keeps.",
  voices: "Make every kept voice again, on every phone.",
  devices: "Every device heard, what it carries, and forgetting one.",
  exchange: "The exchange's players, and a code to invite a new one.",
  commons: "This home's link to the commons, and its keeper's list: let a home in or out.",
  keys: "A pairing code for a new phone or browser, every one paired, the relay, Home Assistant.",
  jobs: "The site (built at every push), THE HANDS on the computer, and every job the command line did.",
};

// ---- THE MIND (C-319): everyone's tasks, LATER; C-363: THE MESH you walk into, its pipelines coloured by step ----
// C-363 (the user, 2026-11-14: "red = first processing step... orange = 2nd.... purple = 7th... and colours outside of
// those 7 are general non-temporal colours -- unless we already have colour mappings"): we had one -- the week's seven
// chakras, Root to Crown (server/data/week.json; admin.test.ts holds these to it). A pipeline's Nth step takes the Nth.
const STEPS = [["#833131", "ROOT"], ["#734120", "SACRAL"], ["#B4B439", "SOLAR PLEXUS"], ["#41AC41", "HEART"],
               ["#315A62", "THROAT"], ["#393194", "THIRD EYE"], ["#7B3194", "CROWN"]];
const BEYOND = "#e6ebf5";                                   // an eighth step and on: white, its number on it
const stepColour = (n) => (n >= 1 && n <= STEPS.length ? STEPS[n - 1][0] : BEYOND);
// the chakras' colours are deep; a line or a ring on the night page is drawn lighter, toward white
const lift = (hex, f) => "#" + [1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * (1 - f) + 255 * f).toString(16).padStart(2, "0")).join("");
// every other colour on the page is off that spectrum, so a colour that is a step always means a step (C-363) -- DRAFT.
// C-400: the hub sends the one table (server/src/ai/tasks.ts TASK_KINDS) with every view; this copy is only for a hub
// older than it
let KIND = { talk: ["#c9d1e0", "TALK"], guide: ["#3fc7d6", "THE GUIDE"], dream: ["#e07aa8", "DREAMS"], whatsnew: ["#d9a74a", "WHAT'S NEW"],
               journal: ["#b08d64", "JOURNAL"], meeting: ["#e8dcb5", "MEETINGS"], voice: ["#d64fbf", "VOICES"], chatter: ["#7d8aa6", "CHATTER"],
               persona: ["#2fa39a", "PERSONA"], painting: ["#f2a7a0", "THE EASEL"], signs: ["#a1887f", "SIGNS"], memory: ["#b9a99a", "MEMORY"],
               processing: ["#8fa3bf", "PROCESSING"] };
const kindOf = (k) => KIND[k] ?? ["#7a7f8a", String(k).toUpperCase()];
const LIVE = (t) => t.state === "waiting" || t.state === "thinking";
const STATE = { waiting: "waiting", thinking: "thinking", done: "done", failed: "failed", stopped: "stopped", scheduled: "planned" };
const startOf = (t) => Date.parse(t.started ?? t.at);
// a task's parts in the order they ran, as steps: parts started within two seconds of each other run side by side, one step
const stepsOf = (id, ts) => {
  const waves = [];
  for (const c of ts.filter((x) => x.parent === id).sort((a, b) => startOf(a) - startOf(b))) {
    const w = waves.at(-1);
    if (w && startOf(c) - startOf(w[0]) < 2000) w.push(c); else waves.push([c]);
  }
  return waves;
};
const stepOf = (t, ts) => (t.parent ? stepsOf(t.parent, ts).findIndex((w) => w.includes(t)) + 1 : 0);
// a task's colour: its step's when it is one, else its kind's (a failure is marked ✕, never by a colour: red is a step)
const colourOf = (t, ts) => { const n = stepOf(t, ts); return n ? stepColour(n) : kindOf(t.kind)[0]; };
const stepDot = (t, ts) => {
  const n = stepOf(t, ts), c = colourOf(t, ts);
  return `<span class="sdot${t.state === "failed" ? " failed" : ""}" style="background:${c};border-color:${lift(c, 0.45)}${n > STEPS.length ? ";color:#0f1420" : ""}"` +
    ` title="${n ? `step ${n}${n <= 7 ? ` (${STEPS[n - 1][1]})` : ""}` : esc(kindOf(t.kind)[1])}">${t.state === "failed" ? "✕" : n || ""}</span>`;
};
const treed = (ts) => {
  const ids = new Set(ts.map((t) => t.id)), out = [];
  const walk = (t, d) => { out.push([t, d]); ts.filter((c) => c.parent === t.id).sort((a, b) => startOf(a) - startOf(b)).forEach((c) => walk(c, d + 1)); };
  ts.filter((t) => !t.parent || !ids.has(t.parent)).forEach((t) => walk(t, 0));
  return out;
};

// THE MESH (C-319's WEB, C-363): the hub at the middle, every mind on a ring round it, every device that asked outside
// that; a task thinking now is a spark running from its device to its mind, what finished lately a faint thread, a
// hand-off a warm line between minds. Every node and spark opens. An SVG, redrawn every few seconds: each spark's place
// in its run is set from the clock, so a redraw does not jump it back to the start.
const W = 720, H = 400, CX = W / 2, CY = H / 2;
function meshSvg(v, ts, minds, devices, focus) {
  const at = (i, n, rx, ry, turn = 0) => { const a = -Math.PI / 2 + turn + (2 * Math.PI * i) / Math.max(1, n); return [CX + rx * Math.cos(a), CY + ry * Math.sin(a)]; };
  const mindAt = new Map(minds.map((m, i) => [m.name, at(i, minds.length, 170, 105)]));
  const devAt = new Map(devices.map((d, i) => [d, at(i, devices.length, 296, 172, Math.PI / Math.max(2, devices.length))]));
  // work the hub asked for itself starts at the hub, not out among the devices
  const ends = (t) => [(t.device !== "the hub" && devAt.get(t.device)) || [CX, CY], (t.mind && mindAt.get(t.mind)) || [CX, CY]];
  const ft = focus?.type === "task" ? ts.find((t) => t.id === focus.id) : null;
  // what the focus touches stays bright; the rest dims
  const lit = (t) => !focus || (ft ? t.id === ft.id || t.parent === ft.id || (ft.parent && (t.id === ft.parent || t.parent === ft.parent))
                                   : focus.type === "mind" ? t.mind === focus.id : focus.type === "device" ? t.device === focus.id : true);
  const live = ts.filter(LIVE), recent = ts.filter((t) => !LIVE(t)).slice(0, 24);
  const secs = Date.now() / 1000, DUR = 1.6;
  const line = ([x1, y1], [x2, y2], c, o, w, extra = "") => `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${c}" stroke-opacity="${o}" stroke-width="${w}" stroke-linecap="round"${extra}/>`;
  const isOn = (type, id) => focus && focus.type === type && focus.id === id;
  let s = `<svg class="mesh" viewBox="0 0 ${W} ${H}" role="img" aria-label="THE MESH: the hub, its minds and the devices that asked">`;
  for (const p of mindAt.values()) s += line([CX, CY], p, "#3a4466", 0.9, 1.2);
  for (const t of recent) s += line(...ends(t), lift(colourOf(t, ts), 0.25), lit(t) ? 0.38 : 0.08, lit(t) ? 1.6 : 1);
  for (const t of ts.filter((x) => (x.hops?.length ?? 0) > 1).slice(0, 12))
    t.hops.slice(1).forEach((h, i) => { const a = mindAt.get(t.hops[i].mind), b = mindAt.get(h.mind);
      if (a && b) s += line(a, b, "#e08a3c", LIVE(t) ? 0.9 : lit(t) && focus ? 0.7 : 0.35, 2, ' stroke-dasharray="5 4"'); });
  for (const t of live) s += line(...ends(t), lift(colourOf(t, ts), 0.3), lit(t) ? 0.85 : 0.2, 2.4);
  // the hub
  s += `<g class="node" data-act="focus" data-f="hub:" tabindex="0" role="button" aria-label="the hub">
    <circle cx="${CX}" cy="${CY}" r="26" fill="#1d2436" stroke="#d9a74a" stroke-width="${isOn("hub", "") ? 4 : 2}"/>
    <text x="${CX}" y="${CY + 4}" class="lbl gold" text-anchor="middle">HUB</text>
    ${v.load?.waiting ? `<circle cx="${CX + 22}" cy="${CY - 22}" r="10" fill="#d9a74a"/><text x="${CX + 22}" y="${CY - 18}" class="cnt" text-anchor="middle">${v.load.waiting}</text>` : ""}</g>`;
  for (const m of minds) {
    const [x, y] = mindAt.get(m.name), depth = live.filter((t) => t.mind === m.name).length;
    const ring = m.ok === false ? "#6c7696" : "#d9a74a";
    s += `<g class="node" data-act="focus" data-f="mind:${esc(m.name)}" tabindex="0" role="button" aria-label="mind ${esc(m.name)}">
      <circle cx="${x}" cy="${y}" r="${depth ? 15 : 12}" fill="${depth ? "#24402c" : "#0f1420"}" stroke="${ring}" stroke-width="${isOn("mind", m.name) ? 4 : 2}"${m.ok === false ? ' stroke-dasharray="3 3"' : ""}>
        ${depth ? `<animate attributeName="r" values="13;17;13" dur="1.4s" begin="-${(secs % 1.4).toFixed(2)}s" repeatCount="indefinite"/>` : ""}</circle>
      ${m.ok === false ? `<text x="${x}" y="${y + 4}" class="lbl faint" text-anchor="middle">✕</text>` : ""}
      ${depth > 1 ? `<circle cx="${x + 15}" cy="${y - 14}" r="9" fill="#d9a74a"/><text x="${x + 15}" y="${y - 10.5}" class="cnt" text-anchor="middle">${depth}</text>` : ""}
      <text x="${x}" y="${y + 30}" class="lbl" text-anchor="middle">${esc(m.name)}</text></g>`;
  }
  for (const d of devices) {
    const [x, y] = devAt.get(d);
    s += `<g class="node" data-act="focus" data-f="device:${esc(d)}" tabindex="0" role="button" aria-label="device ${esc(d)}">
      <rect x="${x - 7}" y="${y - 7}" width="14" height="14" rx="2" fill="#0f1420" stroke="#9aa6c4" stroke-width="${isOn("device", d) ? 4 : 1.6}"/>
      <text x="${x}" y="${y + 22}" class="lbl dim" text-anchor="middle">${esc(dn(d).length > 18 ? dn(d).slice(0, 17) + "…" : dn(d))}</text></g>`;
  }
  // a spark for each task thinking now, from its device to its mind (waiting: held at the device), in its step's colour
  live.forEach((t, i) => {
    const [[x1, y1], [x2, y2]] = ends(t), c = colourOf(t, ts), n = stepOf(t, ts);
    const run = t.state === "waiting" ? "" : `<animateMotion dur="${DUR}s" repeatCount="indefinite" begin="-${((secs + i * 0.37) % DUR).toFixed(2)}s" path="M0,0 L${(x2 - x1).toFixed(1)},${(y2 - y1).toFixed(1)}"/>`;
    const [ox, oy] = t.state === "waiting" ? [(x2 - x1) * 0.08, (y2 - y1) * 0.08] : [0, 0];
    s += `<g class="node" data-act="focus" data-f="task:${esc(t.id)}" role="button" aria-label="${esc(t.title)}" transform="translate(${(x1 + ox).toFixed(1)},${(y1 + oy).toFixed(1)})">
      <g>${run}<circle r="${isOn("task", t.id) ? 11 : 8}" fill="${c}" stroke="${isOn("task", t.id) ? "#ffffff" : lift(c, 0.6)}" stroke-width="2.5"/>
      ${n ? `<text y="3.5" class="cnt light" text-anchor="middle">${n}</text>` : ""}</g></g>`;
  });
  if (!live.length) s += `<text x="${CX}" y="${H - 10}" class="lbl faint" text-anchor="middle">nothing thinking right now</text>`;
  return s + "</svg>";
}

// a pipeline: its steps left to right, the parts of one step stacked, each a chip in its step's colour that opens
function pipeline(id, ts, here, now) {
  const waves = stepsOf(id, ts);
  if (!waves.length) return "";
  return `<div class="pipe">${waves.map((w, i) => `${i ? `<span class="arrow" aria-hidden="true">→</span>` : ""}<div class="wave">${w.map((p) => {
    const c = stepColour(i + 1);
    return `<button class="chip${p.id === here ? " here" : ""}${LIVE(p) ? " live" : ""}" data-act="into" data-f="task:${esc(p.id)}"
        style="--c:${c};--l:${lift(c, 0.5)}"><b${i >= STEPS.length ? ' style="color:#0f1420"' : ""}>${i + 1}</b><span class="ct">${esc(p.title)}</span>
        <span class="cs">${p.state === "failed" ? "✕ failed" : LIVE(p) ? STATE[p.state] : took(p.ms)}${p.mind ? ` · ${esc(p.mind)}` : ""}</span></button>`;
  }).join("")}</div>`).join("")}</div>`;
}

// what a node or a task shows when it is opened (C-363)
function opened(f, v, ts, now) {
  const row = ([t, d]) => `<div class="item" data-act="into" data-f="task:${esc(t.id)}" style="padding-left:${d * 16}px">
      ${stepDot(t, ts)}<span class="t">${d ? "└ " : ""}${esc(t.title)}${(t.hops?.length ?? 0) > 1 ? " ⇢" : ""}</span>
      <span class="small">${esc(t.user)} · ${LIVE(t) ? STATE[t.state] : `${took(t.ms)} ${ago(t.ended ?? t.at, now)}`}</span></div>`;
  if (f.type !== "task") {
    const mine = f.type === "hub" ? ts.filter((t) => !t.mind || t.mind === "the hub" || t.device === "the hub") : ts.filter((t) => (f.type === "mind" ? t.mind : t.device) === f.id);
    const settled = mine.filter((t) => !LIVE(t)), fails = settled.filter((t) => t.state === "failed").length;
    const avg = settled.filter((t) => t.ms).reduce((a, t, _, all) => a + t.ms / all.length, 0);
    const m = f.type === "mind" ? (v.minds ?? []).find((x) => x.name === f.id) : null;
    const what = f.type === "hub" ? "THE HUB -- its queue, and work no mind took" : f.type === "mind" ? `MIND · ${f.id}` : `DEVICE · ${f.id}`;
    return `<div class="card"><p class="eyebrow">${esc(what)}</p>
      <p class="small">${m ? (m.ok ? "answering · " : "not answering · ") : ""}${mine.filter(LIVE).length} thinking now · ${settled.length} finished lately${avg ? ` · ${took(Math.round(avg))} on average` : ""}${fails ? ` · <span class="warm">${fails} failed</span>` : ""}${f.type === "hub" && v.load ? ` · ${v.load.running} running, ${v.load.waiting} waiting in its talk queue` : ""}</p>
      <div class="list">${treed(mine.slice(0, 40)).map(row).join("") || `<p class="small">Nothing here lately.</p>`}</div></div>`;
  }
  const t = ts.find((x) => x.id === f.id);
  if (!t) return `<div class="card"><p class="small">That task is no longer in the ledger.</p></div>`;
  const n = stepOf(t, ts), parent = t.parent ? ts.find((x) => x.id === t.parent) : null, steps = stepsOf(t.id, ts);
  const c = colourOf(t, ts);
  return `<div class="card" style="border-color:${lift(c, 0.3)}">
    <div class="row">${stepDot(t, ts)}<div class="big grow" style="font-size:16px">${esc(t.title)}</div></div>
    <div class="small">${kindOf(t.kind)[1]}${n ? ` · step ${n}${n <= 7 ? ` (${STEPS[n - 1][1]})` : ""}${parent ? ` of ${stepsOf(parent.id, ts).length}` : ""}` : ""} · ${STATE[t.state]}${t.ms !== undefined ? ` in ${took(t.ms)}` : ""} · ${ago(t.at, now)}</div>
    <div class="small">for ${esc(t.user)}, from <a role="button" tabindex="0" class="link" data-act="into" data-f="device:${esc(t.device)}">${esc(dn(t.device))}</a>${t.mind ? `, on <a role="button" tabindex="0" class="link" data-act="into" data-f="mind:${esc(t.mind)}">${esc(t.mind)}</a>` : ""}${t.source === "trace" ? " (reported by the phone)" : t.source === "queue" ? " (the hub's talk queue)" : ""}</div>
    ${t.size || t.tokens ? `<div class="small">${t.size ? `${t.size.in ?? "?"} chars in, ${t.size.out ?? "nothing yet"} out` : ""}${t.tokens ? ` · ${t.tokens.in ?? "?"} → ${t.tokens.out ?? "?"} tokens` : ""}</div>` : ""}
    ${(t.hops?.length ?? 0) > 1 ? `<div class="small warm">handed on: ${t.hops.map((h) => esc(h.mind + (h.error ? ` ✕ (${h.error})` : ""))).join(" → ")}</div>` : ""}
    ${t.error ? `<div class="small warm">✕ ${esc(t.error)}</div>` : ""}
    ${steps.length ? `<p class="eyebrow" style="margin-top:12px">ITS PIPELINE · ${steps.length} STEP${steps.length > 1 ? "S" : ""}</p>${pipeline(t.id, ts, null, now)}` : ""}
    ${parent ? `<p class="eyebrow" style="margin-top:12px">A PART OF <a role="button" tabindex="0" class="link" data-act="into" data-f="task:${esc(parent.id)}">${esc(parent.title)}</a></p>${pipeline(parent.id, ts, t.id, now)}` : ""}
    <div class="row" style="margin-top:10px">
      ${t.can?.stop && LIVE(t) ? `<button class="btn danger" data-act="task" data-id="${esc(t.id)}" data-a="stop">STOP</button>` : ""}
      ${t.can?.retry && (t.state === "failed" || t.state === "stopped") ? `<button class="btn" data-act="task" data-id="${esc(t.id)}" data-a="retry">TRY AGAIN</button>` : ""}
      ${t.source === "ledger" && !LIVE(t) ? `<button class="btn quiet" data-act="task" data-id="${esc(t.id)}" data-a="forget">FORGET</button>` : ""}</div></div>`;
}

const parseF = (s) => { const i = s.indexOf(":"); return { type: s.slice(0, i), id: s.slice(i + 1) }; };
const fSaid = (f, ts) => f.type === "hub" ? "THE HUB" : f.type === "task" ? (ts.find((t) => t.id === f.id)?.title ?? "a task gone") : f.id;

async function drawMind() {
  const v = await api("/api/mind/tasks"), who = ui.who ?? "all", now = Date.now();
  if (v.kinds) KIND = Object.fromEntries(Object.entries(v.kinds).map(([k, x]) => [k, [x.colour, x.said]]));   // C-400
  const shown = v.tasks.filter((t) => t.state !== "scheduled" && (who === "all" || t.user === who));
  const live = shown.filter(LIVE), done = shown.filter((t) => !LIVE(t)).slice(0, 30);
  const known = new Map((v.minds ?? []).map((m) => [m.name, m.ok]));
  for (const t of shown) if (t.mind && !known.has(t.mind)) known.set(t.mind, null);
  known.delete("the hub");   // C-402: work done on the hub itself is drawn at the HUB, not as a mind beside it
  const minds = [...known].map(([name, ok]) => ({ name, ok }));
  const devices = [...new Set(shown.slice(0, 60).map((t) => t.device))].filter((d) => d !== "the hub").slice(0, 12);
  const trail = ui.trail ?? [], focus = trail.at(-1) ?? null;
  const row = ([t, d]) => `<div class="item" data-act="pick" data-id="${esc(t.id)}" style="padding-left:${d * 16}px">
      ${stepDot(t, v.tasks)}<span class="t">${d ? "└ " : ""}${esc(t.title)}${(t.hops?.length ?? 0) > 1 ? " ⇢" : ""}</span>
      <span class="small">${esc(t.user)} · ${LIVE(t) ? STATE[t.state] : `${took(t.ms)} ${ago(t.ended ?? t.at, now)}`}</span></div>`;
  if (stale()) return;
  $page.innerHTML = `<h1>THE MIND AT WORK</h1>
    <p class="lede">${live.length ? `${live.length} thinking now` : "Quiet"}${v.load?.waiting ? ` · ${v.load.waiting} in the hub's queue` : ""} ·
      minds: ${minds.map((m) => `<span class="${m.ok === false ? "faint" : "gold"}">${m.ok === false ? "✕" : "●"}</span> ${esc(m.name)}`).join(" ") || "none"}</p>
    <div class="row" style="margin-bottom:12px">${["all", ...v.users].map((u) =>
      `<button class="pill ${who === u ? "on" : ""}" data-act="who" data-who="${esc(u)}">${u === "all" ? "EVERYONE" : esc(u.toUpperCase())}</button>`).join("")}</div>
    <div class="card meshcard">${meshSvg(v, shown, minds, devices, focus)}
      <nav class="crumbs" aria-label="where in THE MESH"><button data-act="crumb" data-i="-1" class="${trail.length ? "" : "on"}">THE MESH</button>${trail.map((f, i) =>
        `<span aria-hidden="true">›</span><button data-act="crumb" data-i="${i}" class="${i === trail.length - 1 ? "on" : ""}">${esc(fSaid(f, v.tasks))}</button>`).join("")}</nav>
      ${trail.length ? "" : `<p class="small faint" style="margin:4px 0 0">Tap the hub, a mind, a device or a spark to walk in.</p>`}</div>
    ${focus ? opened(focus, v, v.tasks.filter((t) => focus.type === "task" || who === "all" || t.user === who), now) : ""}
    <div class="card"><p class="eyebrow">A PIPELINE'S STEPS, IN ORDER</p><div class="legend">${STEPS.map(([c, name], i) =>
      `<span><i style="background:${c};border-color:${lift(c, 0.45)}">${i + 1}</i>${name}</span>`).join("")}<span><i style="background:${BEYOND};color:#0f1420">8</i>AND ON</span></div>
      <p class="eyebrow" style="margin-top:10px">EVERYTHING ELSE, BY KIND</p><div class="legend">${Object.values(KIND).map(([c, said]) =>
      `<span><i style="background:${c}"></i>${said}</span>`).join("")}<span><i class="x">✕</i>FAILED</span></div></div>
    <div class="card"><p class="eyebrow">NOW</p><div class="list">${treed(live).map(row).join("") || `<p class="small">Nothing thinking.</p>`}</div></div>
    <div class="card"><p class="eyebrow">BEFORE</p><div class="list">${treed(done).map(row).join("") || `<p class="small">Nothing finished lately.</p>`}</div>
      <div class="row" style="margin-top:8px"><button class="btn quiet" data-act="clear">CLEAR FINISHED${who === "all" ? "" : ` (${esc(who.toUpperCase())})`}</button></div></div>
    <div class="card"><p class="eyebrow">LATER -- THE HUB'S PLANS</p><div class="list">${(v.plans ?? []).map((p) => `<div style="padding:8px 0">
      <div class="row"><span class="dot" style="border:1.5px dashed ${kindOf(p.kind)[0]}"></span><span class="grow ${p.on ? "" : "faint"}">${esc(p.title)}</span>
        <button class="pill ${p.on ? "on" : ""}" data-act="plan" data-plan="${esc(p.id)}" data-on="${p.on ? "" : "1"}">${p.on ? "ON" : "OFF"}</button>
        <button class="pill" data-act="plan" data-plan="${esc(p.id)}" data-now="1">NOW</button></div>
      <div class="small">${esc(p.said)} ${p.on ? `${p.gate ? "Next day" : "Next"}: ${esc(new Date(p.next).toLocaleString([], p.gate ? { weekday: "long", month: "short", day: "numeric" } : { weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }))}.` : "Off."}${p.last && !p.gate ? ` Last: ${ago(p.last, now)}.` : ""}</div>
      ${p.every ? `<div class="row" style="margin-top:6px;flex-wrap:wrap;gap:4px"><span class="small grow">${esc((p.cadence ?? "").toUpperCase())}</span>
        ${CADENCES.map(([e, said]) => `<button class="pill ${p.every === e ? "on" : ""}" data-act="cadence" data-plan="${esc(p.id)}" data-every="${e}" data-times="1">${said}</button>`).join("")}
        ${p.every !== "day" ? `<button class="pill" data-act="cadence" data-plan="${esc(p.id)}" data-every="${p.every}" data-times="${Math.max(1, (p.times ?? 1) - 1)}">−</button><button class="pill" data-act="cadence" data-plan="${esc(p.id)}" data-every="${p.every}" data-times="${(p.times ?? 1) + 1}">+</button>` : ""}</div>` : ""}</div>`).join("") || `<p class="small">No plans.</p>`}</div></div>
    ${note()}`;
}
ACTS.who = (d) => { ui.who = d.who; };
// from THE MESH or a list a walk starts again; from inside what is open it goes one deeper; the crumbs walk back out
const goTo = (f, deeper) => {
  const t = ui.trail ?? [], i = t.findIndex((x) => x.type === f.type && x.id === f.id);
  ui.trail = i >= 0 ? t.slice(0, i + 1) : deeper ? [...t, f] : [f];
  if (ui.trail.length > 8) ui.trail = ui.trail.slice(-8);
  document.querySelector(".meshcard")?.scrollIntoView({ block: "start", behavior: "smooth" });
};
ACTS.focus = (d) => goTo(parseF(d.f), false);
ACTS.into = (d) => goTo(parseF(d.f), true);
ACTS.pick = (d) => { if (d.id) goTo({ type: "task", id: d.id }, false); else ui.trail = []; };
ACTS.crumb = (d) => { ui.trail = (ui.trail ?? []).slice(0, Number(d.i) + 1); };
ACTS.task = async (d) => { await api("/api/mind/tasks", { id: d.id, act: d.a }); said(""); if (d.a === "forget") ui.trail = (ui.trail ?? []).slice(0, -1); };
ACTS.clear = async () => { await api("/api/mind/tasks", { act: "clear", ...(ui.who && ui.who !== "all" ? { user: ui.who } : {}) }); said("Cleared."); };
// C-455: every plan's cadence -- a day, a week, a month, three months or a year, and n times in it (− and +); DRAFT
const CADENCES = [["day", "DAY"], ["week", "WEEK"], ["month", "MONTH"], ["quarter", "3 MONTHS"], ["year", "YEAR"]];
ACTS.cadence = async (d) => { await api("/api/mind/tasks", { act: "plan", plan: d.plan, every: d.every, times: Number(d.times) }); said(""); };
ACTS.plan = async (d) => { await api("/api/mind/tasks", { act: "plan", plan: d.plan, ...(d.now ? { now: true } : { on: !!d.on }) }); said(d.now ? "Started." : ""); };

// ---- THE HOUSE (C-158, C-167) ----
const back = (rtp) => `${(rtp * 100).toFixed(1)} back of every 100`;
const points = (r) => { const n = r.source === "the string" ? r.effect : r.effect * 5; return `${n > 0 ? "+" : ""}${n.toFixed(1)}`; };
const reasons = (rs) => `<div class="reasons">${(rs ?? []).map((r) =>
  `<div><b class="${r.effect > 0 ? "good" : r.effect < 0 ? "bad" : "faint"}">${points(r)}</b><span>${esc(r.why)}</span></div>`).join("")}</div>`;
async function drawHouse() {
  const [h, w] = await Promise.all([api("/api/casino"), api("/api/weather").catch(() => null)]);
  const open = ui.open ?? null, wx = h.world?.weather, k = h.house;
  if (stale()) return;
  $page.innerHTML = `<h1>THE HOUSE</h1>
    <p class="lede">The casino's odds and why. Every table keeps between 90 and 100 back of every 100 bet over many pulls: the day
      sets where, and each player's run of luck moves a pull a little either way.</p>
    <div class="card tap" data-act="open" data-o="day"><p class="eyebrow">TODAY'S ODDS</p><div class="big">${back(h.context.rtp)}</div>
      <div class="small">${h.holiday?.name ? `${esc(h.holiday.name)} · ` : ""}${esc((h.world?.watch ?? "").toLowerCase())}${wx ? ` · ${esc(wx.kind)}, ${Math.round(wx.tempC)}°C in ${esc(wx.city)}` : " · no city set for the weather"}</div>
      ${open === "day" ? reasons(h.context.reasons) : `<div class="small gold">Why ›</div>`}</div>
    ${k ? `<div class="card tap" data-act="open" data-o="keeps"><p class="eyebrow">${k.kept < 0 ? "THE HOUSE OWES" : "THE HOUSE KEEPS"}</p>
      <div class="big">${Math.abs(k.kept).toLocaleString()}</div>
      <div class="small">${k.pending > 0 ? `${k.pending.toLocaleString()} more at the next SYNC` : k.pending < 0 ? `${(-k.pending).toLocaleString()} back at the next SYNC` : "nothing waits for a SYNC"} · ${k.spins.toLocaleString()} pulls in all</div>
      ${open === "keeps" ? `<div class="reasons">${k.devices.map((d) => `<div><b class="${d.take > 0 ? "bad" : d.take < 0 ? "good" : "faint"}" style="width:80px">${d.take.toLocaleString()}</b><span>${esc(dn(d.device))} · ${d.spins.toLocaleString()} pulls</span></div>`).join("")}</div>` : k.devices.length ? `<div class="small gold">By board ›</div>` : ""}</div>` : ""}
    <p class="eyebrow" style="margin-top:16px">AT THE REELS</p>
    ${h.players.length ? "" : `<p class="small">Nobody is playing just now.</p>`}
    ${h.players.map((p) => `<div class="card tap" data-act="open" data-o="${esc(p.device)}"><div class="row">
        ${p.species ? `<img class="art" alt="" src="/art/species/${encodeURIComponent(p.species)}.png">` : ""}
        <div class="grow"><div class="mono"><b>${esc(p.name)}</b></div><div class="small">${esc(dn(p.device))} · ${p.odds ? back(p.odds.rtp) : "the day's odds"}</div></div></div>
      ${open === p.device ? `${p.odds ? `<div class="small">${p.odds.dry} pulls since a win · ${p.odds.streak} wins running · the string at ${p.odds.reach > 0 ? "+" : ""}${p.odds.reach.toFixed(2)}</div>` : ""}${reasons(p.reasons)}` : ""}</div>`).join("")}
    <div class="card"><p class="eyebrow">THE WEATHER'S CITY</p>
      <p class="small">The real weather moves the day's luck. ${w?.place ? `Now: ${esc(w.place.name)}${w.place.country ? `, ${esc(w.place.country)}` : ""}.` : "None set."}</p>
      <form class="row" data-form="city"><input class="text" name="city" placeholder="a city Open-Meteo knows" aria-label="city"><button class="btn">SET</button></form></div>
    ${note()}`;
  $page.querySelector('[data-form="city"]').addEventListener("submit", async (ev) => {
    ev.preventDefault();
    try { await api("/api/weather", { city: ev.target.city.value }); said("Set."); } catch (e) { said(e.message); }
    show(true);
  });
}
ACTS.open = (d) => { ui.open = ui.open === d.o ? null : d.o; };

// ---- VOICES (C-303) ----
async function drawVoices() {
  const t = await api("/api/talk/settings");
  if (stale()) return;
  $page.innerHTML = `<h1>VOICES</h1>
    <p class="lede">A voice heard once is kept on each phone. Make them again after a recipe or a voice model changes.</p>
    <div class="card"><p class="eyebrow">THE VOICES' GENERATION</p><div class="big">${esc(t.voices ?? "?")}</div>
      <p class="small">Making them again moves it on: every phone forgets the voices it kept the next time it asks the hub, and makes each afresh as it is heard.</p>
      ${ui.sure ? `<div class="row"><span class="grow">Every phone's kept voices are forgotten. Make them again?</span>
        <button class="btn danger" data-act="voices">YES, MAKE THEM AGAIN</button><button class="btn quiet" data-act="sure">NO</button></div>`
        : `<button class="btn" data-act="sure">MAKE THE VOICES AGAIN</button>`}</div>
    ${note()}`;
}
ACTS.sure = () => { ui.sure = !ui.sure; };
ACTS.voices = async () => { await api("/api/talk/settings", { voicesAgain: true }); ui.sure = false; said("Every voice will be made afresh the next time it is heard."); };

// ---- CREATIONS (C-361; the user, 2026-11-14: "the engine room we should be able to administrate what content is in
// the household -- such as deleting sleep sounds or easel art"): every creation the hub keeps (C-358), by kind and
// daemon, its size and who asked; let one go, or every one ticked. What this home shared is taken from THE COMMONS too.
const mb = (b) => (b ? `${(b / 1048576).toFixed(1)} MB` : "");
async function drawCreations() {
  const [h, c] = await Promise.all([api("/api/creations"), api("/api/community").catch(() => ({ linked: false, creations: [] }))]);
  if (stale()) return;
  const shared = new Set((c.creations ?? []).map((x) => x.uid));
  ui.kind ??= "all"; ui.daemon ??= "all"; ui.ticked ??= new Set();
  const daemons = [...new Set(h.creations.map((x) => x.daemon.nickname || "?"))].sort();
  // C-404: FAILED is a filter of its own, each failure with its reason and TRY AGAIN
  const failed = h.creations.filter((x) => x.state === "failed");
  if (ui.kind === "failed" && !failed.length) ui.kind = "all";
  const shown = h.creations.filter((x) => (ui.kind === "all" || (ui.kind === "failed" ? x.state === "failed" : x.kind === ui.kind)) && (ui.daemon === "all" || (x.daemon.nickname || "?") === ui.daemon));
  for (const u of [...ui.ticked]) if (!h.creations.some((x) => x.uid === u)) ui.ticked.delete(u);
  if (ui.tickFailed) { for (const x of failed) ui.ticked.add(x.uid); ui.tickFailed = false; }
  const total = h.creations.reduce((s, x) => s + (x.bytes ?? 0), 0);
  const chip = (act, val, on, label) => `<button class="btn ${on ? "" : "quiet"}" data-act="${act}" data-v="${esc(val)}">${esc(label)}</button>`;
  $page.innerHTML = `<h1>CREATIONS</h1>
    <p class="lede">What the daemons made that this hub keeps: ${h.creations.length} in all${total ? `, about ${mb(total)} of music` : ""}. A phone that downloaded one keeps its own copy.</p>
    <div class="row">${chip("ckind", "all", ui.kind === "all", "ALL")}${chip("ckind", "sleep", ui.kind === "sleep", "SLEEP SOUNDS")}${chip("ckind", "painting", ui.kind === "painting", "PAINTINGS")}${chip("ckind", "song", ui.kind === "song", "SONGS")}${failed.length ? chip("ckind", "failed", ui.kind === "failed", `FAILED (${failed.length})`) : ""}</div>
    <div class="row" style="margin-top:8px">${chip("cdaemon", "all", ui.daemon === "all", "EVERY DAEMON")}${daemons.map((d) => chip("cdaemon", d, ui.daemon === d, d)).join("")}</div>
    <div class="row" style="margin:12px 0">
      <button class="btn quiet" data-act="ctickall">${shown.every((x) => ui.ticked.has(x.uid)) && shown.length ? "UNTICK ALL" : "TICK ALL SHOWN"}</button>
      ${failed.length && !failed.every((x) => ui.ticked.has(x.uid)) ? `<button class="btn quiet" data-act="ctickfailed">TICK THE ${failed.length} FAILED</button>` : ""}
      ${ui.ticked.size ? (ui.sure
        ? `<span class="grow">Let ${ui.ticked.size} go from the hub, their exports and covers with them${c.linked ? ", and from THE COMMONS if shared" : ""}?</span>
           <button class="btn danger" data-act="cforget">YES, LET ${ui.ticked.size} GO</button><button class="btn quiet" data-act="sure">NO</button>`
        : `<button class="btn danger" data-act="sure">LET ${ui.ticked.size} GO…</button>`) : ""}
    </div>
    ${note()}
    <div class="grid">${shown.map((x) => `<div class="card">
        <label class="row" style="align-items:flex-start;cursor:pointer">
          <input type="checkbox" data-act="ctick" data-uid="${esc(x.uid)}" ${ui.ticked.has(x.uid) ? "checked" : ""} aria-label="tick ${esc(x.title)}">
          <span class="grow">
            ${x.cover ? `<img src="${esc(x.thumb ?? x.cover)}" alt="" loading="lazy" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:${x.kind === "sleep" ? "50%" : "6px"};margin-bottom:6px">` : ""}
            <span class="eyebrow">${CKIND[x.kind] ?? esc(x.kind.toUpperCase())} · ${esc(x.daemon.nickname || "?")}${shared.has(x.uid) ? " · SHARED" : ""}</span><br>
            <b>${esc(x.title)}</b><br>
            <span class="small">${esc(ago(x.made))}${x.by ? ` · asked on ${esc(dn(x.by))}` : ""}${x.bytes ? ` · ${mb(x.bytes)}` : ""}${x.state !== "ready" ? ` · ${esc(x.state)}` : ""}</span>
          </span></label>
        ${x.state === "failed" ? `<div class="small warm" style="margin-top:6px">${esc(x.meta?.error || "No reason was kept.")}</div>
          ${x.meta?.request ? `<div class="small faint">asked: ${esc(String(x.meta.request).slice(0, 120))}</div>` : ""}
          ${x.kind === "song" || x.kind === "painting" ? `<button class="btn" data-act="cagain" data-uid="${esc(x.uid)}" style="margin-top:6px">TRY AGAIN</button>` : ""}` : ""}
        </div>`).join("") || `<p class="small">Nothing here.</p>`}</div>`;
}
const CKIND = { sleep: "SLEEP SOUNDS", painting: "PAINTING", song: "SONG" };   // C-404: songs were said to be paintings
ACTS.ctickfailed = () => { ui.kind = "failed"; ui.ticked = new Set(); ui.tickFailed = true; ui.sure = false; };   // C-404: then LET N GO
ACTS.cagain = async (d) => {
  const r = await api("/api/creations/again", { uid: d.uid });
  ui.ticked.delete(d.uid);
  said(`Asked again: ${r.asked.daemon.nickname || "the daemon"} ${r.asked.kind === "song" ? "sings it" : "paints it"} -- it appears here when it is made.`);
};
ACTS.ckind = (d) => { ui.kind = d.v; };
ACTS.cdaemon = (d) => { ui.daemon = d.v; };
ACTS.ctick = (d) => { ui.ticked.has(d.uid) ? ui.ticked.delete(d.uid) : ui.ticked.add(d.uid); ui.sure = false; };
ACTS.ctickall = () => {
  const boxes = [...$page.querySelectorAll("input[data-act=ctick]")].map((b) => b.dataset.uid);
  const all = boxes.length && boxes.every((u) => ui.ticked.has(u));
  for (const u of boxes) all ? ui.ticked.delete(u) : ui.ticked.add(u);
  ui.sure = false;
};
ACTS.cforget = async () => {
  const r = await api("/api/creations/forget", { uids: [...ui.ticked] });
  ui.ticked = new Set(r.kept); ui.sure = false;
  said(`${r.gone.length} let go.${r.kept.length ? ` ${r.kept.length} kept (still being made).` : ""}`);
};

// ---- DEVICES (C-80) ----
async function drawDevices() {
  const v = await api("/api/devices"), now = Date.now();
  if (stale()) return;
  $page.innerHTML = `<h1>DEVICES</h1>
    <p class="lede">Every device that has said hello to this hub, and the daemon each carries. A forgotten one leaves the list
      (its daemon back to none) until it next says hello.</p>
    ${v.devices.length ? "" : `<p class="small">No device has said hello yet.</p>`}
    ${v.devices.map((d) => `<div class="card"><div class="row">
        ${d.daemon ? `<img class="art" alt="" src="${esc(d.daemon.art)}">` : ""}
        <div class="grow"><div><b>${esc(d.name || d.id)}</b> <span class="${d.here ? "good" : "faint"}">●</span></div>
          ${d.name && d.name !== d.id ? `<div class="small faint mono">${esc(d.id)}</div>` : ""}
          <div class="small">${esc(d.kind)}${d.via ? ` · ${esc(d.via)}` : ""} · ${esc(ago(d.lastSeen, now))}${d.firmware ? ` · ${esc(d.firmware)}` : ""}${d.battery ? ` · ${d.battery.percent}%${d.battery.charging ? " charging" : ""}` : ""}</div>
          <div class="small">${d.daemon ? `carries ${esc(d.daemon.nickname || d.daemon.name)} · LV ${d.daemon.level}` : "carries nobody"}</div></div>
        ${ui.forget === d.id ? `<button class="btn danger" data-act="forget" data-id="${esc(d.id)}">YES, FORGET IT</button><button class="btn quiet" data-act="forgetask" data-id="">NO</button>`
          : `<button class="btn quiet" data-act="forgetask" data-id="${esc(d.id)}">FORGET</button>`}</div></div>`).join("")}
    ${v.unplaced?.length ? `<div class="card"><p class="eyebrow">AWAY IN NO DEVICE</p><div class="small">${v.unplaced.map((d) => esc(d.nickname || d.name)).join(" · ")}</div>
      <p class="small faint">Each player puts a daemon in a device from the app (PLACES).</p></div>` : ""}
    ${note()}`;
}
ACTS.forgetask = (d) => { ui.forget = d.id || null; };
ACTS.forget = async (d) => { await api("/api/devices/forget", { id: d.id }); ui.forget = null; said(`${dn(d.id)} forgotten.`); };

// ---- EXCHANGE (C-218) ----
async function drawExchange() {
  const v = await api("/api/exchange/players"), inv = ui.invite;
  if (stale()) return;
  $page.innerHTML = `<h1>THE EXCHANGE</h1>
    <p class="lede">Other players' companions join this hub to trade, on the home network and the tailnet.</p>
    <div class="card"><p class="eyebrow">INVITE A PLAYER</p>
      <p class="small">Their companion joins with a code. It works once, for fifteen minutes.</p>
      ${inv ? `<div class="code">${esc(inv.code)}</div><div class="small">until ${esc(new Date(inv.until).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }))}</div>` : ""}
      <button class="btn" data-act="invite">${inv ? "ANOTHER CODE" : "MAKE A CODE"}</button></div>
    <div class="card"><p class="eyebrow">ITS PLAYERS</p><div class="list">${v.players.map((p) => `<div class="item" style="cursor:default">
      <span class="t mono">${esc(p.name)}</span><span class="small">${p.password ? "a password set · " : ""}joined ${esc(ago(p.at))}</span></div>`).join("") || `<p class="small">Nobody has joined yet.</p>`}</div></div>
    ${note()}`;
}
ACTS.invite = async () => { ui.invite = await api("/api/exchange/invite", {}); said(""); };

// ---- THE COMMONS (C-222) ----
async function drawCommons() {
  const c = await api("/api/commons"), h = c.home;
  if (stale()) return;
  $page.innerHTML = `<h1>THE COMMONS</h1>
    <p class="lede">Homes trade with friends' homes through the commons, which runs on its own machine. Players and devices still talk only to this hub.</p>
    <div class="card"><p class="eyebrow">THIS HOME</p>
    ${!c.url ? `<p class="small">Not linked.</p>
      <form class="row" data-form="link" style="margin-top:6px"><input class="text" name="url" placeholder="http://roverbyteseer:4750" aria-label="the commons' address">
        <input class="text" name="name" maxlength="16" placeholder="this home's name, as friends see it" aria-label="this home's name"><button class="btn">LINK</button></form>`
      : !h ? `<p class="small bad">The commons at ${esc(c.url)} did not answer${c.error ? `: ${esc(c.error)}` : "."}</p>`
      : `<div class="big">${esc(h.name)}</div><div class="small">${h.approved ? `<span class="good">let in</span> · its friend code <b class="mono">${esc(h.code)}</b> · ${h.friends.length} friends`
                                                          : `<span class="warm">waiting for the keeper to let it in</span>`} · at ${esc(c.url)}</div>
         <div class="small faint">This home's id: <span class="mono">${esc(h.id)}</span></div>`}
    ${c.url ? (ui.sure ? `<div class="row" style="margin-top:8px"><span class="grow">Unlink this home from the commons?</span><button class="btn danger" data-act="unlink">YES, UNLINK</button><button class="btn quiet" data-act="sure">NO</button></div>`
                       : `<div class="row" style="margin-top:8px"><button class="btn quiet" data-act="sure">UNLINK</button></div>`) : ""}</div>
    <div class="card"><p class="eyebrow">THE KEEPER</p>
      <p class="small">The keeper answers only on the commons' own machine; THE HANDS reach it there and bring back what it said (JOBS).</p>
      <div class="row" style="margin-top:6px"><button class="btn" data-act="job" data-name="commons-homes">EVERY HOME</button></div>
      <form class="row" data-form="keeper" style="margin-top:8px"><input class="text mono" name="id" value="${esc(h?.id ?? "")}" placeholder="a home's id" aria-label="a home's id">
        <button class="btn" name="go" value="commons-approve">LET IT IN</button><button class="btn danger" name="go" value="commons-refuse">LET IT OUT</button></form>
      <p class="small faint">Friends -- codes, asks, accepting -- are each player's, in the app (YOU, TRADE).</p></div>
    ${note()}`;
  $page.querySelector('[data-form="keeper"]')?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    try { await api("/api/engine/jobs", { name: ev.submitter?.value ?? "commons-approve", arg: ev.target.id.value.trim() }); location.hash = "jobs"; }
    catch (e) { said(e.message); show(true); }
  });
  $page.querySelector('[data-form="link"]')?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    try { await api("/api/commons", { url: ev.target.url.value.trim(), name: ev.target.name.value.trim() }); said("Linked. The commons' keeper lets this home in."); }
    catch (e) { said(e.message); }
    show(true);
  });
}
ACTS.unlink = async () => { await api("/api/commons", { url: "" }); ui.sure = false; said("Unlinked."); };

// ---- KEYS (C-342): pairing codes, the paired, the relay, Home Assistant -- once the hub's own machine's alone ----
async function drawKeys() {
  const [phones, relay, home] = await Promise.all([api("/api/pair/phones"), api("/api/settings/relay"), api("/api/settings/home").catch(() => null)]);
  const pc = ui.code, now = Date.now();
  $page.innerHTML = `<h1>KEYS</h1>
    <p class="lede">Who may open the companion, and the two doors into it from outside: the relay and Home Assistant.</p>
    <div class="card"><p class="eyebrow">PAIR A PHONE OR A BROWSER</p>
      ${pc ? `<div class="code">${esc(pc.code)}</div><div class="small">Type it into the app or THE ENGINE ROOM there, within ${pc.minutes} minutes.
        The hub is ${esc(pc.lan?.tailnet ?? "")}${pc.lan?.tailnet ? ":4730 on the tailnet, " : ""}${esc(pc.lan?.name ?? pc.lan?.address ?? "")}:4730 at home.</div>` : ""}
      <button class="btn" data-act="paircode">${pc ? "ANOTHER CODE" : "SHOW A CODE"}</button></div>
    <div class="card"><p class="eyebrow">PAIRED</p><div class="list">${phones.map((p) => `<div class="item" style="cursor:default">
      <span class="t">${esc(p.name)}</span><span class="small">${p.seen ? `seen ${esc(ago(p.seen, now))}` : "never seen"}</span>
      ${ui.forget === p.name ? `<button class="btn danger" data-act="forgetphone" data-name="${esc(p.name)}">YES, FORGET</button><button class="btn quiet" data-act="forgetask" data-id="">NO</button>`
        : `<button class="btn quiet" data-act="forgetask" data-id="${esc(p.name)}">FORGET</button>`}</div>`).join("") || `<p class="small">Nothing is paired.</p>`}</div>
      <p class="small faint">A forgotten key stops working at once -- this browser's too, if it is the one forgotten.</p></div>
    <div class="card"><p class="eyebrow">THE RELAY</p>
      <p class="small">How a phone away from home reaches the companion: through n8n, which marks each request with the secret.</p>
      <form class="row" data-form="relay"><input class="text" name="url" value="${esc(relay.url ?? "")}" placeholder="https://... (its webhook)" aria-label="the relay's address"><button class="btn">SAVE</button></form>
      <div class="small" style="margin-top:6px">The secret: <span class="mono">${ui.secret ? esc(relay.secret) : "••••••••"}</span>
        <button class="pill" data-act="secret">${ui.secret ? "HIDE" : "SHOW"}</button></div>
      ${ui.renew ? `<div class="row" style="margin-top:6px"><span class="grow">A new secret: n8n must be given it, or every phone away loses the companion.</span>
        <button class="btn danger" data-act="renew">YES, A NEW ONE</button><button class="btn quiet" data-act="renewask">NO</button></div>`
        : `<button class="btn quiet" data-act="renewask" style="margin-top:6px">A NEW SECRET</button>`}</div>
    ${home ? `<div class="card"><p class="eyebrow">HOME ASSISTANT</p>
      <p class="small">${home.url ? `${esc(home.url)} · ${home.hasToken ? "a token kept" : "no token"}${home.ok === false ? ` · <span class="bad">not answering</span>` : home.ok ? ` · <span class="good">answering</span>` : ""}` : "Not set."}</p>
      <form class="row" data-form="home"><input class="text" name="url" value="${esc(home.url ?? "")}" placeholder="http://homeassistant.local:8123" aria-label="Home Assistant's address">
        <input class="text" name="token" type="password" placeholder="its long-lived token (kept, never shown)" aria-label="Home Assistant's token" autocomplete="off"><button class="btn">SAVE</button></form>
      ${home.agent?.url ? `<div class="small" style="margin-top:6px">Its way in, for Home Assistant's Ollama setting: <span class="mono">${esc(home.agent.url)}</span></div>` : ""}</div>` : ""}
    ${note()}`;
  $page.querySelector('[data-form="relay"]').addEventListener("submit", async (ev) => {
    ev.preventDefault();
    try { await api("/api/settings/relay", { url: ev.target.url.value.trim() }); said("Saved. Paired phones learn it the next time they open at home."); } catch (e) { said(e.message); }
    show(true);
  });
  $page.querySelector('[data-form="home"]')?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const t = ev.target.token.value;
    try { await api("/api/settings/home", { url: ev.target.url.value.trim(), ...(t ? { token: t } : {}) }); said("Saved."); } catch (e) { said(e.message); }
    show(true);
  });
}
// ---- SAVES (C-364, C-365): the trail of every save that moved, newest first, and going back to one -- rarely: it undoes
// the game since, and is for two saves made at once; and whose copy is kept when a device's and the companion's both moved
const SAVE_KIND = { game: "SAVED IN THE GAME", sync: "SYNC", link: "LINK CABLE", kept: "KEPT BY NAME", "set-aside": "SET ASIDE", back: "WENT BACK" };
async function drawSaves() {
  const h = await api("/api/saves/history"), now = Date.now();
  $page.innerHTML = `<h1>SAVES</h1>
    <p class="lede">One save, wherever the game is played. Each time it moves, a copy is kept here. Going back undoes the game
      since, so it is for when two saves were made at once.</p>
    <div class="card"><p class="eyebrow">WHEN BOTH MOVED</p>
      <p class="small">A device and the companion both saved since they last agreed: whose save goes on?</p>
      <div class="row">${["companion", "device"].map((t) => `<button class="pill ${h.truth === t ? "on" : ""}" data-act="truth" data-t="${t}">${t === "companion" ? "THE COMPANION'S" : "THE DEVICE'S"}</button>`).join("")}</div>
      <p class="small faint">The other is set aside here, never lost.</p></div>
    <div class="card"><p class="eyebrow">THE TRAIL · ${h.trail.length}</p><div class="list">${h.trail.map((e) => `<div class="item" style="cursor:default">
      <span class="t">${esc(e.name)} · ${esc(e.playTime)}</span>
      <span class="small">${esc(SAVE_KIND[e.kind] ?? e.kind)} · ${esc(e.from)} · ${esc(ago(e.at, now))}${e.note ? ` · ${esc(e.note)}` : ""}</span>
      ${ui.back === String(e.id) ? `<button class="btn danger" data-act="back" data-id="${e.id}">YES, GO BACK</button><button class="btn quiet" data-act="backask" data-id="">NO</button>`
        : `<button class="btn quiet" data-act="backask" data-id="${e.id}">GO BACK TO THIS</button>`}</div>`).join("")
      || `<p class="small">Nothing yet: a save is kept here the first time it moves.</p>`}</div></div>
    ${note()}`;
}
ACTS.truth = async (d) => { await api("/api/saves/truth", { truth: d.t }); said(""); };
ACTS.backask = (d) => { ui.back = d.id; };
ACTS.back = async (d) => {
  const r = await api("/api/saves/history/back", { id: Number(d.id) });
  ui.back = ""; said(r.wrote === "mirror" ? "Gone back. The device takes it the next time its game opens." : "Gone back.");
};
ACTS.paircode = async () => { ui.code = await api("/api/pair/code", {}); said(""); };
ACTS.forgetphone = async (d) => { await api("/api/pair/forget", { name: d.name }); ui.forget = null; said(`${d.name} forgotten.`); };
ACTS.secret = () => { ui.secret = !ui.secret; };
ACTS.renewask = () => { ui.renew = !ui.renew; };
ACTS.renew = async () => { await api("/api/settings/relay", { renew: true }); ui.renew = false; ui.secret = true; said("A new secret: give it to n8n's relay."); };

// ---- JOBS (C-342): the site, THE HANDS, and the command line's jobs ----
const LIVE_JOB = (j) => j.state === "waiting" || j.state === "running";
async function drawJobs() {
  const [v, site] = await Promise.all([api("/api/engine/jobs"), api("/api/engine/site")]);
  const now = Date.now(), h = v.hands, awake = h && now - Date.parse(h.seen) < 30000;
  const groups = [...new Set(v.kinds.map((k) => k.group))];
  const open = ui.open ?? v.jobs.find(LIVE_JOB)?.id ?? null;
  $page.innerHTML = `<h1>JOBS</h1>
    <p class="lede">What the command line did, done from here. The site comes by itself; the rest THE HANDS do on the computer.</p>
    <div class="grid">
      <div class="card"><p class="eyebrow">THE SITE</p>
        <div class="big mono">${esc((site.commit ?? "?").slice(0, 7))}</div>
        <div class="small">${site.serving === "release" ? "built on GitHub" : site.serving === "sent" ? "sent from the computer" : "none yet"}${site.at ? `, ${esc(ago(site.at, now))}` : ""}
          ${site.latest && site.latest !== site.commit ? ` · <span class="warm">${esc(site.latest.slice(0, 7))} waits</span>` : site.latest ? " · the newest" : ""}</div>
        ${site.error ? `<div class="small bad">${esc(site.error)}</div>` : ""}
        <button class="btn" data-act="siteupdate" style="margin-top:6px" ${site.fetching ? "disabled" : ""}>${site.fetching ? "FETCHING…" : "UPDATE NOW"}</button></div>
      <div class="card"><p class="eyebrow">THE HANDS</p>
        <div class="big ${awake ? "good" : "warm"}">${awake ? "AWAKE" : h ? "AWAY" : "NOT YET"}</div>
        <div class="small">${h ? `${esc(h.name)} · asked ${esc(ago(h.seen, now))}` : "On the computer, once: hub/hands.sh install"}</div>
        <div class="small faint">${awake ? "A job asked for is taken within five seconds." : "Jobs wait until it wakes (the computer asleep, or not installed)."}</div></div>
    </div>
    ${groups.map((g) => `<div class="card" style="margin-top:12px"><p class="eyebrow">${esc(g)}</p>${v.kinds.filter((k) => k.group === g).map((k) => `
      <div class="row" style="padding:6px 0"><span class="grow small">${esc(k.said)}</span>
        ${ui.sure === k.name ? `<button class="btn danger" data-act="job" data-name="${k.name}">YES</button><button class="btn quiet" data-act="sure" data-name="">NO</button>`
          : k.arg ? `<input class="text mono" style="max-width:150px" id="arg-${k.name}" placeholder="${esc(k.arg)}" aria-label="${esc(k.arg)}"><button class="btn ${k.danger ? "danger" : ""}" data-act="job" data-name="${k.name}" data-witharg="1">RUN</button>`
          : `<button class="btn ${k.danger ? "danger" : ""}" data-act="${k.danger ? "sure" : "job"}" data-name="${k.name}">RUN</button>`}</div>`).join("")}</div>`).join("")}
    <div class="card"><p class="eyebrow">WHAT RAN</p><div class="list">${v.jobs.map((j) => `<div style="padding:8px 0">
      <div class="item" data-act="openjob" data-id="${esc(j.id)}" style="padding:0">
        <span class="dot" style="background:${j.state === "done" ? "var(--good)" : j.state === "failed" ? "var(--bad)" : LIVE_JOB(j) ? "var(--gold)" : "var(--faint)"}"></span>
        <span class="t mono">${esc(j.name)}${j.arg ? ` ${esc(j.arg)}` : ""}</span>
        <span class="small">${esc(j.state)} · ${esc(ago(j.ended ?? j.started ?? j.asked, now))}${j.by ? ` · ${esc(j.by)}` : ""}</span></div>
      ${open === j.id ? `<pre class="cmd" style="max-height:340px;white-space:pre-wrap">${esc(j.output || (j.state === "waiting" ? "(waiting for THE HANDS)" : ""))}</pre>
        ${j.state === "waiting" ? `<button class="btn quiet" data-act="calloff" data-id="${esc(j.id)}">CALL IT OFF</button>` : ""}` : ""}</div>`).join("") || `<p class="small">Nothing has run yet.</p>`}</div></div>
    ${note()}`;
}
ACTS.sure = (d) => { ui.sure = ui.sure === d.name ? null : d.name || null; };
ACTS.job = async (d) => {
  const arg = d.witharg ? document.getElementById(`arg-${d.name}`)?.value ?? "" : undefined;
  const j = await api("/api/engine/jobs", { name: d.name, ...(arg !== undefined ? { arg } : {}) });
  ui.sure = null; ui.open = j.id; said("");
  if (pageNow().id !== "jobs") location.hash = "jobs";
};
ACTS.openjob = (d) => { ui.open = ui.open === d.id ? "" : d.id; };
ACTS.calloff = async (d) => { await api("/api/engine/jobs/calloff", { id: d.id }); said("Called off."); };
ACTS.siteupdate = async () => { const v = await api("/api/engine/site", {}); said(v.error ? v.error : "The site is the newest build."); };

// ---- start: the worker that lets it install and open without the browser, then the page ----
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js", { scope: "./" }).catch(() => {});
show();
