// C-05: the companion's app -- Today, Goals and Daemon, against the local server (server/, npm start). It runs as a
// local site first (npm run web) and builds to iOS from the same code later. The daemon art is DAEMONS' own, drawn
// pixel for pixel.
// C-20: on Tamagui. The whole app sits in today's theme (tamagui.config.ts): $color9 is the day's colour, $color1 to
// $color8 its tints, $color10 to $color12 its shades -- so the app wears the day, as the device does.
import * as SecureStore from "expo-secure-store";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Platform, useColorScheme, useWindowDimensions } from "react-native";
import { ScrollView, TamaguiProvider, Text, Theme, XStack, YStack } from "tamagui";
import { SCREEN } from "./data";
import { loadLook, LOOK, lookHeard, PALETTE, paletteHeard, setPalette } from "./look";
import { ALONE, api, freshHeard, HANDHELD, isAway, KEEP, KEYED, keepEverything, KEPT, loadConnection, LOCAL, MEETING, OFFLINE, offlineHeard, ON_PHONE, onUnpaired, SERVER, setConnection, SITE_HOME, TOKEN, WIDGET } from "./net";
import { DaemonScreen, useNews } from "./screens/Daemon";
import { GoalsScreen } from "./screens/Goals";
import { HomeAssistantCard, HomeScreen } from "./screens/Home";
import { LibraryScreen } from "./screens/Library";
import { PairScreen, sendTodaysSteps } from "./screens/Pair";
import { GameView } from "./screens/Game";
import { DeviceScreen } from "./screens/Places";
import { PairCard, RelayCard, SettingsScreen } from "./screens/Settings";
import { TodayScreen } from "./screens/Today";
import { ProfileScreen } from "./screens/You";
import config, { DAYS, RAINBOW_COLOURS, WEEK_COLOURS } from "./tamagui.config";
import { SHOWN_TABS, TABS, Today } from "./types";
import { InkContext, onColour, Stuck } from "./ui";
import { voiceFor } from "./tuneSound";
import { loadPreview } from "./preview";
// and takes you to them, and goes once the last is in view
function TabStrip({ tab, setTab }: { tab: (typeof TABS)[number]; setTab: (t: (typeof TABS)[number]) => void }) {
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
          {SHOWN_TABS.map((t) => (
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

function Shell() {
  // the page's width in points, never "100%": inside a vertical ScrollView on iOS a percentage is not resolved, and on an
  // iPad (wider than the 720 cap) every line of the books was laid out at its full length and ran off the right edge
  // (the user's mom's iPad, 2026-10-25)
  const pageWidth = Math.min(720, useWindowDimensions().width);
  const [tab, setTab] = useState<(typeof TABS)[number]>("today");
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
  useEffect(() => {
    const f = () => heard((n) => n + 1);
    const g = () => { setFresh((n) => n + 1); reload(); };
    offlineHeard.add(f); freshHeard.add(g); paletteHeard.add(f);
    keepEverything().then(f);
    api<{ palette?: string }>("/api/device/settings").then((s) => setPalette(s.palette)).catch(() => {});   // C-90
    return () => { offlineHeard.delete(f); freshHeard.delete(g); paletteHeard.delete(f); };
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

  const page = (
    <YStack flex={1} backgroundColor="$color2">
      <YStack paddingTop={ON_PHONE ? 60 : 24} paddingHorizontal={20} borderBottomWidth={3} borderBottomColor="$color9" backgroundColor="$color1">
        <XStack alignItems="center">
          <Text fontFamily="$mono" fontSize={13} letterSpacing={2} fontWeight="600" color="$color10">DAEMONS · companion</Text>
          {OFFLINE && !showToast ? (
            <YStack marginLeft="auto" role="button" cursor="pointer" onPress={() => setToastGone(null)}
                    paddingHorizontal={10} paddingVertical={2} borderRadius={999} borderWidth={1.5}
                    borderColor="$color11" backgroundColor="$color3">
              <Text fontFamily="$mono" fontSize={10} letterSpacing={1.5} fontWeight="700" color="$color11">AWAY</Text>
            </YStack>
          ) : null}
          <YStack marginLeft={OFFLINE && !showToast ? 10 : "auto"} padding={4} cursor="pointer" role="button" aria-label="settings"
                  onPress={() => setTab(tab === "settings" ? "today" : "settings")}>
            <Text fontSize={20} lineHeight={22} color={tab === "settings" ? "$color12" : "$color10"}>⚙</Text>
          </YStack>
        </XStack>
        <TabStrip tab={tab} setTab={setTab} />
      </YStack>
      {/* C-187: the game stays mounted (hidden and paused on the other tabs), beside the page, never inside its scroll */}
      {ON_PHONE ? <GameView active={tab === "game"} ink={ink} /> : null}
      {tab !== "game" ? <ScrollView key={fresh} ref={(r: any) => { SCREEN.scroller = r; }} contentContainerStyle={{ padding: 20, width: pageWidth, alignSelf: "center" }}>
        {error ? <Stuck error={error} ink={ink} /> : null}
        {tab === "today" && today ? <TodayScreen today={today} reload={reload} ink={ink} goTo={setTab} /> : null}
        {tab === "goals" ? <GoalsScreen reload={reload} ink={ink} /> : null}
        {tab === "daemon" ? <DaemonScreen ink={ink} goSettings={() => setTab("settings")} /> : null}
        {tab === "places" ? <YStack gap={14}><DeviceScreen ink={ink} /><HomeScreen ink={ink} goSettings={() => setTab("settings")} /></YStack> : null}
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
      <StatusBar style="auto" />{/* C-144: as the look is -- wearLook() tells the phone */}
    </YStack>
  );
  const inked = <InkContext.Provider value={ink}>{page}</InkContext.Provider>;   // the day's ink for every key and banner
  return day ? <Theme name={(rainbow ? `${day}rainbow` : day) as any}>{inked}</Theme> : inked;
}

export default function App() {
  // C-53: on the phone, pair first; on the site, the server is this machine
  const [paired, setPaired] = useState<boolean | null>(KEYED ? null : true);   // C-170: a site away from home pairs too
  useEffect(() => { onUnpaired(() => setPaired(false)); loadConnection().then(setPaired).catch(() => setPaired(false)); }, []);
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
      </Theme>
    </TamaguiProvider>
  );
}
