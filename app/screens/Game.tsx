// C-187: GAME -- DAEMONS played in the app (docs/ONEAPP.md), as the playground plays it: the mGBA core through
// EmulatorJS in a web view, the ROM made on this device from the player's own (game/rom.ts). The page is written next to
// the ROM in the app's documents and opened from there, so the emulator reads the ROM as a file beside it.
// The save is the companion's (C-188's one save): hosting alone's daemons.sav. It is put into the game when the game
// starts, and taken out of the game the moment it saves (C-261: its save read each second, taken once it holds still)
// and whenever the game is left -- so what the game writes is what TODAY, the widget and the INDEX read. Each save the
// game makes is SYNCed at once, and what SYNC writes goes into the running game too (server/src/game/live.ts): play
// never stops for it. The game is paused whenever another tab is shown.
// A newer release, once published, shows as a strip above the game: one tap makes it from the player's original kept
// here, and the game starts again from the same save.
import { GameTitle, type TitleChoice } from "./GameTitle";
import { useEffect, useRef, useState } from "react";
import { Directory, File, Paths } from "expo-file-system";
import { WebView } from "react-native-webview";
import { useLowPowerMode } from "expo-battery";
import { Text, XStack, YStack } from "tamagui";
import { freshPatches, heldGame, makeGame, makeTestingBuild, testingBuilds, updateFor, updateGame, type Game, type Step } from "../game/rom";
import { GATE } from "../game/gate";
import { ALONE, api, LOCAL, TOKEN } from "../net";
import { sha1 } from "../../server/src/game/hash";
import { mirrorChoice } from "../../server/src/game/mirror";
import { applyPlan, livePlan } from "../../server/src/game/live";       // C-261
import { heardSync } from "../received";
import PAD from "../modules/daemons-pad";                              // C-263
import { HowToOverlay, openHowTo, useHowTo } from "../howto";          // C-264
import { Action, Card, Eyebrow, Small } from "../ui";

const CDN = "https://cdn.emulatorjs.org/4.2.3/data/";       // the playground's EmulatorJS, the same version
const saveFile = () => new File(Paths.document, "daemons.sav");
// C-188: paired with a companion (the Mac, the hub), the device's save is the real one and the companion keeps a mirror
// of it. `agreed` is the save both last held, so a SYNC the companion wrote since is taken back only while the device's
// save has not moved; when both moved, the device's wins and goes out at the next save.
const paired = () => !ALONE && !!TOKEN;
const agreedFile = () => new File(new Directory(Paths.document, "game"), "mirror.json");
function agreed(): string { try { const f = agreedFile(); return f.exists ? String(JSON.parse(f.textSync()).sha1 ?? "") : ""; } catch { return ""; } }
function agree(s: string) { try { const f = agreedFile(); if (!f.exists) f.create(); f.write(JSON.stringify({ sha1: s })); } catch { /* asked again next time */ } }
// C-215: the companion refuses to mirror another game (a new game begun here, a testing build's): the device can keep it
// there as a save of its own instead, and once told to, keeps it each time it saves. `refused` hears the first refusal.
const keptFile = () => new File(new Directory(Paths.document, "game"), "kept.json");
function keeping(): boolean { try { const f = keptFile(); return f.exists && !!JSON.parse(f.textSync()).keep; } catch { return false; } }
function keepHere(on: boolean) { try { const f = keptFile(); if (!f.exists) f.create(); f.write(JSON.stringify({ keep: on })); } catch { /* asked again */ } }
const keepThere = (b64: string) => api("/api/saves/keep", { b64, label: "This device's other game" });   // DRAFT
// true when the companion now holds this save as its mirror (C-261: then it may SYNC it)
async function mirrorOut(b64: string, refused?: (b64: string, why: string) => void): Promise<boolean> {
  if (!paired()) return false;
  try { agree((await api<{ sha1: string }>("/api/save/mirror", { b64, base: agreed() || undefined })).sha1); return true; }
  catch (e) {                                             // the companion away, or its copy moved on (base: never undo a SYNC's writes): the next look settles it
    const why = (e as Error).message;
    if (!/another game/.test(why)) return false;
    if (keeping()) keepThere(b64).catch(() => { /* the next save tries again */ });
    else refused?.(b64, why);
    return false;
  }
}
async function mirrorIn() {
  if (!paired()) return;
  try {
    const m = await api<{ sha1: string; b64: string }>("/api/save/mirror");
    const f = saveFile(), mine = f.exists ? sha1(f.bytesSync()) : "", last = agreed();
    const choice = mirrorChoice(m.sha1, mine, last);
    if (choice === "same") agree(m.sha1);
    else if (choice === "take") { if (!f.exists) f.create(); f.write(bytesOf(m.b64)); agree(m.sha1); }
  } catch { /* no mirror yet, or the companion away: the device's save as it is */ }
}

// C-263: the controller, drawn under the game while it plays -- each button with what it is in the game (A, B, L, R,
// START, SELECT); the Pocket Taco's own shape, its M buttons the shoulders
const TACO = `<svg viewBox="0 0 400 190" xmlns="http://www.w3.org/2000/svg" font-family="ui-monospace,Menlo,monospace" font-weight="700">
<rect x="4" y="26" width="392" height="160" rx="46" fill="#1b1e26" stroke="#3a3f4a" stroke-width="3"/>
<rect x="34" y="8" width="70" height="26" rx="10" fill="#2a2e38" stroke="#3a3f4a" stroke-width="2"/><text x="69" y="26" fill="#c9ccd3" font-size="14" text-anchor="middle">L</text>
<rect x="296" y="8" width="70" height="26" rx="10" fill="#2a2e38" stroke="#3a3f4a" stroke-width="2"/><text x="331" y="26" fill="#c9ccd3" font-size="14" text-anchor="middle">R</text>
<path d="M68 72h26v26h26v26h-26v26h-26v-26h-26v-26h26z" fill="#3a3f4a"/>
<g fill="#3a3f4a"><circle cx="320" cy="72" r="17"/><circle cx="288" cy="104" r="17"/><circle cx="352" cy="104" r="17"/><circle cx="320" cy="136" r="17"/></g>
<g fill="#c9ccd3" font-size="14" text-anchor="middle"><text x="320" y="77">R</text><text x="288" y="109">L</text><text x="352" y="109">B</text><text x="320" y="141">A</text></g>
<g fill="#2a2e38" stroke="#3a3f4a" stroke-width="2"><rect x="150" y="140" width="40" height="14" rx="7"/><rect x="210" y="140" width="40" height="14" rx="7"/></g>
<g fill="#8b90a0" font-size="9" text-anchor="middle"><text x="170" y="170">SELECT</text><text x="230" y="170">START</text></g>
</svg>`;

// The page: the emulator, and a few words to and from the app
const PAGE = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<style>html,body{margin:0;height:100%;background:#0f1115;overflow:hidden}#game{width:100%;height:100%}
body.pad #game{height:50%}#taco{display:none}
body.pad #taco{display:flex;height:50%;flex-direction:column;align-items:center;justify-content:center;gap:12px;
  color:#8b90a0;font:11px ui-monospace,Menlo,monospace;letter-spacing:1px;text-align:center}
#taco svg{width:min(86%,420px);height:auto}</style></head>
<body><div id="game"></div><div id="taco">${TACO}<div>THE CONTROLLER PLAYS THE GAME · DRAFT</div></div><script>
const ctxs = []; const AC = window.AudioContext || window.webkitAudioContext;   // every sound context, to wake on a touch
if (AC) { const W = function (...a) { const c = new AC(...a); ctxs.push(c); return c; }; W.prototype = AC.prototype;
  window.AudioContext = W; window.webkitAudioContext = W; }
let muted = false;                                         // C-260: put away beside the companion, and muted while so
const wake = () => { if (!muted) ctxs.forEach((c) => { if (c.state !== "running") c.resume().catch(() => {}); }); };
["touchstart", "touchend", "mousedown", "keydown"].forEach((e) => document.addEventListener(e, wake, true));
const say = (m) => window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(m));
// C-257: what EmulatorJS warns of while starting reaches the app, so a failed start says why
["warn", "error"].forEach((k) => { const o = console[k].bind(console); console[k] = (...a) => { o(...a);
  const t = a.map((x) => (x && x.stack) || String(x)).join(" "); if (/fail|error/i.test(t)) say({ kind: "log", text: t.slice(0, 400) }); }; });
const b64 = (u8) => { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (s) => { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
const g = () => window.EJS_emulator && window.EJS_emulator.gameManager;
let last = "";
// C-261: the save as it lands -- the game's save memory read each second, and a save taken once it has held still for
// two (the game writes its sectors over a second or so; a read in the middle of that is never taken)
let seen = null, still = 0;
const same = (a, b) => { if (!a || !b || a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; };
setInterval(() => { try { const E = window.EJS_emulator, b = !E || E.paused || !g() ? null : g().getSaveFile(); if (!b || !b.length) return;
  if (!same(b, seen)) { seen = b.slice(); still = 0; return; }
  if (++still !== 2) return;
  const s = b64(b); if (s !== last) { last = s; say({ kind: "save", b64: s, why: "saved" }); } } catch (e) {} }, 1000);
window.takeSave = (why) => { try { const b = g() && g().getSaveFile(); if (!b || !b.length) return; const s = b64(b);
  if (s !== last || why === "leave") { last = s; say({ kind: "save", b64: s, why }); } } catch (e) { say({ kind: "error", text: String(e) }); } };
const writeSave = (s) => { const m = g(), p = m.getSaveFilePath(); let dir = "";
  for (const part of p.split("/").slice(0, -1).filter(Boolean)) { dir += "/" + part; if (!m.FS.analyzePath(dir).exists) m.FS.mkdir(dir); }
  if (m.FS.analyzePath(p).exists) m.FS.unlink(p); m.FS.writeFile(p, unb64(s)); m.loadSaveFiles(); last = s; seen = unb64(s); still = 0; };
window.putSave = (s) => { try { writeSave(s); g().restart(); } catch (e) { say({ kind: "error", text: String(e) }); } };
window.putFlash = (s) => { try { writeSave(s); } catch (e) { say({ kind: "error", text: String(e) }); } };
// C-261: SYNC into the running game -- the game as mGBA keeps it, out to the app, and back with SYNC's bytes in it
window.snapshot = (id) => { try { say({ kind: "state", id, b64: b64(g().getState()) }); } catch (e) { say({ kind: "state", id, error: String(e) }); } };
window.restore = (id, st, s) => { try { g().loadState(unb64(st)); writeSave(s); say({ kind: "restored", id, ok: true }); }
  catch (e) { say({ kind: "restored", id, ok: false, error: String(e) }); } };
// C-265: whether the app wants the game running. Back from another Space, the background or the lock screen, a game the
// app still wants running plays again, and a button held down when the touch was lost is let go -- before this, the
// screen's buttons could stop moving anything until the game was left and started again
let want = false;
const release = () => { for (let i = 0; i < 16; i++) { try { g().simulateInput(0, i, 0); } catch (e) {} } };
const back = () => { const E = window.EJS_emulator; wake(); if (want && E && E.started && E.paused) { try { E.play(); } catch (e) {} } };
window.pauseGame = () => { want = false; try { window.takeSave("leave"); window.EJS_emulator.pause(); } catch (e) {} };
window.playGame = () => { want = true; try { window.EJS_emulator.play(); } catch (e) {} };
document.addEventListener("visibilitychange", () => { if (document.hidden) release(); else back(); });
window.addEventListener("pageshow", back); window.addEventListener("focus", back);
window.addEventListener("blur", release);
["touchstart", "mousedown"].forEach((e) => document.addEventListener(e, back, true));
let volume = null;
window.muteGame = (on) => { const E = window.EJS_emulator; muted = on;
  try { if (on) { if (volume === null) volume = E.volume; E.setVolume(0); } else { E.setVolume(volume ?? 0.5); volume = null; } }
  catch (e) { ctxs.forEach((c) => { try { on ? c.suspend() : c.resume(); } catch (x) {} }); }
  if (!on) wake(); };
window.EJS_player = "#game"; window.EJS_core = "gba"; window.EJS_gameUrl = "daemons.gba"; window.EJS_gameName = "daemons";
window.EJS_pathtodata = "${CDN}"; window.EJS_startOnLoaded = true; window.EJS_backgroundColor = "#0f1115";
window.EJS_Buttons = { netplay: false, exitEmulation: false, saveState: false, loadState: false };
// the on-screen controls wherever there is a touch screen: EmulatorJS draws them only for a phone it knows, and an iPad
// says it is a Mac (the user, 2026-10-28: "on the ipad ... there was no on screen controls")
const touchy = navigator.maxTouchPoints > 1;
window.EJS_defaultOptions = touchy ? { webgl2Enabled: "enabled", "virtual-gamepad": "enabled" } : { webgl2Enabled: "enabled" };
// C-234: a controller held (the GameSir Pocket Taco clips over the phone's lower half): the game in the top half, the
// screen's own controls hidden; taken off, back as before. C-263: the app reads the controller (GameController) and hands
// its buttons in -- a web view's Gamepad API never hears it -- and CONTROLLER above the game chooses it by hand
let tacoOn = false, nativePad = false;
const pads = () => !nativePad && Array.from((navigator.getGamepads && navigator.getGamepads()) || []).some((x) => x && x.connected);
window.setTaco = (on) => { tacoOn = on; layout(); };
window.padInput = (b, v) => { try { g().simulateInput(0, b, v); } catch (e) {} };
window.useNativePad = () => { nativePad = true;                       // the app reads it: the page never reads it twice
  try { Object.defineProperty(navigator, "getGamepads", { value: () => [], configurable: true }); } catch (e) {} };
const layout = () => { const held = tacoOn || pads(); document.body.classList.toggle("pad", held);
  try { window.EJS_emulator.changeSettingOption("virtual-gamepad", held || !touchy ? "disabled" : "enabled"); } catch (e) {}
  try { window.EJS_emulator.handleResize(); } catch (e) {}
  say({ kind: "pad", held }); };
window.addEventListener("gamepadconnected", layout); window.addEventListener("gamepaddisconnected", layout);
// C-257: a page EmulatorJS's settings cannot be kept by (the Mac's web view refuses file:// storage) keeps none, rather
// than its start throwing on the read
window.EJS_disableLocalStorage = (() => { try { localStorage.setItem("ejs-probe", "1"); localStorage.removeItem("ejs-probe"); return false; } catch (e) { return true; } })();
let begun = false;
const begin = () => { if (begun) return; begun = true; say({ kind: "started" });
  try { speed(); } catch (e) {} try { layout(); } catch (e) {} };
window.EJS_onGameStart = () => begin();
// C-257: EmulatorJS's start can throw after the core is already running (the music plays) -- then it shows "Failed to
// start game", never draws the game and never says it started. Frames moving mean it did: its last steps are done here.
const rescue = setInterval(() => { const E = window.EJS_emulator; let f = 0;
  try { f = Number(g().getFrameNum()) || 0; } catch (e) {}
  if (begun) { clearInterval(rescue); return; }
  if (f < 30 || !E || E.started) return;
  clearInterval(rescue);
  const steps = [() => { if (E.textElem) { E.textElem.remove(); E.textElem = null; } },
    () => { E.game.classList.remove("ejs_game"); E.game.classList.add("ejs_canvas_parent"); if (!E.canvas.parentNode) E.game.appendChild(E.canvas); },
    () => { E.failedToStart = false; E.started = true; E.paused = false; },
    () => { if (E.touch) E.virtualGamepad.style.display = ""; }, () => E.handleResize(), () => E.menu.open()];
  steps.forEach((s) => { try { s(); } catch (e) {} });
  say({ kind: "rescued" }); begin(); }, 1000);
// How fast it runs: frames drawn a second (the screen's pace; Low Power Mode holds it at 30) and frames the core ran
const speed = () => { let drawn = 0, t0 = performance.now(), f0 = null;
  const tick = () => { drawn++; requestAnimationFrame(tick); }; requestAnimationFrame(tick);
  setInterval(() => { const t = performance.now(), s = (t - t0) / 1000; let f = null;
    try { f = g().getFrameNum(); } catch (e) {}
    say({ kind: "speed", drawn: Math.round(drawn / s), ran: f !== null && f0 !== null ? Math.round((f - f0) / s) : null,
          sound: ctxs.map((c) => c.state).join(",") });
    drawn = 0; t0 = t; f0 = f; back();
    // C-263: the screen's own controls kept where they belong -- a start that stopped short of showing them left the
    // iPad with none (C-235, C-257)
    try { const E = window.EJS_emulator; if (touchy && !document.body.classList.contains("pad") && E.virtualGamepad.style.display === "none" && !E.virtualGamepad.style.opacity)
      E.changeSettingOption("virtual-gamepad", "enabled"); } catch (e) {} }, 3000); };
window.onerror = (m) => say({ kind: "error", text: String(m) });
const s = document.createElement("script"); s.src = "${CDN}loader.js"; document.body.appendChild(s);
</script></body></html>`;

function bytesOf(b64: string) {
  const s = atob(b64), u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return u;
}
function b64Of(u: Uint8Array) {
  let s = "";
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
}

const STEPS: Record<Step, string> = { reading: "Reading your game...", checking: "Checking which game it is...",   // DRAFT
  fetching: "Fetching the DAEMONS patch...", patching: "Making DAEMONS from it...", keeping: "Keeping it on this device..." };

// The game, kept mounted while the app runs (hidden, and paused, on the other tabs)
// `muted`: put away beside the companion with MUTE THE GAME WHILE IT IS PUT AWAY on (C-260)
export function GameView({ active, ink, onSaved, muted = false }: { active: boolean; ink: string; onSaved?: () => void; muted?: boolean }) {
  const [game, setGame] = useState<Game | null>(() => heldGame());
  const [step, setStep] = useState<Step | null>(null);
  const [error, setError] = useState("");
  const [page, setPage] = useState<string | null>(null);
  const web = useRef<WebView>(null);
  const started = useRef(false);
  const given = useRef("");                              // the save as the game last had it (put in, or written out)
  const [update, setUpdate] = useState<ReturnType<typeof updateFor>>(null);
  const [refused, setRefused] = useState<{ b64: string; why: string } | null>(null);   // C-215: the mirror said another game
  const [keptSaid, setKeptSaid] = useState("");
  const offered = useRef(false);                          // asked once a session; "Not now" is not asked again
  const onRefused = (b64: string, why: string) => { if (offered.current) return; offered.current = true; setRefused({ b64, why }); };
  const keepIt = async () => {
    if (!refused) return;
    try { await keepThere(refused.b64); keepHere(true); setRefused(null); setKeptSaid("Kept on the companion as its own save; each save here keeps it there too. Choose it in SETTINGS, YOUR SAVES."); }
    catch (e) { setKeptSaid((e as Error).message); }
  };
  const [pace, setPace] = useState<{ drawn: number; ran: number | null; sound: string } | null>(null);   // the speed readout
  // the title (GameTitle.tsx): GAME opens on it, and PLAY starts the emulator -- once a session; leaving the tab and
  // coming back finds the game where it was
  const [playing, setPlaying] = useState(false);
  const lowPower = useLowPowerMode();                     // C-258
  // C-263: a controller held -- the app hears it come and go (and its buttons), and the game takes the controller's
  // layout then, or when CONTROLLER is pressed; ON-SCREEN CONTROLS goes back
  const [held, setHeld] = useState<string[]>(() => { try { return PAD?.held() ?? []; } catch { return []; } });
  const [taco, setTaco] = useState(() => held.length > 0);
  const tacoNow = useRef(taco);
  useEffect(() => {
    if (!PAD) return;
    const a = PAD.addListener("onPad", (e) => { setHeld(e.held); setTaco(e.held.length > 0); });
    const b = PAD.addListener("onButton", (e) => { if (started.current) web.current?.injectJavaScript(`window.padInput(${e.b},${e.v}); true;`); });
    return () => { a.remove(); b.remove(); };
  }, []);
  useEffect(() => { tacoNow.current = taco; if (started.current) web.current?.injectJavaScript(`window.setTaco(${taco}); true;`); }, [taco]);
  // C-264: HOW TO PLAY over the game panel -- the game held still while a book is open over it, and going on after
  const how = useHowTo(), reading = how !== "closed";
  const wasReading = useRef(false);
  const [startWhy, setStartWhy] = useState("");          // C-257: what EmulatorJS warned of while starting
  useEffect(() => { if (started.current) web.current?.injectJavaScript(`window.muteGame(${muted}); true;`); }, [muted]);
  // C-259: back to the title -- the save taken out first, as leaving a tab does, then the emulator let go
  const toTitle = async () => {
    if (started.current) await new Promise<void>((done) => {
      const t = setTimeout(() => { handed.current = null; done(); }, paired() ? 8000 : 1500);
      handed.current = () => { clearTimeout(t); handed.current = null; done(); };
      web.current?.injectJavaScript("window.pauseGame(); true;");
    });
    started.current = false; setPace(null); setStartWhy(""); setPlaying(false);
  };

  useEffect(() => {                                       // a newer release, as published now
    if (game) freshPatches().then(() => setUpdate(updateFor(game)));
  }, [game]);
  const [testing, setTesting] = useState<string | null>(null);   // C-216: the paired companion's testing build, by version
  useEffect(() => { if (paired()) testingBuilds().then((m) => setTesting(m?.version ?? null)); }, []);

  useEffect(() => {                                       // the page beside the ROM
    if (!game) return;
    const dir = new Directory(Paths.document, "game"), f = new File(dir, "play.html");
    if (!f.exists) f.create();
    f.write(PAGE);
    setPage(f.uri);
  }, [game]);
  const handed = useRef<(() => void) | null>(null);       // waiting on the save the game hands over on leaving
  // C-261: a word to the page and its answer, by id (a snapshot of the game, the game put back)
  const asks = useRef(new Map<string, (m: any) => void>());
  const ask = (js: (id: string) => string, ms = 8000) => new Promise<any>((done) => {
    const id = `a${Date.now()}${Math.floor(Math.random() * 1e6)}`;
    const t = setTimeout(() => { asks.current.delete(id); done(null); }, ms);
    asks.current.set(id, (m) => { clearTimeout(t); asks.current.delete(id); done(m); });
    web.current?.injectJavaScript(js(JSON.stringify(id)));
  });
  // C-261: what SYNC wrote, put into the running game -- true when it is there and play goes on from the same frame;
  // false when it could not be put there safely (the game moved on since its save), and the game starts again instead
  const lived = useRef<{ was: string; now: string; until: number } | null>(null);
  const [liveWhy, setLiveWhy] = useState("");
  const liveWrite = async (was: string, now: string): Promise<boolean> => {
    const before = bytesOf(was), after = bytesOf(now), plan = livePlan(before, after);
    if (!plan) { setLiveWhy("SYNC wrote another slot"); return false; }
    const st = await ask((id) => `window.snapshot(${id}); true;`);
    if (!st?.b64) { setLiveWhy(st?.error ?? "the game gave no snapshot"); return false; }
    const state = bytesOf(st.b64), r = applyPlan(state, plan, { before, after });
    if (!r.ok) { setLiveWhy(r.why); return false; }
    const back = await ask((id) => `window.restore(${id}, ${JSON.stringify(b64Of(state))}, ${JSON.stringify(now)}); true;`);
    if (!back?.ok) { setLiveWhy(back?.error ?? "the game did not take it back"); return false; }
    lived.current = { was, now, until: Date.now() + 20000 };   // and a save from before it, if one comes, is not taken
    setLiveWhy("");
    return true;
  };
  // C-188: back to the game -- if the companion wrote the save meanwhile (a SYNC, a daemon sent or come home), what it
  // wrote goes into the running game (C-261), or where it cannot, the game starts again from it (CONTINUE); otherwise
  // it simply goes on
  const resume = async () => {
    try {
      await mirrorIn();                                   // C-188: a SYNC the paired companion wrote comes back first
      const f = saveFile(), now = f.exists ? b64Of(f.bytesSync()) : "";
      if (now && now !== given.current) {
        const was = given.current; given.current = now;
        if (!(was && started.current && await liveWrite(was, now))) web.current?.injectJavaScript(`window.putSave(${JSON.stringify(now)}); true;`);
      }
    } catch { /* C-265: whatever failed on the way back, the game still goes on -- it was left paused */ }
    finally { web.current?.injectJavaScript("window.playGame(); true;"); }
  };
  useEffect(() => {
    if (!started.current || reading === wasReading.current) return;
    wasReading.current = reading;
    if (reading) web.current?.injectJavaScript("window.pauseGame(); true;");
    else if (active) resume();
  }, [reading]);
  // C-261: each save the game makes, SYNCed at once -- only the game the companion follows (a SYNC by hand marries it
  // first), and only a save the companion holds: the phone's own, or, paired, the mirror that just took it
  const syncing = useRef(false), again = useRef(false);
  const autoSync = async () => {
    if (syncing.current) { again.current = true; return; }
    syncing.current = true;
    try {
      const p = await api<{ thisGame: boolean | null }>("/api/profile");
      if (p.thisGame === true) { const r = await api<any>("/api/sync", {}); heardSync(r); onSaved?.(); }
    } catch { /* the companion away, or no save it follows: SYNC by hand says why */ }
    finally { syncing.current = false; if (again.current) { again.current = false; autoSync(); } }
  };
  useEffect(() => {                                       // paused while another tab is shown
    if (!started.current) return;
    if (!active) { web.current?.injectJavaScript("window.pauseGame(); true;"); return; }
    resume();
  }, [active]);
  useEffect(() => {                                       // C-189: while it plays, SYNC holds it (game/gate.ts)
    if (!active) return;
    GATE.hold = () => !started.current ? Promise.resolve() : new Promise<void>((done) => {
      const t = setTimeout(() => { handed.current = null; done(); }, paired() ? 8000 : 1500);   // a game that does not answer: the file as it is (paired, its save also crosses to the companion)
      handed.current = () => { clearTimeout(t); handed.current = null; done(); };
      web.current?.injectJavaScript("window.pauseGame(); true;");
    });
    GATE.release = () => { if (started.current) resume(); };
    return () => { GATE.hold = async () => {}; GATE.release = () => {}; };
  }, [active]);

  const bring = async () => {
    setError("");
    try {
      const g = await makeGame(setStep);
      if (g) { LOCAL?.setEdition(g.edition); setGame(g); }      // the companion keeps the game's edition
    } catch (e) { setError((e as Error).message); } finally { setStep(null); }
  };
  const renew = async () => {
    setError("");
    try {
      if (started.current) { web.current?.injectJavaScript("window.pauseGame(); true;"); await new Promise((r) => setTimeout(r, 800)); }
      const g = update?.needs === "ready" ? await updateGame(setStep) : await makeGame(setStep);
      if (g) { started.current = false; LOCAL?.setEdition(g.edition); setGame(g); }   // the page reloads; the save goes back in
    } catch (e) { setError((e as Error).message); } finally { setStep(null); }
  };
  // C-216: to the TESTING BUILD, or back to the release -- the same save goes in either way
  const swap = async (toTesting: boolean) => {
    setError("");
    try {
      if (started.current) { web.current?.injectJavaScript("window.pauseGame(); true;"); await new Promise((r) => setTimeout(r, 800)); }
      const g = toTesting ? await makeTestingBuild(setStep) : await updateGame(setStep);
      started.current = false; LOCAL?.setEdition(g.edition); setGame(g);
    } catch (e) { setError((e as Error).message); } finally { setStep(null); }
  };
  const heard = (data: string) => {
    let m: { kind: string; b64?: string; text?: string; why?: string; drawn?: number; ran?: number | null; sound?: string };
    try { m = JSON.parse(data); } catch { return; }
    if (m.kind === "started") {
      started.current = true;
      (async () => {
        await mirrorIn();                                 // C-188: what the paired companion wrote while the app was shut
        const f = saveFile();
        if (f.exists) {
          given.current = b64Of(f.bytesSync()); web.current?.injectJavaScript(`window.putSave(${JSON.stringify(given.current)}); true;`);
          if (paired() && sha1(f.bytesSync()) !== agreed()) mirrorOut(given.current, onRefused);   // and the device's, to it
        }
        if (!active) web.current?.injectJavaScript("window.pauseGame(); true;");
        if (muted) web.current?.injectJavaScript("window.muteGame(true); true;");
        if (PAD) web.current?.injectJavaScript(`window.useNativePad(); window.setTaco(${tacoNow.current}); true;`);   // C-263
        if (__DEV__ && process.env.EXPO_PUBLIC_DAEMONS_TRY_PAD === "1") PAD?.tryVirtual?.(true);   // the Simulator has no controller
      })();
    } else if (m.kind === "save" && m.b64) {
      const u = lived.current;                              // C-261: the save from before a live write, read back: put SYNC's in again
      if (u && m.b64 === u.was && Date.now() < u.until) {
        web.current?.injectJavaScript(`window.putFlash(${JSON.stringify(u.now)}); true;`);
        if (m.why === "leave") handed.current?.();
        return;
      }
      const f = saveFile(), bytes = bytesOf(m.b64);
      const whole = bytes.length >= 0x10000;                // a whole save, never a blank start
      if (whole) { if (!f.exists) f.create(); f.write(bytes); given.current = m.b64; onSaved?.(); }   // C-189: read beside the game
      // C-188: to the paired companion's mirror -- and a SYNC waiting on the game's save waits for that too
      (whole ? mirrorOut(m.b64, onRefused) : Promise.resolve(false)).then((mirrored) => {
        if (whole && m.why === "saved" && (ALONE || mirrored)) autoSync();   // C-261
      }).finally(() => { if (m.why === "leave") handed.current?.(); });
    } else if ((m.kind === "state" || m.kind === "restored") && typeof (m as any).id === "string") {
      asks.current.get((m as any).id)?.(m);                // C-261
    } else if (m.kind === "speed" && typeof m.drawn === "number") setPace({ drawn: m.drawn, ran: m.ran ?? null, sound: m.sound ?? "" });
    else if (m.kind === "error" && m.text) setError(m.text);
    else if (m.kind === "log" && m.text && /start/i.test(m.text)) setStartWhy((w) => w || m.text!);
  };

  if (!active && !game) return null;
  if (!game || !page) {
    return (
      <YStack display={active ? "flex" : "none"} padding={20} gap={14} maxWidth={720} width="100%" alignSelf="center">
        <Card>
          <Eyebrow>GAME</Eyebrow>
          <Text fontSize={20} fontWeight="700" color="$color12">Play DAEMONS here</Text>
          <Small>{"Give this device your own copy of FireRed or LeafGreen (the .gba file, from Files). DAEMONS is made from it "
            + "here: FireRed becomes CONTENT, LeafGreen becomes CONTEXT. Your file is only read; nothing of it leaves this device."}</Small>
          {step ? <Small color="$color10">{STEPS[step]}</Small> : <Action label="Choose your game" ink={ink} onPress={bring} />}
          {error ? <Small color="$color9">{error}</Small> : null}
          <XStack><Action label="How to play" ink={ink} onPress={() => openHowTo()} /></XStack>{/* C-264 */}
          <Small color="$color8">DRAFT</Small>
        </Card>
        <HowToOverlay playing={false} />
      </YStack>
    );
  }
  if (!playing) {
    const choices: TitleChoice[] = [
      { key: "play", label: "PLAY", note: game.testing ? `the TESTING BUILD, v${game.release}` : `v${game.release}`, onPick: () => setPlaying(true) },
      { key: "how", label: "HOW TO PLAY", note: "MICRO-START, QUICK-START, the USER MANUAL", onPick: () => openHowTo() },   // C-264 (DRAFT)
      ...(update ? [{ key: "update", label: "UPDATE", note: step ? STEPS[step] : update.needs === "ready" ? `v${update.release} is out -- your save comes with it`
                                                                    : `v${update.release} is out -- choose your FireRed or LeafGreen again`,
                      onPick: () => { if (!step) renew(); } }] : []),
      ...(game.testing ? [{ key: "release", label: "THE RELEASE", note: step ? STEPS[step] : "back from the TESTING BUILD", onPick: () => { if (!step) swap(false); } }]
        : testing ? [{ key: "debug", label: "DEBUG", note: step ? STEPS[step] : `the TESTING BUILD, v${testing}, with its DEBUG menu`, onPick: () => { if (!step) swap(true); } }] : []),
      { key: "another", label: "ANOTHER GAME", note: "FireRed for CONTENT, LeafGreen for CONTEXT", onPick: () => { if (!step) bring(); } },
    ];
    return (
      <YStack flex={active ? 1 : undefined} display={active ? "flex" : "none"}>
        <GameTitle edition={game.edition} choices={choices} said={error || (step ? STEPS[step] : "")} />
        <HowToOverlay playing={false} />
      </YStack>
    );
  }
  return (
    <YStack flex={active ? 1 : undefined} display={active ? "flex" : "none"} backgroundColor="#0f1115">
      {update ? (
        <XStack padding={10} gap={10} alignItems="center" backgroundColor="$color3">
          <YStack flex={1}><Small>{step ? STEPS[step] : update.needs === "ready"
            ? `A new DAEMONS is out (v${update.release}). Your save comes with it.`
            : `A new DAEMONS is out (v${update.release}). Choose your FireRed or LeafGreen again to make it.`}  DRAFT</Small></YStack>
          {step ? null : <Action label={update.needs === "ready" ? "Update" : "Choose"} ink={ink} onPress={renew} />}
        </XStack>
      ) : null}
      {game.testing || testing ? (                            /* C-216 (DRAFT) */
        <XStack padding={8} gap={10} alignItems="center" backgroundColor="$color3">
          <YStack flex={1}><Small>{step ? STEPS[step] : game.testing ? `TESTING BUILD (v${game.release}): the DEBUG build, with its DEBUG menu.` : `A TESTING BUILD is on the companion (v${testing}).`}  DRAFT</Small></YStack>
          {step ? null : <Action label={game.testing ? "Back to the release" : "Play it"} ink={ink} onPress={() => swap(!game.testing)} />}
        </XStack>
      ) : null}
      {refused ? (                                            /* C-215 (DRAFT) */
        <XStack padding={8} gap={10} alignItems="center" backgroundColor="$color3">
          <YStack flex={1}><Small>{`This game isn't the one the companion follows (${refused.why}), so it isn't mirrored. Keep it on the companion as a save of its own?  DRAFT`}</Small></YStack>
          <Action label="Keep it" ink={ink} onPress={keepIt} />
          <Action label="Not now" ink={ink} onPress={() => setRefused(null)} />
        </XStack>
      ) : keptSaid ? (
        <XStack padding={8} backgroundColor="$color3" onPress={() => setKeptSaid("")}><Small>{`${keptSaid}  DRAFT`}</Small></XStack>
      ) : null}
      {/* C-259, C-258 (DRAFT) */}
      <XStack paddingHorizontal={8} paddingVertical={4} gap={10} alignItems="center">
        <YStack role="button" cursor="pointer" paddingHorizontal={10} paddingVertical={4} borderRadius={3} borderWidth={1} borderColor="#3a3f4a"
                onPress={toTitle} aria-label="back to the title">
          <Text fontFamily="$mono" fontSize={11} letterSpacing={1} color="#c9ccd3">‹ TITLE</Text>
        </YStack>
        <YStack role="button" cursor="pointer" paddingHorizontal={10} paddingVertical={4} borderRadius={3} borderWidth={1}
                borderColor={taco ? "#c9ccd3" : "#3a3f4a"} onPress={() => setTaco((t) => !t)}
                aria-label={taco ? "the screen's own controls" : "play with a controller"}>{/* C-263 (DRAFT) */}
          <Text fontFamily="$mono" fontSize={11} letterSpacing={1} color="#c9ccd3">
            {taco ? "ON-SCREEN CONTROLS" : held.length ? `CONTROLLER · ${held[0].toUpperCase()}` : "CONTROLLER"}
          </Text>
        </YStack>
        {lowPower ? <Text flex={1} fontSize={12} color="#f2c14e">Low Power Mode is on: the game may run slower. DRAFT</Text> : null}
      </XStack>
      <WebView key={game.sha1} ref={web} source={{ uri: page }} originWhitelist={["*"]} style={{ flex: 1, backgroundColor: "#0f1115" }}
               allowingReadAccessToURL={new Directory(Paths.document, "game").uri} allowFileAccess allowFileAccessFromFileURLs
               allowUniversalAccessFromFileURLs allowsInlineMediaPlayback mediaPlaybackRequiresUserAction={false}
               scrollEnabled={false} bounces={false} onMessage={(e) => heard(e.nativeEvent.data)}
               applicationNameForUserAgent="Version/18.0 Mobile/15E148 Safari/604.1" />
      {pace && active ? (
        <Small color={pace.ran !== null && pace.ran < 55 ? "$color9" : "$color8"}>
          {`${pace.ran ?? "?"} game frames a second · ${pace.drawn} drawn · sound ${pace.sound || "none"}`
            + (!lowPower && pace.drawn > 0 && pace.drawn <= 35 ? " -- the screen is held at 30" : "")}
        </Small>) : null}
      {error ? <Small color="$color9">{error}</Small> : null}
      {startWhy ? <Small color="$color8">{`EmulatorJS, starting: ${startWhy}`}</Small> : null}
      <HowToOverlay playing toTitle={toTitle} />
      {liveWhy ? <Small color="$color8">{`SYNC started the game again from its save: ${liveWhy}  DRAFT`}</Small> : null}
    </YStack>
  );
}
