// LIBRARY > THE SUBTLE LAYER (T-423, the user, 2026-10-18): a trainer's handbook, in the game and here, once the save holds
// it (GET /api/subtle, as the GUIDE is). An open book, as the user chose for the game: the contents first, then each entry
// with its picture on the left and its words on the right (one above the other on a narrow screen); in TWO VOICES the
// "asking" voice is printed faint, each voice on its own line. The pictures are the game's own (data/art/subtle_*.png, a
// few turning, a frame every 0.7 s); the cover carries no lettering (the game's font is Nintendo's), so its title is set
// here in our own type. Every word DRAFT.
import { useEffect, useState } from "react";
import { Text, XStack, YStack } from "tamagui";
import { SCREEN } from "../data";
import { Art } from "../ui";
import { ReadAloud } from "../readAloud";   // C-208
import { AskSubtle, TodaysQuestion } from "./AskSubtle";   // C-229, C-230
import { Cards } from "./Arcana";   // C-232

type Para = { text: string; voice: "telling" | "asking" };
type Entry = { short: string; title: string; picture: string; caption: string; frames?: number; paragraphs: Para[] };
export type SubtleT = { held: boolean; title?: string; subtitle?: string; draft?: boolean; sections?: { label: string; heading: string; entries: Entry[] }[] };

const C = { boards: "#1b0f1f", page: "#2c1c32", edge: "#4a3352", ink: "#f0e6f2", faint: "#9a86a0", pink: "#e07ad0" };
const mono = { fontFamily: "$mono" as const, letterSpacing: 2 };

// a picture at a whole multiple, its frames turning as the game turns them
function Picture({ e, scale }: { e: Entry; scale: number }) {
  const [f, setF] = useState(0), n = Math.max(1, e.frames ?? 1);
  useEffect(() => {
    if (n < 2) return;
    const t = setInterval(() => setF((x) => (x + 1) % n), 700);
    return () => clearInterval(t);
  }, [n]);
  return <Art path={`/art/subtle/${e.picture}_${n > 1 ? f : 0}.png`} size={94 * scale} height={84 * scale} fit="contain" />;
}

export function SubtleBook({ b }: { b: SubtleT }) {
  const flat = (b.sections ?? []).flatMap((sec) => sec.entries.map((e) => ({ sec, e })));
  const [at, setTo] = useState<number | null>(null);
  const [w, setW] = useState(0);
  const setAt = (to: number | null) => { setTo(to); SCREEN.scroller?.scrollTo?.({ y: 0, animated: false }); };
  const wide = w >= 560;
  if (at !== null && flat[at]) {
    const { sec, e } = flat[at];
    const turn = (label: string, to: number | null) => (
      <Text {...mono} fontSize={12} color={to === null ? C.edge : C.pink} cursor={to === null ? "default" : "pointer"} role="button"
            onPress={() => to !== null && setAt(to)}>{label}</Text>
    );
    return (
      <YStack onLayout={(ev) => setW(ev.nativeEvent.layout.width)} backgroundColor={C.page} borderColor={C.edge} borderWidth={1}
              borderRadius={4} padding={18} gap={12}>
        <Text {...mono} fontSize={11} color={C.faint}>{sec.label.toUpperCase() === sec.heading.toUpperCase() ? sec.label : `${sec.label} · ${sec.heading.toUpperCase()}`}</Text>
        <XStack gap={18} flexDirection={wide ? "row" : "column"} alignItems={wide ? "flex-start" : "center"}>
          {/* the left page: the picture, and its caption */}
          <YStack alignItems="center" gap={6} width={wide ? 94 * 3 : undefined}>
            <YStack backgroundColor={C.boards} padding={8} borderRadius={3}><Picture e={e} scale={wide ? 3 : 2} /></YStack>
            {e.caption ? <Text fontSize={12} lineHeight={17} color={C.faint} textAlign="center">{e.caption}</Text> : null}
          </YStack>
          {/* the right page: the words, the asking voice faint */}
          {/* the right page: as wide as the card leaves beside the picture, in points (a flexed width ran off on the iPad) */}
          <YStack width={wide ? Math.max(0, w - 2 * 18 - 94 * 3 - 18) : "100%"} gap={10}>
            <Text fontSize={20} lineHeight={27} fontWeight="700" color={C.ink}>{e.title}</Text>
            <YStack height={2} backgroundColor={C.pink} width={48} />
            <ReadAloud id={`subtle-${at}`} paragraphs={[e.title, ...e.paragraphs.map((p) => p.text)]} ink={C.pink} />
            {e.paragraphs.map((p, i) => (
              <Text key={i} fontSize={16} lineHeight={25} color={p.voice === "asking" ? C.faint : C.ink}
                    fontStyle={p.voice === "asking" ? "italic" : "normal"}>{p.text}</Text>
            ))}
          </YStack>
        </XStack>
        <XStack justifyContent="space-between" marginTop={8} paddingTop={12} borderTopWidth={1} borderColor={C.edge}>
          {turn("‹ BACK", at > 0 ? at - 1 : null)}
          <Text {...mono} fontSize={12} color={C.pink} cursor="pointer" role="button" onPress={() => setAt(null)}>CONTENTS</Text>
          {turn("NEXT ›", at < flat.length - 1 ? at + 1 : null)}
        </XStack>
        <Text {...mono} fontSize={10} color={C.faint} textAlign="center">{`${at + 1} / ${flat.length}${b.draft ? " · DRAFT" : ""}`}</Text>
      </YStack>
    );
  }
  let n = 0;
  return (
    <YStack backgroundColor={C.boards} borderRadius={4} padding={14} gap={14}>
      {/* the cover, cut from the game's 240x160 screen (the book, x 54..185), its title in our own type over its top band,
          a little below the border (the user, 2026-10-19) */}
      <YStack width={132 * 2} height={160 * 2} overflow="hidden" alignSelf="center" borderRadius={2} position="relative">
        <YStack marginLeft={-54 * 2}><Art path="/art/subtle/cover.png" size={240 * 2} height={160 * 2} /></YStack>
        <Text allowFontScaling={false} position="absolute" top={12 * 2} left={0} right={0} textAlign="center" {...mono} letterSpacing={1} fontSize={14} fontWeight="800"
              color={C.ink}>{b.title ?? "THE SUBTLE LAYER"}</Text>
        <Text allowFontScaling={false} position="absolute" top={25 * 2} left={0} right={0} textAlign="center" fontSize={11} fontStyle="italic" color={C.faint}>
          {b.subtitle ?? ""}</Text>
      </YStack>
      <Cards />
      <TodaysQuestion />
      <AskSubtle />
      <YStack backgroundColor={C.page} borderColor={C.edge} borderWidth={1} borderRadius={4} padding={16} gap={4}>
        <Text {...mono} fontSize={12} color={C.pink}>CONTENTS</Text>
        {(b.sections ?? []).map((sec) => (
          <YStack key={sec.label} marginTop={10} gap={2}>
            <Text {...mono} fontSize={10} color={C.faint}>{sec.label}</Text>
            <Text fontSize={15} fontWeight="700" color={C.ink} marginBottom={4}>{sec.heading}</Text>
            {sec.entries.map((e) => {
              const i = n++;
              return (
                <XStack key={`${e.short}${i}`} gap={10} paddingVertical={6} borderTopWidth={1} borderColor={C.edge} cursor="pointer" role="button"
                        onPress={() => setAt(i)}>
                  <Text {...mono} fontSize={12} color={C.pink} flex={1}>{e.short}</Text>
                  <Text fontSize={14} color={C.faint}>›</Text>
                </XStack>
              );
            })}
          </YStack>
        ))}
        {b.draft ? <Text {...mono} fontSize={10} color={C.faint} marginTop={10}>DRAFT</Text> : null}
      </YStack>
    </YStack>
  );
}
