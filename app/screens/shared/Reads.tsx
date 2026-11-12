// C-203: READS -- the companion's own log, as THE LOG is the game's: what the watches read and leant, and which landed.
// Nothing shows before the save holds THE SUBTLE LAYER. The purple marks a noticing, never a feeling; the companion
// counts and never vouches (DAEMONS T-459, 4.33). Every word DRAFT.
import { Text, YStack } from "tamagui";
import { useSubtleInk } from "../../state/look";
import { ReadHow, Reads } from "../../state/types";
import { Card, Eyebrow, Small, whenSaid } from "../../ui/ui";
import { useApi } from "../../platform/useApi";

// TRUE OR NOT and AT REST: each read kept "with the day and the centre, and whether it came calm or with argument" (DRAFT)
const howSaid = (x: ReadHow) => [x.day, x.centre && `the ${x.centre.toLowerCase()}`, x.calm === null ? null : x.calm ? "calm" : "with argument"]
  .filter(Boolean).join(" · ");
const MISREAD = "The information was accurate. The conclusion is the misread.";   // THE MISREAD, the book's own words

export function ReadsCard() {
  const [r] = useApi<Reads>("/api/reads");
  const ink = useSubtleInk();
  if (!r?.held) return null;
  return (
    <Card borderLeftWidth={6} borderLeftColor={ink}>
      <Eyebrow>READS</Eyebrow>
      <Text fontSize={15} lineHeight={22} color={ink}>{`Reads: ${r.reads.given} given, ${r.reads.landed} landed.`}</Text>
      <Text fontSize={15} lineHeight={22} color={ink}>{`Leans: ${r.leans.told} told, ${r.leans.landed} landed.`}</Text>
      {r.recent.length ? (
        <YStack gap={6} marginTop={6}>
          {r.recent.map((x, i) => (
            <YStack key={i}>
              <Text fontSize={15} lineHeight={21} color={ink}>{`A read: ${x.line}${x.landed ? " Landed." : ""}`}</Text>
              <Small color="$color9">{[whenSaid(x.at), howSaid(x)].filter(Boolean).join(" · ")}{x.open ? " · still open" : ""}</Small>
            </YStack>
          ))}
        </YStack>
      ) : <Small>None yet. Now and then a watch gives one: someone close by, rain, the night, a walk.</Small>}
      {r.recentLeans?.length ? (
        <YStack gap={6} marginTop={10}>
          {r.recentLeans.map((x, i) => (
            <YStack key={i}>
              <Text fontSize={15} lineHeight={21} color={ink}>{`A lean: ${x.line}${x.landed ? " Landed." : " A misread."}`}</Text>
              <Small color="$color9">{[whenSaid(x.at), howSaid(x)].filter(Boolean).join(" · ")}</Small>
            </YStack>
          ))}
          {r.recentLeans.some((x) => x.misread) ? <Small color="$color9">{MISREAD}</Small> : null}
        </YStack>
      ) : null}
      {r.byHow && r.byHow.calm.given + r.byHow.argument.given >= 3 ? (
        <YStack marginTop={10}>
          <Text fontSize={15} lineHeight={22} color={ink}>{`Calm: ${r.byHow.calm.given} kept, ${r.byHow.calm.landed} landed.`}</Text>
          <Text fontSize={15} lineHeight={22} color={ink}>{`With argument: ${r.byHow.argument.given} kept, ${r.byHow.argument.landed} landed.`}</Text>
          <Small color="$color9">The log decides. The calm only points.</Small>
        </YStack>
      ) : null}
    </Card>
  );
}

// C-204: words under words -- the line the companion sends under one of the daemon's own (only once the book is held),
// in the book's purple, under what it said. Never a feeling. DRAFT.
export function Under({ words }: { words: string }) {
  const ink = useSubtleInk();
  return words ? <Text fontSize={15} lineHeight={20} color={ink}>{words}</Text> : null;
}
