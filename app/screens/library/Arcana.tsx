// C-232 (the user, 2026-10-28): THE SUBTLE LAYER's cards -- twenty-two, a REASON face (a circuit board under green, a
// mainland daemon) and an INSTINCT face (a living net under gold, an island daemon), on the book's purple; a keyword at
// the top, the daemon, a phrase under it; now and then SHINY. Every word DRAFT.
// The card is laid out as the face was drawn for it (server/tools/arcana_backs.py CARD: a 240 x 400 card).
// C-273 (the user's design, 2026-11-01, DAEMONS T-509): a CARDS section in each book, folded under its cover until the
// deck is touched -- THE CARD OF THE DAY face down until it is turned; A SINGLE DRAW, PAST / PRESENT / FUTURE and MIND /
// BODY / SPIRIT from the deck the reader chooses; the deck shuffles and spreads, a touched card comes out and lands face
// down on the board, and is turned there. The backs are all one (they never show the type). C-272: under a turned card,
// its PROPHECY -- the app's alone; the game and the watches keep the short phrase. Only read, never an effect.
import { useEffect, useRef, useState } from "react";
import { Animated, Easing } from "react-native";
import { Text, XStack, YStack } from "tamagui";
import { thinNow } from "../../../server/src/witching";
import { api } from "../../platform/net";
import { previewing } from "../../state/preview";
import { Art, Small } from "../../ui/ui";

export type Card = { n: number; roman: string; side: "reason" | "instinct" | "above" | "below" | "spellcraft" | "dawn"; keyword: string; phrase: string;
                     prophecy?: string; name: string; shiny: boolean; art: string; face: string; at?: string };
const CS = { page: "#2c1c32", edge: "#4a3352", ink: "#f0e6f2", faint: "#9a86a0", pink: "#e07ad0", deep: "#3a1838" };
const C = CS;
const mono = { fontFamily: "$mono" as const, letterSpacing: 2 };
const BACK = "/art/arcana/back.png";
const SLOW = { duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: false } as const;

export function ArcanaCard({ card, width }: { card: Card; width: number }) {
  const k = width / 240, h = 400 * k, ink = card.shiny ? "#140a14" : "#fff4fc";
  const edge = { textShadowColor: card.shiny ? "#f0dcf0" : C.deep, textShadowRadius: 3 * k, textShadowOffset: { width: 0, height: 0 } };
  const at = (y: number, child: React.ReactNode, key: string) =>
    <YStack key={key} position="absolute" top={y * k} left={0} right={0} alignItems="center">{child}</YStack>;
  const sprite = 128 * k;            // the words are set over the card's art, so they keep its size, whatever the device's text size
  return (
    <YStack width={width} height={h} position="relative" aria-label={`${card.keyword}: ${card.phrase}`}>
      <YStack position="absolute" top={0} left={0}><Art path={card.face} size={width} height={h} /></YStack>
      {card.art ? <YStack position="absolute" top={186 * k - sprite / 2} left={width / 2 - sprite / 2}><Art path={card.art} size={sprite} /></YStack> : null}{/* C-313: a dawn face's daemons are to be chosen; its sun stands there */}
      {at(10, <Text allowFontScaling={false} {...mono} fontSize={11 * k} color={ink}>{card.roman}</Text>, "roman")}
      {at(32, <Text allowFontScaling={false} {...mono} letterSpacing={1} fontWeight="800" fontSize={(card.keyword.length <= 8 ? 24 : card.keyword.length <= 10 ? 20 : 18) * k}
                    color={ink} {...edge}>{card.keyword}</Text>, "keyword")}
      {at(274, <Text allowFontScaling={false} fontSize={16 * k} lineHeight={21 * k} color={ink} textAlign="center" paddingHorizontal={20 * k} {...edge}>{card.phrase}</Text>, "phrase")}
      {at(361, <Text allowFontScaling={false} {...mono} fontSize={9 * k} color={ink}>{card.name}</Text>, "name")}
      {card.shiny ? at(-2, <Text allowFontScaling={false} {...mono} fontSize={9 * k} color="#b8860b">✦ SHINY ✦</Text>, "shiny") : null}
    </YStack>
  );
}

// a card that turns over where it lies: the one back, then (halfway through the turn) its face
function TurningCard({ card, width, turned, onTurn }: { card: Card; width: number; turned: boolean; onTurn?: () => void }) {
  const spin = useRef(new Animated.Value(turned ? 1 : 0)).current;
  const [showFace, setShowFace] = useState(turned);
  useEffect(() => {
    if (!turned || showFace) return;
    Animated.timing(spin, { toValue: 0.5, duration: 160, easing: Easing.in(Easing.quad), useNativeDriver: false }).start(() => {
      setShowFace(true);
      Animated.timing(spin, { toValue: 1, duration: 200, easing: Easing.out(Easing.quad), useNativeDriver: false }).start();
    });
  }, [turned, showFace, spin]);
  const scaleX = spin.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0.02, 1] });
  return (
    <Animated.View style={{ transform: [{ scaleX }] }}>
      <YStack role="button" aria-label={showFace ? `${card.keyword}: ${card.phrase}` : "a card, face down: turn it over"} cursor={showFace ? "default" : "pointer"}
              onPress={() => !turned && onTurn?.()}>
        {showFace ? <ArcanaCard card={card} width={width} /> : <Art path={BACK} size={width} height={width * 400 / 240} />}
      </YStack>
    </Animated.View>
  );
}

// a turned card's words: its place, its name, and the prophecy under the card (C-272)
function Reading({ card, colour }: { card: Card; colour: string }) {
  return (
    <YStack gap={4}>
      <Text {...mono} fontSize={11} color={colour}>{`${card.at ? `${card.at} · ` : ""}${card.roman} ${card.keyword}`}</Text>
      <Text fontSize={16} lineHeight={24} color={C.ink}>{card.prophecy ?? card.phrase}</Text>
    </YStack>
  );
}

// the deck, shuffled and spread: touch a place and one card comes out from there. When enough have come out, it moves away.
const FAN = 11;
function Spread({ width, left, colour, onPick, onGone }: { width: number; left: number; colour: string; onPick: () => void; onGone: () => void }) {
  const open = useRef(new Animated.Value(0)).current;
  const gone = useRef(new Animated.Value(0)).current;
  const pulls = useRef(Array.from({ length: FAN }, () => new Animated.Value(0))).current;
  const [out, setOut] = useState<Set<number>>(new Set());
  useEffect(() => {                                                    // shuffle (a gather and a riffle), then spread
    Animated.sequence([Animated.timing(open, { toValue: 0.18, duration: 160, useNativeDriver: false }),
                       Animated.timing(open, { toValue: 0, duration: 140, useNativeDriver: false }),
                       Animated.timing(open, { toValue: 0.18, duration: 160, useNativeDriver: false }),
                       Animated.timing(open, { toValue: 1, ...SLOW })]).start();
  }, [open]);
  useEffect(() => { if (left === 0) Animated.timing(gone, { toValue: 1, ...SLOW }).start(onGone); }, [left, gone, onGone]);
  const cw = Math.max(44, Math.min(70, width / 7)), ch = cw * 400 / 240, step = Math.min(cw * 0.62, (width - cw) / (FAN - 1));
  const pick = (i: number) => {
    if (left === 0 || out.has(i)) return;
    setOut(new Set(out).add(i));
    Animated.timing(pulls[i], { toValue: 1, duration: 360, easing: Easing.in(Easing.cubic), useNativeDriver: false }).start(onPick);
  };
  return (
    <Animated.View style={{ height: ch + 40, opacity: gone.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
                            transform: [{ translateY: gone.interpolate({ inputRange: [0, 1], outputRange: [0, 30] }) }] }}>
      {Array.from({ length: FAN }, (_, i) => {
        const off = i - (FAN - 1) / 2;
        const x = open.interpolate({ inputRange: [0, 1], outputRange: [width / 2 - cw / 2, width / 2 - cw / 2 + off * step] });
        const rot = open.interpolate({ inputRange: [0, 1], outputRange: ["0deg", `${off * 4}deg`] });
        const y = Animated.add(open.interpolate({ inputRange: [0, 1], outputRange: [10, 10 + Math.abs(off) * Math.abs(off) * 1.2] }),
                               pulls[i].interpolate({ inputRange: [0, 1], outputRange: [0, -60] }));
        return (
          <Animated.View key={i} style={{ position: "absolute", left: x, top: y, opacity: pulls[i].interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
                                          transform: [{ rotate: rot }] }}>
            <YStack role="button" aria-label="a card in the spread: draw it" cursor="pointer" onPress={() => pick(i)}
                    borderRadius={6} borderWidth={1} borderColor={colour}>
              <Art path={BACK} size={cw} height={ch} />
            </YStack>
          </Animated.View>
        );
      })}
    </Animated.View>
  );
}

// a card come out of the spread, landing face down in its place on the board
function Landing({ children }: { children: React.ReactNode }) {
  const land = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.timing(land, { toValue: 1, ...SLOW }).start(); }, [land]);
  return (
    <Animated.View style={{ opacity: land, transform: [{ translateY: land.interpolate({ inputRange: [0, 1], outputRange: [-70, 0] }) },
                                                         { rotate: land.interpolate({ inputRange: [0, 1], outputRange: ["-8deg", "0deg"] }) }] }}>
      {children}
    </Animated.View>
  );
}

type Book = "subtle" | "hermetic" | "unity" | "eudaimon";   // C-313: the dawn half deals its own deck, the cards' dawn faces   // C-299: the mended book deals the hermetic deck, Both as One only
type Mode = "day" | "one" | "ppf" | "mbs";
type Pick = "reason" | "instinct" | "above" | "below" | "dawn" | "both";
const MODES: { k: Mode; label: string }[] = [
  { k: "day", label: "THE CARD OF THE DAY" }, { k: "one", label: "A SINGLE DRAW" },
  { k: "ppf", label: "PAST · PRESENT · FUTURE" }, { k: "mbs", label: "MIND · BODY · SPIRIT" },   // DRAFT
];
const PLACES: Record<"one" | "ppf" | "mbs", string[]> = { one: [""], ppf: ["PAST", "PRESENT", "FUTURE"], mbs: ["MIND", "BODY", "SPIRIT"] };
const SPELL = { page: "#1d2a24", edge: "#1F8F5F", pink: "#50C878" };
const MENDED = { page: "#211C26", edge: "#5C4766", pink: "#E8A93A" };
const DAWNING = { page: "#1F2240", edge: "#C98A1E", pink: "#E8A93A", ink: "#FBF3E4", faint: "#C9B48E", deep: "#1A1E3E" };   // C-313: the night's last blue, the dawn's gold   // C-299: the mended book's deck, the dawn's gold on the night's plum

// which deck: THE SUBTLE LAYER's names one under another; THE HERMETIC LAYER's read as one sentence, only the names
// bold -- "as The Deck Above, so The Deck Below, or Both as One" -- and in the thin half-hour Within and Without (the user)
function DeckChoice({ book, pick, setPick, colour }: { book: Book; pick: Pick; setPick: (p: Pick) => void; colour: string }) {
  const name = (p: Pick, label: string) => (
    <Text key={p} role="button" aria-label={label} aria-checked={pick === p} cursor="pointer" onPress={() => setPick(p)}
          fontSize={16} lineHeight={26} fontWeight="800" color={pick === p ? colour : C.ink}
          textDecorationLine={pick === p ? "underline" : "none"}>{label}</Text>
  );
  const plain = (s: string) => <Text key={s} fontSize={16} lineHeight={26} color={C.faint}>{s}</Text>;
  if (book === "subtle") return (
    <YStack gap={2}>{[name("reason", "The Deck of Reason"), name("instinct", "The Deck of Instinct"), name("both", "A Combined Deck")]}</YStack>
  );
  if (book === "eudaimon") return <Text>{name("dawn", "The Deck of Dawn")}</Text>;   // C-313: one deck, the dawn faces. DRAFT
  if (book === "unity") return (                                      // C-299 (vision 4.40): "the mended book deals Both as One only"
    <Text>{name("both", "Both as One")}</Text>
  );
  const thin = thinNow();
  return (
    <Text>
      {plain("as ")}{name("above", thin ? "The Deck Within" : "The Deck Above")}{plain(", so ")}
      {name("below", thin ? "The Deck Without" : "The Deck Below")}{plain(", or ")}{name("both", "Both as One")}
    </Text>
  );
}

// the side's name as the book says it (in the thin half-hour ABOVE and BELOW are WITHIN and WITHOUT)
const sideName = (side: Card["side"]) =>
  side === "above" ? (thinNow() ? "WITHIN" : "ABOVE") : side === "below" ? (thinNow() ? "WITHOUT" : "BELOW") : side.toUpperCase();

export function Cards({ book = "subtle" }: { book?: Book }) {
  const C = book === "hermetic" ? { ...CS, ...SPELL } : book === "unity" ? { ...CS, ...MENDED } : book === "eudaimon" ? { ...CS, ...DAWNING } : CS;
  const deck = book === "subtle" ? "subtle" : book === "eudaimon" ? "dawn" : "hermetic";
  const pv = previewing() ? "&preview=1" : "";                          // the preview: both decks, read only
  const [day, setDay] = useState<Card | null>(null);
  const [halloween, setHalloween] = useState(false);
  const [held, setHeld] = useState(false);
  const [open, setOpen] = useState(false);                            // folded under the cover until the deck is touched
  const [mode, setMode] = useState<Mode>("day");
  const [pick, setPick] = useState<Pick>(book === "eudaimon" ? "dawn" : "both");
  const [dayTurned, setDayTurned] = useState(false);
  const [hand, setHand] = useState<Card[]>([]);                       // this round's cards, in the order they come out
  const [placed, setPlaced] = useState(0);
  const [turned, setTurned] = useState<boolean[]>([]);
  const [round, setRound] = useState(0);
  const [spreadGone, setSpreadGone] = useState(false);
  const [err, setErr] = useState("");
  const [w, setW] = useState(0);
  useEffect(() => {
    api<{ held: boolean; card?: Card; halloween?: boolean }>(`/api/arcana/today?deck=${deck}${pv}`)
      .then((r) => { setHeld(r.held); setDay(r.card ?? null); setHalloween(!!r.halloween); }).catch(() => {});
  }, [deck, pv]);
  if (!held || !day) return null;

  const deal = async (m: Mode, p: Pick) => {                          // a new mode (or deck) clears the last, and shuffles
    setMode(m); setPick(p); setHand([]); setPlaced(0); setTurned([]); setErr(""); setSpreadGone(false);
    if (m === "day") return;
    const n = PLACES[m].length;
    try {
      const r = await api<{ cards: Card[] }>(`/api/arcana/draw?deck=${deck}&count=${n}&pick=${p}${m === "mbs" ? "&spread=mbs" : ""}${pv}`);
      setHand(r.cards); setTurned(r.cards.map(() => false)); setRound((x) => x + 1);
    } catch (e) { setErr((e as Error).message); }
  };
  const inner = Math.max(0, w - 32 - (w >= 560 ? 258 : 0));      // wide, the modes stand beside the cards
  const one = Math.min(240, Math.max(150, inner)), three = Math.max(90, Math.min(200, (inner - 2 * 10) / 3));
  const places = mode === "day" ? [] : PLACES[mode];
  const size = places.length === 3 ? three : one;

  // folded: the deck as a tile under the cover -- touch it to open the cards, and again to fold them away
  const tile = (
    <XStack role="button" aria-label={open ? "fold the cards away" : "open the cards"} aria-expanded={open} cursor="pointer" onPress={() => setOpen(!open)}
            alignItems="center" gap={14} padding={12} borderRadius={4} borderWidth={1} borderColor={C.edge} backgroundColor={C.page}>
      <XStack width={58} height={68} alignItems="flex-start">
        {[0, 1, 2].map((i) => (
          <YStack key={i} marginLeft={i ? -30 : 0} marginTop={(2 - i) * 3}><Art path={BACK} size={36} height={60} /></YStack>
        ))}
      </XStack>
      <YStack flex={1} gap={2}>
        <Text {...mono} fontSize={13} fontWeight="800" color={C.pink}>THE CARDS</Text>
        <Small color={C.faint}>{open ? "Touch the deck to put them away." : "Touch the deck to open it."}</Small>
      </YStack>
      <Text fontSize={18} color={C.pink}>{open ? "▴" : "▾"}</Text>
    </XStack>
  );
  if (!open) return tile;

  const dayCaption = halloween ? `HALLOWEEN · THE THIRTEEN · ${day.roman} -- a spell for the day.  DRAFT`
    : `${sideName(day.side)} · ${day.roman}${day.shiny ? " · shiny" : ""}  DRAFT`;
  const modes = (
    <YStack gap={6} flexDirection={w >= 560 ? "column" : "row"} flexWrap="wrap" width={w >= 560 ? 240 : undefined}>
      {MODES.map((m) => (
        <Text key={m.k} role="button" aria-label={m.label} aria-pressed={mode === m.k} cursor="pointer" onPress={() => deal(m.k, pick)}
              {...mono} fontSize={11} paddingVertical={8} paddingHorizontal={10} borderRadius={3} borderWidth={1} borderColor={C.pink}
              color={mode === m.k ? C.page : C.pink} backgroundColor={mode === m.k ? C.pink : "transparent"}>{m.label}</Text>
      ))}
    </YStack>
  );
  const stage = mode === "day" ? (
    <YStack alignItems="center" gap={10}>
      <Text {...mono} fontSize={12} color={C.pink}>THE CARD OF THE DAY</Text>
      <TurningCard card={day} width={one} turned={dayTurned} onTurn={() => setDayTurned(true)} />
      {dayTurned ? <YStack alignSelf="stretch" gap={6}><Small color={C.faint}>{dayCaption}</Small><Reading card={day} colour={C.pink} /></YStack>
        : <Small color={C.faint}>Touch the card to turn it over.</Small>}
    </YStack>
  ) : (
    <YStack gap={12}>
      <DeckChoice book={book} pick={pick} setPick={(p) => deal(mode, p)} colour={C.pink} />
      {hand.length && !spreadGone ? (
        <Spread key={round} width={inner} left={hand.length - placed} colour={C.edge} onPick={() => setPlaced((x) => Math.min(hand.length, x + 1))}
                onGone={() => setSpreadGone(true)} />
      ) : null}
      {hand.length && placed < hand.length ? <Small color={C.faint}>{places.length === 3 ? `Touch the spread for the ${places[placed]} card.` : "Touch the spread to draw a card."}</Small> : null}
      <XStack gap={10} justifyContent="center">
        {places.map((label, i) => (
          <YStack key={`${round}-${i}`} alignItems="center" gap={6}>
            <YStack width={size + 8} height={size * 400 / 240 + 8} padding={3} borderRadius={6} borderWidth={1}
                    borderColor={C.pink} borderStyle={i < placed ? "solid" : "dashed"} alignItems="center" justifyContent="center">
              {i < placed && hand[i] ? (
                <Landing><TurningCard card={hand[i]} width={size} turned={!!turned[i]} onTurn={() => setTurned((t) => t.map((x, j) => (j === i ? true : x)))} /></Landing>
              ) : null}
            </YStack>
            {label ? <Text {...mono} fontSize={10} color={i < placed ? C.pink : C.faint}>{label}</Text> : null}
          </YStack>
        ))}
      </XStack>
      {placed && turned.slice(0, placed).some((t) => !t) ? <Small color={C.faint}>Touch a card on the board to turn it over.</Small> : null}
      {hand.map((c, i) => (turned[i] ? <Reading key={`${round}-r${i}`} card={c} colour={C.pink} /> : null))}
    </YStack>
  );
  return (
    <YStack gap={10}>
      {tile}
      <YStack onLayout={(e) => setW(e.nativeEvent.layout.width)} backgroundColor={C.page} borderColor={C.edge} borderWidth={1} borderRadius={4} padding={16} gap={14}>
        {w >= 560 ? <XStack gap={18}><YStack flex={1}>{stage}</YStack>{modes}</XStack> : <>{modes}{stage}</>}
        {err ? <Small color={C.faint}>{err}</Small> : null}
        <Text {...mono} fontSize={10} color={C.faint}>Only read. Every word DRAFT.</Text>
      </YStack>
    </YStack>
  );
}

