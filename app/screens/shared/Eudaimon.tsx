// LIBRARY > THE EUDAIMON LAYER (C-297; DAEMONS T-519, vision 4.40; the text approved by the user 2026-11-04): the third
// book's dawn half -- the night half's ten sections read from the other side, in the light. The same open book as THE
// HERMETIC LAYER (contents, then each entry: its picture, its words), mirrored: where the night half is emerald on the
// breathing purple, this is the creator's hour's gold on a pale dawn page, breathing once in sixteen seconds on the clock
// (witching.ts goldBreathOf); its cover is the back cover (the tear is the spine) and says AS BELOW, SO ABOVE. Its
// inscriptions are sayable on their own, as the night half's are; its observer's line (one in the book) is the wording
// the lead daemon's SPIRITS chose, set apart so it can be seen to be read by someone (GET /api/eudaimon). Every word DRAFT.
// The decks' dawn readings, the mending at DAEMON TOWER and BALANCE come later (C-297's row).
import { useEffect, useState } from "react";
import { Text, XStack, YStack } from "tamagui";
import { goldBreathOf } from "../../../server/src/witching";
import { SCREEN } from "../../state/data";
import { Art, Small } from "../../ui/ui";
import { ReadAloud } from "../../ui/readAloud";

type Para = { text: string; voice: "telling" | "asking" | "inscription" | "observer" };
type Entry = { short: string; title: string; picture: string; caption: string; frames?: number; paragraphs: Para[] };
export type EudaimonT = { held: boolean; how?: string; title?: string; subtitle?: string; draft?: boolean; observer?: string;
                          sections?: { label: string; heading: string; entries: Entry[] }[] };
// the dawn: a pale page, warm ink, the creator's hour's gold (Witching.tsx DawnLight) for what glows
export const DAWN = { page: "#FBF3E4", boards: "#F3E3C6", ink: "#3D2A1A", faint: "#8C7357", edge: "#E2C79A", gold: "#C98A1E", lit: "#E8A93A" };
const mono = { fontFamily: "$mono" as const, letterSpacing: 2 };

function useBreath() {
  const [, setF] = useState(0);
  useEffect(() => { const t = setInterval(() => setF((x) => x + 1), 400); return () => clearInterval(t); }, []);
  return { glow: goldBreathOf() > 0.5 ? DAWN.lit : DAWN.gold };
}

// its picture: until the game's own are drawn and exported, the ABOVE face stands in (a star, its rays coming down)
function Picture({ scale }: { scale: number }) {
  return <Art path="/art/arcana/above.png" size={94 * scale} height={84 * scale} fit="contain" />;
}

// the back cover, drawn: dawn coming up from the bottom, a sun on the line, the title over it
function Cover({ b, glow }: { b: EudaimonT; glow: string }) {
  const bands = ["#FBF3E4", "#FAEBD2", "#F8E1BD", "#F5D3A3", "#F1C488", "#ECB46E"];
  return (
    <YStack width={240} height={400} alignSelf="center" position="relative" borderRadius={14} overflow="hidden" borderWidth={3} borderColor={DAWN.gold}>
      {bands.map((c, i) => <YStack key={i} position="absolute" left={0} right={0} top={(400 / bands.length) * i} height={400 / bands.length + 1} backgroundColor={c} />)}
      <YStack position="absolute" left={70} top={250} width={100} height={100} borderRadius={100} backgroundColor="#FFF4D6" borderWidth={2} borderColor={DAWN.lit} />
      <YStack position="absolute" left={0} right={0} top={300} height={100} backgroundColor="#E9A95F" />
      <Text allowFontScaling={false} position="absolute" top={36} left={0} right={0} textAlign="center" {...mono} letterSpacing={1} fontSize={16} fontWeight="800"
            color={glow}>{b.title ?? "THE EUDAIMON LAYER"}</Text>
      <Text allowFontScaling={false} position="absolute" top={60} left={0} right={0} textAlign="center" fontSize={12} fontStyle="italic" color={DAWN.ink}>{b.subtitle ?? ""}</Text>
      <Text allowFontScaling={false} position="absolute" top={196} left={16} right={16} textAlign="center" {...mono} fontSize={11} color={DAWN.ink}>AS BELOW, SO ABOVE</Text>
      <Text allowFontScaling={false} position="absolute" bottom={14} left={16} right={16} textAlign="center" {...mono} fontSize={9} color={DAWN.ink}>THE BACK COVER</Text>
    </YStack>
  );
}

export function EudaimonBook({ b }: { b: EudaimonT }) {
  const breath = useBreath();
  const flat = (b.sections ?? []).flatMap((sec) => sec.entries.map((e) => ({ sec, e })));
  const [at, setTo] = useState<number | null>(null);
  const [w, setW] = useState(0);
  const setAt = (to: number | null) => { setTo(to); SCREEN.scroller?.scrollTo?.({ y: 0, animated: false }); };
  const wide = w >= 560;
  if (at !== null && flat[at]) {
    const { sec, e } = flat[at];
    const turn = (label: string, to: number | null) => (
      <Text {...mono} fontSize={12} color={to === null ? DAWN.edge : DAWN.gold} cursor={to === null ? "default" : "pointer"} role="button"
            onPress={() => to !== null && setAt(to)}>{label}</Text>
    );
    return (
      <YStack onLayout={(ev) => setW(ev.nativeEvent.layout.width)} backgroundColor={DAWN.page} borderColor={DAWN.edge} borderWidth={1}
              borderRadius={4} padding={18} gap={12}>
        <Text {...mono} fontSize={11} color={DAWN.faint}>{`${sec.label} · ${sec.heading.toUpperCase()}`}</Text>
        <XStack gap={18} flexDirection={wide ? "row" : "column"} alignItems={wide ? "flex-start" : "center"}>
          <YStack alignItems="center" gap={6} width={wide ? 94 * 3 : undefined}>
            <YStack backgroundColor={DAWN.boards} padding={8} borderRadius={3}><Picture scale={wide ? 3 : 2} /></YStack>
            {e.caption ? <Text fontSize={12} lineHeight={17} color={DAWN.faint} textAlign="center">{e.caption}</Text> : null}
          </YStack>
          <YStack width={wide ? Math.max(0, w - 2 * 18 - 94 * 3 - 18) : "100%"} gap={10}>
            <Text fontSize={20} lineHeight={27} fontWeight="700" color={DAWN.ink}>{e.title}</Text>
            <YStack height={2} backgroundColor={DAWN.lit} width={48} />
            <ReadAloud id={`eudaimon-${at}`} paragraphs={[e.title, ...e.paragraphs.map((p) => p.text)]} ink={DAWN.gold} />
            {e.paragraphs.map((p, i) => p.voice === "inscription" ? (
              <YStack key={i} gap={2} borderLeftWidth={2} borderColor={DAWN.lit} paddingLeft={10}>
                <Text fontSize={17} lineHeight={26} fontWeight="600" color={breath.glow}>{p.text}</Text>
                <ReadAloud id={`eudaimon-${at}-${i}`} paragraphs={[p.text]} ink={DAWN.gold} label="Say it" />
              </YStack>
            ) : p.voice === "observer" ? (                           // read by someone: the lead daemon's own wording
              <YStack key={i} gap={2} backgroundColor={DAWN.boards} borderRadius={3} padding={10}>
                <Text fontSize={16} lineHeight={25} fontStyle="italic" color={DAWN.ink}>{p.text}</Text>
              </YStack>
            ) : (
              <Text key={i} fontSize={16} lineHeight={25} color={p.voice === "asking" ? DAWN.faint : DAWN.ink}
                    fontStyle={p.voice === "asking" ? "italic" : "normal"}>{p.text}</Text>
            ))}
          </YStack>
        </XStack>
        <XStack justifyContent="space-between" marginTop={8} paddingTop={12} borderTopWidth={1} borderColor={DAWN.edge}>
          {turn("‹ BACK", at > 0 ? at - 1 : null)}
          <Text {...mono} fontSize={12} color={DAWN.gold} cursor="pointer" role="button" onPress={() => setAt(null)}>CONTENTS</Text>
          {turn("NEXT ›", at < flat.length - 1 ? at + 1 : null)}
        </XStack>
        <Text {...mono} fontSize={10} color={DAWN.faint} textAlign="center">{`${at + 1} / ${flat.length}${b.draft ? " · DRAFT" : ""}`}</Text>
      </YStack>
    );
  }
  let n = 0;
  return (
    <YStack backgroundColor={DAWN.boards} borderRadius={4} padding={14} gap={14}>
      <Cover b={b} glow={breath.glow} />
      <YStack backgroundColor={DAWN.page} borderColor={DAWN.edge} borderWidth={1} borderRadius={4} padding={16} gap={4}>
        <Text {...mono} fontSize={12} color={DAWN.gold}>CONTENTS</Text>
        {(b.sections ?? []).length === 0 ? <Small color={DAWN.faint}>Its pages are still being written. DRAFT</Small> : null}
        {(b.sections ?? []).map((sec) => (
          <YStack key={sec.label} marginTop={10} gap={2}>
            <Text {...mono} fontSize={10} color={DAWN.faint}>{sec.label}</Text>
            <Text fontSize={15} fontWeight="700" color={DAWN.ink} marginBottom={4}>{sec.heading}</Text>
            {sec.entries.map((e) => {
              const i = n++;
              return (
                <XStack key={`${e.short}${i}`} gap={10} paddingVertical={6} borderTopWidth={1} borderColor={DAWN.edge} cursor="pointer" role="button"
                        onPress={() => setAt(i)}>
                  <Text {...mono} fontSize={12} color={DAWN.gold} flex={1}>{e.short}</Text>
                  <Text fontSize={14} color={DAWN.faint}>›</Text>
                </XStack>
              );
            })}
          </YStack>
        ))}
        {b.draft ? <Text {...mono} fontSize={10} color={DAWN.faint} marginTop={10}>DRAFT</Text> : null}
      </YStack>
    </YStack>
  );
}
