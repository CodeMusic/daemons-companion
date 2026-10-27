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
import { freshPatches, heldGame, makeGame, updateFor, updateGame, type Game, type Step } from "../game/rom";
import { GATE } from "../game/gate";
import { LOCAL } from "../net";
import { Action, Card, Eyebrow, Small } from "../ui";

const CDN = "https://cdn.emulatorjs.org/4.2.3/data/";       // the playground's EmulatorJS, the same version
const saveFile = () => new File(Paths.document, "daemons.sav");

// The page: the emulator, and a few words to and from the app
const PAGE = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<style>html,body{margin:0;height:100%;background:#0f1115;overflow:hidden}#game{width:100%;height:100%}</style></head>
<body><div id="game"></div><script>
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
window.EJS_onGameStart = () => say({ kind: "started" });
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
export function GameView({ active, ink }: { active: boolean; ink: string }) {
  const [game, setGame] = useState<Game | null>(() => heldGame());
  const [step, setStep] = useState<Step | null>(null);
  const [error, setError] = useState("");
  const [page, setPage] = useState<string | null>(null);
  const web = useRef<WebView>(null);
  const started = useRef(false);
  const given = useRef("");                              // the save as the game last had it (put in, or written out)
  const [update, setUpdate] = useState<ReturnType<typeof updateFor>>(null);

  useEffect(() => {                                       // a newer release, as published now
    if (game) freshPatches().then(() => setUpdate(updateFor(game)));
  }, [game]);

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
  const resume = () => {
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
      const t = setTimeout(() => { handed.current = null; done(); }, 1500);   // a game that does not answer: the file as it is
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
  const heard = (data: string) => {
    let m: { kind: string; b64?: string; text?: string; why?: string };
    try { m = JSON.parse(data); } catch { return; }
    if (m.kind === "started") {
      started.current = true;
      const f = saveFile();
      if (f.exists) { given.current = b64Of(f.bytesSync()); web.current?.injectJavaScript(`window.putSave(${JSON.stringify(given.current)}); true;`); }
      if (!active) web.current?.injectJavaScript("window.pauseGame(); true;");
    } else if (m.kind === "save" && m.b64) {
      const f = saveFile(), bytes = bytesOf(m.b64);
      if (bytes.length >= 0x10000) { if (!f.exists) f.create(); f.write(bytes); given.current = m.b64; }   // a whole save, never a blank start
      if (m.why === "leave") handed.current?.();
    } else if (m.kind === "error" && m.text) setError(m.text);
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
      <WebView key={game.sha1} ref={web} source={{ uri: page }} originWhitelist={["*"]} style={{ flex: 1, backgroundColor: "#0f1115" }}
               allowingReadAccessToURL={new Directory(Paths.document, "game").uri} allowFileAccess allowFileAccessFromFileURLs
               allowUniversalAccessFromFileURLs allowsInlineMediaPlayback mediaPlaybackRequiresUserAction={false}
               scrollEnabled={false} bounces={false} onMessage={(e) => heard(e.nativeEvent.data)} />
      {error ? <Small color="$color9">{error}</Small> : null}
    </YStack>
  );
}
