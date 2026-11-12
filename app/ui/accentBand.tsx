// C-349: an accent worn -- the place's four colours from the game in a band under the header's rule (which stays the
// day's). THE BLACKOUT's breathes, as the cave does: its purple rising and falling on the pulse's eight-second breath
// (DAEMONS T-546, Pulse_Phase), its green thread steady.
import { useEffect, useRef } from "react";
import { Animated, Easing } from "react-native";
import { XStack, YStack } from "tamagui";
import type { AccentColours } from "../tamagui.config";

export function AccentBand({ colours, height = 5 }: { colours: AccentColours; height?: number }) {
  const breath = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!colours.breathe) { breath.setValue(1); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(breath, { toValue: 0.55, duration: 4000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(breath, { toValue: 1, duration: 4000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [colours.breathe, breath]);
  return (
    <XStack height={height} aria-hidden>
      <Animated.View style={{ flex: 3, flexDirection: "row", opacity: breath }}>
        <YStack flex={1} backgroundColor={colours.deep} />
        <YStack flex={3} backgroundColor={colours.main} />
        <YStack flex={1} backgroundColor={colours.light} />
      </Animated.View>
      <YStack flex={0.6} backgroundColor={colours.spark} />
    </XStack>
  );
}
