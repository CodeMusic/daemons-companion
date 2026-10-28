// C-203: READS -- the companion's own log, as THE LOG is the game's: what the watches read and leant, and which landed.
// Nothing shows before the save holds THE SUBTLE LAYER. The purple marks a noticing, never a feeling; the companion
// counts and never vouches (DAEMONS T-459, 4.33). Every word DRAFT.
import { Text, YStack } from "tamagui";
import { useSubtleInk } from "../look";
import { Reads } from "../types";
import { Card, Eyebrow, Small, whenSaid } from "../ui";
import { useApi } from "../useApi";

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
              <Small color="$color9">{whenSaid(x.at)}{x.open ? " · still open" : ""}</Small>
            </YStack>
          ))}
        </YStack>
      ) : <Small>None yet. Now and then a watch gives one: someone close by, rain, the night, a walk.</Small>}
    </Card>
  );
}
