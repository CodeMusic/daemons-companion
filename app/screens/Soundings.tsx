// C-195: SOUNDINGS (DAEMONS 4.37) -- CRYSTAL's receiver, for real: one quiet card for each daemon away, with when it was
// last heard and how it was doing then, as each SYNC writes it into the save for the game to read. Nothing to fix here,
// no score and no streak (PLAN 7: it never pesters) -- only what was heard.
import { useEffect, useState } from "react";
import { Text, YStack } from "tamagui";
import { api } from "../net";
import { Card, Eyebrow, Small, whenSaid } from "../ui";

type Heard = { personality: number; nickname: string; name: string; species: number; level: 0 | 1 | 2 | 3; at: string | null };
const HOW = ["No signal yet", "Quiet today", "Doing fine", "Doing well"];   // DRAFT

export function SoundingsScreen() {
  const [heard, setHeard] = useState<Heard[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { api<{ daemons: Heard[] }>("/api/soundings").then((r) => setHeard(r.daemons)).catch((e) => setError(e.message)); }, []);
  if (error) return <Small color="$color8">{error}</Small>;
  if (!heard) return null;
  return (
    <YStack gap={12}>
      <Small>{"What the receiver has heard from each daemon away, at each SYNC.  DRAFT"}</Small>
      {heard.length ? heard.map((d) => (
        <Card key={d.personality}>
          <Eyebrow>{d.name.toUpperCase()}</Eyebrow>
          <Text fontFamily="$mono" fontSize={15} fontWeight="700" color="$color12">{d.nickname}</Text>
          <Small>{HOW[d.level]}</Small>
          <Small color="$color10">{d.at ? `Last heard ${whenSaid(d.at)}` : "Not heard since it left"}</Small>
        </Card>
      )) : <Card><Small>{"No daemon is away. Send one from the game, and the receiver listens for it here.  DRAFT"}</Small></Card>}
    </YStack>
  );
}
