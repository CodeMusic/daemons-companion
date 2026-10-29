// C-200 (the user, 2026-10-28: "sleep tracking ... it should be creative relating to daemons and dreams"): the dream
// journal -- every night a watch told the companion, the newest first: the dream the daemon had (the hub's telling when
// it wrote one, otherwise the companion's own words), how long and how still the night was, and whether it was tucked in.
import { useEffect, useState } from "react";
import { Text, XStack, YStack } from "tamagui";
import { api, apiLater, ON_PHONE } from "../net";
import { Spoken } from "../types";
import { Action, Card, Eyebrow, Small, whenSaid } from "../ui";
import { useVoice } from "./Daemon";

type Dream = { id: number; at: string; to: string; hours: number; stirs: number; tucked: boolean;
               quality: "vivid" | "quiet" | "broken"; text: string; by: "module" | "words"; nickname: string };
const NIGHT = { vivid: "A deep night", quiet: "A quiet night", broken: "A restless night" };   // DRAFT

export function DreamsScreen({ ink }: { ink?: string }) {
  const [dreams, setDreams] = useState<Dream[] | null>(null);
  const speak = useVoice();
  const [reading, setReading] = useState(0);
  const readAloud = async (d: Dream) => {                     // the user, 2026-10-28: a dream read aloud, in the INDEX voice
    setReading(d.id);
    try { speak((await apiLater<Spoken>("/api/ai/speak", { text: d.text })).audioBase64); } catch { /* the card says nothing new */ }
    finally { setReading(0); }
  };
  const [error, setError] = useState("");
  const [shared, setShared] = useState<Record<number, string>>({});   // C-223: what SHARE said, per dream
  const share = async (d: Dream) => {
    try { await api("/api/trade/share", { id: d.id }); setShared((x) => ({ ...x, [d.id]: "Shared with the players at home." })); }
    catch (e) { setShared((x) => ({ ...x, [d.id]: (e as Error).message })); }
  };
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
          <XStack gap={8} flexWrap="wrap">
            {ON_PHONE ? <Action label={reading === d.id ? "Reading…" : "Read aloud"} onPress={() => readAloud(d)} ink={ink} /> : null}
            <Action label="SHARE" onPress={() => share(d)} ink={ink} />
          </XStack>
          {shared[d.id] ? <Small>{shared[d.id]}</Small> : null}
        </Card>
      )) : <Card><Small>{"No dreams yet. Wear the watch to bed, or tuck the daemon in with SLEEP, and its dream is here in the morning.  DRAFT"}</Small></Card>}
    </YStack>
  );
}
