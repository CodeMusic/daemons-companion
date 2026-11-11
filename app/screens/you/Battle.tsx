// C-328: BATTLE on the YOU tab -- which daemon this phone or site fights with (one of those AWAY), everyone online to
// battle (the household's devices, and the players on the exchange), and a request on its way. The battle itself, and a
// request to this device, show over every screen (ui/battle.tsx). Every word DRAFT.
import { useState } from "react";
import { Text, XStack, YStack } from "tamagui";
import { Action, Art, Card, Eyebrow, Small, useInk } from "../../ui/ui";
import { useArena } from "../../ui/battle";
import { act, arenaError } from "../../platform/battle";

const KIND: Record<string, string> = { device: "a device here", app: "the app or site here", player: "a player on the exchange" };   // DRAFT

export function BattleCard({ ink }: { ink?: string }) {
  const dayInk = useInk();
  ink = ink ?? dayInk;
  const a = useArena();
  const [said, setSaid] = useState("");
  if (!a) return arenaError() ? <Card><Eyebrow>BATTLE</Eyebrow><Small>{arenaError()}</Small></Card> : null;
  const waiting = a.fights.find((f) => f.phase === "asked" && f.me === 0);
  const choose = async (personality: number) => { setSaid(""); try { await act("/api/battle/pick", { personality }); } catch (e) { setSaid((e as Error).message); } };
  const ask = async (to: string, label: string) => {
    setSaid("");
    try { await act("/api/battle/request", { to }); void label; } catch (e) { setSaid((e as Error).message); }
  };
  const withdraw = async (id: string) => { try { await act("/api/battle/answer", { id, accept: false }); setSaid(""); } catch (e) { setSaid((e as Error).message); } };
  const recent = a.fights.filter((f) => f.phase === "over" && f.me !== null).slice(0, 3);
  return (
    <Card gap={8}>
      <Eyebrow>BATTLE</Eyebrow>
      <Small>One daemon each, the game's own rules. Win or lose, every daemon comes back as it went, and its experience reaches the game at the next SYNC.  DRAFT</Small>
      {a.chooses ? (
        a.away.length ? (
          <YStack gap={4}>
            <Small color="$color10">Fight with</Small>
            <XStack flexWrap="wrap" gap={6}>
              {a.away.map((d) => (
                <XStack key={d.personality} alignItems="center" gap={6} borderWidth={2} borderRadius={6} paddingHorizontal={8} paddingVertical={4} cursor="pointer"
                        borderColor={a.daemon?.personality === d.personality ? ink : "$color6"} onPress={() => choose(d.personality!)} role="radio" aria-checked={a.daemon?.personality === d.personality}>
                  <Art path={`/art/species/${d.species}.png`} size={32} />
                  <Text fontFamily="$mono" fontSize={12} color={ink}>{`${d.nickname} ${d.level}`}</Text>
                </XStack>
              ))}
            </XStack>
          </YStack>
        ) : <Small>No daemon AWAY to fight with -- SEND one from the game first.</Small>
      ) : a.daemon ? <Small>{`This device fights with ${a.daemon.nickname}.`}</Small> : null}
      {waiting ? (
        <XStack alignItems="center" justifyContent="space-between" gap={8}>
          <Small>{`Asked ${waiting.sides[1].label} -- waiting for an answer.`}</Small>
          <Action label="WITHDRAW" ink={ink} onPress={() => withdraw(waiting.id)} />
        </XStack>
      ) : a.online.length ? (
        <YStack gap={6}>
          <Small color="$color10">Online now</Small>
          {a.online.map((o) => (
            <XStack key={o.seat} alignItems="center" justifyContent="space-between" gap={8}>
              <XStack alignItems="center" gap={8} flex={1}>
                {o.daemon ? <Art path={`/art/species/${o.daemon.species}.png`} size={36} /> : <YStack width={36} />}
                <YStack flex={1}>
                  <Text fontFamily="$mono" fontSize={13} fontWeight="700" color={ink}>{o.label}</Text>
                  <Small color="$color10">{o.daemon ? `${o.daemon.nickname} · LV ${o.daemon.level}` : KIND[o.kind]}</Small>
                </YStack>
              </XStack>
              <Action label="BATTLE" ink={ink} onPress={() => ask(o.seat, o.label)} />
            </XStack>
          ))}
        </YStack>
      ) : <Small>No one else is online to battle. Open the companion on another device, or join the exchange on TRADE.</Small>}
      {recent.map((f) => (
        <Small key={f.id} color="$color10">{`${f.result ?? "A draw"}${f.exp[f.me!] ? ` · +${f.exp[f.me!]} EXP` : ""}`}</Small>
      ))}
      {said ? <Small>{said}</Small> : null}
      <Small color="$color8">DRAFT</Small>
    </Card>
  );
}
