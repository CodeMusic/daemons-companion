// LIBRARY > THE UNITY BOOK (C-299; DAEMONS T-519 item 3, vision 4.40): the two halves mended at DAEMON TOWER, read by the
// player with both -- the same open book as the dawn half (Eudaimon.tsx LayerPages), in full light: "Mended, the book has
// both covers", so its cover is the two laid flat, the night half's front and the dawn half's back, stitched at the spine
// in the tablet's green and the dawn's gold. It breathes in neither hour's breath ("It was written for no hour"): the page
// is plain white, its inscriptions the tablet's green as both halves print them, its own marks the book's purple, which
// is red and blue made one. BALANCE, written at the crease, carries both halves' colours under its heading. Its ATTESTATION's
// observer's line is the wording the lead daemon's SPIRITS chose (GET /api/unity). Its deck deals "Both as One" only.
// Its recording is in one voice, leaned neither way, sealed with its own key, read from its ATTESTATION (the user, 2026-11-05). The first time
// the LIBRARY finds the save mended, the mending plays once on the shelf (Mending, below; app/state/mended.ts).
// Every word DRAFT.
import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing } from "react-native";
import { Text, XStack, YStack } from "tamagui";
import { EMERALD } from "../../../server/src/witching";
import { Listen } from "../../ui/bookAudio";
import { BookCover, CoverCrop, TurningPicture } from "../../ui/bookPicture";   // C-299: the game's own cover and pictures
import { Art, Card } from "../../ui/ui";
import { Cards } from "../library/Arcana";
import { DAWN, DawnBack, LayerPages, type Entry, type EudaimonT, type LayerPalette } from "./Eudaimon";

export type UnityT = EudaimonT;
export const UNITY: LayerPalette = { page: "#FFFDF8", boards: "#EFE9DE", ink: "#211C26", faint: "#756C7B", edge: "#DCD2C4", mark: "#8E3F80", lit: "#B0569E" };
const mono = { fontFamily: "$mono" as const, letterSpacing: 2 };

// the seam: the halves' two colours, stitch by stitch
function Spine({ h }: { h: number }) {
  const n = Math.max(6, Math.floor(h / 14));
  return (
    <YStack width={12} height={h} backgroundColor={UNITY.ink} alignItems="center" justifyContent="space-evenly">
      {Array.from({ length: n }, (_, i) => <YStack key={i} width={6} height={3} borderRadius={2} backgroundColor={i % 2 ? DAWN.lit : EMERALD.lit} />)}
    </YStack>
  );
}

// the game's own cover once exported (both covers laid flat, as it draws them; its title in our type), the last word under
// it; until then drawn here: the night half's front, the seam, the dawn half's back; the title above, the last word below
function Cover({ b }: { b: UnityT }) {
  const [w, setW] = useState(0);
  if (b.cover) return (
    <YStack gap={8} paddingVertical={6}>
      <BookCover book="unity" title={b.title ?? "THE UNITY BOOK"} subtitle={b.subtitle} />
      <Text allowFontScaling={false} textAlign="center" {...mono} fontSize={11} color={UNITY.ink}>AS ABOVE, SO BELOW, SO ONE</Text>
    </YStack>
  );
  const half = Math.max(90, Math.min(150, (w - 12) / 2)), h = Math.round(half * (400 / 240));
  return (
    <YStack onLayout={(ev) => setW(ev.nativeEvent.layout.width)} alignItems="center" gap={10} paddingVertical={6}>
      <Text allowFontScaling={false} textAlign="center" {...mono} letterSpacing={1} fontSize={17} fontWeight="800" color={UNITY.mark}>{b.title ?? "THE UNITY BOOK"}</Text>
      <Text allowFontScaling={false} textAlign="center" fontSize={12} fontStyle="italic" color={UNITY.ink} marginTop={-6}>{b.subtitle ?? ""}</Text>
      {w ? (
        <XStack borderRadius={10} overflow="hidden" borderWidth={2} borderColor={UNITY.ink}>
          <Art path="/art/arcana/spellcraft.png" size={half} height={h} />
          <Spine h={h} />
          <DawnBack w={half} h={h} />
        </XStack>
      ) : null}
      <XStack width={half * 2 + 12} justifyContent="space-between">
        <Text {...mono} fontSize={9} color={UNITY.faint}>THE FRONT</Text>
        <Text {...mono} fontSize={9} color={UNITY.faint}>THE BACK</Text>
      </XStack>
      <Text allowFontScaling={false} textAlign="center" {...mono} fontSize={11} color={UNITY.ink}>AS ABOVE, SO BELOW, SO ONE</Text>
    </YStack>
  );
}

// its picture, the game's own (data/art/unity_<picture>_<frame>.png); until one is exported, the two decks' faces stand in
function Picture({ e, scale }: { e: Entry; scale: number }) {
  return <TurningPicture book="unity" e={e} scale={scale} standIn={<Faces scale={scale} />} />;
}
function Faces({ scale }: { scale: number }) {
  return (
    <XStack gap={4 * scale}>
      <Art path="/art/arcana/above.png" size={45 * scale} height={84 * scale} fit="contain" />
      <Art path="/art/arcana/below.png" size={45 * scale} height={84 * scale} fit="contain" />
    </XStack>
  );
}

// BALANCE, at the crease: both halves' colours under its heading
const rule = (label: string) => label === "BALANCE" ? (
  <XStack height={3} width={72} marginBottom={4}><YStack flex={1} backgroundColor={EMERALD.hue} /><YStack flex={1} backgroundColor={DAWN.lit} /></XStack>
) : null;

export function UnityBook({ b }: { b: UnityT }) {
  return <LayerPages b={b} P={UNITY} green={EMERALD.hue} id="unity" cover={<Cover b={b} />}
                     under={<><Listen which="unity" warning={b.sections?.[0]?.entries?.[0]?.paragraphs.map((p) => p.text).join(" ")} /><Cards book="unity" /></>}
                     picture={(e, scale) => <Picture e={e} scale={scale} />} rule={rule} />;
}

// The mending, once (vision 4.40: "mended at DAEMON TOWER in a colourful burst -- the pair going back to light"): on the
// shelf, the night half's front and the dawn half's back come together at the spine, the light goes out of them in rings
// of colour, and the mended book is there. No new words. A tap, or the phone's Reduce Motion, lets it be mended at once.
const SPECTRUM = ["#E05A5A", "#E8A93A", "#F2D45C", "#50C878", "#4A90D9", "#8E3F80"];
const HALF = { w: 54, h: 90 };
const drive = (v: Animated.Value, toValue: number, duration: number, easing = Easing.inOut(Easing.cubic)) =>
  Animated.timing(v, { toValue, duration, easing, useNativeDriver: false });

type Named = { title?: string; subtitle?: string } | null | undefined;
export function Mending({ b, onDone, night, dawn }: { b: UnityT; onDone: () => void; night?: Named; dawn?: Named }) {
  const close = useRef(new Animated.Value(0)).current;      // 0: the halves apart; 1: together at the spine
  const burst = useRef(new Animated.Value(0)).current;      // the light going out of them
  const whole = useRef(new Animated.Value(0)).current;      // the mended book
  const done = useRef(false);
  const end = () => { if (!done.current) { done.current = true; onDone(); } };
  useEffect(() => {
    let run: Animated.CompositeAnimation | null = null;
    AccessibilityInfo.isReduceMotionEnabled().catch(() => false).then((still) => {
      if (still) { end(); return; }
      run = Animated.sequence([
        Animated.delay(600),
        drive(close, 1, 1500),
        Animated.parallel([drive(burst, 1, 1300, Easing.out(Easing.quad)), Animated.sequence([Animated.delay(450), drive(whole, 1, 700)])]),
        Animated.delay(1200),
      ]);
      run.start(({ finished }) => { if (finished) end(); });
    });
    return () => run?.stop();
  }, []);
  const apart = (side: -1 | 1) => close.interpolate({ inputRange: [0, 1], outputRange: [side * 46, 0] });
  const halves = whole.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  const flash = burst.interpolate({ inputRange: [0, 0.08, 0.4], outputRange: [0, 0.85, 0], extrapolate: "clamp" });
  const real = !!b.cover;                                   // the export carries the three covers together (companion 38233c8)
  return (
    <Card cursor="pointer" role="button" onPress={end} overflow="hidden" borderColor={UNITY.lit}>
      <YStack height={real ? 170 : 150} alignItems="center" justifyContent="center" overflow="hidden" position="relative">{/* the light stays on its card */}
        {SPECTRUM.map((c, i) => {
          const at = i / SPECTRUM.length;
          return (
            <Animated.View key={c} pointerEvents="none" style={{
              position: "absolute", width: 120, height: 120, borderRadius: 60, borderWidth: 5, borderColor: c,
              opacity: burst.interpolate({ inputRange: [0, 0.05 + at * 0.4, 1], outputRange: [0, 0.95, 0], extrapolate: "clamp" }),
              transform: [{ scale: burst.interpolate({ inputRange: [0, 1], outputRange: [0.15, 2.4 + i * 0.35] }) }],
            }} />
          );
        })}
        <Animated.View style={{ flexDirection: "row", opacity: halves }}>
          {real ? (<>                                         {/* the game's own covers: the night half's front, the dawn half's */}
            <Animated.View style={{ transform: [{ translateX: apart(-1) }] }}><CoverCrop book="hermetic" k={0.9} title={night?.title ?? "THE HERMETIC LAYER"} subtitle={night?.subtitle} /></Animated.View>
            <Animated.View style={{ transform: [{ translateX: apart(1) }] }}><CoverCrop book="eudaimon" k={0.9} title={dawn?.title ?? "THE EUDAIMON LAYER"} subtitle={dawn?.subtitle} /></Animated.View>
          </>) : (<>
            <Animated.View style={{ transform: [{ translateX: apart(-1) }], backgroundColor: "#1d2a24", borderRadius: 3, padding: 3,
                                    borderWidth: 2, borderColor: EMERALD.hue }}>
              <Art path="/art/arcana/spellcraft.png" size={HALF.w} height={HALF.h} />
            </Animated.View>
            <Animated.View style={{ transform: [{ translateX: apart(1) }], borderRadius: 3, padding: 3, overflow: "hidden",
                                    borderWidth: 2, borderColor: DAWN.lit }}>
              <DawnBack w={HALF.w} h={HALF.h} />
            </Animated.View>
          </>)}
        </Animated.View>
        <Animated.View pointerEvents="none" style={{ position: "absolute", alignItems: "center", gap: 6, opacity: whole }}>
          {real ? <CoverCrop book="unity" k={0.9} title={b.title ?? "THE UNITY BOOK"} subtitle={b.subtitle} /> : (
            <XStack borderRadius={4} overflow="hidden" borderWidth={2} borderColor={UNITY.ink}>
              <Art path="/art/arcana/spellcraft.png" size={HALF.w} height={HALF.h} />
              <Spine h={HALF.h} />
              <DawnBack w={HALF.w} h={HALF.h} />
            </XStack>
          )}
          {real ? null : <Text allowFontScaling={false} {...mono} letterSpacing={1} fontSize={13} fontWeight="800" color={UNITY.mark}>{b.title ?? "THE UNITY BOOK"}</Text>}
        </Animated.View>
        <Animated.View pointerEvents="none" style={{ position: "absolute", width: 120, height: 120, borderRadius: 60, backgroundColor: "#FFFDF8",
                                                     opacity: flash, transform: [{ scale: burst.interpolate({ inputRange: [0, 0.4], outputRange: [0.3, 2.2], extrapolate: "clamp" }) }] }} />
      </YStack>
    </Card>
  );
}
