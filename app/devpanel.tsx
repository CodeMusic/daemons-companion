// C-268: DEVELOPER MODE's LOGS -- the game's pace, the app's memory, and every warning the game's web view and the app
// gave, newest first. A panel beside the game and the companion; a card in SETTINGS where there is no room beside.
import { ScrollView, Share, useWindowDimensions } from "react-native";
import { useState } from "react";
import { Slider, Text, XStack, YStack } from "tamagui";
import { clearLog, devLog, devMode, heap, pretending, setDevMode, setPretend, useDev, type Pretend } from "./game/dev";
import { ALONE, api, ON_PHONE, SERVER } from "./net";
import { Card, Choice, Eyebrow, Small } from "./ui";

const Pill = ({ label, hint, onPress }: { label: string; hint: string; onPress: () => void }) => (
  <YStack role="button" cursor="pointer" aria-label={hint} paddingHorizontal={8} paddingVertical={3}
          borderRadius={999} borderWidth={1.5} borderColor="$color9" onPress={onPress}>
    <Text fontFamily="$mono" fontSize={10} letterSpacing={1.5} fontWeight="700" color="$color11">{label}</Text>
  </YStack>);
// C-269: how long the companion takes to answer, into the log (TODAY: a read every host has)
async function ping() {
  const t0 = Date.now();
  try { await api("/api/today"); devLog("app", `PING: the companion answered in ${Date.now() - t0} ms`); }
  catch (e) { devLog("app", `PING: no answer after ${Date.now() - t0} ms -- ${(e as Error).message}`); }
}
const clock = (t: number) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

export function Logs() {
  const { lines, stats } = useDev();
  const mem = heap();
  return (
    <YStack flex={1} gap={8} padding={12} minHeight={260}>
      <XStack alignItems="center">
        <Eyebrow>LOGS · DRAFT</Eyebrow>
        <YStack flex={1} />
        <XStack gap={6}>
          <Pill label="PING" hint="time a request to the companion" onPress={ping} />
          <Pill label="COPY" hint="share the logs" onPress={() => Share.share({ message: lines.map((l) => `${new Date(l.at).toISOString()} ${l.from} ${l.text}`).join("\n") }).catch(() => {})} />
          <Pill label="CLEAR" hint="clear the logs" onPress={clearLog} />
        </XStack>
      </XStack>
      <YStack gap={2}>
        <Small>{stats ? `${stats.ran ?? "?"} game frames a second · ${stats.drawn} drawn · sound ${stats.sound || "none"}` : "the game is not running"}</Small>
        <Small>{`the app's memory: ${mem ?? "not reported"}`}</Small>
        <Small>{ON_PHONE ? (ALONE ? "hosting on this device alone" : `paired with ${SERVER}`) : `served by ${SERVER}`}</Small>
      </YStack>
      <ScrollView style={{ flex: 1 }}>
        {lines.length === 0 ? <Small color="$color8">Nothing yet.</Small> : null}
        {[...lines].reverse().map((l, i) => (
          <Text key={`${l.at}.${i}`} fontFamily="$mono" fontSize={11} lineHeight={15} marginBottom={6}
                color={l.from === "game" ? "$color11" : "$color10"}>
            {`${clock(l.at)} ${l.from.toUpperCase()}  ${l.text}`}
          </Text>
        ))}
      </ScrollView>
    </YStack>
  );
}

export function DevModeCard({ ink }: { ink: string }) {
  const { on } = useDev();
  const { width, height } = useWindowDimensions();
  const beside = ON_PHONE && width > height && Math.min(width, height) >= 700;   // as App.tsx lays it out
  return (
    <Card>
      <Eyebrow>DEVELOPER MODE</Eyebrow>
      <Small>{"On, the game shows how fast it runs, and LOGS show what the game and the app warned of and how much memory the app holds" +
        (beside ? ", in a panel at the right." : ", below.") + " DRAFT"}</Small>
      <Choice value={on} options={[[true, "On"], [false, "Off"]]} onPick={(v) => setDevMode(v)} ink={ink} />
      {on && !beside ? <YStack height={420} borderTopWidth={1} borderColor="$color5" marginTop={6}><Logs /></YStack> : null}
    </Card>
  );
}

// C-269: </> on the daemon's card -- its mood and care as a developer sets them, in memory only (game/dev.ts)
export const DevTag = ({ open, onPress }: { open: boolean; onPress: () => void }) => (
  <YStack role="button" cursor="pointer" aria-label={open ? "close the developer's sliders" : "the developer's sliders"} paddingHorizontal={8} paddingVertical={2}
          borderRadius={4} borderWidth={1.5} borderColor="$color9" backgroundColor={open ? "$color9" : "transparent"} onPress={onPress}>
    <Text fontFamily="$mono" fontSize={12} fontWeight="700" color={open ? "$color1" : "$color11"}>{"</>"}</Text>
  </YStack>);

type Truth = { mood: number; care?: { rest: number; hunger: number; thirst: number; weight: number; companionship: number } };
const ROWS: [keyof Pretend, string, number, number][] = [["mood", "MOOD", 10, 100], ["rest", "REST", 0, 100], ["hunger", "HUNGER", 0, 100],
  ["thirst", "THIRST", 0, 100], ["weight", "WEIGHT", -100, 100], ["companionship", "COMPANY", 0, 100]];
export function PretendPanel({ truth, onClose }: { truth: Truth; onClose: () => void }) {
  useDev();                                                 // redrawn as the sliders move
  const [round, setRound] = useState(0);                    // RESET puts every thumb back where the truth is
  const p = pretending() ?? {};
  const real = (k: keyof Pretend) => (k === "mood" ? truth.mood : truth.care?.[k]);
  return (
    <YStack gap={8} marginTop={8} padding={10} borderRadius={4} borderWidth={1} borderColor="$color9" borderStyle="dashed">
      <XStack alignItems="center">
        <Eyebrow>{"</> AS YOU SET IT · IN MEMORY ONLY · DRAFT"}</Eyebrow>
        <YStack flex={1} />
        <XStack gap={6}>
          <Pill label="RESET" hint="back to its true values" onPress={() => { setPretend(null); setRound((n) => n + 1); }} />
          <Pill label="CLOSE" hint="close, and back to its true values" onPress={() => { setPretend(null); onClose(); }} />
        </XStack>
      </XStack>
      {ROWS.map(([k, label, min, max]) => {
        const t = real(k);
        if (t === undefined) return null;
        const v = p[k] ?? t;
        return (
          <XStack key={`${k}.${round}`} alignItems="center" gap={10}>
            <Text fontFamily="$mono" fontSize={10} width={62} color="$color11">{label}</Text>
            <Slider flex={1} size="$2" min={min} max={max} step={1} defaultValue={[t]}
                    onValueChange={([n]) => setPretend({ ...(pretending() ?? {}), [k]: n })}>
              <Slider.Track><Slider.TrackActive /></Slider.Track>
              <Slider.Thumb index={0} circular size="$1" />
            </Slider>
            <Text fontFamily="$mono" fontSize={10} width={86} color={p[k] === undefined ? "$color10" : "$color12"}>
              {p[k] === undefined ? `${t}` : `${v} (true ${t})`}
            </Text>
          </XStack>);
      })}
      <Small color="$color10">Nothing here reaches the companion, the save or the game. Closing this, or DEVELOPER MODE off, puts it back.</Small>
    </YStack>
  );
}

export { devMode };
