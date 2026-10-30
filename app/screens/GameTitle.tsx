// The GAME tab's title (the user, 2026-10-29, through the game lane: "whenever I go to the game tab the game starts --
// but sometimes I want to hit the UPDATE option, or the DEBUG options... so maybe we have it first go to a menu with those
// options -- themed like the game"): opening GAME lands here, on a title like the game's own -- the intro's falling green
// binary and its coloured notes, DAEMONS and the edition, the mark under it -- with a press-start list in front: PLAY,
// UPDATE when a new release is out, the TESTING BUILD (C-216) when there is one, and ANOTHER GAME. PLAY starts the
// emulator, so it feels like the game simply starting. The title's art is the game's own (art/title/). Every word DRAFT.
import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Image, Pressable, View, useWindowDimensions } from "react-native";
import { Text, YStack } from "tamagui";
import title from "../../server/data/art/title/title.json";

const NOTES = require("../../server/data/art/play_notes.png");   // the game's note heads: 16x16 each, C..B, one above the next
// the title screen's own art (the game lane's companion_export, art/title/, at 2x): each edition's DAEMONS, its word, and
// the two who face off on it (left, then right -- already mirrored)
const TITLE = {
  CONTENT: { logo: require("../../server/data/art/title/logo_content.png"), word: require("../../server/data/art/title/content.png"),
             left: require("../../server/data/art/title/content_1.png"), right: require("../../server/data/art/title/content_2.png") },
  CONTEXT: { logo: require("../../server/data/art/title/logo_context.png"), word: require("../../server/data/art/title/context.png"),
             left: require("../../server/data/art/title/context_1.png"), right: require("../../server/data/art/title/context_2.png") },
};
const GREEN = title.green, RAMP: string[] = title.greenRamp;    // the splash's 0s and 1s, bright to trail
export const MARK = title.mark;
const PIXELATED = { imageRendering: "pixelated" } as const;

export type TitleChoice = { key: string; label: string; note?: string; onPick: () => void };

// one column of falling binary: a strip of 0s and 1s sliding down the screen, again and again, at its own pace
function Rain({ x, height, seed }: { x: number; height: number; seed: number }) {
  const fall = useRef(new Animated.Value(0)).current;
  const digits = useMemo(() => Array.from({ length: 24 }, (_, i) => ((seed * 7 + i * 13) % 5 < 2 ? "1" : "0")).join("\n"), [seed]);
  useEffect(() => {
    const ms = 5000 + (seed % 7) * 900;
    const run = Animated.loop(Animated.timing(fall, { toValue: 1, duration: ms, easing: Easing.linear, useNativeDriver: true }));
    const t = setTimeout(() => run.start(), (seed % 9) * 400);
    return () => { clearTimeout(t); run.stop(); };
  }, [fall, seed]);
  const y = fall.interpolate({ inputRange: [0, 1], outputRange: [-420, height] });
  return (
    <Animated.Text style={{ position: "absolute", left: x, top: 0, transform: [{ translateY: y }], color: RAMP[seed % RAMP.length], opacity: 0.22 + (seed % 3) * 0.1,
                            fontFamily: "Courier", fontSize: 14, lineHeight: 17 }}>{digits}</Animated.Text>
  );
}

// a note head drifting up and fading, in its key's colour (the game's own sprite)
function Note({ x, height, pc, seed }: { x: number; height: number; pc: number; seed: number }) {
  const rise = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const run = Animated.loop(Animated.timing(rise, { toValue: 1, duration: 6000 + (seed % 5) * 1200, easing: Easing.inOut(Easing.quad), useNativeDriver: true }));
    const t = setTimeout(() => run.start(), (seed % 6) * 700);
    return () => { clearTimeout(t); run.stop(); };
  }, [rise, seed]);
  const y = rise.interpolate({ inputRange: [0, 1], outputRange: [height, height * 0.15] });
  const o = rise.interpolate({ inputRange: [0, 0.15, 0.8, 1], outputRange: [0, 0.9, 0.7, 0] });
  const size = 32;
  return (
    <Animated.View style={{ position: "absolute", left: x, top: 0, width: size, height: size, overflow: "hidden", opacity: o, transform: [{ translateY: y }] }}>
      <Image source={NOTES} style={[{ width: size, height: size * 12, marginTop: -size * pc }, PIXELATED as any]} />
    </Animated.View>
  );
}

export function GameTitle({ edition, choices, said }: { edition: string; choices: TitleChoice[]; said?: string }) {
  const { width, height } = useWindowDimensions();
  const [at, setAt] = useState(0);
  const blink = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const run = Animated.loop(Animated.sequence([
      Animated.timing(blink, { toValue: 0.35, duration: 600, useNativeDriver: true }),
      Animated.timing(blink, { toValue: 1, duration: 600, useNativeDriver: true })]));
    run.start();
    return () => run.stop();
  }, [blink]);
  const columns = Math.max(6, Math.floor(width / 26));
  const notes = 7;
  const art = TITLE[edition === "CONTEXT" ? "CONTEXT" : "CONTENT"];
  const logoW = Math.min(width - 40, 406), face = Math.min(112, (width - 80) / 3);
  return (
    <View style={{ flex: 1, backgroundColor: "#05070a", overflow: "hidden" }}>
      {Array.from({ length: columns }, (_, i) => <Rain key={`r${i}`} x={i * (width / columns) + 4} height={height} seed={i * 31 + 7} />)}
      {Array.from({ length: notes }, (_, i) => (
        <Note key={`n${i}`} x={((i * 0.137 + 0.06) % 1) * (width - 30)} height={height} pc={(i * 5) % 12} seed={i * 17 + 3} />
      ))}
      <YStack flex={1} alignItems="center" justifyContent="center" gap={14} paddingHorizontal={20}>
        <Image source={art.logo} style={[{ width: logoW, height: logoW * 124 / 406 }, PIXELATED as any]} accessibilityLabel="DAEMONS" />
        <Image source={art.word} style={[{ width: logoW * 0.53, height: logoW * 0.53 * 28 / 108 }, PIXELATED as any]} accessibilityLabel={edition} />
        <View style={{ flexDirection: "row", justifyContent: "space-between", width: Math.min(width - 40, 360) }}>
          <Image source={art.left} style={[{ width: face, height: face }, PIXELATED as any]} />
          <Image source={art.right} style={[{ width: face, height: face }, PIXELATED as any]} />
        </View>
        <YStack alignItems="flex-start">
        {choices.map((c, i) => (
          <Pressable key={c.key} onPress={() => { setAt(i); c.onPick(); }} onHoverIn={() => setAt(i)} style={{ paddingVertical: 8, minWidth: 220 }}>
            <Animated.View style={{ flexDirection: "row", alignItems: "center", opacity: i === at ? blink : 0.85 }}>
              <Text fontFamily="$mono" fontSize={18} width={22} color={GREEN}>{i === at ? "▶" : " "}</Text>
              <YStack>
                <Text fontFamily="$mono" fontSize={20} letterSpacing={3} color="#f4f1e8">{c.label}</Text>
                {c.note ? <Text fontFamily="$mono" fontSize={11} color="#9aa3ad">{c.note}</Text> : null}
              </YStack>
            </Animated.View>
          </Pressable>
        ))}
        </YStack>
        {said ? <Text fontFamily="$mono" fontSize={12} color="#9aa3ad" textAlign="center" maxWidth={420}>{said}</Text> : null}
      </YStack>
      <Text allowFontScaling={false} position="absolute" bottom={18} alignSelf="center" fontFamily="$mono" fontSize={12} letterSpacing={2} color="#9aa3ad">{MARK}</Text>
    </View>
  );
}
