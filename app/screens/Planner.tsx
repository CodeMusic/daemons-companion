// C-191 (C-186 step 6): THE ROAD AHEAD -- the planner, read from the save and the game lane's T-453 data
// (server/src/planner.ts): the next step and where it is, the fights and trainers still ahead, the levels so far, the
// places open now, and a place's wild daemons when it is tapped. Nothing past the next step is ever shown. Words DRAFT.
import { useState } from "react";
import { Text, XStack, YStack } from "tamagui";
import { api } from "../net";
import { Card, Eyebrow, Fact, Small } from "../ui";
import { useApi } from "../useApi";

type Plan = {
  done: number; total: number;
  next: { label: string; place: string; area: string | null; draft: boolean } | null;
  places: { place: string; type: string; maps: string[]; wild: boolean }[];
  levels: { wild: [number, number] | null; trainers: [number, number] | null };
  fights: { who: string; class: string; place: string; level: number }[];
  trainers: { place: string; count: number; levels: [number, number] }[];
};
type Wild = { place: string; ways: Record<string, { name: string; species: number; levels: [number, number]; rate: number }[]> };
const lv = (r: [number, number]) => (r[0] === r[1] ? `L${r[0]}` : `L${r[0]}-${r[1]}`);

export function PlannerCard() {
  const [p, , error] = useApi<Plan>("/api/planner");
  const [wild, setWild] = useState<Wild | null>(null);
  const [asked, setAsked] = useState("");
  if (error || !p) return null;
  const look = async (place: string) => {
    if (asked === place) { setAsked(""); setWild(null); return; }
    setAsked(place); setWild(null);
    try { setWild(await api<Wild>(`/api/planner/wild?place=${encodeURIComponent(place)}`)); } catch { setAsked(""); }
  };
  return (
    <Card>
      <Eyebrow>THE ROAD AHEAD</Eyebrow>
      {p.next ? (
        <YStack gap={2}>
          <Text fontFamily="$mono" fontSize={17} fontWeight="700" color="$color12">{p.next.label}</Text>
          <Small>{`In ${p.next.place}${p.next.area === "centre" ? ", in the middle" : p.next.area ? `, to the ${p.next.area}` : ""}.`}</Small>
        </YStack>
      ) : <Small>The story is told to the end.</Small>}
      <Small color="$color10">{`${p.done} of ${p.total} steps of the story done.`}</Small>
      {p.levels.trainers ? <Fact label="TRAINERS HERE">{lv(p.levels.trainers)}</Fact> : null}
      {p.levels.wild ? <Fact label="WILD HERE">{lv(p.levels.wild)}</Fact> : null}
      {p.fights.length ? (
        <YStack gap={2} marginTop={6}>
          <Eyebrow>FIGHTS AHEAD</Eyebrow>
          {p.fights.map((f, i) => <Small key={i}>{`${f.who} (${f.class}) in ${f.place}, up to L${f.level}`}</Small>)}
        </YStack>
      ) : null}
      {p.trainers.length ? (
        <YStack gap={2} marginTop={6}>
          <Eyebrow>TRAINERS NOT YET MET</Eyebrow>
          {p.trainers.map((t) => <Small key={t.place}>{`${t.place}: ${t.count} daemon${t.count === 1 ? "" : "s"}, ${lv(t.levels)}`}</Small>)}
        </YStack>
      ) : null}
      <YStack gap={6} marginTop={6}>
        <Eyebrow>OPEN TO YOU</Eyebrow>
        <XStack flexWrap="wrap" gap={6}>
          {p.places.filter((x) => x.type === "town" || x.type === "route" || x.wild).map((x) => (
            <YStack key={x.place} paddingHorizontal={8} paddingVertical={4} borderWidth={1} borderRadius={4}
                    borderColor={asked === x.place ? "$color9" : "$color5"} cursor={x.wild ? "pointer" : undefined}
                    role={x.wild ? "button" : undefined} onPress={x.wild ? () => look(x.place) : undefined}>
              <Text fontFamily="$mono" fontSize={11} color={x.wild ? "$color12" : "$color10"}>{x.place}</Text>
            </YStack>
          ))}
        </XStack>
        <Small color="$color8">Tap a place to see who lives there.</Small>
      </YStack>
      {wild ? (
        <YStack gap={4} marginTop={6}>
          <Eyebrow>{`IN ${wild.place}`}</Eyebrow>
          {Object.entries(wild.ways).map(([way, list]) => (
            <Small key={way}>{`${way.toUpperCase()}: ${list.map((m) => `${m.name} ${lv(m.levels)}`).join(", ")}`}</Small>
          ))}
        </YStack>
      ) : null}
      <Small color="$color8">DRAFT</Small>
    </Card>
  );
}
