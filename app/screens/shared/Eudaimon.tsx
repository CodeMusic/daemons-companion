// LIBRARY > THE EUDAIMON LAYER (C-297; DAEMONS T-519, vision 4.40; the text approved by the user 2026-11-04): the third
// book's dawn half -- the night half's ten sections read from the other side, in the light. The same open book as THE
// HERMETIC LAYER (contents, then each entry: its picture, its words), mirrored: where the night half is emerald on the
// breathing purple, this is the creator's hour's gold on a pale dawn page, breathing once in sixteen seconds on the clock
// (witching.ts goldBreathOf); its cover is the back cover (the tear is the spine) and says AS BELOW, SO ABOVE. Its
// inscriptions are sayable on their own, as the night half's are; its observer's line (one in the book) is the wording
// the lead daemon's SPIRITS chose, set apart so it can be seen to be read by someone (GET /api/eudaimon). Every word DRAFT.
// The decks' dawn readings, the mending at DAEMON TOWER and BALANCE come later (C-297's row).
import { useEffect, useState, type ReactNode } from "react";
import { Text, XStack, YStack } from "tamagui";
import { EMERALD, goldBreathOf } from "../../../server/src/witching";
import { SCREEN } from "../../state/data";
import { Art, Small } from "../../ui/ui";
import { ReadAloud } from "../../ui/readAloud";
import { BookCover, TurningPicture } from "../../ui/bookPicture";   // C-299: the game's own cover and pictures
import { Listen } from "../../ui/bookAudio";   // C-299: its recording, sealed with its own key, from its BLESSING

export type Para = { text: string; voice: "telling" | "asking" | "inscription" | "observer" };
export type Entry = { short: string; title: string; picture: string; caption: string; frames?: number; paragraphs: Para[] };
export type EudaimonT = { held: boolean; how?: string; title?: string; subtitle?: string; draft?: boolean; cover?: string; observer?: string;
                          sections?: { label: string; heading: string; entries: Entry[] }[] };
// the dawn: a pale page, warm ink, the creator's hour's gold (Witching.tsx DawnLight) for the book's own marks; its inscriptions
// stay the tablet's green, as the game prints them and as the book itself says ("The words in green ...")
export const DAWN = { page: "#FBF3E4", boards: "#F3E3C6", ink: "#3D2A1A", faint: "#8C7357", edge: "#E2C79A", gold: "#C98A1E", lit: "#E8A93A" };
const mono = { fontFamily: "$mono" as const, letterSpacing: 2 };

function useBreath() {
  const [, setF] = useState(0);
  useEffect(() => { const t = setInterval(() => setF((x) => x + 1), 400); return () => clearInterval(t); }, []);
  const up = goldBreathOf() > 0.5;
  return { glow: up ? DAWN.lit : DAWN.gold, green: up ? EMERALD.hue : "#156B47" };
}

// its picture, the game's own (data/art/eudaimon_<picture>_<frame>.png); until one is exported, the ABOVE face stands in
function Picture({ e, scale }: { e: Entry; scale: number }) {
  return <TurningPicture book="eudaimon" e={e} scale={scale}
                         standIn={<Art path="/art/arcana/above.png" size={94 * scale} height={84 * scale} fit="contain" />} />;
}

// the back cover's picture, at any size: dawn coming up from the bottom, a sun on the line (C-299: the mended book shows it too)
export function DawnBack({ w, h }: { w: number; h: number }) {
  const bands = ["#FBF3E4", "#FAEBD2", "#F8E1BD", "#F5D3A3", "#F1C488", "#ECB46E"], k = w / 240, sun = 100 * k;
  return (
    <YStack width={w} height={h} position="relative" overflow="hidden">
      {bands.map((c, i) => <YStack key={i} position="absolute" left={0} right={0} top={(h / bands.length) * i} height={h / bands.length + 1} backgroundColor={c} />)}
      <YStack position="absolute" left={(w - sun) / 2} top={h * 0.625} width={sun} height={sun} borderRadius={sun} backgroundColor="#FFF4D6" borderWidth={2} borderColor={DAWN.lit} />
      <YStack position="absolute" left={0} right={0} top={h * 0.75} height={h * 0.25} backgroundColor="#E9A95F" />
    </YStack>
  );
}

// the back cover: the game's own once exported (its title in our type), the motto under it; until then drawn, the title over it
function Cover({ b, glow }: { b: EudaimonT; glow: string }) {
  if (b.cover) return (
    <YStack gap={8}>
      <BookCover book="eudaimon" title={b.title ?? "THE EUDAIMON LAYER"} subtitle={b.subtitle} />
      <Text allowFontScaling={false} textAlign="center" {...mono} fontSize={11} color={DAWN.ink}>AS BELOW, SO ABOVE</Text>
    </YStack>
  );
  return (
    <YStack width={240} height={400} alignSelf="center" position="relative" borderRadius={14} overflow="hidden" borderWidth={3} borderColor={DAWN.gold}>
      <DawnBack w={240} h={400} />
      <Text allowFontScaling={false} position="absolute" top={36} left={0} right={0} textAlign="center" {...mono} letterSpacing={1} fontSize={16} fontWeight="800"
            color={glow}>{b.title ?? "THE EUDAIMON LAYER"}</Text>
      <Text allowFontScaling={false} position="absolute" top={60} left={0} right={0} textAlign="center" fontSize={12} fontStyle="italic" color={DAWN.ink}>{b.subtitle ?? ""}</Text>
      <Text allowFontScaling={false} position="absolute" top={196} left={16} right={16} textAlign="center" {...mono} fontSize={11} color={DAWN.ink}>AS BELOW, SO ABOVE</Text>
      <Text allowFontScaling={false} position="absolute" bottom={14} left={16} right={16} textAlign="center" {...mono} fontSize={9} color={DAWN.ink}>THE BACK COVER</Text>
    </YStack>
  );
}

// a layer book's palette: its page and boards, its ink, and the colour its own marks (and links) are in
export type LayerPalette = { page: string; boards: string; ink: string; faint: string; edge: string; mark: string; lit: string };

export function EudaimonBook({ b }: { b: EudaimonT }) {
  const breath = useBreath();
  return <LayerPages b={b} P={{ ...DAWN, mark: DAWN.gold }} green={breath.green} id="eudaimon" cover={<Cover b={b} glow={breath.glow} />}
                     under={<Listen which="eudaimon" warning={b.sections?.[0]?.entries?.[0]?.paragraphs.map((p) => p.text).join(" ")} />} picture={(e, scale) => <Picture e={e} scale={scale} />} />;
}

// the open book the dawn half and the mended book share (C-299): its cover, what goes under it, its contents, then each
// entry -- its picture, its words; an inscription in the tablet's green, sayable on its own; the observer's line set apart
export function LayerPages({ b, P, green, id, cover, under, picture, rule }: {
  b: EudaimonT; P: LayerPalette; green: string; id: string; cover: ReactNode; under?: ReactNode;
  picture: (e: Entry, scale: number) => ReactNode; rule?: (label: string) => ReactNode }) {
  const flat = (b.sections ?? []).flatMap((sec) => sec.entries.map((e) => ({ sec, e })));
  const [at, setTo] = useState<number | null>(null);
  const [w, setW] = useState(0);
  const setAt = (to: number | null) => { setTo(to); SCREEN.scroller?.scrollTo?.({ y: 0, animated: false }); };
  const wide = w >= 560;
  if (at !== null && flat[at]) {
    const { sec, e } = flat[at];
    const turn = (label: string, to: number | null) => (
      <Text {...mono} fontSize={12} color={to === null ? P.edge : P.mark} cursor={to === null ? "default" : "pointer"} role="button"
            onPress={() => to !== null && setAt(to)}>{label}</Text>
    );
    return (
      <YStack onLayout={(ev) => setW(ev.nativeEvent.layout.width)} backgroundColor={P.page} borderColor={P.edge} borderWidth={1}
              borderRadius={4} padding={18} gap={12}>
        <Text {...mono} fontSize={11} color={P.faint}>{`${sec.label} · ${sec.heading.toUpperCase()}`}</Text>
        <XStack gap={18} flexDirection={wide ? "row" : "column"} alignItems={wide ? "flex-start" : "center"}>
          <YStack alignItems="center" gap={6} width={wide ? 94 * 3 : undefined}>
            <YStack backgroundColor={P.boards} padding={8} borderRadius={3}>{picture(e, wide ? 3 : 2)}</YStack>
            {e.caption ? <Text fontSize={12} lineHeight={17} color={P.faint} textAlign="center">{e.caption}</Text> : null}
          </YStack>
          <YStack width={wide ? Math.max(0, w - 2 * 18 - 94 * 3 - 18) : "100%"} gap={10}>
            <Text fontSize={20} lineHeight={27} fontWeight="700" color={P.ink}>{e.title}</Text>
            <YStack height={2} backgroundColor={P.lit} width={48} />
            <ReadAloud id={`${id}-${at}`} paragraphs={[e.title, ...e.paragraphs.map((p) => p.text)]} ink={P.mark} />
            {e.paragraphs.map((p, i) => p.voice === "inscription" ? (
              <YStack key={i} gap={2} borderLeftWidth={2} borderColor={EMERALD.hue} paddingLeft={10}>
                <Text fontSize={17} lineHeight={26} fontWeight="600" color={green}>{p.text}</Text>
                <ReadAloud id={`${id}-${at}-${i}`} paragraphs={[p.text]} ink={EMERALD.hue} label="Say it" />
              </YStack>
            ) : p.voice === "observer" ? (                           // read by someone: the lead daemon's own wording
              <YStack key={i} gap={2} backgroundColor={P.boards} borderRadius={3} padding={10}>
                <Text fontSize={16} lineHeight={25} fontStyle="italic" color={P.ink}>{p.text}</Text>
              </YStack>
            ) : (
              <Text key={i} fontSize={16} lineHeight={25} color={p.voice === "asking" ? P.faint : P.ink}
                    fontStyle={p.voice === "asking" ? "italic" : "normal"}>{p.text}</Text>
            ))}
          </YStack>
        </XStack>
        <XStack justifyContent="space-between" marginTop={8} paddingTop={12} borderTopWidth={1} borderColor={P.edge}>
          {turn("‹ BACK", at > 0 ? at - 1 : null)}
          <Text {...mono} fontSize={12} color={P.mark} cursor="pointer" role="button" onPress={() => setAt(null)}>CONTENTS</Text>
          {turn("NEXT ›", at < flat.length - 1 ? at + 1 : null)}
        </XStack>
        <Text {...mono} fontSize={10} color={P.faint} textAlign="center">{`${at + 1} / ${flat.length}${b.draft ? " · DRAFT" : ""}`}</Text>
      </YStack>
    );
  }
  let n = 0;
  return (
    <YStack backgroundColor={P.boards} borderRadius={4} padding={14} gap={14}>
      {cover}
      {under}
      <YStack backgroundColor={P.page} borderColor={P.edge} borderWidth={1} borderRadius={4} padding={16} gap={4}>
        <Text {...mono} fontSize={12} color={P.mark}>CONTENTS</Text>
        {(b.sections ?? []).length === 0 ? <Small color={P.faint}>Its pages are still being written. DRAFT</Small> : null}
        {(b.sections ?? []).map((sec) => (
          <YStack key={sec.label} marginTop={10} gap={2}>
            <Text {...mono} fontSize={10} color={P.faint}>{sec.label}</Text>
            <Text fontSize={15} fontWeight="700" color={P.ink} marginBottom={4}>{sec.heading}</Text>
            {rule?.(sec.label)}
            {sec.entries.map((e) => {
              const i = n++;
              return (
                <XStack key={`${e.short}${i}`} gap={10} paddingVertical={6} borderTopWidth={1} borderColor={P.edge} cursor="pointer" role="button"
                        onPress={() => setAt(i)}>
                  <Text {...mono} fontSize={12} color={P.mark} flex={1}>{e.short}</Text>
                  <Text fontSize={14} color={P.faint}>›</Text>
                </XStack>
              );
            })}
          </YStack>
        ))}
        {b.draft ? <Text {...mono} fontSize={10} color={P.faint} marginTop={10}>DRAFT</Text> : null}
      </YStack>
    </YStack>
  );
}
