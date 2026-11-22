// C-433 (PRAXIS 6; the user, 2026-11-22, by multiple choice): ARETE on JOURNEY -- what is held, earned today and this
// week, and THE REWARD SHELF the person stocks themselves: each reward its price, once or any number of times; SPEND
// takes it at once and the daemon is glad with you; a spend can be taken back on its own day (server/src/lifemanagement/rewards.ts).
// Every word DRAFT.
import { useState } from "react";
import { Text, XStack, YStack } from "tamagui";
import { api } from "../platform/net";
import { useApi } from "../platform/useApi";
import { Action, Art, Card, Choice, Entry, Eyebrow, Pending, Small } from "../ui/ui";

type Reward = { id: number; title: string; price: number; times: "once" | "any"; note: string; taken: boolean;
                spends: { key: string; at: string; undoable: boolean }[] };
type Shelf = { arete: { held: number; today: number; week: number }; rewards: Reward[];
               spent?: { id: number; title: string; price: number }; daemon?: { nickname: string; species: number } };

const when = (iso: string) => new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });

export function AreteSection({ ink }: { ink: string }) {
  const [v, setV, error] = useApi<Shelf>("/api/rewards");
  const [title, setTitle] = useState(""), [price, setPrice] = useState(""), [times, setTimes] = useState<"any" | "once">("any");
  const [said, setSaid] = useState(""), [cheer, setCheer] = useState<Shelf["spent"] & { daemon?: Shelf["daemon"] } | null>(null);
  const post = async (path: string, body: unknown) => {
    setSaid("");
    try { const r = await api<Shelf>(path, body); setV(r); return r; } catch (e) { setSaid((e as Error).message); return null; }
  };
  if (error) return <Card><Eyebrow>ARETE</Eyebrow><Small>{error}</Small></Card>;
  if (!v) return <Pending title="ARETE" height={[260, 220]} />;
  const add = async () => {
    const r = await post("/api/rewards", { title, price: Number(price), times });
    if (r) { setTitle(""); setPrice(""); }
  };
  const take = async (r: Reward) => {
    const out = await post("/api/rewards/spend", { id: r.id });
    if (out?.spent) setCheer({ ...out.spent, daemon: out.daemon });
  };
  return (
    <YStack gap={14}>
      <Card>
        <Eyebrow>ARETE</Eyebrow>
        <XStack alignItems="baseline" gap={10}>
          <Text fontSize={40} fontWeight="700" color={ink}>{v.arete.held}</Text>
          <Small color="$color10">{`held · ${v.arete.today} today · ${v.arete.week} this week`}</Small>
        </XStack>
        <Small color="$color10">Earned by finishing: a step, a goal, an entry, a dream written, the centre tended, an action done. Nothing is taken for a day missed.</Small>
      </Card>
      {cheer ? (
        <Card borderLeftWidth={6} borderLeftColor={ink} onPress={() => setCheer(null)} cursor="pointer" role="button" aria-label="Put the cheer away">
          <XStack gap={12} alignItems="center">
            {cheer.daemon ? <Art path={`/art/species/${cheer.daemon.species}.png`} size={64} /> : null}
            <YStack flex={1} gap={4}>
              <Text fontSize={17} fontWeight="700" color={ink}>{`${cheer.title}!`}</Text>
              <Small>{cheer.daemon ? `${cheer.daemon.nickname} is glad with you. ${cheer.price} ARETE well spent.` : `${cheer.price} ARETE well spent.`}</Small>
            </YStack>
          </XStack>
        </Card>
      ) : null}
      <Card gap={8}>
        <Eyebrow>THE REWARD SHELF</Eyebrow>
        {v.rewards.length ? v.rewards.map((r) => (
          <YStack key={r.id} gap={4} paddingVertical={6} borderBottomWidth={1} borderColor="$color4" opacity={r.taken ? 0.55 : 1}>
            <XStack justifyContent="space-between" alignItems="center" gap={10}>
              <YStack flex={1}>
                <Text fontSize={16} fontWeight="600" color="$color12" textDecorationLine={r.taken ? "line-through" : "none"}>{r.title}</Text>
                <Small color="$color10">{`${r.price} ARETE · ${r.times === "once" ? "once" : "any number of times"}${r.taken ? " · taken" : ""}`}</Small>
              </YStack>
              {!r.taken ? (r.price <= v.arete.held ? <Action label="SPEND" ink={ink} onPress={() => take(r)} />
                                                  : <Small color="$color9">{`${r.price - v.arete.held} more`}</Small>) : null}
            </XStack>
            {r.spends.slice(-3).map((s) => (
              <XStack key={s.key} gap={8} alignItems="center">
                <Small color="$color10">{`Taken ${when(s.at)}`}</Small>
                {s.undoable ? <Text fontSize={12} color={ink} cursor="pointer" role="button" aria-label={`Take back the spend on ${r.title}`}
                                    onPress={() => post("/api/rewards/undo", { id: r.id, key: s.key })}>UNDO</Text> : null}
              </XStack>
            ))}
          </YStack>
        )) : <Small>Nothing on the shelf yet. Stock it with what you would like to earn: an episode, a coffee out, an hour of DAEMONS.</Small>}
        <YStack gap={6} marginTop={6}>
          <Small color="$color10">Stock a reward</Small>
          <Entry value={title} onChange={setTitle} onSubmit={add} placeholder="what it is" limit={60} />
          <Entry value={price} onChange={(t) => setPrice(t.replace(/[^0-9]/g, ""))} onSubmit={add} placeholder="its price in ARETE" limit={5} />
          <XStack gap={8} alignItems="center" flexWrap="wrap">
            <Choice value={times} options={[["any", "ANY TIMES"], ["once", "ONCE"]]} onPick={setTimes} ink={ink} />
            <Action label="STOCK IT" ink={ink} onPress={add} />
          </XStack>
        </YStack>
        {said ? <Small color="$color9">{said}</Small> : null}
        <Small color="$color8">DRAFT</Small>
      </Card>
    </YStack>
  );
}
