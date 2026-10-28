// C-200 (the user, 2026-10-28: "sleep tracking ... it should be creative relating to daemons and dreams"): the dream
// journal -- every night a watch told the companion, the newest first: the dream the daemon had (the hub's telling when
// it wrote one, otherwise the companion's own words), how long and how still the night was, and whether it was tucked in.
import { useEffect, useState } from "react";
import { Text, YStack } from "tamagui";
import { api } from "../net";
import { Card, Eyebrow, Small, whenSaid } from "../ui";

type Dream = { id: number; at: string; to: string; hours: number; stirs: number; tucked: boolean;
               quality: "vivid" | "quiet" | "broken"; text: string; by: "module" | "words"; nickname: string };
const NIGHT = { vivid: "A deep night", quiet: "A quiet night", broken: "A restless night" };   // DRAFT

export function DreamsScreen() {
  const [dreams, setDreams] = useState<Dream[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { api<{ dreams: Dream[] }>("/api/dreams").then((r) => setDreams(r.dreams)).catch((e) => setError(e.message)); }, []);
  if (error) return <Small color="$color8">{error}</Small>;
  if (!dreams) return null;
  return (
    <YStack gap={12}>
      <Small>{"What the daemon dreamt, each night a watch kept with it.  DRAFT"}</Small>
      {dreams.length ? dreams.map((d) => (
        <Card key={d.id}>
          <Eyebrow>{`${NIGHT[d.quality].toUpperCase()} · ${d.hours} HOURS${d.tucked ? " · TUCKED IN" : ""}`}</Eyebrow>
          <Text fontSize={15} color="$color12">{d.text}</Text>
          <Small color="$color10">{`${d.nickname || "Your daemon"}, woke ${whenSaid(d.to)}`}</Small>
        </Card>
      )) : <Card><Small>{"No dreams yet. Wear the watch to bed, or tuck the daemon in with SLEEP, and its dream is here in the morning.  DRAFT"}</Small></Card>}
    </YStack>
  );
}
