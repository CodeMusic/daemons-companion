// C-05: the companion's app -- Today, Goals and Daemon, against the local server (server/, npm start). It runs as a
// local site first (npm run web) and builds to iOS from the same code later. The daemon art is DAEMONS' own, drawn
// pixel for pixel.
// C-20: on Tamagui. The whole app sits in today's theme (tamagui.config.ts): $color9 is the day's colour, $color1 to
// $color8 its tints, $color10 to $color12 its shades -- so the app wears the day, as the device does.
import * as SecureStore from "expo-secure-store";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, LayoutAnimation, Linking, PanResponder, Platform, useColorScheme, useWindowDimensions } from "react-native";
import { ScrollView, TamaguiProvider, Text, Theme, XStack, YStack } from "tamagui";
import { SCREEN } from "./data";
import { loadLook, LOOK, lookHeard, PALETTE, paletteHeard, setPalette } from "./look";
import { ALONE, api, freshHeard, HANDHELD, isAway, KEEP, KEYED, keepEverything, KEPT, loadConnection, LOCAL, MEETING, OFFLINE, offlineHeard, ON_PHONE, onUnpaired, SERVER, setConnection, SITE_HOME, TOKEN, WIDGET } from "./net";
import { DaemonScreen, useNews } from "./screens/Daemon";
import { GoalsScreen } from "./screens/Goals";
import { HomeAssistantCard, HomeScreen } from "./screens/Home";
import { TvCard } from "./screens/Tv";
import { GlassCard } from "./screens/Glass";   // C-262
import { LibraryScreen } from "./screens/Library";
import { PairScreen, sendTodaysSteps } from "./screens/Pair";
import { GameView } from "./screens/Game";
import { FoundBeside, useFound } from "./screens/Found";
import { DeviceScreen } from "./screens/Places";
import { PairCard, RelayCard, SettingsScreen } from "./screens/Settings";
import { TodayScreen } from "./screens/Today";
import { ProfileScreen } from "./screens/You";
import config, { DAYS, RAINBOW_COLOURS, WEEK_COLOURS } from "./tamagui.config";
import { SHOWN_TABS, TABS, Today } from "./types";
import { InkContext, onColour, Stuck } from "./ui";
import { voiceFor } from "./tuneSound";
import { loadPreview } from "./preview";
import { keepSplit, muteAway, splitKept } from "./game/away";
import { keepLogsWidth, logsWidth, useDev } from "./game/dev";       // C-268
import { Logs } from "./devpanel";
import { heardElsewhere, Received } from "./received";   // C-261
import { HowToOverlay, openHowTo } from "./howto";          // C-264
import MENU from "./modules/daemons-menu";                    // C-264: the menu bar's Help
import type { Arrival } from "../server/src/core";
let menuHowTo: (() => void) | null = null;                    // C-264: Shell's HOW TO PLAY, which brings the game panel into view
// and takes you to them, and goes once the last is in view
function TabStrip({ tab, setTab, tabs = SHOWN_TABS }: { tab: (typeof TABS)[number]; setTab: (t: (typeof TABS)[number]) => void;
                                                         tabs?: readonly (typeof TABS)[number][] }) {
  const strip = useRef<any>(null);
  const size = useRef({ seen: 0, whole: 0, at: 0 });
  const [more, setMore] = useState(false);
  const [narrow, setNarrow] = useState(false);              // C-156: a phone's width -- the six share it, a size smaller
  const measure = () => { const z = size.current; setMore(z.whole - z.seen - z.at > 4); };
  return (
    <YStack position="relative">
      <ScrollView ref={strip} horizontal showsHorizontalScrollIndicator={false} scrollEventThrottle={32}
                  contentContainerStyle={narrow ? { flexGrow: 1 } : undefined}
                  onLayout={(e: any) => { size.current.seen = e.nativeEvent.layout.width; setNarrow(size.current.seen < 560); measure(); }}
                  onContentSizeChange={(w: number) => { size.current.whole = w; measure(); }}
                  onScroll={(e: any) => { size.current.at = e.nativeEvent.contentOffset.x; measure(); }}>
        <XStack gap={narrow ? 10 : 20} marginTop={12} paddingRight={more ? 28 : 0} role="tablist"
                flexGrow={narrow ? 1 : 0} justifyContent={narrow ? "space-between" : "flex-start"}>
          {tabs.map((t) => (
            <YStack key={t} paddingVertical={10} borderBottomWidth={3} cursor="pointer" role="tab"
                    aria-selected={tab === t} borderBottomColor={tab === t ? "$color9" : "transparent"}
                    onPress={() => setTab(t)}>
              <Text fontFamily="$mono" fontSize={narrow ? 11 : 12} letterSpacing={narrow ? 0.6 : 1.5} fontWeight={tab === t ? "700" : "400"}
                    color={tab === t ? "$color12" : "$color10"}>{t.toUpperCase()}</Text>
            </YStack>
          ))}
        </XStack>
      </ScrollView>
      {more ? (
        <YStack position="absolute" right={0} top={12} bottom={3} width={32} alignItems="flex-end" justifyContent="center"
                backgroundColor="$color1" cursor="pointer" role="button" aria-label="more tabs"
                onPress={() => strip.current?.scrollToEnd?.({ animated: true })}>
          <Text fontSize={20} lineHeight={20} color="$color9">›</Text>
        </YStack>
      ) : null}
    </YStack>
  );
}

// C-260: beside, the game and the companion share the window -- a divider to drag between them, and each side can be
// put away (the other takes the whole window); putting one away while the other is away brings that one back
type Away = "none" | "game" | "companion";
function Knob({ label, onPress, hint }: { label: string; onPress: () => void; hint: string }) {
  return (
    <YStack role="button" cursor="pointer" aria-label={hint} width={22} height={34} borderRadius={4} alignItems="center" justifyContent="center"
            backgroundColor="$color9" onPress={onPress}>
      <Text fontSize={16} lineHeight={18} fontWeight="700" color="$color1">{label}</Text>
    </YStack>
  );
}
function Divider({ drag, putAway }: { drag: (dx: number, done: boolean) => void; putAway: (side: Away) => void }) {
  const latest = useRef(drag); latest.current = drag;       // the pan is made once; the drag it calls is this render's
  const pan = useRef(PanResponder.create({                   // a tap is the knobs'; a sideways pull is the divider's
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 3, onPanResponderTerminationRequest: () => false,
    onPanResponderMove: (_, g) => latest.current(g.dx, false), onPanResponderRelease: (_, g) => latest.current(g.dx, true),
    onPanResponderTerminate: (_, g) => latest.current(g.dx, true),
  })).current;
  return (
    <YStack width={24} backgroundColor="$color3" borderLeftWidth={1} borderRightWidth={1} borderColor="$color6"
            alignItems="center" justifyContent="center" gap={10} cursor="col-resize" {...pan.panHandlers}>
      <Knob label="‹" hint="put the game away" onPress={() => putAway("game")} />
      <YStack gap={4} paddingVertical={12}>{[0, 1, 2, 3, 4].map((i) => <YStack key={i} width={4} height={4} borderRadius={2} backgroundColor="$color9" />)}</YStack>
      <Knob label="›" hint="put the companion away" onPress={() => putAway("companion")} />
    </YStack>
  );
}
function Edge({ side, putAway }: { side: "left" | "right"; putAway: (side: Away) => void }) {
  // the strip at the edge the hidden side went to: bring it back, or swap which side is away
  return (
    <YStack width={28} backgroundColor="$color3" borderColor="$color6" borderLeftWidth={side === "right" ? 1 : 0} borderRightWidth={side === "left" ? 1 : 0}
            alignItems="center" justifyContent="center" gap={10}>
      <Knob label={side === "left" ? "›" : "‹"} hint={side === "left" ? "bring the game back" : "bring the companion back"} onPress={() => putAway("none")} />
      <Knob label={side === "left" ? "»" : "«"} hint={side === "left" ? "the game alone" : "the companion alone"} onPress={() => putAway(side === "left" ? "companion" : "game")} />
    </YStack>
  );
}

// C-268: DEVELOPER MODE's LOGS at the right, beside the companion -- its own divider to drag, and a › that puts it away
// (a ‹ at the right edge brings it back)
function LogsDivider({ drag, putAway }: { drag: (dx: number, done: boolean) => void; putAway: () => void }) {
  const latest = useRef(drag); latest.current = drag;
  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 3, onPanResponderTerminationRequest: () => false,
    onPanResponderMove: (_, g) => latest.current(g.dx, false), onPanResponderRelease: (_, g) => latest.current(g.dx, true),
    onPanResponderTerminate: (_, g) => latest.current(g.dx, true),
  })).current;
  return (
    <YStack width={24} backgroundColor="$color3" borderLeftWidth={1} borderRightWidth={1} borderColor="$color6"
            alignItems="center" justifyContent="center" gap={10} cursor="col-resize" {...pan.panHandlers}>
      <YStack gap={4} paddingVertical={12}>{[0, 1, 2, 3, 4].map((i) => <YStack key={i} width={4} height={4} borderRadius={2} backgroundColor="$color9" />)}</YStack>
      <Knob label="›" hint="put the logs away" onPress={putAway} />
    </YStack>
  );
}

function Shell() {
  // the page's width in points, never "100%": inside a vertical ScrollView on iOS a percentage is not resolved, and on an
  // iPad (wider than the 720 cap) every line of the books was laid out at its full length and ran off the right edge
  // (the user's mom's iPad, 2026-10-25)
  const { width, height } = useWindowDimensions();
  // C-189: an iPad on its side is one screen -- the game on the left, always playing, and the companion beside it on the
  // right (GAME is no longer a tab there); upright, and on a phone, GAME is one more tab
  const beside = ON_PHONE && width > height && Math.min(width, height) >= 700;   // an iPad; a big phone on its side is 440 high
  const [away, setAway] = useState<Away>("none");            // C-260: which side is put away
  const [split, setSplit] = useState<number | null>(() => (ON_PHONE ? splitKept() : null));   // the companion's width, as dragged
  const dev = useDev();                                       // C-268: DEVELOPER MODE's LOGS, at the right
  const [logsAway, setLogsAway] = useState(false);
  const [logsW, setLogsW] = useState(() => (ON_PHONE ? logsWidth() ?? 320 : 320));
  const showLogs = beside && dev.on && !logsAway;
  const fitLogs = (w: number) => Math.round(Math.max(220, Math.min(width * 0.4, w)));
  const logsRoom = beside && dev.on ? (logsAway ? 28 : fitLogs(logsW) + 24) : 0;
  const fit = (w: number) => Math.round(Math.max(300, Math.min(width - 340 - logsRoom, w)));
  const besideWidth = fit(split ?? Math.min(480, width * 0.42));
  const gameAway = beside && away === "game", companionAway = beside && away === "companion";
  const narrowHeader = (beside ? besideWidth : width) < 420;   // C-264: the header's HOW TO PLAY as "?" where it is narrow
  const pageWidth = beside && !gameAway ? besideWidth : Math.min(720, width);
  const putAway = (side: Away) => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setAway(side); };
  // C-264: HOW TO PLAY from the companion's header -- over the game panel, which is brought into view for it (GAME on a
  // phone, the game side brought back beside); on the site, over the page
  const howToPlay = () => {
    if (ON_PHONE && !beside) setTab("game");
    else if (gameAway) putAway("none");
    openHowTo();
  };
  const dragFrom = useRef<number | null>(null);
  const drag = (dx: number, done: boolean) => {             // the divider dragged left widens the companion
    if (dragFrom.current === null) dragFrom.current = besideWidth;
    const w = fit(dragFrom.current - dx);
    setSplit(w);
    if (done) { dragFrom.current = null; keepSplit(w); }
  };
  const logsFrom = useRef<number | null>(null);
  const dragLogs = (dx: number, done: boolean) => {         // the logs' divider dragged left widens the logs
    if (logsFrom.current === null) logsFrom.current = fitLogs(logsW);
    const w = fitLogs(logsFrom.current - dx);
    setLogsW(w);
    if (done) { logsFrom.current = null; keepLogsWidth(w); }
  };
  const logsPutAway = (on: boolean) => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setLogsAway(on); };
  const [tab, setTab] = useState<(typeof TABS)[number]>("today");
  useEffect(() => { menuHowTo = howToPlay; return () => { menuHowTo = null; }; });   // C-264: the menu bar's Help, here
  // C-176 (the user chose "the watch shows, the phone taps"): the Ultra's tag holds daemons://link?device=<id> -- the
  // phone tapped to it opens here, on PLACES, linking with that watch
  useEffect(() => {
    const open = (url: string | null) => {
      const m = url ? /^daemons:\/\/link\?device=([a-z0-9][a-z0-9-]{2,47})$/.exec(url) : null;
      if (!m || !HANDHELD) return;
      setTab("places");
      HANDHELD.pair(m[1]);
    };
    Linking.getInitialURL().then(open).catch(() => {});
    const sub = Linking.addEventListener("url", (e) => open(e.url));
    return () => sub.remove();
  }, []);
  useEffect(() => { if (beside && tab === "game") setTab("today"); }, [beside, tab]);
  const [today, setToday] = useState<Today | null>(null);
  const [error, setError] = useState("");
  const reload = useCallback(() => {
    api<Today>("/api/today").then((t) => { setToday(t); voiceFor(t.edition); })   // T-425: the save's own instrument
      .catch((e) => setError(`${e.message} -- is the server running? (./bindCompanion.sh)`));
  }, []);
  useEffect(reload, [reload]);
  // C-62: keep everything on the phone each time the app opens and reaches the companion; redraw when it goes away
  const [, heard] = useState(0);
  // C-86: a screen first drawn from what the phone kept is drawn again when the companion's fresher answer arrives
  const [fresh, setFresh] = useState(0);
  // the tab already open, tapped again: back to its own first page -- out of a book to the LIBRARY (the user, 2026-10-28)
  const [again, setAgain] = useState(0);
  const pickTab = (t: (typeof TABS)[number]) => { if (t === tab) setAgain((n) => n + 1); setTab(t); };
  useEffect(() => {
    const f = () => heard((n) => n + 1);
    const g = () => { setFresh((n) => n + 1); reload(); };
    offlineHeard.add(f); freshHeard.add(g); paletteHeard.add(f);
    keepEverything().then(f);
    api<{ palette?: string }>("/api/device/settings").then((s) => setPalette(s.palette)).catch(() => {});   // C-90
    return () => { offlineHeard.delete(f); freshHeard.delete(g); paletteHeard.delete(f); };
  }, [reload]);
  // C-261: on the site, a SYNC something else asked for (the save watched as it lands, the playground's game, a paired
  // phone) shows RECEIVED here too and the page is read again; a save that changed is read again
  useEffect(() => {
    if (ON_PHONE) return;
    let was: string | null | undefined;
    const t = setInterval(() => {
      api<{ n: number; saved: string | null; player: string; arrivals: Arrival[] }>("/api/sync/heard").then((h) => {
        if (heardElsewhere(h, was === undefined)) { setFresh((n) => n + 1); reload(); }
        else if (was !== undefined && h.saved !== was) reload();
        was = h.saved;
      }).catch(() => {});
    }, 4000);
    return () => clearInterval(t);
  }, [reload]);
  // C-92: away from the companion, a toast once -- dismissed, a small AWAY in the title bar, which brings it back
  const [toastGone, setToastGone] = useState<string | null>(null);
  // C-55: back to the handheld this phone paired with, if any
  useEffect(() => { HANDHELD?.start(api, isAway); MEETING?.start(api, () => HANDHELD!.bluetooth()); }, []);
  // C-56: the way back from anywhere, learned at home and kept on the phone
  useEffect(() => {
    if (!ON_PHONE) return;
    api<{ url: string | null }>("/api/settings/away").then(async ({ url }) => {
      setConnection({ away: url });
      if (url) await SecureStore.setItemAsync("away", url, KEEP); else await SecureStore.deleteItemAsync("away");
      if (TOKEN) WIDGET?.shareWithWidget({ server: SERVER, token: TOKEN, away: url });   // C-100
    }).catch(() => {});
  }, []);
  // C-27, C-48: on the phone, today's steps from Apple Health -- when the app opens, and each time it comes back
  useEffect(() => {
    if (!ON_PHONE) return;
    const sync = () => sendTodaysSteps().then(() => reload()).catch(() => {});
    // C-100: what the widget kept while out of reach is sent, and the widget drawn again with what the app now knows
    const widget = () => {
      const w = WIDGET, l = LOCAL;
      if (ALONE && w && l)                              // C-111: its buttons tended here, then the app draws it
        w.sendWidgetKept(api).catch(() => {}).finally(() => w.drawAlone(l.localApi).catch(() => {}));
      else { WIDGET?.sendWidgetKept(api).catch(() => {}); WIDGET?.redrawWidget(); }
    };
    sync(); widget();
    // C-87: each time the app comes back to the front, what the phone holds is brought up to date (and anything kept
    // on it is sent), so a phone opened away from home shows the freshest it could get
    const sub = AppState.addEventListener("change", (s) => { if (s === "active") { sync(); widget(); keepEverything().catch(() => {}); HANDHELD?.nudge(); MEETING?.nudge(); } });
    return () => sub.remove();
  }, [reload]);
  // Today's theme, by name; before the server answers, the paper alone. On the site, ?day=tuesday shows another day's
  // theme, to look at all seven without waiting a week.
  const asked = Platform.OS === "web" ? new URLSearchParams(globalThis.location?.search ?? "").get("day")?.toLowerCase() : null;
  const day = asked && DAYS.includes(asked) ? asked
    : today && DAYS.includes(today.day.day.toLowerCase()) ? today.day.day.toLowerCase() : null;
  const rainbow = PALETTE === "rainbow";                                      // C-90
  const ink = onColour(day ? (rainbow ? RAINBOW_COLOURS : WEEK_COLOURS)[day] : "#5b6b8c");
  const showToast = !!OFFLINE && toastGone !== OFFLINE;
  const newsBanner = useNews(() => setTab("daemon"), ink);  // C-154
  const [saved, setSaved] = useState(0);                    // C-189: each save the game writes, read again beside it
  const found = useFound(saved);

  // C-187, C-189: the game is mounted once, in one place, whatever the shape (never inside the page's scroll, and never
  // remounted by turning the iPad, which would lose what was played since the last save): on its side the game is on the
  // left and the companion -- its header, tabs and page -- on the right; upright, the header sits above the game on GAME
  const page = (
    <YStack flex={1} backgroundColor="$color2" flexDirection={beside ? "row" : "column-reverse"}>
      {/* put away, the game keeps a sliver on screen: a web view out of sight stops drawing, and the game with it */}
      {ON_PHONE ? <YStack flex={gameAway ? undefined : 1} width={gameAway ? 2 : undefined} overflow="hidden"
                              display={beside || tab === "game" ? "flex" : "none"}
                              paddingTop={beside ? 24 : 0} backgroundColor="#0f1115">
        <GameView active={beside || tab === "game"} ink={ink} onSaved={() => setSaved((n) => n + 1)}
                  muted={gameAway && muteAway()} /></YStack> : null}
      {beside && away === "none" ? <Divider drag={drag} putAway={putAway} /> : null}
      {gameAway ? <Edge side="left" putAway={putAway} /> : null}
      {companionAway ? <Edge side="right" putAway={putAway} /> : null}
      <YStack flex={(!beside && tab !== "game") || gameAway ? 1 : undefined} width={beside && !gameAway ? besideWidth : undefined}
              display={companionAway ? "none" : "flex"}>
        <YStack paddingTop={ON_PHONE ? 60 : 24} paddingHorizontal={20} borderBottomWidth={3} borderBottomColor="$color9" backgroundColor="$color1">
          <XStack alignItems="center">
            <Text fontFamily="$mono" fontSize={13} letterSpacing={2} fontWeight="600" color="$color10">DAEMONS · companion</Text>
            <YStack flex={1} />
            {OFFLINE && !showToast ? (
              <YStack marginLeft={10} role="button" cursor="pointer" onPress={() => setToastGone(null)}
                      paddingHorizontal={10} paddingVertical={2} borderRadius={999} borderWidth={1.5}
                      borderColor="$color11" backgroundColor="$color3">
                <Text fontFamily="$mono" fontSize={10} letterSpacing={1.5} fontWeight="700" color="$color11">AWAY</Text>
              </YStack>
            ) : null}
            <YStack marginLeft={10} paddingHorizontal={8} paddingVertical={3} borderRadius={999} borderWidth={1.5} borderColor="$color9"
                    cursor="pointer" role="button" aria-label="how to play" onPress={howToPlay}>{/* C-264 (DRAFT) */}
              <Text fontFamily="$mono" fontSize={10} letterSpacing={1.5} fontWeight="700" color="$color11">{narrowHeader ? "?" : "? HOW TO PLAY"}</Text>
            </YStack>
            <YStack marginLeft={6} padding={4} cursor="pointer" role="button" aria-label="settings"
                    onPress={() => setTab(tab === "settings" ? "today" : "settings")}>
              <Text fontSize={20} lineHeight={22} color={tab === "settings" ? "$color12" : "$color10"}>⚙</Text>
            </YStack>
          </XStack>
          <TabStrip tab={tab} setTab={pickTab} tabs={beside ? SHOWN_TABS.filter((t) => t !== "game") : SHOWN_TABS} />
        </YStack>
        {beside ? <FoundBeside {...found} /> : null}
        {tab !== "game" ? <ScrollView key={`${fresh}.${again}`} ref={(r: any) => { SCREEN.scroller = r; }} contentContainerStyle={{ padding: 20, width: pageWidth, alignSelf: "center" }}>
          {error ? <Stuck error={error} ink={ink} /> : null}
          {tab === "today" && today ? <TodayScreen today={today} reload={reload} ink={ink} goTo={setTab} /> : null}
          {tab === "goals" ? <GoalsScreen reload={reload} ink={ink} /> : null}
          {tab === "daemon" ? <DaemonScreen ink={ink} goSettings={() => setTab("settings")} /> : null}
          {tab === "places" ? <YStack gap={14}><DeviceScreen ink={ink} /><GlassCard ink={ink} /><HomeScreen ink={ink} goSettings={() => setTab("settings")} /><TvCard ink={ink} goSettings={() => setTab("settings")} /></YStack> : null}
          {tab === "you" ? <ProfileScreen /> : null}
          {tab === "library" ? <LibraryScreen /> : null}
          {tab === "settings" ? <SettingsScreen ink={ink} /> : null}
          {tab === "settings" && SITE_HOME ? <YStack marginTop={14} gap={14}><PairCard ink={ink} /><RelayCard ink={ink} /><HomeAssistantCard ink={ink} /></YStack> : null}
        </ScrollView> : null}
        {newsBanner}
        {showToast ? (
          <XStack position="absolute" left={16} right={16} bottom={ON_PHONE ? 36 : 20} alignItems="center" gap={10}
                  padding={14} borderRadius={10} backgroundColor="$color12" maxWidth={720} alignSelf="center">
            <Text flex={1} fontSize={13} color="$color1">
              {`Away from the companion: this is what the phone kept on ${new Date(OFFLINE!).toLocaleString()}.${KEPT.queue.length ? ` ${KEPT.queue.length} kept to send.` : ""}`}
            </Text>
            <YStack role="button" cursor="pointer" padding={6} onPress={() => setToastGone(OFFLINE)}>
              <Text fontSize={16} fontWeight="700" color="$color1">✕</Text>
            </YStack>
          </XStack>
        ) : null}
      </YStack>
      {showLogs ? <LogsDivider drag={dragLogs} putAway={() => logsPutAway(true)} /> : null}
      {showLogs ? <YStack width={fitLogs(logsW)} backgroundColor="$color1" paddingTop={24}><Logs /></YStack> : null}
      {beside && dev.on && logsAway ? (
        <YStack width={28} backgroundColor="$color3" borderColor="$color6" borderLeftWidth={1} alignItems="center" justifyContent="center">
          <Knob label="‹" hint="bring the logs back" onPress={() => logsPutAway(false)} />
        </YStack>) : null}
      <StatusBar style="auto" />{/* C-144: as the look is -- wearLook() tells the phone */}
      <Received />{/* C-261: over everything, the game too */}
      {!ON_PHONE ? <HowToOverlay playing={false} /> : null}{/* C-264: the site has no game panel: over the page */}
    </YStack>
  );
  const inked = <InkContext.Provider value={ink}>{page}</InkContext.Provider>;   // the day's ink for every key and banner
  return day ? <Theme name={(rainbow ? `${day}rainbow` : day) as any}>{inked}</Theme> : inked;
}

export default function App() {
  // C-53: on the phone, pair first; on the site, the server is this machine
  const [paired, setPaired] = useState<boolean | null>(KEYED ? null : true);   // C-170: a site away from home pairs too
  useEffect(() => { onUnpaired(() => setPaired(false)); loadConnection().then(setPaired).catch(() => setPaired(false)); }, []);
  // C-264: HOW TO PLAY from the menu bar's Help (the iPad's, and the Mac's for the iPad app on it) -- over the game panel
  // once there is one, and over the pairing before it
  useEffect(() => {
    const s = MENU?.addListener("onHowToPlay", () => (menuHowTo ?? openHowTo)());
    // the Simulator's taps never reach the menu bar's menus: a debug build can send the command itself
    const t = __DEV__ && process.env.EXPO_PUBLIC_DAEMONS_TRY_MENU === "1" ? setTimeout(() => MENU?.tryHowToPlay?.(), 5000) : undefined;
    return () => { s?.remove(); clearTimeout(t); };
  }, []);
  // C-144: the paper or the night -- chosen, or AUTO as the phone or the computer is set
  const [look, seeLook] = useState(LOOK);
  useEffect(() => { const f = () => seeLook(LOOK); lookHeard.add(f); loadLook().then(f); return () => { lookHeard.delete(f); }; }, []);
  useEffect(() => { loadPreview(); }, []);                  // SETTINGS' PREVIEW, a bench check (preview.ts)
  const system = useColorScheme();
  const scheme = look === "auto" ? (system === "dark" ? "dark" : "light") : look;
  useEffect(() => {   // the site's own pieces too: its scroll bars, and the page behind the app
    if (ON_PHONE || typeof document === "undefined") return;
    document.documentElement.style.colorScheme = scheme;
    document.body.style.backgroundColor = scheme === "dark" ? "#16181c" : "#f6f4ee";
  }, [scheme]);
  return (
    <TamaguiProvider config={config} defaultTheme={scheme}>
      <Theme name={scheme}>
        {paired === null ? null : paired ? <Shell /> : <PairScreen onPaired={() => setPaired(true)} />}
        {paired === false ? (   // C-264: the books over the pairing, below the status bar as the header is
          <YStack position="absolute" top={ON_PHONE ? 60 : 0} left={0} right={0} bottom={0} pointerEvents="box-none">
            <HowToOverlay playing={false} />
          </YStack>
        ) : null}
      </Theme>
    </TamaguiProvider>
  );
}
