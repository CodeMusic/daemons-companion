// LIBRARY > THE UNITY BOOK (C-299; DAEMONS T-519 item 3, vision 4.40): the two halves mended at DAEMON TOWER, read by the
// player with both -- the same open book as the dawn half (Eudaimon.tsx LayerPages), in full light: "Mended, the book has
// both covers", so its cover is the two laid flat, the night half's front and the dawn half's back, stitched at the spine
// in the tablet's green and the dawn's gold. It breathes in neither hour's breath ("It was written for no hour"): the page
// is plain white, its inscriptions the tablet's green as both halves print them, its own marks the book's purple, which
// is red and blue made one. BALANCE, written at the crease, carries both halves' colours under its heading. Its ATTESTATION's
// observer's line is the wording the lead daemon's SPIRITS chose (GET /api/unity). Its deck deals "Both as One" only.
// Every word DRAFT.
import { useState } from "react";
import { Text, XStack, YStack } from "tamagui";
import { EMERALD } from "../../../server/src/witching";
import { Art } from "../../ui/ui";
import { Cards } from "../library/Arcana";
import { DAWN, DawnBack, LayerPages, type EudaimonT, type LayerPalette } from "./Eudaimon";

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

// both covers laid flat: the night half's front, the seam, the dawn half's back; the title above, the last word below
function Cover({ b }: { b: UnityT }) {
  const [w, setW] = useState(0);
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

// its picture: until the game's own are exported, the two decks' faces stand in, side by side
function Picture({ scale }: { scale: number }) {
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
  return <LayerPages b={b} P={UNITY} green={EMERALD.hue} id="unity" cover={<Cover b={b} />} under={<Cards book="unity" />}
                     picture={(_, scale) => <Picture scale={scale} />} rule={rule} />;
}
