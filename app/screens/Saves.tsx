// C-215 (the user, 2026-10-28: "a future way to manage multiple saves ... maybe profiles in the app or even just a save
// selector"): YOUR SAVES -- every save the companion knows, who each is, and which one it reads now; tap another to read
// that one instead. Choosing only points the companion at a save; nothing is written. Every word is DRAFT.
import { useState } from "react";
import { Text, XStack, YStack } from "tamagui";
import { api } from "../net";
import { Card, Eyebrow, Small } from "../ui";
import { useApi } from "../useApi";

type SaveEntry = { id: string; kind: "given" | "mirror" | "kept"; label: string; current: boolean; at: string;
                   name: string; trainerId: number; playTime: string; marks: number; seen: number; place: string | null };

export function SavesCard({ onChosen }: { onChosen?: () => void }) {
  const [r, setR] = useApi<{ saves: SaveEntry[] }>("/api/saves");
  const [said, setSaid] = useState("");
  if (!r || r.saves.length < 2) return null;               // one save: nothing to choose between
  const choose = async (e: SaveEntry) => {
    if (e.current) return;
    try { setR(await api<{ saves: SaveEntry[] }>("/api/saves/choose", { id: e.id })); setSaid(`Now reading ${e.name}'s save.`); onChosen?.(); }
    catch (x) { setSaid((x as Error).message); }
  };
  return (
    <Card gap={6}>
      <Eyebrow>YOUR SAVES</Eyebrow>
      <Small>Tap one to have the companion read it. Nothing is changed in any of them.</Small>
      {r.saves.map((e) => (
        <XStack key={e.id} gap={10} paddingVertical={8} borderTopWidth={1} borderColor="$color5" alignItems="center"
                cursor={e.current ? "default" : "pointer"} role="button" onPress={() => choose(e)}>
          <YStack width={10} height={10} borderRadius={5} backgroundColor={e.current ? "$color9" : "$color5"} />
          <YStack flex={1} gap={2}>
            <Text fontSize={15} fontWeight={e.current ? "700" : "500"} color="$color12">{`${e.name} · ${e.label}`}</Text>
            <Small>{[`played ${e.playTime}`, `${e.marks} MARKS`, `${e.seen} seen`, e.place ? `saved in ${e.place}` : null]
              .filter(Boolean).join(" · ")}</Small>
          </YStack>
          <Text fontFamily="$mono" fontSize={11} color="$color9">{e.current ? "READING" : "READ THIS ›"}</Text>
        </XStack>
      ))}
      {said ? <Small>{said}</Small> : null}
      <Small color="$color8">DRAFT</Small>
    </Card>
  );
}
