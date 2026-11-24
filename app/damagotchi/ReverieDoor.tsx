// C-550 (the user, 2026-11-24: "REVERIE should start with a question before it, one shows your monkey sprite and below
// some overlayed randomly selected daemon sprites ... the options will not have labels, if u select the monkey (your own
// avatar) you see the 4. SLEEP, MEDITATION, NATURE and TINCTURES, otherwise ... TINCTURE would become DEV CONSOLE, SLEEP
// would become SUSPEND ... when u hover over an item u will see a phrase that gives context about the reverie"; by
// multiple choice, MEDITATION is DEFRAG and NATURE is SANDBOX for a daemon): REVERIE's door. First, with no words, you or
// your daemons; then the four kinds of that side, each with its phrase on a hover (a long press on the phone). A
// daemon's four play its own drifts (a machine's voice, C-553), or yours of the same kind where it has none. Every word DRAFT.
import { useMemo, useState } from "react";
import { Image, Pressable, View } from "react-native";
import { Text, XStack, YStack } from "tamagui";
import { PLAYER_ART } from "../state/data";
import { Art, Small } from "../shared/ui/ui";

export type Side = "you" | "daemon";
export type Kind = "sleep" | "meditation" | "nature" | "tinctures";
const KINDS: Kind[] = ["sleep", "meditation", "nature", "tinctures"];
// each side's name for a kind, and the phrase a hover shows
const NAMES: Record<Side, Record<Kind, [string, string]>> = {
  you: {
    sleep: ["SLEEP", "Down toward sleep, the beat slowing as you go."],
    meditation: ["MEDITATION", "Into stillness: awake, and turned inward."],
    nature: ["NATURE", "Into a place: rain, wind, a tide, a forest at dusk."],
    tinctures: ["TINCTURES", "A state taken on for a while, each named for how it feels."],
  },
  daemon: {
    sleep: ["SUSPEND", "Its state held while it rests: everything kept, nothing running."],
    meditation: ["DEFRAG", "Its scattered pieces gathered quietly back into order."],
    nature: ["SANDBOX", "An open world to wander in, safe to break."],
    tinctures: ["DEV CONSOLE", "Its own settings changed by hand, for a while."],
  },
};
const SIDE_PHRASE: Record<Side, string> = {
  you: "For you: sleep, stillness, a place, or a state taken on.",
  daemon: "For a daemon: the same paths, walked the way a machine walks them.",
};
export const KIND_COLOUR: Record<Kind, string> = { sleep: "#6a72ff", meditation: "#27b3a0", nature: "#58b04a", tinctures: "#e3a12f" };   // the spirals' (C-555)
export const kindName = (side: Side, kind: Kind) => NAMES[side][kind][0];

type PartyDaemon = { slot: number };

export function ReverieDoor({ side, kind, choice, party, onSide, onKind }:
  { side: Side | null; kind: Kind | null; choice: "REASON" | "INSTINCT"; party: PartyDaemon[];
    onSide: (s: Side | null) => void; onKind: (k: Kind | null) => void }) {
  const [phrase, setPhrase] = useState("");
  const few = useMemo(() => [...party].sort(() => Math.random() - 0.5).slice(0, 3), [party]);   // a few, at random, each visit
  const tell = (p: string) => ({ onHoverIn: () => setPhrase(p), onHoverOut: () => setPhrase(""), onLongPress: () => setPhrase(p) });

  if (!side) return (
    <YStack alignItems="center" gap={6} marginTop={6}>
      <Pressable accessibilityRole="button" accessibilityLabel={SIDE_PHRASE.you} onPress={() => { setPhrase(""); onSide("you"); }} {...tell(SIDE_PHRASE.you)}>
        <Image source={PLAYER_ART[choice].card} style={{ width: 88, height: 88 }} resizeMode="contain" />
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={SIDE_PHRASE.daemon} onPress={() => { setPhrase(""); onSide("daemon"); }} {...tell(SIDE_PHRASE.daemon)}>
        <View style={{ width: 150, height: 84 }}>
          {few.map((d, i) => (                              // overlaid, each a little further on and higher
            <View key={d.slot} style={{ position: "absolute", left: i * 38, top: (i % 2) * -8 + 8 }}>
              <Art path={`/art/party/${d.slot}.png`} size={72} />
            </View>
          ))}
        </View>
      </Pressable>
      <Small color="$color10">{phrase || " "}</Small>
    </YStack>
  );

  return (
    <YStack gap={6} marginTop={6}>
      <XStack gap={6} flexWrap="wrap">
        {KINDS.map((k) => {
          const [name, p] = NAMES[side][k];
          return (
            <Pressable key={k} accessibilityRole="button" accessibilityLabel={`${name}: ${p}`} onPress={() => onKind(kind === k ? null : k)} {...tell(p)}>
              <XStack alignItems="center" gap={6} paddingHorizontal={10} paddingVertical={6} borderRadius={6} borderWidth={1}
                      borderColor={kind === k ? KIND_COLOUR[k] : "$color6"} backgroundColor={kind === k ? "$color4" : "transparent"}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: KIND_COLOUR[k] }} />
                <Text fontFamily="$mono" fontSize={12} letterSpacing={1.5} fontWeight="700" color="$color12">{name}</Text>
              </XStack>
            </Pressable>
          );
        })}
      </XStack>
      <Small color="$color10">{phrase || (kind ? NAMES[side][kind][1] : " ")}</Small>
      <Text fontFamily="$mono" fontSize={12} letterSpacing={1.5} color="$color10" cursor="pointer" role="link"
            onPress={() => { onKind(null); onSide(null); setPhrase(""); }}>{"‹ BACK"}</Text>
    </YStack>
  );
}
