// C-353 (the user, 2026-11-12, with a sketch: "12 NOV" in a box beside the day): a calendar page beside TODAY's day --
// the month's colour its border (two outlines when the month blends two), its fill a lighter version of them, two rings
// at its top as a wall calendar hangs, the day of the month large in the day's colour with a thin outline in the month's,
// and the month's three letters centred at the bottom in the outline colour. Tapped, it opens THE CALENDAR (C-354).
import { Platform, View } from "react-native";
import { Text, XStack, YStack } from "tamagui";
import { mix, NIGHT, PAPER } from "./pixels";
import { useDark } from "../state/look";

// a thin outline around a number: four shadows, one each way, as a pixel font is outlined (the web draws a stroke)
const outlined = (c: string) => Platform.OS === "web"
  ? ({ WebkitTextStroke: `1px ${c}`, paintOrder: "stroke fill" } as object)
  : { textShadowColor: c, textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 1.5 };

export function CalendarSprite({ day, short, colours, dayColour, onPress, size = 68 }:
  { day: number; short: string; colours: string[]; dayColour: string; onPress?: () => void; size?: number }) {
  const dark = useDark();
  const outer = colours[0], inner = colours[1] ?? colours[0];
  const light = (c: string) => (dark ? mix(c, NIGHT, 0.55) : mix(c, PAPER, 0.78));
  const bands = 6;                                   // the fill, stepped from the first colour's light to the second's
  return (
    <YStack role={onPress ? "button" : undefined} aria-label={`${day} ${short}, open the calendar`} cursor={onPress ? "pointer" : undefined}
            onPress={onPress} pressStyle={{ opacity: 0.75 }} hoverStyle={{ opacity: 0.88 }} width={size} alignItems="center">
      <XStack gap={size * 0.3} zIndex={2} marginBottom={-5}>
        {[0, 1].map((i) => <YStack key={i} width={5} height={11} borderRadius={3} backgroundColor={outer} borderWidth={1} borderColor={mix(outer, NIGHT, 0.3)} />)}
      </XStack>
      <YStack width={size} height={size * 1.02} borderWidth={3} borderColor={outer} borderRadius={6} overflow="hidden">
        {/* a react-native View: it is positioned on the web (Tamagui's is not), so the words stay inside the page */}
        <View style={{ flex: 1, position: "relative", borderWidth: colours.length > 1 ? 2 : 0, borderColor: inner, borderRadius: 3, overflow: "hidden" }}>
          {Array.from({ length: bands }, (_, i) => (
            <YStack key={i} flex={1} backgroundColor={light(mix(outer, inner, i / (bands - 1)))} />
          ))}
          <YStack position="absolute" top={0} left={0} right={0} height={7} backgroundColor={outer} opacity={0.85} />
          <YStack position="absolute" top={5} left={0} right={0} bottom={0} alignItems="center" justifyContent="space-between" paddingBottom={3}>
            <Text fontFamily="$mono" fontSize={size * 0.44} lineHeight={size * 0.54} fontWeight="800" color={dayColour}
                  allowFontScaling={false} style={outlined(outer)}>{day}</Text>
            <Text fontFamily="$mono" fontSize={size * 0.17} lineHeight={size * 0.2} letterSpacing={1.5} fontWeight="700" color={outer}
                  allowFontScaling={false}>{short}</Text>
          </YStack>
        </View>
      </YStack>
    </YStack>
  );
}
