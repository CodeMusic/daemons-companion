// C-221: THE LINK CABLE (DRAFT) -- from the GAME tab's title, this phone's seat at the two linked games the hub runs
// (seer/linkhost/, mGBA's lockstep cable): its screen and its buttons, the hub's own page (/link/) in a web view, handed
// the seat and this phone's key before it loads. At home and on the tailnet only, as the hub's link is. Every word DRAFT.
import { useState } from "react";
import { WebView } from "react-native-webview";
import { Text, XStack, YStack } from "tamagui";
import { ALONE, isAway, SERVER, TOKEN } from "../../platform/net";
import { Small } from "../../ui/ui";

const SEATS = [{ seat: 0, edition: "CONTENT" }, { seat: 1, edition: "CONTEXT" }] as const;

export function LinkView({ edition, onBack }: { edition: string; onBack: () => void }) {
  const [seat, setSeat] = useState<number>(edition === "CONTEXT" ? 1 : 0);
  const can = !ALONE && !!TOKEN && !isAway();
  const hand = `window.LINK = ${JSON.stringify({ seat, token: TOKEN, edition: SEATS[seat].edition })}; true;`;
  const chip = (label: string, on: boolean, onPress: () => void, aria: string) => (
    <YStack key={label} role="button" cursor="pointer" paddingHorizontal={10} paddingVertical={4} borderRadius={3} borderWidth={1}
            borderColor={on ? "#c9ccd3" : "#3a3f4a"} onPress={onPress} aria-label={aria}>
      <Text fontFamily="$mono" fontSize={11} letterSpacing={1} color="#c9ccd3">{label}</Text>
    </YStack>
  );
  return (
    <YStack flex={1} backgroundColor="#0f1115">
      <XStack paddingHorizontal={8} paddingVertical={4} gap={10} alignItems="center">
        {chip("‹ TITLE", false, onBack, "back to the title")}
        {SEATS.map((s) => chip(`PLAYER ${s.seat + 1} · ${s.edition}`, seat === s.seat, () => setSeat(s.seat), `sit at player ${s.seat + 1}`))}
      </XStack>
      {can ? (
        <WebView key={seat} source={{ uri: `${SERVER}/link/` }} injectedJavaScriptBeforeContentLoaded={hand}
                 originWhitelist={["*"]} style={{ flex: 1, backgroundColor: "#0f1115" }}
                 scrollEnabled={false} bounces={false} />
      ) : (
        <YStack padding={20}><Small color="$color8">
          {"THE LINK CABLE is the companion's: it runs both games, and each phone plays its own. Pair this phone with the "
            + "companion, at home or on the tailnet, to sit at it.  DRAFT"}
        </Small></YStack>
      )}
    </YStack>
  );
}
