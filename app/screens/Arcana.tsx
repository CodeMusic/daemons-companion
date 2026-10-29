// C-232 (the user, 2026-10-28): THE SUBTLE LAYER's cards -- twenty-two, a REASON face (a circuit board under green, a
// mainland daemon) and an INSTINCT face (a living net under gold, an island daemon), on the book's purple; a keyword at
// the top, the daemon, a phrase under it; now and then SHINY. THE DAY'S CARD; A CARD whenever one is wanted (one each,
// with a friend); A SPREAD -- past, present, future. A prompt for noticing, never a prediction. Every word DRAFT.
// The card is laid out as the face was drawn for it (server/tools/arcana_backs.py CARD: a 240 x 400 card).
import { useEffect, useState } from "react";
import { Button, Text, XStack, YStack } from "tamagui";
import { api } from "../net";
import { Art, Small } from "../ui";

export type Card = { n: number; roman: string; side: "reason" | "instinct" | "spellcraft"; keyword: string; phrase: string; name: string;
                     shiny: boolean; art: string; face: string; at?: string };
const CS = { page: "#2c1c32", edge: "#4a3352", ink: "#f0e6f2", faint: "#9a86a0", pink: "#e07ad0", deep: "#3a1838" };
const C = CS;
const mono = { fontFamily: "$mono" as const, letterSpacing: 2 };

export function ArcanaCard({ card, width }: { card: Card; width: number }) {
  const k = width / 240, h = 400 * k, ink = card.shiny ? "#140a14" : "#fff4fc";
  const edge = { textShadowColor: card.shiny ? "#f0dcf0" : C.deep, textShadowRadius: 3 * k, textShadowOffset: { width: 0, height: 0 } };
  const at = (y: number, child: React.ReactNode, key: string) =>
    <YStack key={key} position="absolute" top={y * k} left={0} right={0} alignItems="center">{child}</YStack>;
  const sprite = 128 * k;
  return (
    <YStack width={width} height={h} position="relative" aria-label={`${card.keyword}: ${card.phrase}`}>
      <YStack position="absolute" top={0} left={0}><Art path={card.face} size={width} height={h} /></YStack>
      <YStack position="absolute" top={186 * k - sprite / 2} left={width / 2 - sprite / 2}><Art path={card.art} size={sprite} /></YStack>
      {at(10, <Text {...mono} fontSize={11 * k} color={ink}>{card.roman}</Text>, "roman")}
      {at(32, <Text {...mono} letterSpacing={1} fontWeight="800" fontSize={(card.keyword.length <= 8 ? 24 : card.keyword.length <= 10 ? 20 : 18) * k}
                    color={ink} {...edge}>{card.keyword}</Text>, "keyword")}
      {at(274, <Text fontSize={16 * k} lineHeight={21 * k} color={ink} textAlign="center" paddingHorizontal={20 * k} {...edge}>{card.phrase}</Text>, "phrase")}
      {at(361, <Text {...mono} fontSize={9 * k} color={ink}>{card.name}</Text>, "name")}
      {card.shiny ? at(-2, <Text {...mono} fontSize={9 * k} color="#b8860b">✦ SHINY ✦</Text>, "shiny") : null}
    </YStack>
  );
}

// THE DAY'S CARD, and A CARD or A SPREAD drawn whenever one is wanted -- in THE SUBTLE LAYER's book, once it is held;
// C-239: deck="spellcraft", THE HERMETIC LAYER's, in its emerald (and on Halloween, C-240, the day's card one of the thirteen)
const SPELL = { page: "#1d2a24", edge: "#1F8F5F", pink: "#50C878" };
export function Cards({ deck = "subtle" }: { deck?: "subtle" | "spellcraft" }) {
  const C = deck === "spellcraft" ? { ...CS, ...SPELL } : CS;
  const q = deck === "spellcraft" ? "&deck=spellcraft" : "";
  const [halloween, setHalloween] = useState(false);
  const [day, setDay] = useState<Card | null>(null);
  const [held, setHeld] = useState(false);
  const [drawn, setDrawn] = useState<Card[]>([]);
  const [err, setErr] = useState("");
  const [w, setW] = useState(0);
  useEffect(() => { api<{ held: boolean; card?: Card; halloween?: boolean }>(`/api/arcana/today${q ? "?" + q.slice(1) : ""}`).then((r) => { setHeld(r.held); setDay(r.card ?? null); setHalloween(!!r.halloween); }).catch(() => {}); }, [q]);
  if (!held || !day) return null;
  const draw = async (count: 1 | 3) => {
    try { setDrawn((await api<{ cards: Card[] }>(`/api/arcana/draw?count=${count}${q}`)).cards); setErr(""); }
    catch (e) { setErr((e as Error).message); }
  };
  const one = Math.min(240, Math.max(150, w - 32)), three = Math.max(96, Math.min(200, (w - 32 - 2 * 10) / 3));
  return (
    <YStack onLayout={(e) => setW(e.nativeEvent.layout.width)} backgroundColor={C.page} borderColor={C.edge} borderWidth={1} borderRadius={4} padding={16} gap={10}>
      <Text {...mono} fontSize={12} color={C.pink}>THE DAY'S CARD</Text>
      {w ? <YStack alignSelf="center"><ArcanaCard card={day} width={one} /></YStack> : null}
      <Small color={C.faint}>{halloween ? `HALLOWEEN · THE THIRTEEN · ${day.roman} -- a spell for the day.  DRAFT`
        : `${day.side === "reason" ? "REASON" : day.side === "instinct" ? "INSTINCT" : "SPELLCRAFT"} · ${day.roman}${day.shiny ? " · shiny" : ""} -- what does it point you toward today?  DRAFT`}</Small>
      <XStack gap={8} flexWrap="wrap">
        <Button size="$3" onPress={() => draw(1)} backgroundColor={C.pink}><Text {...mono} fontSize={12} color={C.page}>DRAW A CARD</Text></Button>
        <Button size="$3" onPress={() => draw(3)} borderColor={C.pink} backgroundColor={C.page}><Text {...mono} fontSize={12} color={C.pink}>PAST · PRESENT · FUTURE</Text></Button>
      </XStack>
      {err ? <Small color={C.faint}>{err}</Small> : null}
      {drawn.length === 1 && w ? <YStack alignSelf="center"><ArcanaCard card={drawn[0]} width={one} /></YStack> : null}
      {drawn.length === 3 && w ? (
        <XStack gap={10} justifyContent="center">
          {drawn.map((c, i) => (
            <YStack key={i} alignItems="center" gap={4}>
              <Text {...mono} fontSize={10} color={C.faint}>{c.at}</Text>
              <ArcanaCard card={c} width={three} />
            </YStack>
          ))}
        </XStack>
      ) : null}
    </YStack>
  );
}
