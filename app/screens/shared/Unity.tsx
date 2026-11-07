// LIBRARY > THE UNITY BOOK (C-299; DAEMONS T-519 item 3, vision 4.40): the two halves mended at DAEMON TOWER, read by the
// player with both -- the same open book as the dawn half (Eudaimon.tsx LayerPages), in full light: "Mended, the book has
// both covers", so its cover is the two laid flat, the night half's front and the dawn half's back, stitched at the spine
// in the tablet's green and the dawn's gold. It breathes in neither hour's breath ("It was written for no hour"): the page
// is plain white, its inscriptions the tablet's green as both halves print them, its own marks the book's purple, which
// is red and blue made one. BALANCE, written at the crease, carries both halves' colours under its heading. Its ATTESTATION's
// observer's line is the wording the lead daemon's SPIRITS chose (GET /api/unity). Its deck deals "Both as One" only.
// Its recording is in one voice, leaned neither way, sealed with its own key, read from its ATTESTATION (the user, 2026-11-05). The first time
// the LIBRARY finds the save mended, the mending plays once on the shelf (Mending, below; app/state/mended.ts).
// C-304 (DAEMONS T-529, vision 4.40; the user, 2026-11-07: "you should be able to use a lens to see the passages from
// either of their two forms"): a three-way switch on top of every page -- NIGHT, WHOLE, DAWN -- re-reads the section open
// in place as the night half words it, as the whole does, or as the dawn half does (GET /api/unity's lens), and the page
// turns to that half's tone: emerald sepia, full colour, sapphire cyanotype, the tints HALFTONE wears for each half. A
// section only the whole has (BALANCE) reads whole, in full colour, in every setting. The game turns it with L and R.
// Every word DRAFT.
import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing } from "react-native";
import { Text, XStack, YStack } from "tamagui";
import { EMERALD } from "../../../server/src/witching";
import { Listen } from "../../ui/bookAudio";
import { BookCover, CoverCrop, TurningPicture } from "../../ui/bookPicture";   // C-299: the game's own cover and pictures
import { Art, Card } from "../../ui/ui";
import { Cards } from "../library/Arcana";
import { toneHex, type Tone } from "../../ui/tone";
import { DAWN, DawnBack, LayerPages, type Entry, type EudaimonT, type LayerPalette } from "./Eudaimon";

type Sections = NonNullable<EudaimonT["sections"]>;
export type UnityT = EudaimonT & { lens?: { night: (Sections[number] | null)[]; dawn: (Sections[number] | null)[] } };
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

// its picture, the game's own (data/art/unity_<picture>_<frame>.png; through the lens, the half's own); until one is
// exported, the two decks' faces stand in
function Picture({ e, scale }: { e: Entry; scale: number }) {
  return <TurningPicture book={e.book ?? "unity"} e={e} scale={scale} standIn={<Faces scale={scale} />} />;
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

// the lens: which reading, the half it is read from, and its tone
type Lens = "night" | "whole" | "dawn";
const LENSES: { k: Lens; label: string; tone: Tone; from?: "hermetic" | "eudaimon" }[] = [
  { k: "night", label: "NIGHT", tone: "emerald", from: "hermetic" },
  { k: "whole", label: "WHOLE", tone: null },
  { k: "dawn", label: "DAWN", tone: "sapphire", from: "eudaimon" },
];
// the switch, on top of the page: three settings, the one held in its tone and underlined
function LensSwitch({ lens, set }: { lens: Lens; set: (l: Lens) => void }) {
  return (
    <XStack alignSelf="center" borderWidth={1} borderColor={UNITY.edge} borderRadius={4} overflow="hidden" role="radiogroup" aria-label="Read it as">
      {LENSES.map((l, i) => {
        const on = l.k === lens, ink = toneHex(UNITY.mark, l.tone);
        return (
          <YStack key={l.k} paddingHorizontal={14} paddingVertical={7} cursor="pointer" role="radio" aria-checked={on}
                  backgroundColor={on ? toneHex(UNITY.boards, l.tone) : UNITY.page} borderLeftWidth={i ? 1 : 0} borderColor={UNITY.edge}
                  onPress={() => set(l.k)}>
            <Text allowFontScaling={false} {...mono} fontSize={11} fontWeight={on ? "800" : "400"} color={on ? ink : UNITY.faint}
                  textDecorationLine={on ? "underline" : "none"}>{l.label}</Text>
          </YStack>
        );
      })}
    </XStack>
  );
}

export function UnityBook({ b }: { b: UnityT }) {
  const [lens, setLens] = useState<Lens>("whole");
  const L = LENSES.find((l) => l.k === lens)!;
  const whole = b.sections ?? [];
  // each section in the reading held: the half's words where it has them (its pictures its own), else the whole's
  const other = L.from ? b.lens?.[lens as "night" | "dawn"] : undefined;
  const read = other ? whole.map((s, i) => other[i] ? { ...other[i]!, entries: other[i]!.entries.map((e) => ({ ...e, book: L.from })) } : s) : whole;
  const toneFor = (s: number | null) => s === null ? L.tone : other?.[s] ? L.tone : null;
  return <LayerPages b={{ ...b, sections: read }} P={UNITY} green={EMERALD.hue} id={`unity-${lens}`} cover={<Cover b={b} />}
                     under={<><Listen which="unity" warning={b.sections?.[0]?.entries?.[0]?.paragraphs.map((p) => p.text).join(" ")} /><Cards book="unity" /></>}
                     picture={(e, scale) => <Picture e={e} scale={scale} />} rule={rule}
                     top={b.lens ? <LensSwitch lens={lens} set={setLens} /> : null} toneFor={toneFor} />;
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
