// C-351 (the user, 2026-11-12): THE SINGING BOWL -- the tuning fork beside the day's note, tapped, brings a Tibetan singing
// bowl in the day's colour, patterned faintly with the chakras' signs (the day's own lit) and the virtue over its shadow.
// Tapped, the bowl rings in the day's note; a tap outside it, or the small x at its top right, puts it away.
// C-354: THE CALENDAR's fork brings the same bowl in the month's colours, ringing the month's chord. Every word DRAFT.
import { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, Modal, Platform, Pressable, View } from "react-native";
import { Text, YStack } from "tamagui";
import { useAudioPlayer, setAudioModeAsync } from "expo-audio";
import { bowlTone } from "../sound/bowl";
import { bowlPalettes, bowlRows, PixelSprite, TuningFork } from "./pixels";
import { useDark } from "../state/look";

const CELL = 6, W = 46;
// a Modal on the site is drawn outside the app's root, where the theme's body face is not set: name the phone's own
const BODY = Platform.OS === "web" ? "system-ui, -apple-system, 'Segoe UI', sans-serif" : undefined;

export type BowlOf = { colours: string[]; lit: string[]; notes: string[]; title: string; lines: string[] };

export function ForkKey({ colour, onPress, label }: { colour: string; onPress: () => void; label: string }) {
  return (
    <YStack role="button" aria-label={label} cursor="pointer" paddingHorizontal={4} paddingVertical={2} marginVertical={-2}
            hoverStyle={{ opacity: 0.75 }} pressStyle={{ opacity: 0.6 }} onPress={onPress}>
      <TuningFork colour={colour} cell={2} />
    </YStack>
  );
}

export function SingingBowl({ bowl, onClose }: { bowl: BowlOf | null; onClose: () => void }) {
  const dark = useDark();
  const rows = useMemo(() => bowlRows(bowl?.lit ?? [], W), [bowl?.lit.join()]);
  const palette = useMemo(() => bowlPalettes(bowl?.colours ?? ["#888888"], dark, W), [bowl?.colours.join(), dark]);
  const player = useAudioPlayer(null);
  const rings = [useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current];
  const sway = useRef(new Animated.Value(0)).current;
  useEffect(() => { if (!bowl) rings.forEach((r) => r.setValue(0)); }, [bowl]);
  if (!bowl) return null;
  const ring = async () => {
    rings.forEach((r) => r.setValue(0));
    Animated.stagger(450, rings.map((r) => Animated.timing(r, { toValue: 1, duration: 3200, easing: Easing.out(Easing.quad), useNativeDriver: true }))).start();
    sway.setValue(1);
    Animated.timing(sway, { toValue: 0, duration: 900, easing: Easing.elastic(2), useNativeDriver: true }).start();
    try {
      await setAudioModeAsync({ playsInSilentMode: false });
      player.replace({ uri: bowlTone(bowl.notes) }); player.volume = 0.9; player.seekTo(0); player.play();
    } catch { /* a quiet bowl is still a bowl */ }
  };
  const width = W * CELL, colour = bowl.colours[0];
  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      {/* the dimmed page behind the bowl is its own layer, so a tap on the bowl never reaches it; react-native Views hold
          what is laid over the bowl -- they are positioned on the web, Tamagui's are not */}
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 16 }}>
        <Pressable onPress={onClose} aria-label="put the bowl away" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(10,10,14,0.55)" }} />
        <View style={{ maxWidth: "100%", position: "relative" }}>
          <YStack backgroundColor="$color1" borderRadius={14} padding={20} paddingTop={16} alignItems="center" gap={10}
                  borderWidth={2} borderColor={colour}>
            <YStack position="absolute" top={6} right={8} padding={6} role="button" aria-label="close the bowl" cursor="pointer" onPress={onClose} zIndex={2}>
              <Text fontFamily="$mono" fontSize={14} fontWeight="700" color="$color10">[x]</Text>
            </YStack>
            <Text fontFamily="$mono" fontSize={12} letterSpacing={2} color="$color10">{bowl.title}</Text>
            <YStack role="button" aria-label="ring the bowl" cursor="pointer" onPress={ring}>
            <View style={{ position: "relative", width, height: rows.length * CELL + 30, alignItems: "center", justifyContent: "flex-end" }}>
              {rings.map((r, i) => (
                <Animated.View key={i} pointerEvents="none" style={{
                  position: "absolute", top: 4 * CELL - 30, width: width * 0.9, height: 60, borderRadius: width, borderWidth: 2,
                  borderColor: bowl.colours[i % bowl.colours.length],
                  opacity: r.interpolate({ inputRange: [0, 0.05, 1], outputRange: [0, 0.7, 0] }),
                  transform: [{ scaleX: r.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.6] }) },
                              { scaleY: r.interpolate({ inputRange: [0, 1], outputRange: [0.85, 2.6] }) }],
                }} />
              ))}
              <Animated.View style={{ transform: [{ rotate: sway.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "1.5deg"] }) }] }}>
                <PixelSprite rows={rows} palette={palette} cell={CELL} />
              </Animated.View>
            </View>
            </YStack>
            {bowl.lines.map((l, i) => <Text key={i} style={BODY ? { fontFamily: BODY } : undefined} maxWidth={width} fontSize={i ? 13 : 15} fontWeight={i ? "400" : "600"} color={i ? "$color11" : "$color12"} textAlign="center">{l}</Text>)}
            <Text fontFamily="$mono" fontSize={11} letterSpacing={1} color="$color9">TAP THE BOWL TO RING IT</Text>
          </YStack>
        </View>
      </View>
    </Modal>
  );
}
