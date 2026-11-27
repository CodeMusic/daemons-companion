// THE HOARD: a file looked at in the app (C-596), by how rules.ts says it looks -- audio played here, a video played
// here, a text file read here, an image shown; anything else says what it is. A file is played straight from a door's
// own address (it carries its ticket, so a player needs no key), the door reckoned soonest first (C-574), the next
// one tried when that fails, and how each went told to the hub. A once-only file that is someone else's is fetched
// whole, the one time, and looked at from this device's own copy. Every word DRAFT.
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { File } from "expo-file-system";
import { createElement, useEffect, useRef, useState } from "react";
import { Image, Platform, ScrollView } from "react-native";
import { WebView } from "react-native-webview";
import { Text, XStack, YStack } from "tamagui";
import { looksOf, type Looks } from "../../../server/src/hoard/rules";
import { bringHere, doorsOf, fetchBest, onceOnly, textOf, type Best, type Held } from "../../platform/hoard";
import { ON_PHONE } from "../../platform/net";
import { Action, Small } from "../../shared/ui/ui";
import { Bar } from "./HoardParts";

// ---- the way to it ----
export type Way = {
  state: "asking" | "ready" | "once" | "bringing" | "none";
  url: string | null;            // where a player takes it from: a door, or this device's own copy
  local: string | null;          // this device's own copy, when it was brought here whole
  from: string;                  // which machine, and why that one
  said: string;                  // what is happening, or why it cannot be had
  failed: () => void; loaded: () => void; bring: () => void;
};
const WAITING = "The hub is bringing it back from another machine…";
export function useWay(f: Held, wanted = true): Way {
  const [w, setW] = useState<Pick<Way, "state" | "url" | "local" | "from" | "said">>({ state: "asking", url: null, local: null, from: "", said: "" });
  const best = useRef<Best | null>(null), gone = useRef(false);
  const once = onceOnly(f);
  useEffect(() => {
    gone.current = false; best.current = null;
    if (!wanted) return;
    if (once) { setW({ state: "once", url: null, local: null, from: "", said: "" }); return; }
    let left = false;
    setW({ state: "asking", url: null, local: null, from: "", said: "" });
    fetchBest(f.id, { onWait: () => { if (!left) setW((x) => ({ ...x, said: WAITING })); } })
      .then((b) => { if (left) return; best.current = b; setW({ state: "ready", url: b.url, local: null, from: `From ${b.door.name}: ${b.door.why}.`, said: "" }); })
      .catch((e) => { if (!left) setW({ state: "none", url: null, local: null, from: "", said: (e as Error).message }); });
    return () => { left = true; gone.current = true; };
  }, [f.id, wanted, once]);
  return {
    ...w,
    loaded: () => best.current?.told(true),
    failed: () => {
      const b = best.current;
      if (!b) { if (w.local) setW({ ...w, state: "none", said: "This device's copy could not be opened." }); return; }
      b.told(false);
      const n = b.next();
      best.current = n;
      setW(n ? { state: "ready", url: n.url, local: null, from: `From ${n.door.name}: ${n.door.why}.`, said: "" }
             : { state: "none", url: null, local: null, from: "", said: "It could not be opened here from any machine that holds it. SAVE it to open it somewhere else." });
    },
    bring: () => {
      setW({ state: "bringing", url: null, local: null, from: "", said: "Fetching it…" });
      bringHere(f, () => { if (!gone.current) setW((x) => ({ ...x, said: WAITING })); })
        .then((local) => { if (!gone.current) setW({ state: "ready", url: local, local, from: `On ${ON_PHONE ? "this phone" : "this page"} now.`, said: "" }); })
        .catch((e) => { if (!gone.current) setW({ state: "none", url: null, local: null, from: "", said: (e as Error).message }); });
    },
  };
}

// ---- audio ----
const clock = (s: number) => { const n = Math.max(0, Math.floor(s || 0)); return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`; };
const SLOW_MS = 15_000;                                        // a door that has not begun to play by then is given up on
export function AudioLook({ url, ink, auto, onFailed, onLoaded }: { url: string; ink: string; auto?: boolean; onFailed?: () => void; onLoaded?: () => void }) {
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  const [wanted, setWanted] = useState(!!auto);
  const want = useRef(!!auto), told = useRef<"" | "loaded" | "failed">("");
  const begin = () => {
    (ON_PHONE ? setAudioModeAsync({ playsInSilentMode: true }) : Promise.resolve()).catch(() => {}).then(() => { try { player.play(); } catch { /* gone */ } });
  };
  // a new address (the first door, or the next after one failed): taken up, and played at once if it was wanted
  useEffect(() => { told.current = ""; player.replace({ uri: url }); if (want.current) begin(); }, [url]);
  const say = (how: "loaded" | "failed") => { if (told.current) return; told.current = how; (how === "loaded" ? onLoaded : onFailed)?.(); };
  useEffect(() => { if (status.isLoaded) say("loaded"); }, [status.isLoaded]);
  useEffect(() => { if (status.error) say("failed"); }, [status.error]);
  useEffect(() => {                                            // wanted, and not begun: the next door
    if (!wanted || status.isLoaded) return;
    const t = setTimeout(() => say("failed"), SLOW_MS);
    return () => clearTimeout(t);
  }, [wanted, status.isLoaded, url]);
  useEffect(() => { if (status.didJustFinish) { want.current = false; setWanted(false); } }, [status.didJustFinish]);
  const ended = status.duration > 0 && status.currentTime >= status.duration - 0.3;
  const press = async () => {
    if (status.playing) { want.current = false; setWanted(false); player.pause(); return; }
    if (ended) await player.seekTo(0);
    want.current = true; setWanted(true); begin();
  };
  const jump = (by: number) => { player.seekTo(Math.max(0, Math.min(status.duration || 0, status.currentTime + by))).catch(() => {}); };
  return (
    <YStack gap={6}>
      <Bar part={status.duration > 0 ? status.currentTime / status.duration : 0} />
      <XStack gap={8} alignItems="center" flexWrap="wrap">
        <Action label={status.playing ? "PAUSE" : wanted && !status.isLoaded ? "COMING…" : ended ? "PLAY IT AGAIN" : "PLAY"} ink={ink} onPress={press} />
        {status.isLoaded ? <Action label="‹ 15 S" ink={ink} onPress={() => jump(-15)} /> : null}
        {status.isLoaded ? <Action label="15 S ›" ink={ink} onPress={() => jump(15)} /> : null}
        <Text fontFamily="$mono" fontSize={12} color="$color10" marginTop={8}>{`${clock(status.currentTime)} of ${status.duration > 0 ? clock(status.duration) : "…"}`}</Text>
      </XStack>
    </YStack>
  );
}

// ---- video: no video module in this build, so a small page in a web view on the phone; the browser's own on the site ----
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const videoPage = (src: string) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>html,body{margin:0;height:100%;background:#000}video{display:block;width:100%;height:100%;object-fit:contain;background:#000}</style></head>
<body><video controls playsinline webkit-playsinline preload="metadata" src="${esc(src)}"></video>
<script>(function(){var v=document.querySelector("video"),say=function(m){if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(m)};
v.addEventListener("error",function(){say("failed")});v.addEventListener("loadeddata",function(){say("loaded")});})();</script></body></html>`;
// this device's own copy: a web view opens a file only from a page that is a file beside it
function pageBeside(local: string): { uri: string; dir: string } | null {
  try {
    const v = new File(local), page = new File(v.parentDirectory, `${v.name}.html`);
    if (page.exists) page.delete();
    page.create(); page.write(videoPage(encodeURIComponent(v.name)));
    return { uri: page.uri, dir: v.parentDirectory.uri };
  } catch { return null; }
}
export function VideoLook({ url, onFailed, onLoaded }: { url: string; onFailed?: () => void; onLoaded?: () => void }) {
  const [beside] = useState(() => (Platform.OS !== "web" && url.startsWith("file://") ? pageBeside(url) : null));
  const heard = (m: string) => { if (m === "failed") onFailed?.(); else if (m === "loaded") onLoaded?.(); };
  return (
    <YStack aspectRatio={16 / 9} backgroundColor="#000" borderRadius={6} overflow="hidden">
      {Platform.OS === "web"
        ? createElement("video", { key: url, src: url, controls: true, playsInline: true, preload: "metadata", onError: () => onFailed?.(), onLoadedData: () => onLoaded?.(),
                                   style: { width: "100%", height: "100%", objectFit: "contain", background: "#000" } })
        : <WebView key={url} source={beside ? { uri: beside.uri } : { html: videoPage(url) }} originWhitelist={["*"]} allowsInlineMediaPlayback allowsFullscreenVideo
                   allowFileAccess allowingReadAccessToURL={beside?.dir} scrollEnabled={false} onMessage={(e) => heard(e.nativeEvent.data)}
                   style={{ flex: 1, backgroundColor: "#000" }} />}
    </YStack>
  );
}

// ---- a text file, read here ----
export function TextLook({ f }: { f: Held }) {
  const [t, setT] = useState<{ text: string; whole: boolean } | null>(null), [error, setError] = useState("");
  useEffect(() => { let gone = false; textOf(f.id).then((r) => { if (!gone) setT(r); }).catch((e) => { if (!gone) setError((e as Error).message); }); return () => { gone = true; }; }, [f.id]);
  if (error) return <Small color="$color8">{error}</Small>;
  if (!t) return <Small color="$color8">…</Small>;
  const plain = f.mime === "application/json" || f.mime === "text/csv";
  return (
    <YStack gap={6}>
      <ScrollView style={{ maxHeight: 460 }} nestedScrollEnabled>
        <Text fontFamily={plain ? "$mono" : undefined} fontSize={plain ? 13 : 16} lineHeight={plain ? 19 : 25} color="$color12"
              {...(Platform.OS === "web" ? { userSelect: "text", whiteSpace: "pre-wrap" } : { selectable: true })}>{t.text || "It is empty."}</Text>
      </ScrollView>
      {!t.whole ? <Small color="$color10">Its first part is shown. SAVE the original for all of it.</Small> : null}
    </YStack>
  );
}

// ---- a small picture of an image in THE HOARD (a chooser's): from its first door, the next if that one fails ----
export function Thumb({ f, size }: { f: Held; size: number }) {
  const [doors, setDoors] = useState<string[]>([]), [at, setAt] = useState(0);
  useEffect(() => {
    let gone = false;
    if (!onceOnly(f)) doorsOf(f.id).then((w) => { if (!gone) setDoors(w.doors.map((d) => d.full)); }).catch(() => {});
    return () => { gone = true; };
  }, [f.id]);
  return doors[at]
    ? <Image source={{ uri: doors[at] }} onError={() => setAt((n) => n + 1)} style={{ width: size, height: size, borderRadius: 4, backgroundColor: "#16181d" }} />
    : <YStack width={size} height={size} borderRadius={4} backgroundColor="$color3" />;
}

// ---- the file, by how it looks ----
const WHAT: Record<Looks, string> = { audio: "A recording", video: "A video", text: "A text file", image: "A picture", other: "A file" };
export const looksSaid = (f: Held) => WHAT[looksOf(f.mime)];
export function Look({ f, way, ink, auto }: { f: Held; way: Way; ink: string; auto?: boolean }) {
  const looks = looksOf(f.mime);
  if (looks === "text") return <TextLook f={f} />;
  if (looks === "other" || (Platform.OS === "web" && /hei[cf]/.test(f.mime)))   // a browser draws no HEIC
    return <Small>{`${f.mime === "application/octet-stream" ? "A file" : `A ${f.mime} file`}: it cannot be shown here. SAVE it to open it somewhere that can.`}</Small>;
  if (way.state === "once") return (
    <YStack gap={4}>
      <Small>{`${f.ownerName} shared this to be downloaded once. Opening it here is that once: save it while it is open, because it cannot be opened again.`}</Small>
      <Action label="OPEN IT, THIS ONCE" ink={ink} onPress={way.bring} />
    </YStack>
  );
  if (way.state !== "ready" || !way.url) return <Small color={way.state === "none" ? "$color8" : "$color10"}>{way.said || "Finding the quickest machine that holds it…"}</Small>;
  return (
    <YStack gap={6}>
      {looks === "audio" ? <AudioLook url={way.url} ink={ink} auto={auto} onFailed={way.failed} onLoaded={way.loaded} />
        : looks === "video" ? <VideoLook url={way.url} onFailed={way.failed} onLoaded={way.loaded} />
        : <Image key={way.url} source={{ uri: way.url }} resizeMode="contain" onError={way.failed} onLoad={way.loaded}
                 style={{ width: "100%", aspectRatio: 1, borderRadius: 4, backgroundColor: "#16181d" }} />}
      {way.from ? <Small color="$color8">{way.from}</Small> : null}
    </YStack>
  );
}
