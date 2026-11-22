// C-432 (PRAXIS 5; the user, 2026-11-22, by multiple choice): THE WEEK'S BALANCE on TODAY, under the day's centre --
// Sunday to Saturday, each day's virtue lit when something was done on its day (a step, the centre tended, an entry, a
// dream written), the days passed with nothing dim and their shadow named, never red and never scolded (T-418: a virtue
// is said OVER its shadow, never as its cure), the days ahead faint. A tap opens the week: what lived each day. The day's
// first finish earns its virtue 2 ARETE more (server/src/balance.ts, practice.ts). Every word DRAFT.
import { useState } from "react";
import { Text, XStack, YStack } from "tamagui";
import { useApi } from "../../platform/useApi";
import { Card, Eyebrow, Pending, Small } from "../../ui/ui";

type Acts = { goals: number; tended: number; entries: number; dreams: number; actions?: number; learning?: number; cooked?: number };
type Day = { day: string; date: string; virtue: string; shadow: string; today: boolean; ahead: boolean; lived: boolean; acts: Acts };
type Balance = { days: Day[]; lived: number; today: { virtue: string; shadow: string; paid: boolean } };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
function what(a: Acts): string {                                                     // DRAFT
  const parts = [a.goals && plural(a.goals, "step"), a.tended && "the centre tended", a.entries && plural(a.entries, "entry", "entries"),
                 a.dreams && plural(a.dreams, "dream"), a.actions && plural(a.actions, "action item"),
                 a.learning && plural(a.learning, "lesson or card", "lessons and cards"), a.cooked && plural(a.cooked, "meal cooked", "meals cooked")].filter(Boolean);
  return parts.join(", ");
}

export function WeekBalanceCard() {
  const [b] = useApi<Balance>("/api/balance");
  const [open, setOpen] = useState(false);
  // lit in the theme's accent, the shade the day's keys are filled with -- not useInk(), which is the colour of the
  // words ON a key (paper on a dark day), and so all but vanished on the card (DAEMONS C-321's pictures, a Sunday)
  const ink = "$color9";
  if (!b) return <Pending title="THE WEEK'S BALANCE" height={[128, 112]} />;
  return (
    <Card onPress={() => setOpen((o) => !o)} cursor="pointer" role="button" aria-expanded={open}
          aria-label={`The week's balance: ${b.lived} of 7 days lived. ${open ? "Close" : "Open"} the week.`}>
      <XStack justifyContent="space-between" alignItems="baseline">
        <Eyebrow>THE WEEK'S BALANCE</Eyebrow>
        <Small color="$color10">{`${b.lived} of 7 lived`}</Small>
      </XStack>
      <XStack gap={4} marginTop={8} flexWrap="wrap">
        {b.days.map((d) => (
          <YStack key={d.day} alignItems="center" gap={3} flexBasis={0} flexGrow={1} minWidth={38} opacity={d.ahead ? 0.4 : d.lived ? 1 : 0.6}>
            <YStack width={14} height={14} borderRadius={7} borderWidth={1.5} borderColor={d.lived || d.today ? ink : "$color8"}
                    backgroundColor={d.lived ? ink : "transparent"} />
            <Text fontSize={11} lineHeight={14} textAlign="center" color={d.lived ? ink : "$color10"}
                  fontWeight={d.today ? "700" : "400"} aria-label={`${d.day}: ${d.lived ? `${d.virtue} lived` : d.ahead ? d.virtue : `${d.shadow} untended`}`}>
              {d.day.slice(0, 1)}
            </Text>
          </YStack>
        ))}
      </XStack>
      <Small color="$color10">
        {b.today.paid ? `Today, ${b.today.virtue.toLowerCase()} over ${b.today.shadow.toLowerCase()}: lived, +2 ARETE.`
                      : `Today, ${b.today.virtue.toLowerCase()} over ${b.today.shadow.toLowerCase()}: the first thing done today earns 2 ARETE more.`}
      </Small>
      {open ? (
        <YStack gap={4} marginTop={6}>
          {b.days.map((d) => (
            <XStack key={d.day} gap={8} opacity={d.ahead ? 0.5 : 1}>
              <Text fontSize={12} width={84} color={d.today ? ink : "$color11"} fontWeight={d.today ? "700" : "400"}>{d.day}</Text>
              <Text fontSize={12} flex={1} color="$color11">
                {d.ahead ? `${d.virtue} over ${d.shadow}` : d.lived ? `${d.virtue} lived: ${what(d.acts)}` : `${d.shadow} untended`}
              </Text>
            </XStack>
          ))}
          <Small color="$color9">Lived on its own day. Nothing is taken for a day missed.</Small>
        </YStack>
      ) : null}
      <Small color="$color8">DRAFT</Small>
    </Card>
  );
}
