// LIBRARY > THE HERMETIC LAYER (C-238, the user, 2026-10-29): the third book -- SPELLCRAFT. The same open book as THE
// SUBTLE LAYER (contents, then each entry: its picture, its words), but not from the ordinary world: the page breathes
// red<->blue through purple (C-237, witching.ts PULSE) and its inscriptions -- the paragraphs the game prints in the
// tablet's emerald -- glow, each one sayable on its own (a spell read aloud), as is the whole entry. Its cards (C-239)
// open it. Held once the save holds it, or once the hour's first sight was acknowledged here (GET /api/hermetic).
// Every word DRAFT.
import { useEffect, useState } from "react";
import { Button, Text, XStack, YStack } from "tamagui";
import { EMERALD, pulseNow } from "../../server/src/witching";
import { SCREEN } from "../data";
import { api } from "../net";
import { Art, Small } from "../ui";
import { ReadAloud } from "../readAloud";   // C-208
import { Cards } from "./Arcana";   // C-239: ?deck=spellcraft

type Para = { text: string; voice: "telling" | "asking" | "inscription" };
type Entry = { short: string; title: string; picture: string; caption: string; frames?: number; paragraphs: Para[] };
export type HermeticT = { held: boolean; how?: string; title?: string; subtitle?: string; draft?: boolean;
                          sections?: { label: string; heading: string; entries: Entry[] }[] };
const C = { ink: "#f2ecf4", faint: "#a796ac", edge: "#4a3352" };
const mono = { fontFamily: "$mono" as const, letterSpacing: 2 };

// the breath, and an inscription's glow (emerald brightening and dimming on the same eight seconds)
function useBreath() {
  const [, setF] = useState(0);
  useEffect(() => { const t = setInterval(() => setF((x) => x + 1), 250); return () => clearInterval(t); }, []);
  const ms = Date.now() % 8000, s = (1 - Math.cos((2 * Math.PI * ms) / 8000)) / 2;
  return { page: pulseNow(0.16), boards: pulseNow(0.09), glow: s > 0.5 ? EMERALD.lit : "#3FB06C" };
}

// its picture: until the game's own are drawn and exported (data/art/hermetic/<picture>_0.png), the deck's face stands in
function Picture({ e, scale }: { e: Entry; scale: number }) {
  return <Art key={e.picture} path="/art/arcana/spellcraft.png" size={94 * scale} height={84 * scale} fit="contain" />;
}

export function HermeticBook({ b }: { b: HermeticT }) {
  const breath = useBreath();
  const flat = (b.sections ?? []).flatMap((sec) => sec.entries.map((e) => ({ sec, e })));
  const [at, setTo] = useState<number | null>(null);
  const [w, setW] = useState(0);
  const setAt = (to: number | null) => { setTo(to); SCREEN.scroller?.scrollTo?.({ y: 0, animated: false }); };
  const wide = w >= 560;
  if (at !== null && flat[at]) {
    const { sec, e } = flat[at];
    const turn = (label: string, to: number | null) => (
      <Text {...mono} fontSize={12} color={to === null ? C.edge : EMERALD.lit} cursor={to === null ? "default" : "pointer"} role="button"
            onPress={() => to !== null && setAt(to)}>{label}</Text>
    );
    return (
      <YStack onLayout={(ev) => setW(ev.nativeEvent.layout.width)} backgroundColor={breath.page} borderColor={EMERALD.hue} borderWidth={1}
              borderRadius={4} padding={18} gap={12}>
        <Text {...mono} fontSize={11} color={C.faint}>{`${sec.label} · ${sec.heading.toUpperCase()}`}</Text>
        <XStack gap={18} flexDirection={wide ? "row" : "column"} alignItems={wide ? "flex-start" : "center"}>
          <YStack alignItems="center" gap={6} width={wide ? 94 * 3 : undefined}>
            <YStack backgroundColor={breath.boards} padding={8} borderRadius={3}><Picture e={e} scale={wide ? 3 : 2} /></YStack>
            {e.caption ? <Text fontSize={12} lineHeight={17} color={C.faint} textAlign="center">{e.caption}</Text> : null}
          </YStack>
          <YStack width={wide ? Math.max(0, w - 2 * 18 - 94 * 3 - 18) : "100%"} gap={10}>
            <Text fontSize={20} lineHeight={27} fontWeight="700" color={C.ink}>{e.title}</Text>
            <YStack height={2} backgroundColor={EMERALD.lit} width={48} />
            <ReadAloud id={`hermetic-${at}`} paragraphs={[e.title, ...e.paragraphs.map((p) => p.text)]} ink={EMERALD.lit} />
            {e.paragraphs.map((p, i) => p.voice === "inscription" ? (
              <YStack key={i} gap={2} borderLeftWidth={2} borderColor={EMERALD.hue} paddingLeft={10}>
                <Text fontSize={17} lineHeight={26} fontWeight="600" color={breath.glow}>{p.text}</Text>
                <ReadAloud id={`hermetic-${at}-${i}`} paragraphs={[p.text]} ink={EMERALD.lit} label="Say it" />
              </YStack>
            ) : (
              <Text key={i} fontSize={16} lineHeight={25} color={p.voice === "asking" ? C.faint : C.ink}
                    fontStyle={p.voice === "asking" ? "italic" : "normal"}>{p.text}</Text>
            ))}
          </YStack>
        </XStack>
        <XStack justifyContent="space-between" marginTop={8} paddingTop={12} borderTopWidth={1} borderColor={EMERALD.hue}>
          {turn("‹ BACK", at > 0 ? at - 1 : null)}
          <Text {...mono} fontSize={12} color={EMERALD.lit} cursor="pointer" role="button" onPress={() => setAt(null)}>CONTENTS</Text>
          {turn("NEXT ›", at < flat.length - 1 ? at + 1 : null)}
        </XStack>
        <Text {...mono} fontSize={10} color={C.faint} textAlign="center">{`${at + 1} / ${flat.length}${b.draft ? " · DRAFT" : ""}`}</Text>
      </YStack>
    );
  }
  let n = 0;
  return (
    <YStack backgroundColor={breath.boards} borderRadius={4} padding={14} gap={14}>
      {/* the cover: the deck's own face, the title over it in our type */}
      <YStack width={240} height={400} alignSelf="center" position="relative">
        <Art path="/art/arcana/spellcraft.png" size={240} height={400} />
        <Text position="absolute" top={36} left={0} right={0} textAlign="center" {...mono} letterSpacing={1} fontSize={16} fontWeight="800"
              color={breath.glow}>{b.title ?? "THE HERMETIC LAYER"}</Text>
        <Text position="absolute" top={60} left={0} right={0} textAlign="center" fontSize={12} fontStyle="italic" color={C.ink}>{b.subtitle ?? ""}</Text>
        <Text position="absolute" bottom={92} left={16} right={16} textAlign="center" {...mono} fontSize={11} color={C.ink}>AS ABOVE, SO BELOW</Text>
      </YStack>
      <Cards deck="spellcraft" />
      <YStack backgroundColor={breath.page} borderColor={EMERALD.hue} borderWidth={1} borderRadius={4} padding={16} gap={4}>
        <Text {...mono} fontSize={12} color={EMERALD.lit}>CONTENTS</Text>
        {(b.sections ?? []).length === 0 ? <Small color={C.faint}>Its pages are still being written. DRAFT</Small> : null}
        {(b.sections ?? []).map((sec) => (
          <YStack key={sec.label} marginTop={10} gap={2}>
            <Text {...mono} fontSize={10} color={C.faint}>{sec.label}</Text>
            <Text fontSize={15} fontWeight="700" color={C.ink} marginBottom={4}>{sec.heading}</Text>
            {sec.entries.map((e) => {
              const i = n++;
              return (
                <XStack key={`${e.short}${i}`} gap={10} paddingVertical={6} borderTopWidth={1} borderColor={EMERALD.hue} cursor="pointer" role="button"
                        onPress={() => setAt(i)}>
                  <Text {...mono} fontSize={12} color={EMERALD.lit} flex={1}>{e.short}</Text>
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

// the hour's first sight (C-238): what is happening, and the way in -- shown where the shimmer is, until it is said
export function FirstSight({ onHeld }: { onHeld?: () => void }) {
  const breath = useBreath();
  const [m, setM] = useState<{ title: string; lines: string[]; ack: string } | null>(null);
  const [done, setDone] = useState("");
  useEffect(() => { api<{ message: typeof m }>("/api/hermetic/first").then((r) => setM(r.message)).catch(() => {}); }, []);
  if (!m) return null;
  const ack = async () => {
    try { await api("/api/hermetic/ack", {}); setDone("SPELLCRAFT is yours. THE HERMETIC LAYER is in the LIBRARY."); onHeld?.(); }   // DRAFT
    catch (e) { setDone((e as Error).message); }
  };
  return (
    <YStack gap={8} padding={14} borderRadius={10} borderWidth={1} borderColor={EMERALD.hue} backgroundColor={breath.page} marginTop={8}>
      <Text {...mono} fontSize={13} fontWeight="800" color={breath.glow}>{m.title}</Text>
      {m.lines.map((l, i) => <Text key={i} fontSize={15} lineHeight={22} color={C.ink}>{l}</Text>)}
      {done ? <Small color={EMERALD.lit}>{done}</Small> : (
        <Button size="$3" alignSelf="flex-start" onPress={ack} backgroundColor={EMERALD.hue}>
          <Text {...mono} fontSize={12} color="#ffffff">{m.ack ?? "SO MOTE IT BE"}</Text>
        </Button>
      )}
    </YStack>
  );
}
