// C-507 (the user, 2026-11-24: "pulse entrain ... had an Admin site where you could fully make your own beats and link
// them to mp3 audio files u have ... you use the same simple interface to make your down drift, you can add an mp3 (which
// for us should connect to the hub to select already made files ...) and you can save ... to the hub"): THE DOWNDRIFT
// STUDIO. PulseEntrain's Studio carried over to the web: a drift's timeline drawn on its bands (tap to add a point, drag
// to move it, Delete to take it away), its carrier, a noise bed, an isochronic layer, a daemon's machine voice (square
// waves, glitches, a beat that wavers); heard here through headphones, a piece the hub already made playing under it;
// saved to the hub (POST /api/drifts/save), which checks it, keeps it with the drifts made there, and chooses it.
// Nothing of the user's is in this file: everything comes from the API, behind a key this browser pairs for. DRAFT.
"use strict";
// where the API is: the hub's own /api, or -- through EUDAIMONIA (downdrift.daemons.codemusic.ca, behind its sign-in) --
// the relay it names in the page (<meta name="downdrift-api">), which adds the hub's key itself
const API = document.querySelector('meta[name="downdrift-api"]')?.content || "/api";
const KEY = "downdrift.key";
const keyNow = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
const keep = (k) => { try { k ? localStorage.setItem(KEY, k) : localStorage.removeItem(KEY); } catch { /* a private window */ } };
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

class Unpaired extends Error {}
async function api(path, body) {
  const headers = { "content-type": "application/json" }, k = keyNow();
  if (k) headers.authorization = `Bearer ${k}`;
  const r = await fetch(path, body === undefined ? { headers } : { method: "POST", headers, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 || r.status === 403 && /pair/i.test(j.error ?? "")) throw new Unpaired(j.error ?? "not paired");
  if (!r.ok) throw new Error(j.error ?? `the hub said ${r.status}`);
  return j;
}
async function blobOf(path) {            // a piece's file, fetched with the key (an <audio> cannot send one)
  const k = keyNow(), r = await fetch(path, { headers: k ? { authorization: `Bearer ${k}` } : {} });
  if (!r.ok) throw new Error(`the hub said ${r.status}`);
  return URL.createObjectURL(await r.blob());
}

// ---- the drift being made ----------------------------------------------------------------------------------------
const KINDS = { you: ["sleep", "meditation", "nature", "tinctures"], daemon: ["sleep", "meditation", "nature", "tinctures"] };
const KIND_NAME = { you: { sleep: "SLEEP", meditation: "MEDITATION", nature: "NATURE", tinctures: "TINCTURES" },
                    daemon: { sleep: "SUSPEND", meditation: "DEFRAG", nature: "SANDBOX", tinctures: "DEV CONSOLE" } };
const BANDS = [["delta", 0.5, 4], ["theta", 4, 8], ["alpha", 8, 13], ["beta", 13, 30], ["gamma", 30, 45]];
const fresh = () => ({ name: "", line: "", kind: "sleep", side: "you", minutes: 20, carrierHz: 200,
                       scenes: [{ atSec: 0, beatHz: 10 }, { atSec: 600, beatHz: 6 }, { atSec: 1200, beatHz: 3 }],
                       bed: { type: "pink", level: 0.1 }, isochronic: null, machine: null });
let d = fresh(), sel = 0, drifts = [], pieces = [];
const sorted = () => d.scenes.slice().sort((a, b) => a.atSec - b.atSec);
const end = () => d.minutes * 60;
const bandOf = (hz) => (BANDS.find(([, lo, hi]) => hz >= lo && hz < hi) ?? BANDS[4])[0];
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

// a library or made drift as a starting point
function fromFile(f) {
  const bed = (f.audio?.beds ?? [])[0];
  return { name: f.meta?.name ?? "", line: f.meta?.description ?? "", kind: f.kind ?? "sleep", side: f.side ?? "you",
           minutes: Math.max(10, Math.min(45, Math.round((f.meta?.durationSec ?? 1200) / 60))),
           carrierHz: f.audio?.binaural?.carrierHz ?? 200,
           scenes: (f.entrainment?.scenes ?? []).map((s) => ({ atSec: Math.round(s.atSec), beatHz: Math.round(s.beatHz * 100) / 100, ...(s.carrierHz ? { carrierHz: s.carrierHz } : {}) })),
           bed: bed ? { type: bed.type, level: bed.level ?? 0.1 } : null,
           isochronic: f.audio?.isochronic ? { voice: f.audio.isochronic.voice ?? "tone", level: f.audio.isochronic.level ?? 0.3, toneHz: f.audio.isochronic.toneHz } : null,
           machine: f.machine ? JSON.parse(JSON.stringify(f.machine)) : null };
}

// ---- the page --------------------------------------------------------------------------------------------------------
function pairPage(why) {
  if (API !== "/api") {   // through EUDAIMONIA: its own sign-in, not the hub's pairing
    $("page").innerHTML = `<div class="card"><div class="eyebrow">SIGN IN FIRST</div>
      <p class="small">The studio opens for someone signed in to EUDAIMONIA. <a href="/">Sign in</a>, then come back to this page.</p></div>`;
    return;
  }
  $("page").innerHTML = `<div class="card"><div class="eyebrow">PAIR THIS BROWSER</div>
    <p class="small">The studio saves to your companion hub. Show a pairing code on the hub's own screen, or in the app's
      SETTINGS (PAIR A PHONE), and type it here.</p>
    <form id="pairform" class="row"><input id="code" class="text mono" inputmode="numeric" autocomplete="one-time-code"
      placeholder="the code on the hub's screen" aria-label="pairing code" required style="max-width:240px"><button class="btn gold">PAIR</button></form>
    <div class="small bad" id="pairnote">${esc(why && !/pair/i.test(why) ? why : "")}</div></div>`;
  $("pairform").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    try {
      const r = await fetch("/api/pair", { method: "POST", headers: { "content-type": "application/json" },
                                          body: JSON.stringify({ code: $("code").value.trim(), name: "THE DOWNDRIFT STUDIO" }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.token) throw new Error(j.error ?? "that did not pair");
      keep(j.token); start();
    } catch (e) { $("pairnote").textContent = e.message; }
  });
}

function page() {
  const opt = (v, label, on) => `<option value="${esc(v)}"${on ? " selected" : ""}>${esc(label)}</option>`;
  $("page").innerHTML = `
  <section class="card">
    <div class="eyebrow">START FROM</div>
    <div class="row">
      <select id="from" aria-label="Start from a drift" style="max-width:420px">
        <option value="">a fresh drift</option>
        ${drifts.map((x) => opt(x.id, `${x.made ? "MADE · " : ""}${x.name} · ${(x.kind || "").toUpperCase()}${x.side === "daemon" ? " (a daemon's)" : ""}`)).join("")}
      </select>
      <button class="btn" id="load">OPEN</button>
    </div>
  </section>
  <section class="card">
    <div class="eyebrow">THE DRIFT</div>
    <div class="grid">
      <label class="f">NAME<input class="text mono" id="name" maxlength="40" value="${esc(d.name)}" placeholder="TWO TO FOUR WORDS"></label>
      <label class="f">WHOSE<select id="side">${opt("you", "YOURS", d.side === "you")}${opt("daemon", "A DAEMON'S", d.side === "daemon")}</select></label>
      <label class="f">KIND<select id="kind">${KINDS[d.side].map((k) => opt(k, KIND_NAME[d.side][k], d.kind === k)).join("")}</select></label>
      <label class="f">MINUTES<input class="text mono" id="minutes" type="number" min="10" max="45" value="${d.minutes}"></label>
      <label class="f">CARRIER (HZ)<input class="text mono" id="carrier" type="number" min="100" max="500" value="${d.carrierHz}"></label>
    </div>
    <label class="f">THE LINE ON HOVER<input class="text" id="line" maxlength="160" value="${esc(d.line)}" placeholder="One sentence on what it does."></label>
  </section>
  <section class="card">
    <div class="eyebrow">THE TIMELINE</div>
    <canvas id="tl" class="timeline" tabindex="0" aria-label="The drift's timeline: tap to add a point, drag to move one, Delete to remove it"></canvas>
    <div class="legend">${BANDS.map(([b]) => `<span><i style="background:var(--${b})"></i>${b.toUpperCase()}</span>`).join("")}
      <span class="dim">tap to add · drag to move · Delete to remove</span></div>
    <div id="point" class="grid"></div>
  </section>
  <section class="card">
    <div class="eyebrow">LAYERS</div>
    <div class="grid">
      <label class="f">NOISE BED<select id="bed">${opt("", "none", !d.bed)}${["white", "pink", "brown", "rain", "wind", "surf", "stream"].map((b) => opt(b, b, d.bed?.type === b)).join("")}</select></label>
      <label class="f">BED LEVEL<input id="bedlevel" type="range" min="0" max="0.5" step="0.01" value="${d.bed?.level ?? 0.1}"></label>
      <label class="f">ISOCHRONIC<select id="iso">${opt("", "none", !d.isochronic)}${opt("tone", "a tone", d.isochronic?.voice === "tone")}${opt("glitch", "glitch noise", d.isochronic?.voice === "glitch")}</select></label>
      <label class="f">ISOCHRONIC LEVEL<input id="isolevel" type="range" min="0" max="0.8" step="0.01" value="${d.isochronic?.level ?? 0.3}"></label>
    </div>
    <div class="small">The isochronic layer pulses at each moment's exact beat and is heard on a speaker too; the binaural beat needs headphones.</div>
  </section>
  <section class="card" id="machinecard" ${d.side === "daemon" ? "" : "hidden"}>
    <div class="eyebrow">A DAEMON'S MACHINE VOICE</div>
    <div class="grid">
      <label class="f">WAVE<select id="wave">${opt("square", "square", (d.machine?.wave ?? "square") === "square")}${opt("sine", "sine", d.machine?.wave === "sine")}</select></label>
      <label class="f">GLITCHES A SECOND<input class="text mono" id="glitch" type="number" min="0" max="5" step="0.1" value="${d.machine?.glitch?.perSec ?? 0.6}"></label>
      <label class="f">WAVER<select id="waverwhat">${opt("", "none", !d.machine?.waver)}${["beat", "carrier", "both"].map((w) => opt(w, `the ${w}`, d.machine?.waver?.what === w)).join("")}</select></label>
      <label class="f">WAVER BY (HZ, AT MOST THE BEAT)<input class="text mono" id="waverdelta" type="number" min="0" max="10" step="0.1" value="${d.machine?.waver?.deltaHz ?? 1}"></label>
      <label class="f">OVER (SECONDS)<input class="text mono" id="waverperiod" type="number" min="2" max="60" step="1" value="${d.machine?.waver?.periodSec ?? 8}"></label>
    </div>
  </section>
  <section class="card">
    <div class="eyebrow">HEAR IT</div>
    <div class="row">
      <label class="f" style="flex:1;min-width:220px">MUSIC UNDER IT (A PIECE THE HUB MADE)<select id="music">${opt("", "no music", true)}
        ${pieces.map((p) => opt(p.id, `${p.nickname || "a daemon"} · ${(p.said || p.caption || "").slice(0, 60)}`)).join("")}</select></label>
      <label class="f">PLAY<select id="pace">${opt("60", "the whole drift in one minute", true)}${opt("real", "in real time")}</select></label>
    </div>
    <div class="row"><button class="btn" id="play">▶ HEAR IT</button><button class="btn" id="stop">■ STOP</button>
      <span class="small" id="hearing">Headphones for the beat.</span></div>
  </section>
  <section class="card">
    <div class="row"><button class="btn gold" id="save">SAVE TO THE HUB</button><span class="small" id="saved"></span></div>
    <div class="small">Saved, it is kept with the drifts made on your hub and chosen: REVERIE plays it from the next PLAY.</div>
  </section>`;
  wire(); drawPoint(); draw();
}

// ---- reading the form back ------------------------------------------------------------------------------------------
function wire() {
  const num = (id, lo, hi, dflt) => Math.max(lo, Math.min(hi, Number($(id).value) || dflt));
  const sync = () => {
    d.name = $("name").value.toUpperCase(); d.line = $("line").value;
    d.minutes = num("minutes", 10, 45, 20); d.carrierHz = num("carrier", 100, 500, 200);
    d.scenes.forEach((s) => { s.atSec = Math.min(s.atSec, end()); });
    d.bed = $("bed").value ? { type: $("bed").value, level: Number($("bedlevel").value) } : null;
    d.isochronic = $("iso").value ? { voice: $("iso").value, level: Number($("isolevel").value),
                                      ...(d.isochronic?.toneHz ? { toneHz: d.isochronic.toneHz } : {}) } : null;   // a drift's own tone kept
    if (d.side === "daemon") {
      const what = $("waverwhat").value;
      d.machine = { wave: $("wave").value, glitch: { perSec: num("glitch", 0, 5, 0), level: 0.5 },
                    waver: what ? { what, deltaHz: num("waverdelta", 0, 10, 1), periodSec: num("waverperiod", 2, 60, 8) } : null };
    } else d.machine = null;
    draw();
  };
  for (const id of ["name", "line", "minutes", "carrier", "bed", "bedlevel", "iso", "isolevel", "wave", "glitch", "waverwhat", "waverdelta", "waverperiod"])
    $(id)?.addEventListener("input", sync);
  $("side").addEventListener("change", () => { d.side = $("side").value; page(); });
  $("kind").addEventListener("change", () => { d.kind = $("kind").value; });
  $("load").addEventListener("click", async () => {
    const id = $("from").value;
    if (!id) { d = fresh(); sel = 0; return page(); }
    try { d = fromFile(await api(`${API}/drifts/${encodeURIComponent(id)}`)); sel = 0; page(); }
    catch (e) { if (e instanceof Unpaired) return pairPage(e.message); $("saved").textContent = e.message; }
  });
  $("play").addEventListener("click", () => hear().catch((e) => { $("hearing").textContent = e.message; }));
  $("stop").addEventListener("click", hush);
  $("save").addEventListener("click", save);
  timeline($("tl"));
}

// ---- the timeline: bands, the beat's line, its points ----------------------------------------------------------------
const LO = 0.5, HI = 45;
const yOf = (hz, h) => h - 12 - (Math.log(hz / LO) / Math.log(HI / LO)) * (h - 24);   // a log scale: delta has room
const hzOf = (y, h) => LO * Math.pow(HI / LO, (h - 12 - y) / (h - 24));
const xOf = (s, w) => 52 + (s / end()) * (w - 64);
const sOf = (x, w) => ((x - 52) / (w - 64)) * end();
function draw() {
  const c = $("tl"); if (!c) return;
  const r = c.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr);
  const g = c.getContext("2d"), w = r.width, h = r.height, css = getComputedStyle(document.documentElement);
  g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
  for (const [b, lo, hi] of BANDS) {                                   // the bands, faint
    g.fillStyle = css.getPropertyValue(`--${b}`).trim(); g.globalAlpha = 0.09;
    g.fillRect(52, yOf(hi, h), w - 64, yOf(lo, h) - yOf(hi, h));
    g.globalAlpha = 0.8; g.font = "10px ui-monospace, Menlo, monospace"; g.fillText(b.toUpperCase(), 4, (yOf(lo, h) + yOf(hi, h)) / 2 + 3);
  }
  g.globalAlpha = 1; g.strokeStyle = css.getPropertyValue("--faint").trim(); g.fillStyle = g.strokeStyle;
  for (let m = 0; m <= d.minutes; m += 5) { const x = xOf(m * 60, w); g.fillText(`${m}′`, x - 6, h - 1); }
  const pts = sorted();
  g.strokeStyle = css.getPropertyValue("--gold").trim(); g.lineWidth = 2; g.beginPath();
  pts.forEach((s, i) => { const x = xOf(s.atSec, w), y = yOf(s.beatHz, h); i ? g.lineTo(x, y) : g.moveTo(x, y); });
  if (pts.length) g.lineTo(xOf(end(), w), yOf(pts[pts.length - 1].beatHz, h));   // held past the last point
  g.stroke();
  d.scenes.forEach((s, i) => {
    g.beginPath(); g.arc(xOf(s.atSec, w), yOf(s.beatHz, h), i === sel ? 7 : 5, 0, Math.PI * 2);
    g.fillStyle = css.getPropertyValue(`--${bandOf(s.beatHz)}`).trim(); g.fill();
    g.lineWidth = i === sel ? 2.5 : 1.5; g.strokeStyle = "#0d0d0d"; g.stroke();
  });
}
function timeline(c) {
  let dragging = -1;
  const at = (ev) => { const r = c.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top, w: r.width, h: r.height }; };
  const near = (p) => d.scenes.findIndex((s) => Math.hypot(xOf(s.atSec, p.w) - p.x, yOf(s.beatHz, p.h) - p.y) < 12);
  const place = (i, p) => {
    const s = d.scenes[i];
    s.atSec = i === 0 ? 0 : Math.round(Math.max(0, Math.min(end(), sOf(p.x, p.w))));   // the first stays at the start
    s.beatHz = Math.round(Math.max(LO, Math.min(HI, hzOf(p.y, p.h))) * 4) / 4;
  };
  c.addEventListener("pointerdown", (ev) => {
    const p = at(ev); let i = near(p);
    if (i < 0) { d.scenes.push({ atSec: 0, beatHz: 10 }); i = d.scenes.length - 1; place(i, p); }
    sel = i; dragging = i; c.setPointerCapture(ev.pointerId); drawPoint(); draw();
  });
  c.addEventListener("pointermove", (ev) => { if (dragging >= 0) { place(dragging, at(ev)); drawPoint(); draw(); } });
  c.addEventListener("pointerup", () => { dragging = -1; });
  c.addEventListener("keydown", (ev) => {
    const s = d.scenes[sel]; if (!s) return;
    if ((ev.key === "Delete" || ev.key === "Backspace") && sel > 0 && d.scenes.length > 2) { d.scenes.splice(sel, 1); sel = 0; }
    else if (ev.key === "ArrowUp") s.beatHz = Math.min(HI, s.beatHz + 0.25);
    else if (ev.key === "ArrowDown") s.beatHz = Math.max(LO, s.beatHz - 0.25);
    else if (ev.key === "ArrowRight" && sel > 0) s.atSec = Math.min(end(), s.atSec + 15);
    else if (ev.key === "ArrowLeft" && sel > 0) s.atSec = Math.max(0, s.atSec - 15);
    else return;
    ev.preventDefault(); drawPoint(); draw();
  });
  new ResizeObserver(draw).observe(c);
}
function drawPoint() {
  const s = d.scenes[sel], el = $("point"); if (!el || !s) return;
  el.innerHTML = `
    <label class="f">AT (SECONDS) · ${mmss(s.atSec)}<input class="text mono" id="p_at" type="number" min="0" max="${end()}" value="${s.atSec}" ${sel === 0 ? "disabled" : ""}></label>
    <label class="f">BEAT (HZ) · ${bandOf(s.beatHz).toUpperCase()}<input class="text mono" id="p_beat" type="number" min="0.5" max="45" step="0.01" value="${s.beatHz}"></label>
    <label class="f">ITS OWN CARRIER (HZ, OPTIONAL)<input class="text mono" id="p_car" type="number" min="100" max="500" value="${s.carrierHz ?? ""}" placeholder="the drift's"></label>
    <div class="row" style="align-self:end"><button class="btn" id="p_del" ${sel === 0 || d.scenes.length <= 2 ? "disabled" : ""}>REMOVE THIS POINT</button></div>`;
  const upd = () => {
    if (sel > 0) s.atSec = Math.max(0, Math.min(end(), Number($("p_at").value) || 0));
    s.beatHz = Math.max(LO, Math.min(HI, Number($("p_beat").value) || s.beatHz));
    const car = Number($("p_car").value); if (car) s.carrierHz = Math.max(100, Math.min(500, car)); else delete s.carrierHz;
    draw();
  };
  for (const id of ["p_at", "p_beat", "p_car"]) $(id).addEventListener("change", () => { upd(); drawPoint(); });
  $("p_del").addEventListener("click", () => { d.scenes.splice(sel, 1); sel = 0; drawPoint(); draw(); });
}

// ---- hearing it: the same layers the phone plays, in Web Audio ------------------------------------------------------
let ctx = null, nodes = [], music = null, glitchTimer = null;
function hush() {
  for (const n of nodes) { try { n.stop?.(); } catch { /* not started */ } try { n.disconnect(); } catch { /* gone */ } }
  nodes = []; clearInterval(glitchTimer); glitchTimer = null;
  if (music) { music.pause(); music = null; }
  if ($("hearing")) $("hearing").textContent = "Headphones for the beat.";
}
const squareWave = (ctx) => {   // odd harmonics to the ninth, as server/src/shared/tones.ts draws its square
  const re = new Float32Array(10), im = new Float32Array(10);
  for (let k = 1; k <= 9; k += 2) im[k] = 1 / k;
  return ctx.createPeriodicWave(re, im);
};
function noiseBuffer(ctx, type) {
  const n = ctx.sampleRate * 4, b = ctx.createBuffer(1, n, ctx.sampleRate), x = b.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, br = 0;
  const colour = { rain: "pink", stream: "pink", wind: "brown", surf: "brown" }[type] ?? type;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    if (colour === "pink") { b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913; x[i] = (b0 + b1 + b2 + w * 0.1848) * 0.11; }
    else if (colour === "brown") { br = (br + 0.02 * w) / 1.02; x[i] = br * 3.5; }
    else x[i] = w * 0.5;
  }
  return b;
}
async function hear() {
  hush();
  ctx ??= new (window.AudioContext || window.webkitAudioContext)();
  await ctx.resume();
  const pts = sorted(), whole = end(), f = $("pace").value === "real" ? 1 : 60 / whole, t0 = ctx.currentTime + 0.1;
  const master = ctx.createGain(); master.gain.value = 0.25; master.connect(ctx.destination); nodes.push(master);
  const merge = ctx.createChannelMerger(2); merge.connect(master); nodes.push(merge);
  const L = ctx.createOscillator(), R = ctx.createOscillator();
  if (d.machine?.wave === "square") { const w = squareWave(ctx); L.setPeriodicWave(w); R.setPeriodicWave(w); }
  L.connect(merge, 0, 0); R.connect(merge, 0, 1); nodes.push(L, R);
  for (const s of pts) {                                                // the beat's ramps, time compressed if asked
    const car = s.carrierHz ?? d.carrierHz, at = t0 + s.atSec * f;
    if (s === pts[0]) { L.frequency.setValueAtTime(car, at); R.frequency.setValueAtTime(car + s.beatHz, at); }
    else { L.frequency.linearRampToValueAtTime(car, at); R.frequency.linearRampToValueAtTime(car + s.beatHz, at); }
  }
  const w = d.machine?.waver;
  if (w && w.deltaHz > 0) {                                              // the waver: a slow sine on the ears' pitch
    const lfo = ctx.createOscillator(), depthL = ctx.createGain(), depthR = ctx.createGain();
    lfo.frequency.value = 1 / (w.periodSec * f); depthL.gain.value = w.what === "beat" ? 0 : w.deltaHz;
    depthR.gain.value = w.what === "carrier" ? w.deltaHz : w.what === "both" ? 2 * w.deltaHz : w.deltaHz;
    lfo.connect(depthL).connect(L.frequency); lfo.connect(depthR).connect(R.frequency); lfo.start(t0); nodes.push(lfo, depthL, depthR);
  }
  if (d.isochronic) {                                                   // a tone (or noise) pulsed at the beat
    const gate = ctx.createGain(); gate.gain.value = 0; gate.connect(master); nodes.push(gate);
    const lfo = ctx.createOscillator(); lfo.type = "square";
    const half = ctx.createGain(); half.gain.value = 0.5 * d.isochronic.level;
    const bias = ctx.createConstantSource(); bias.offset.value = 0.5 * d.isochronic.level;
    lfo.connect(half).connect(gate.gain); bias.connect(gate.gain);
    for (const s of pts) { const at = t0 + s.atSec * f; s === pts[0] ? lfo.frequency.setValueAtTime(s.beatHz, at) : lfo.frequency.linearRampToValueAtTime(s.beatHz, at); }
    let src;
    if (d.isochronic.voice === "glitch") { src = ctx.createBufferSource(); src.buffer = noiseBuffer(ctx, "white"); src.loop = true; }
    else { src = ctx.createOscillator(); src.frequency.value = d.isochronic.toneHz ?? 400; }
    src.connect(gate); lfo.start(t0); bias.start(t0); src.start(t0); nodes.push(lfo, half, bias, src);
  }
  if (d.bed) {
    const src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = noiseBuffer(ctx, d.bed.type); src.loop = true; g.gain.value = d.bed.level * 1.5;
    src.connect(g).connect(ctx.destination); src.start(t0); nodes.push(src, g);
  }
  L.start(t0); R.start(t0);
  const stopAt = t0 + whole * f; L.stop(stopAt); R.stop(stopAt);
  const g = d.machine?.glitch?.perSec ?? 0;
  if (g > 0) glitchTimer = setInterval(() => {                         // a glitch: the ears dropped for a moment
    const now = ctx.currentTime; master.gain.setValueAtTime(0.03, now); master.gain.setValueAtTime(0.25, now + 0.02 + Math.random() * 0.04);
  }, 1000 / g);
  const id = $("music").value;
  if (id) { music = new Audio(await blobOf(`${API}/sleep/track/${encodeURIComponent(id)}/phone.m4a`)); music.volume = 0.8; music.play().catch(() => {}); }
  $("hearing").textContent = f === 1 ? `Playing in real time: ${d.minutes} minutes.` : "Playing the whole drift in one minute.";
  setTimeout(() => { if (nodes.length && ctx.currentTime >= stopAt - 0.05) hush(); }, (whole * f + 0.3) * 1000);
}

// ---- saving it to the hub -------------------------------------------------------------------------------------------
async function save() {
  if (d.scenes.length < 2) { $("saved").textContent = "A drift needs at least two points."; return; }
  $("saved").textContent = "Saving…";
  try {
    const r = await api(`${API}/drifts/save`, { drift: { ...d, scenes: sorted() } });
    $("saved").innerHTML = `<span class="good">Saved and chosen: ${esc(r.name)}.</span>`;
    drifts = (await api(`${API}/drifts`)).drifts ?? drifts;
  } catch (e) {
    if (e instanceof Unpaired) return pairPage(e.message);
    $("saved").innerHTML = `<span class="bad">${esc(e.message)}</span>`;
  }
}

// ---- start ----------------------------------------------------------------------------------------------------------
async function start() {
  $("where").textContent = location.host;
  try {
    drifts = (await api(`${API}/drifts`)).drifts ?? [];
    pieces = ((await api(`${API}/sleep/tracks`).catch(() => ({ tracks: [] }))).tracks ?? []).filter((t) => t.state === "ready");
    page();
  } catch (e) { e instanceof Unpaired ? pairPage(e.message) : ($("page").innerHTML = `<p class="bad">${esc(e.message)}</p>`); }
}
start();
