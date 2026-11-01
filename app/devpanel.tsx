// C-268: DEVELOPER MODE's LOGS -- the game's pace, the app's memory, and every warning the game's web view and the app
// gave, newest first. A panel beside the game and the companion; a card in SETTINGS where there is no room beside.
import { ScrollView } from "react-native";
import { Text, XStack, YStack } from "tamagui";
import { clearLog, devMode, heap, setDevMode, useDev } from "./game/dev";
import { ALONE, ON_PHONE, SERVER } from "./net";
import { Card, Choice, Eyebrow, Small } from "./ui";

const clock = (t: number) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

export function Logs() {
  const { lines, stats } = useDev();
  const mem = heap();
  return (
    <YStack flex={1} gap={8} padding={12} minHeight={260}>
      <XStack alignItems="center">
        <Eyebrow>LOGS · DRAFT</Eyebrow>
        <YStack flex={1} />
        <YStack role="button" cursor="pointer" aria-label="clear the logs" paddingHorizontal={8} paddingVertical={3}
                borderRadius={999} borderWidth={1.5} borderColor="$color9" onPress={clearLog}>
          <Text fontFamily="$mono" fontSize={10} letterSpacing={1.5} fontWeight="700" color="$color11">CLEAR</Text>
        </YStack>
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
                color={l.from === "game" ? "$color11" : "$color10"} selectable>
            {`${clock(l.at)} ${l.from.toUpperCase()}  ${l.text}`}
          </Text>
        ))}
      </ScrollView>
    </YStack>
  );
}

export function DevModeCard({ ink, beside }: { ink: string; beside: boolean }) {
  const { on } = useDev();
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

export { devMode };
