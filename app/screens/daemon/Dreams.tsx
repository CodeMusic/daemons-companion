// C-200 (the user, 2026-10-28: "sleep tracking ... it should be creative relating to daemons and dreams"): the dream
// journal -- every night a watch told the companion, the newest first: the dream the daemon had (the hub's telling when
// it wrote one, otherwise the companion's own words), how long and how still the night was, and whether it was tucked in.
import { useEffect, useState } from "react";
import { Button, Text, XStack, YStack } from "tamagui";
import { api } from "../../platform/net";
import { Action, Card, Eyebrow, Small, whenSaid } from "../../ui/ui";
import { VoiceButton } from "../../ui/voiceButton";
import { SleepSoundsCard } from "./SleepSounds";   // C-334
import { useFresh } from "../../platform/useApi";   // C-344

type Dream = { id: number; at: string; to: string; hours: number; stirs: number; tucked: boolean;
               quality: "vivid" | "quiet" | "broken"; text: string; by: "module" | "words"; nickname: string;
               title?: string; left?: string; right?: string };   // C-308
const NIGHT = { vivid: "A deep night", quiet: "A quiet night", broken: "A restless night" };   // DRAFT

// C-308 (the user, 2026-11-08): a dream made of two tellings is read through two lenses -- red the one told in order,
// blue the one told all at once, and both lit, purple, the dream they made together (the hub's dreams.ts dreamTwice).
// Both lit to begin with; a lit lens tapped goes out and leaves the other; the last lit one stays. Words DRAFT.
const LENS = { left: { ink: "#C2413A", word: "REASON" }, right: { ink: "#3A6FC8", word: "INSTINCT" }, both: { ink: "#7E4FC4", word: "WHOLE" } };
type Lit = { left: boolean; right: boolean };
function LensKey({ side, lit, onPress }: { side: "left" | "right"; lit: boolean; onPress: () => void }) {
  const l = LENS[side];
  return (
    <Button size="$2" borderRadius={12} paddingHorizontal={12} borderWidth={1.5} borderColor={l.ink}
            backgroundColor={lit ? l.ink : "transparent"} hoverStyle={{ backgroundColor: lit ? l.ink : "transparent", borderColor: l.ink, opacity: 0.9 }}
            focusStyle={{ backgroundColor: lit ? l.ink : "transparent", borderColor: l.ink }}
            pressStyle={{ backgroundColor: lit ? l.ink : "transparent", borderColor: l.ink, opacity: 0.8 }} onPress={onPress}
            accessibilityRole="switch" accessibilityState={{ checked: lit }} accessibilityLabel={`${l.word} lens`}>
      <Text fontFamily="$mono" fontSize={11} letterSpacing={1} fontWeight="700" color={lit ? "white" : l.ink}>{l.word}</Text>
    </Button>
  );
}
function shown(d: Dream, lit: Lit) {
  if (!d.left || !d.right) return { text: d.text, ink: null as string | null };
  if (lit.left && lit.right) return { text: d.text, ink: LENS.both.ink };
  return lit.left ? { text: d.left, ink: LENS.left.ink } : { text: d.right, ink: LENS.right.ink };
}

export function DreamsScreen({ ink }: { ink?: string }) {
  const [dreams, setDreams] = useState<Dream[] | null>(null);
  const [error, setError] = useState("");
  const [shared, setShared] = useState<Record<number, string>>({});   // C-223: what SHARE said, per dream
  const [lenses, setLenses] = useState<Record<number, Lit>>({});        // C-308: each dream's lenses, both lit to begin
  const litOf = (id: number): Lit => lenses[id] ?? { left: true, right: true };
  const tap = (id: number, side: "left" | "right") => setLenses((x) => {
    const was = x[id] ?? { left: true, right: true }, next = { ...was, [side]: !was[side] };
    return next.left || next.right ? { ...x, [id]: next } : x;          // the last lit lens stays lit
  });
  const share = async (d: Dream) => {
    try { await api("/api/trade/share", { id: d.id }); setShared((x) => ({ ...x, [d.id]: "Shared with the players at home." })); }
    catch (e) { setShared((x) => ({ ...x, [d.id]: (e as Error).message })); }
  };
  const fresh = useFresh();   // C-344: a fresher answer read again in place
  useEffect(() => { api<{ dreams: Dream[] }>("/api/dreams").then((r) => setDreams(r.dreams)).catch((e) => setError(e.message)); }, [fresh]);
  if (error) return <YStack gap={12}><SleepSoundsCard ink={ink} /><Small color="$color8">{error}</Small></YStack>;
  if (!dreams) return <SleepSoundsCard ink={ink} />;
  return (
    <YStack gap={12}>
      <SleepSoundsCard ink={ink} />
      <Small>{"What the daemon dreamt, each night it slept -- tucked in on the watch, the phone or the widget.  DRAFT"}</Small>
      {dreams.length ? dreams.map((d) => { const lit = litOf(d.id), view = shown(d, lit); return (
        <Card key={d.id}>
          <Eyebrow>{`${NIGHT[d.quality].toUpperCase()} · ${d.hours} HOURS${d.tucked ? " · TUCKED IN" : ""}`}</Eyebrow>
          {d.title ? <Text fontFamily="$mono" fontSize={14} letterSpacing={1.5} fontWeight="700" color={view.ink ?? "$color12"}>{d.title}</Text> : null}
          {view.ink ? (
            <XStack gap={8} alignItems="center">
              <LensKey side="left" lit={lit.left} onPress={() => tap(d.id, "left")} />
              <LensKey side="right" lit={lit.right} onPress={() => tap(d.id, "right")} />
              {lit.left && lit.right ? <Small color={LENS.both.ink}>{LENS.both.word}</Small> : null}
            </XStack>
          ) : null}
          <Text fontSize={15} color="$color12" borderLeftWidth={view.ink ? 3 : 0} borderColor={view.ink ?? undefined}
                paddingLeft={view.ink ? 10 : 0}>{view.text}</Text>
          <Small color="$color10">{`${d.nickname || "Your daemon"}, woke ${whenSaid(d.to)}`}</Small>
          <XStack gap={8} flexWrap="wrap">
            {/* the user, 2026-10-28: a dream read aloud, in the INDEX voice -- 2026-11-07: made in the background, and kept */}
            <VoiceButton text={view.text} ink={ink} voice="daemon" />
            <Action label="SHARE" onPress={() => share(d)} ink={ink} />
          </XStack>
          {shared[d.id] ? <Small>{shared[d.id]}</Small> : null}
        </Card>
      ); }) : <Card><Small>{"No dreams yet. Wear the watch to bed, or tuck the daemon in with SLEEP, and its dream is here in the morning.  DRAFT"}</Small></Card>}
    </YStack>
  );
}
