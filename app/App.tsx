// C-05: the companion's app -- Today, Goals and Daemon, against the local server (server/, npm start). It runs as a
// local site first (npm run web) and builds to iOS from the same code later. The daemon art is DAEMONS' own, drawn
// pixel for pixel.
// C-20: on Tamagui. The whole app sits in today's theme (tamagui.config.ts): $color9 is the day's colour, $color1 to
// $color8 its tints, $color10 to $color12 its shades -- so the app wears the day, as the device does.
// C-288: Shell wires together what lives in shell/ -- the tab strip, the beside split's panes and sizes, and the
// background syncs.
import { StatusBar } from "expo-status-bar";
import { Fragment, useCallback, useEffect, useState } from "react";
import { Platform, useColorScheme, useWindowDimensions } from "react-native";
import { ScrollView, TamaguiProvider, Text, Theme, XStack, YStack } from "tamagui";
import { SCREEN } from "./state/data";
import { loadLook, LOOK, lookHeard, PALETTE } from "./state/look";
import { api, KEYED, KEPT, loadConnection, OFFLINE, ON_PHONE, onUnpaired } from "./platform/net";
import { DaemonScreen, useNews } from "./screens/daemon/Daemon";
import { GoalsScreen } from "./screens/goals/Goals";
import { LibraryScreen } from "./screens/library/Library";
import { PairScreen } from "./screens/settings/Pair";
import { GameView } from "./screens/game/Game";
import { FoundBeside, useFound } from "./screens/game/Found";
import { PlacesScreen } from "./screens/places/Places";
import { SettingsScreen } from "./screens/settings/Settings";
import { TodayScreen } from "./screens/today/Today";
import { ProfileScreen } from "./screens/you/You";
import config, { DAYS, RAINBOW_COLOURS, WEEK_COLOURS } from "./tamagui.config";
import { SHOWN_TABS, TABS, Today } from "./state/types";
import { InkContext, onColour, Stuck } from "./ui/ui";
import { voiceFor } from "./sound/tuneSound";
import { muteAway } from "./state/away";
import { useDev } from "./state/dev";       // C-268
import { Logs } from "./ui/devpanel";
import { DevScreen } from "./screens/dev/Dev";                  // C-275: </>
import { Received } from "./ui/received";   // C-261
import { HowToOverlay, openHowTo } from "./ui/howto";          // C-264
import MENU from "./modules/daemons-menu";                    // C-264: the menu bar's Help
import { TabStrip } from "./shell/TabStrip";
import { Divider, Edge, LogsDivider, LogsEdge } from "./shell/panes";
import { isBeside, useLogsPane, useSplitPane } from "./shell/split";
import { useBackgroundSync, useDeepLinks, useSiteHeard } from "./shell/sync";
let menuHowTo: (() => void) | null = null;                    // C-264: Shell's HOW TO PLAY, which brings the game panel into view

type Tab = (typeof TABS)[number];

// C-287: every tab but GAME, by name -- one page each (GAME is mounted once, outside the page's scroll: C-187). A view
// returns null while it cannot be shown: TODAY until its data has come, </> outside DEVELOPER MODE.
type TabProps = { ink: string; today: Today | null; reload: () => void; setTab: (t: Tab) => void; devOn: boolean };
const TAB_VIEW: Record<Exclude<Tab, "game">, (p: TabProps) => React.JSX.Element | null> = {
  today: ({ today, reload, ink, setTab }) => (today ? <TodayScreen today={today} reload={reload} ink={ink} goTo={setTab} /> : null),
  goals: ({ reload, ink }) => <GoalsScreen reload={reload} ink={ink} />,
  daemon: ({ ink, setTab }) => <DaemonScreen ink={ink} goSettings={() => setTab("settings")} />,
  places: ({ ink, setTab }) => <PlacesScreen ink={ink} goSettings={() => setTab("settings")} />,
  you: () => <ProfileScreen />,
  library: () => <LibraryScreen />,
  settings: ({ ink }) => <SettingsScreen ink={ink} />,
  dev: ({ ink, devOn }) => (devOn ? <DevScreen ink={ink} /> : null),   // C-275
};

function Shell() {
  // the page's width in points, never "100%": inside a vertical ScrollView on iOS a percentage is not resolved, and on an
  // iPad (wider than the 720 cap) every line of the books was laid out at its full length and ran off the right edge
  // (the user's mom's iPad, 2026-10-25)
  const { width, height } = useWindowDimensions();
  const beside = isBeside(width, height);                     // C-189
  const dev = useDev();                                       // C-268: DEVELOPER MODE's LOGS, at the right
  const logs = useLogsPane(width, beside, dev.on);
  const { away, besideWidth, gameAway, companionAway, putAway, drag } = useSplitPane(width, beside, logs.logsRoom);   // C-260
  const narrowHeader = (beside ? besideWidth : width) < 420;   // C-264: the header's HOW TO PLAY as "?" where it is narrow
  const pageWidth = beside && !gameAway ? besideWidth : Math.min(720, width);
  // C-264: HOW TO PLAY from the companion's header -- over the game panel, which is brought into view for it (GAME on a
  // phone, the game side brought back beside); on the site, over the page
  const howToPlay = () => {
    if (ON_PHONE && !beside) setTab("game");
    else if (gameAway) putAway("none");
    openHowTo();
  };
  const [tab, setTab] = useState<Tab>("today");
  useEffect(() => { menuHowTo = howToPlay; return () => { menuHowTo = null; }; });   // C-264: the menu bar's Help, here
  useDeepLinks(setTab);                                       // C-176
  useEffect(() => { if (beside && tab === "game") setTab("today"); }, [beside, tab]);
  useEffect(() => { if (!dev.on && tab === "dev") setTab("settings"); }, [dev.on, tab]);   // C-275: </> goes with DEVELOPER MODE
  const [today, setToday] = useState<Today | null>(null);
  const [error, setError] = useState("");
  const reload = useCallback(() => {
    api<Today>("/api/today").then((t) => { setToday(t); voiceFor(t.edition); })   // T-425: the save's own instrument
      .catch((e) => setError(`${e.message} -- is the server running? (./bindCompanion.sh)`));
  }, []);
  useEffect(reload, [reload]);
  // C-86: a screen first drawn from what the phone kept is drawn again when the companion's fresher answer arrives
  const [fresh, setFresh] = useState(0);
  // the tab already open, tapped again: back to its own first page -- out of a book to the LIBRARY (the user, 2026-10-28)
  const [again, setAgain] = useState(0);
  const pickTab = (t: Tab) => { if (t === tab) setAgain((n) => n + 1); setTab(t); };
  useBackgroundSync(reload, setFresh);                        // C-62, C-55, C-56, C-27, C-48, C-100, C-87
  useSiteHeard(reload, setFresh);                             // C-261
  // C-92: away from the companion, a toast once -- dismissed, a small AWAY in the title bar, which brings it back
  const [toastGone, setToastGone] = useState<string | null>(null);
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
          <TabStrip tab={tab} setTab={pickTab} tabs={[...(beside ? SHOWN_TABS.filter((t) => t !== "game") : SHOWN_TABS), ...(dev.on ? ["dev" as const] : [])]} />
        </YStack>
        {beside ? <FoundBeside {...found} /> : null}
        {tab !== "game" ? <ScrollView key={`${fresh}.${again}`} ref={(r: any) => { SCREEN.scroller = r; }} contentContainerStyle={{ padding: 20, width: pageWidth, alignSelf: "center" }}>
          {error ? <Stuck error={error} ink={ink} /> : null}
          <Fragment key={tab}>{TAB_VIEW[tab]({ ink, today, reload, setTab, devOn: dev.on })}</Fragment>
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
      {logs.showLogs ? <LogsDivider drag={logs.dragLogs} putAway={() => logs.logsPutAway(true)} /> : null}
      {logs.showLogs ? <YStack width={logs.logsWidth} backgroundColor="$color1" paddingTop={24}><Logs /></YStack> : null}
      {beside && dev.on && logs.logsAway ? <LogsEdge bringBack={() => logs.logsPutAway(false)} /> : null}
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
