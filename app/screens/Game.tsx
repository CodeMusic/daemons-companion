// C-187: GAME -- DAEMONS played in the app (docs/ONEAPP.md), as the playground plays it: the mGBA core through
// EmulatorJS in a web view, the ROM made on this device from the player's own (game/rom.ts). The page is written next to
// the ROM in the app's documents and opened from there, so the emulator reads the ROM as a file beside it.
// The save is the companion's (C-188's one save): hosting alone's daemons.sav. It is put into the game when the game
// starts, and taken out of the game every 15 s while it changes and whenever the game is left -- so what the game
// writes is what TODAY, the widget and the INDEX read. The game is paused whenever another tab is shown.
// A newer release, once published, shows as a strip above the game: one tap makes it from the player's original kept
// here, and the game starts again from the same save.
import { useEffect, useRef, useState } from "react";
import { Directory, File, Paths } from "expo-file-system";
import { WebView } from "react-native-webview";
import { Text, XStack, YStack } from "tamagui";
import { freshPatches, heldGame, makeGame, makeTestingBuild, testingBuilds, updateFor, updateGame, type Game, type Step } from "../game/rom";
import { GATE } from "../game/gate";
import { ALONE, api, LOCAL, TOKEN } from "../net";
import { sha1 } from "../../server/src/game/hash";
import { mirrorChoice } from "../../server/src/game/mirror";
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
async function mirrorOut(b64: string, refused?: (b64: string, why: string) => void) {
  if (!paired()) return;
  try { agree((await api<{ sha1: string }>("/api/save/mirror", { b64, base: agreed() || undefined })).sha1); }
  catch (e) {                                             // the companion away, or its copy moved on (base: never undo a SYNC's writes): the next look settles it
    const why = (e as Error).message;
    if (!/another game/.test(why)) return;
    if (keeping()) keepThere(b64).catch(() => { /* the next save tries again */ });
    else refused?.(b64, why);
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

// The page: the emulator, and a few words to and from the app
const PAGE = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<style>html,body{margin:0;height:100%;background:#0f1115;overflow:hidden}#game{width:100%;height:100%}
body.pad #game{height:50%}</style></head>
<body><div id="game"></div><script>
const ctxs = []; const AC = window.AudioContext || window.webkitAudioContext;   // every sound context, to wake on a touch
if (AC) { const W = function (...a) { const c = new AC(...a); ctxs.push(c); return c; }; W.prototype = AC.prototype;
  window.AudioContext = W; window.webkitAudioContext = W; }
const wake = () => ctxs.forEach((c) => { if (c.state !== "running") c.resume().catch(() => {}); });
["touchstart", "touchend", "mousedown", "keydown"].forEach((e) => document.addEventListener(e, wake, true));
const say = (m) => window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(m));
const b64 = (u8) => { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (s) => { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
const g = () => window.EJS_emulator && window.EJS_emulator.gameManager;
let last = "";
window.takeSave = (why) => { try { const b = g() && g().getSaveFile(); if (!b || !b.length) return; const s = b64(b);
  if (s !== last || why === "leave") { last = s; say({ kind: "save", b64: s, why }); } } catch (e) { say({ kind: "error", text: String(e) }); } };
window.putSave = (s) => { try { const m = g(), p = m.getSaveFilePath(); let dir = "";
  for (const part of p.split("/").slice(0, -1).filter(Boolean)) { dir += "/" + part; if (!m.FS.analyzePath(dir).exists) m.FS.mkdir(dir); }
  if (m.FS.analyzePath(p).exists) m.FS.unlink(p); m.FS.writeFile(p, unb64(s)); m.loadSaveFiles(); m.restart(); last = s;
  } catch (e) { say({ kind: "error", text: String(e) }); } };
window.pauseGame = () => { try { window.takeSave("leave"); window.EJS_emulator.pause(); } catch (e) {} };
window.playGame = () => { try { window.EJS_emulator.play(); } catch (e) {} };
setInterval(() => window.takeSave("tick"), 15000);
window.EJS_player = "#game"; window.EJS_core = "gba"; window.EJS_gameUrl = "daemons.gba"; window.EJS_gameName = "daemons";
window.EJS_pathtodata = "${CDN}"; window.EJS_startOnLoaded = true; window.EJS_backgroundColor = "#0f1115";
window.EJS_Buttons = { netplay: false, exitEmulation: false, saveState: false, loadState: false };
// the on-screen controls wherever there is a touch screen: EmulatorJS draws them only for a phone it knows, and an iPad
// says it is a Mac (the user, 2026-10-28: "on the ipad ... there was no on screen controls")
const touchy = navigator.maxTouchPoints > 1;
window.EJS_defaultOptions = touchy ? { webgl2Enabled: "enabled", "virtual-gamepad": "enabled" } : { webgl2Enabled: "enabled" };
// C-234: a controller held (the GameSir Pocket Taco clips over the phone's lower half): the game in the top half, the
// screen's own controls hidden; taken off, back as before. EmulatorJS reads the controller itself (the Gamepad API).
const pads = () => Array.from((navigator.getGamepads && navigator.getGamepads()) || []).some((x) => x && x.connected);
const layout = () => { const held = pads(); document.body.classList.toggle("pad", held);
  try { window.EJS_emulator.changeSettingOption("virtual-gamepad", held || !touchy ? "disabled" : "enabled"); } catch (e) {}
  try { window.EJS_emulator.handleResize(); } catch (e) {}
  say({ kind: "pad", held }); };
window.addEventListener("gamepadconnected", layout); window.addEventListener("gamepaddisconnected", layout);
window.EJS_onGameStart = () => { say({ kind: "started" }); speed(); layout(); };
// How fast it runs: frames drawn a second (the screen's pace; Low Power Mode holds it at 30) and frames the core ran
const speed = () => { let drawn = 0, t0 = performance.now(), f0 = null;
  const tick = () => { drawn++; requestAnimationFrame(tick); }; requestAnimationFrame(tick);
  setInterval(() => { const t = performance.now(), s = (t - t0) / 1000; let f = null;
    try { f = g().getFrameNum(); } catch (e) {}
    say({ kind: "speed", drawn: Math.round(drawn / s), ran: f !== null && f0 !== null ? Math.round((f - f0) / s) : null,
          sound: ctxs.map((c) => c.state).join(",") });
    drawn = 0; t0 = t; f0 = f; wake(); }, 3000); };
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
export function GameView({ active, ink, onSaved }: { active: boolean; ink: string; onSaved?: () => void }) {
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
  // C-188: back to the game -- if the companion wrote the save meanwhile (a SYNC, a daemon sent or come home), the
  // game starts again from it (CONTINUE), as the playground does; otherwise it simply goes on
  const resume = async () => {
    await mirrorIn();                                     // C-188: a SYNC the paired companion wrote comes back first
    const f = saveFile(), now = f.exists ? b64Of(f.bytesSync()) : "";
    if (now && now !== given.current) { given.current = now; web.current?.injectJavaScript(`window.putSave(${JSON.stringify(now)}); true;`); }
    web.current?.injectJavaScript("window.playGame(); true;");
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
      })();
    } else if (m.kind === "save" && m.b64) {
      const f = saveFile(), bytes = bytesOf(m.b64);
      const whole = bytes.length >= 0x10000;                // a whole save, never a blank start
      if (whole) { if (!f.exists) f.create(); f.write(bytes); given.current = m.b64; onSaved?.(); }   // C-189: read beside the game
      // C-188: to the paired companion's mirror -- and a SYNC waiting on the game's save waits for that too
      (whole ? mirrorOut(m.b64, onRefused) : Promise.resolve()).finally(() => { if (m.why === "leave") handed.current?.(); });
    } else if (m.kind === "speed" && typeof m.drawn === "number") setPace({ drawn: m.drawn, ran: m.ran ?? null, sound: m.sound ?? "" });
    else if (m.kind === "error" && m.text) setError(m.text);
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
          <Small color="$color8">DRAFT</Small>
        </Card>
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
      <WebView key={game.sha1} ref={web} source={{ uri: page }} originWhitelist={["*"]} style={{ flex: 1, backgroundColor: "#0f1115" }}
               allowingReadAccessToURL={new Directory(Paths.document, "game").uri} allowFileAccess allowFileAccessFromFileURLs
               allowUniversalAccessFromFileURLs allowsInlineMediaPlayback mediaPlaybackRequiresUserAction={false}
               scrollEnabled={false} bounces={false} onMessage={(e) => heard(e.nativeEvent.data)}
               applicationNameForUserAgent="Version/18.0 Mobile/15E148 Safari/604.1" />
      {pace && active ? (
        <Small color={pace.ran !== null && pace.ran < 55 ? "$color9" : "$color8"}>
          {`${pace.ran ?? "?"} game frames a second · ${pace.drawn} drawn · sound ${pace.sound || "none"}`
            + (pace.drawn > 0 && pace.drawn <= 35 ? " -- the screen is held at 30: is Low Power Mode on?" : "")}
        </Small>) : null}
      {error ? <Small color="$color9">{error}</Small> : null}
    </YStack>
  );
}
