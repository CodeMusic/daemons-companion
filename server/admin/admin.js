// C-330: THE ENGINE ROOM (DRAFT) -- the hub's admin in one web app, one navigation for all of it:
//   THE HUB      what the hub is running, and what is done on its own machine only
//   THE MIND     THE MIND AT WORK for everyone, and LATER (C-319) -- the app keeps only its player's own
//   THE HOUSE    the casino's odds and why, everyone at the reels, what the house keeps, the weather's city (C-158, C-167)
//   VOICES       MAKE THE VOICES AGAIN (C-303)
//   DEVICES      every device heard, what it carries, forgetting one (C-80)
//   EXCHANGE     its players, and an invite code for a new one (C-218)
//   THE COMMONS  this home's link to the commons, and its keeper's list (C-222), run by THE HANDS
//   KEYS         pairing codes, the paired phones, the relay, Home Assistant (C-342: once the hub's own machine's alone)
//   JOBS         the site built at every push, THE HANDS on the computer, the command line's jobs (C-342)
// The page holds nothing of the user's: it asks the hub's API, with a paired key kept in this browser (on the hub's own
// machine none is needed). Every word DRAFT.
const KEY = "engine-room.key";
const keyNow = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
const keep = (k) => { try { k ? localStorage.setItem(KEY, k) : localStorage.removeItem(KEY); } catch { /* a private window */ } };

class Refused extends Error {}
async function api(path, body) {
  const headers = { "content-type": "application/json" }, k = keyNow();
  if (k) headers.authorization = `Bearer ${k}`;
  const r = await fetch(path, body === undefined ? { headers } : { method: "POST", headers, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 || (r.status === 403 && /pair this phone/.test(j.error ?? ""))) throw new Refused(j.error ?? "not paired");
  if (!r.ok) throw new Error(j.error ?? `the hub said ${r.status}`);
  return j;
}

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
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
async function show(again = false) {
  clearTimeout(timer);
  const p = pageNow();
  drawing = p;
  if (!again) { ui = {}; drawNav(); $page.innerHTML = `<p class="small">Asking the hub…</p>`; }
  // a redraw waits while something is being typed into the page (a home's id, an address)
  const typing = again && document.activeElement?.matches?.("input") && $page.contains(document.activeElement);
  try { if (!typing) await p.draw(again); }
  catch (e) {
    if (e instanceof Refused) return drawPair(e.message);
    if (!again) $page.innerHTML = `<h1>${esc(p.label)}</h1><div class="card bad">${esc(e.message)}</div>`;
  }
  if (p.every && pageNow() === p) timer = setTimeout(() => show(true), p.every);
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
  catch (e) { if (e instanceof Refused) return drawPair(e.message); ui.note = e.message; }
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

// ---- THE MIND (C-319): everyone's tasks, LATER ----
const KIND = { talk: ["#5a7fa6", "TALK"], guide: ["#00a8d6", "THE GUIDE"], dream: ["#8E3F80", "DREAMS"], whatsnew: ["#d9a74a", "WHAT'S NEW"],
               journal: ["#6fae6a", "JOURNAL"], meeting: ["#c9784a", "MEETINGS"], voice: ["#b48ce0", "VOICES"], chatter: ["#4f6b8a", "CHATTER"] };
const kindOf = (k) => KIND[k] ?? ["#7a7f8a", String(k).toUpperCase()];
const LIVE = (t) => t.state === "waiting" || t.state === "thinking";
const STATE = { waiting: "waiting", thinking: "thinking", done: "done", failed: "failed", stopped: "stopped", scheduled: "planned" };
const treed = (ts) => {
  const ids = new Set(ts.map((t) => t.id)), out = [];
  const walk = (t, d) => { out.push([t, d]); ts.filter((c) => c.parent === t.id).forEach((c) => walk(c, d + 1)); };
  ts.filter((t) => !t.parent || !ids.has(t.parent)).forEach((t) => walk(t, 0));
  return out;
};
async function drawMind() {
  const v = await api("/api/mind/tasks"), who = ui.who ?? "all", now = Date.now();
  const shown = v.tasks.filter((t) => t.state !== "scheduled" && (who === "all" || t.user === who));
  const live = shown.filter(LIVE), done = shown.filter((t) => !LIVE(t)).slice(0, 30);
  const sel = v.tasks.find((t) => t.id === ui.picked);
  const row = ([t, d]) => `<div class="item" data-act="pick" data-id="${esc(t.id)}" style="padding-left:${d * 16}px">
      <span class="dot" style="background:${t.state === "failed" ? "var(--bad)" : kindOf(t.kind)[0]}"></span>
      <span class="t">${d ? "└ " : ""}${esc(t.title)}${(t.hops?.length ?? 0) > 1 ? " ⇢" : ""}</span>
      <span class="small">${esc(t.user)} · ${LIVE(t) ? STATE[t.state] : `${took(t.ms)} ${ago(t.ended ?? t.at, now)}`}</span></div>`;
  if (stale()) return;
  $page.innerHTML = `<h1>THE MIND AT WORK</h1>
    <p class="lede">${live.length ? `${live.length} thinking now` : "Quiet"}${v.load?.waiting ? ` · ${v.load.waiting} in the hub's queue` : ""} ·
      minds: ${(v.minds ?? []).map((m) => `<span class="${m.ok ? "good" : "bad"}">●</span> ${esc(m.name)}`).join(" ") || "none"}</p>
    <div class="row" style="margin-bottom:12px">${["all", ...v.users].map((u) =>
      `<button class="pill ${who === u ? "on" : ""}" data-act="who" data-who="${esc(u)}">${u === "all" ? "EVERYONE" : esc(u.toUpperCase())}</button>`).join("")}</div>
    ${sel ? `<div class="card" style="border-color:${kindOf(sel.kind)[0]}">
      <div class="big" style="font-size:16px">${esc(sel.title)}</div>
      <div class="small">${kindOf(sel.kind)[1]} · ${STATE[sel.state]}${sel.ms !== undefined ? ` in ${took(sel.ms)}` : ""} · ${ago(sel.at, now)}</div>
      <div class="small">for ${esc(sel.user)}, from ${esc(sel.device)}${sel.mind ? `, on ${esc(sel.mind)}` : ""}${sel.source === "trace" ? " (reported by the phone)" : sel.source === "queue" ? " (the hub's talk queue)" : ""}</div>
      ${(sel.hops?.length ?? 0) > 1 ? `<div class="small warm">handed on: ${sel.hops.map((h) => esc(h.mind + (h.error ? ` ✕ (${h.error})` : ""))).join(" → ")}</div>` : ""}
      ${sel.error ? `<div class="small bad">${esc(sel.error)}</div>` : ""}
      <div class="row" style="margin-top:8px">
        ${sel.can?.stop && LIVE(sel) ? `<button class="btn danger" data-act="task" data-id="${esc(sel.id)}" data-a="stop">STOP</button>` : ""}
        ${sel.can?.retry && (sel.state === "failed" || sel.state === "stopped") ? `<button class="btn" data-act="task" data-id="${esc(sel.id)}" data-a="retry">TRY AGAIN</button>` : ""}
        ${sel.source === "ledger" && !LIVE(sel) ? `<button class="btn quiet" data-act="task" data-id="${esc(sel.id)}" data-a="forget">FORGET</button>` : ""}
        <button class="btn quiet" data-act="pick" data-id="">CLOSE</button></div></div>` : ""}
    <div class="card"><p class="eyebrow">NOW</p><div class="list">${treed(live).map(row).join("") || `<p class="small">Nothing thinking.</p>`}</div></div>
    <div class="card"><p class="eyebrow">BEFORE</p><div class="list">${treed(done).map(row).join("") || `<p class="small">Nothing finished lately.</p>`}</div>
      <div class="row" style="margin-top:8px"><button class="btn quiet" data-act="clear">CLEAR FINISHED${who === "all" ? "" : ` (${esc(who.toUpperCase())})`}</button></div></div>
    <div class="card"><p class="eyebrow">LATER -- THE HUB'S PLANS</p><div class="list">${(v.plans ?? []).map((p) => `<div style="padding:8px 0">
      <div class="row"><span class="dot" style="border:1.5px dashed ${kindOf(p.kind)[0]}"></span><span class="grow ${p.on ? "" : "faint"}">${esc(p.title)}</span>
        <button class="pill ${p.on ? "on" : ""}" data-act="plan" data-plan="${esc(p.id)}" data-on="${p.on ? "" : "1"}">${p.on ? "ON" : "OFF"}</button>
        <button class="pill" data-act="plan" data-plan="${esc(p.id)}" data-now="1">NOW</button></div>
      <div class="small">${esc(p.said)} ${p.on ? `Next: ${esc(new Date(p.next).toLocaleString([], { weekday: "long", hour: "numeric", minute: "2-digit" }))}.` : "Off."}${p.last ? ` Last: ${ago(p.last, now)}.` : ""}</div></div>`).join("") || `<p class="small">No plans.</p>`}</div></div>
    ${note()}`;
}
ACTS.who = (d) => { ui.who = d.who; ui.picked = null; };
ACTS.pick = (d) => { ui.picked = d.id || null; };
ACTS.task = async (d) => { await api("/api/mind/tasks", { id: d.id, act: d.a }); said(""); if (d.a === "forget") ui.picked = null; };
ACTS.clear = async () => { await api("/api/mind/tasks", { act: "clear", ...(ui.who && ui.who !== "all" ? { user: ui.who } : {}) }); said("Cleared."); };
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
      ${open === "keeps" ? `<div class="reasons">${k.devices.map((d) => `<div><b class="${d.take > 0 ? "bad" : d.take < 0 ? "good" : "faint"}" style="width:80px">${d.take.toLocaleString()}</b><span>${esc(d.device)} · ${d.spins.toLocaleString()} pulls</span></div>`).join("")}</div>` : k.devices.length ? `<div class="small gold">By board ›</div>` : ""}</div>` : ""}
    <p class="eyebrow" style="margin-top:16px">AT THE REELS</p>
    ${h.players.length ? "" : `<p class="small">Nobody is playing just now.</p>`}
    ${h.players.map((p) => `<div class="card tap" data-act="open" data-o="${esc(p.device)}"><div class="row">
        ${p.species ? `<img class="art" alt="" src="/art/species/${encodeURIComponent(p.species)}.png">` : ""}
        <div class="grow"><div class="mono"><b>${esc(p.name)}</b></div><div class="small">${esc(p.device)} · ${p.odds ? back(p.odds.rtp) : "the day's odds"}</div></div></div>
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
        <div class="grow"><div class="mono"><b>${esc(d.id)}</b> <span class="${d.here ? "good" : "faint"}">●</span></div>
          <div class="small">${esc(d.kind)}${d.via ? ` · ${esc(d.via)}` : ""} · ${esc(ago(d.lastSeen, now))}${d.firmware ? ` · ${esc(d.firmware)}` : ""}${d.battery ? ` · ${d.battery.percent}%${d.battery.charging ? " charging" : ""}` : ""}</div>
          <div class="small">${d.daemon ? `carries ${esc(d.daemon.nickname || d.daemon.name)} · LV ${d.daemon.level}` : "carries nobody"}</div></div>
        ${ui.forget === d.id ? `<button class="btn danger" data-act="forget" data-id="${esc(d.id)}">YES, FORGET IT</button><button class="btn quiet" data-act="forgetask" data-id="">NO</button>`
          : `<button class="btn quiet" data-act="forgetask" data-id="${esc(d.id)}">FORGET</button>`}</div></div>`).join("")}
    ${v.unplaced?.length ? `<div class="card"><p class="eyebrow">AWAY IN NO DEVICE</p><div class="small">${v.unplaced.map((d) => esc(d.nickname || d.name)).join(" · ")}</div>
      <p class="small faint">Each player puts a daemon in a device from the app (PLACES).</p></div>` : ""}
    ${note()}`;
}
ACTS.forgetask = (d) => { ui.forget = d.id || null; };
ACTS.forget = async (d) => { await api("/api/devices/forget", { id: d.id }); ui.forget = null; said(`${d.id} forgotten.`); };

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
