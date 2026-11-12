// C-357 (3), THE BODY's centres (the user's pick, 2026-11-12): once the save holds THE SUBTLE LAYER, TODAY offers the day's
// centre's tending in the book's own words, and the week's climb, root to crown (server/src/tending.ts). In the book's one
// purple -- never a colour for a centre (the book's rule 3). Every word DRAFT.
import { Text, XStack, YStack } from "tamagui";
import { api } from "../../platform/net";
import { useApi } from "../../platform/useApi";
import { useSubtleInk } from "../../state/look";
import { Action, Card, Eyebrow, Small } from "../../ui/ui";

type Tending = { held: boolean; day?: string; centre?: string; page?: string | null; tending?: string | null;
                 done?: { at: string; by: "you" | "walk" | "dream" } | null;
                 climb?: { day: string; centre: string; today: boolean; ahead: boolean; tended: boolean }[] };
const BY = { you: "Tended today.", walk: "Tended today: a walk.", dream: "Tended today: a dream kept." } as const;   // DRAFT

export function TendingCard() {
  const [t, setT] = useApi<Tending>("/api/subtle/tending");
  const ink = useSubtleInk();
  if (!t?.held || !t.tending || !t.centre || !t.climb) return null;
  const tended = async () => setT(await api<Tending>("/api/subtle/tending", {}));
  return (
    <Card borderLeftWidth={6} borderLeftColor={ink}>
      <Eyebrow>THE DAY'S TENDING</Eyebrow>
      <Text fontSize={17} lineHeight={25} color={ink}>{`The ${t.centre.toLowerCase()}: ${t.tending}`}</Text>
      {t.done ? <Small color="$color11">{BY[t.done.by]}</Small> : <Action label="Tended" onPress={tended} ink={ink} />}
      <XStack gap={4} marginTop={10} flexWrap="wrap" aria-label="the week's climb, root to crown">
        {t.climb.map((c) => (
          <YStack key={c.day} alignItems="center" gap={3} flexBasis={0} flexGrow={1} minWidth={38} opacity={c.ahead ? 0.45 : 1}>
            <YStack width={14} height={14} borderRadius={7} borderWidth={1.5} borderColor={ink}
                    backgroundColor={c.tended ? ink : "transparent"} />
            <Text fontSize={10} lineHeight={13} textAlign="center" color={c.today ? ink : "$color10"}
                  fontWeight={c.today ? "700" : "400"}>{c.centre.toLowerCase()}</Text>
          </YStack>
        ))}
      </XStack>
      <Small color="$color9">So they climb.</Small>
    </Card>
  );
}
