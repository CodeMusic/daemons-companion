// C-338 (the user, 2026-11-11: "you prompt ... that pipeline will result in an image, like the daemon painted it. The ui ...
// could show your current daemon approaching an art easel and he has a painting animation while the ai works, resulting in
// the image it painted -- this would also be saved in a gallery, grouped by the daemon that painted it, each painting would
// also have a title ... in a painted canvas frame and shown in a similar manner as our library bookshelf but with the
// paintings -- tapping on a painting would bring it to a larger screen form, and you could tap and hold at this point to
// reveal the painting prompt"): THE EASEL. Ask, and the daemon walks to its easel and paints (the hub: POST /api/paint,
// its persona of the day, its own style, the image model on roverbyteseer); the canvas fills with strokes while it works,
// then the painting stands on the easel with its title and what the daemon says of it. THE GALLERY below: a wall per
// daemon, each painting in a gilt frame; tapped, it is shown large; held, its prompt. Leaving does not stop a painting:
// the gallery shows it painting, and it is there when it is done. Every word DRAFT.
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Modal, Platform, Pressable, useWindowDimensions } from "react-native";
import { Text, XStack, YStack } from "tamagui";
import { api } from "../../platform/net";
import { Action, Art, Card, Entry, Eyebrow, Small } from "../../ui/ui";

const WORDS = {   // DRAFT
  eyebrow: "THE EASEL", ask: "What should it paint?", paint: "PAINT", painting: (n: string) => `${n} is painting…`,
  walking: (n: string) => `${n} walks to the easel.`, failed: "The paint would not take this time.", again: "TRY AGAIN",
  gallery: "THE GALLERY", empty: "Nothing painted yet. Ask for something above.", hold: "Hold the painting to see what was asked.",
  asked: "WHAT WAS ASKED", close: "CLOSE", forget: "TAKE IT DOWN", stillPainting: "still painting…",
};
const NATIVE = Platform.OS !== "web";
const GILT = { frame: "#a07a2c", light: "#e2bd62", dark: "#5e4413", mat: "#efe6cf", wall: "#2f2a26", wood: "#7a5230", legs: "#5d3d22" };

export type Painting = { id: string; at: string; personality: number; species: number; nickname: string; name: string; types: string[];
                         request: string; title: string; scene: string; about: string; state: "painting" | "done" | "failed"; error?: string };

// --- the frame: gilt, a mat, the painting inside (or the canvas still wet) ---
function Framed({ p, size }: { p: Painting; size: number }) {
  const inner = size - 22;
  return (
    <YStack width={size} height={size} backgroundColor={GILT.frame} padding={4} borderRadius={3}
            borderWidth={2} borderTopColor={GILT.light} borderLeftColor={GILT.light} borderRightColor={GILT.dark} borderBottomColor={GILT.dark}>
      <YStack flex={1} backgroundColor={GILT.mat} padding={5}>
        {p.state === "done" ? <Art path={`/art/paintings/${p.id}.png`} size={inner} height={inner} smooth />
          : <YStack flex={1} backgroundColor="#f6f1e4" alignItems="center" justifyContent="center">
              <Small color="$color9">{p.state === "painting" ? WORDS.stillPainting : "×"}</Small>
            </YStack>}
      </YStack>
    </YStack>
  );
}

// --- the easel, the daemon at it, the canvas filling while it paints ---
function EaselStage({ slot, painting, done, width }: { slot: number | null; painting: boolean; done: Painting | null; width: number }) {
  const x = useRef(new Animated.Value(0)).current, dab = useRef(new Animated.Value(0)).current, fill = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!painting) { Animated.timing(x, { toValue: 0, duration: 600, useNativeDriver: NATIVE }).start(); return; }
    fill.setValue(0);
    Animated.timing(x, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: NATIVE }).start();
    const brush = Animated.loop(Animated.sequence([
      Animated.timing(dab, { toValue: 1, duration: 260, easing: Easing.out(Easing.quad), useNativeDriver: NATIVE }),
      Animated.timing(dab, { toValue: 0, duration: 340, easing: Easing.in(Easing.quad), useNativeDriver: NATIVE })]));
    const wet = Animated.timing(fill, { toValue: 1, duration: 60_000, easing: Easing.out(Easing.cubic), useNativeDriver: false });
    const t = setTimeout(() => { brush.start(); wet.start(); }, 1800);
    return () => { clearTimeout(t); brush.stop(); wet.stop(); };
  }, [painting]);
  const canvas = Math.min(180, width * 0.42), room = Math.max(40, width - canvas - 150);
  const strokes = ["#c8553d", "#f2a541", "#3d7ea6", "#6a994e", "#9b5de5", "#f28482"];
  return (
    <YStack position="relative" height={canvas + 70} width="100%" justifyContent="flex-end">
      <XStack position="absolute" right={8} bottom={0} width={canvas + 20} alignItems="flex-end" justifyContent="center">
        {/* the easel: two legs, a ledge, the canvas on it */}
        <YStack position="absolute" bottom={0} left={canvas * 0.18} width={6} height={canvas + 60} backgroundColor={GILT.legs} transform={[{ rotate: "8deg" }]} />
        <YStack position="absolute" bottom={0} right={canvas * 0.18} width={6} height={canvas + 60} backgroundColor={GILT.legs} transform={[{ rotate: "-8deg" }]} />
        <YStack position="absolute" zIndex={3} bottom={46} width={canvas + 16} height={8} backgroundColor={GILT.wood} borderRadius={2} />
        <YStack zIndex={2} marginBottom={54} width={canvas} height={canvas} backgroundColor="#fbf8f0" borderWidth={3} borderColor="#d9cfb8" overflow="hidden">
          {done?.state === "done" ? <Art path={`/art/paintings/${done.id}.png`} size={canvas - 6} height={canvas - 6} smooth /> : painting ? (
            <YStack flex={1}>{strokes.map((c, i) => (
              <Animated.View key={c} style={{ position: "absolute", left: 8 + (i % 3) * (canvas / 3.4), top: 10 + Math.floor(i / 3) * (canvas / 2.3),
                width: fill.interpolate({ inputRange: [0, 1], outputRange: [0, canvas / 3] }), height: canvas / 3.2,
                opacity: fill.interpolate({ inputRange: [0, 0.15 * (i + 1), 1], outputRange: [0, 0.2, 0.75] }),
                backgroundColor: c, borderRadius: canvas / 10, transform: [{ rotate: `${(i * 23) % 40 - 20}deg` }] }} />))}
            </YStack>) : null}
        </YStack>
      </XStack>
      {slot !== null ? (
        <Animated.View style={{ position: "absolute", left: 0, bottom: 4,
          transform: [{ translateX: x.interpolate({ inputRange: [0, 1], outputRange: [0, room] }) },
                      { translateY: dab.interpolate({ inputRange: [0, 1], outputRange: [0, -6] }) },
                      { rotate: dab.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "6deg"] }) }] }}>
          <Art path={`/art/party/${slot}.png`} size={112} />
        </Animated.View>) : null}
    </YStack>
  );
}

// --- the painting shown large: tapped to close, held to see what was asked ---
function Large({ p, onClose, onForget }: { p: Painting; onClose: () => void; onForget: () => void }) {
  const { width, height } = useWindowDimensions();
  const [asked, setAsked] = useState(false);
  const size = Math.min(width - 32, height - 260, 720);
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <YStack flex={1} backgroundColor="rgba(20,16,12,0.94)" alignItems="center" justifyContent="center" padding={16} gap={12}>
        <Pressable style={{ position: "relative" }} onLongPress={() => setAsked(true)} onPressOut={() => setAsked(false)} delayLongPress={350} aria-label={WORDS.hold}>
          <Framed p={p} size={size} />
          {asked ? (
            <YStack position="absolute" left={16} right={16} bottom={16} backgroundColor="rgba(0,0,0,0.78)" padding={12} borderRadius={6} gap={4}>
              <Text fontFamily="$mono" fontSize={11} letterSpacing={2} color={GILT.light}>{WORDS.asked}</Text>
              <Text fontSize={15} color="#fff">{p.request}</Text>
            </YStack>) : null}
        </Pressable>
        <Text fontFamily="$mono" fontSize={16} letterSpacing={1} fontWeight="700" color={GILT.mat} textAlign="center">{p.title || "UNTITLED"}</Text>
        {p.about ? <Text fontSize={14} color="#d8cfbd" textAlign="center" maxWidth={size}>{`“${p.about}” — ${p.nickname}`}</Text> : null}
        <Small color="#a39a8a">{WORDS.hold}</Small>
        <XStack gap={10}><Action label={WORDS.close} onPress={onClose} ink={GILT.light} /><Action label={WORDS.forget} onPress={onForget} ink="#a39a8a" /></XStack>
      </YStack>
    </Modal>
  );
}

// --- the gallery: a wall per daemon, its paintings framed, newest first ---
function Gallery({ list, open }: { list: Painting[]; open: (p: Painting) => void }) {
  const [w, setW] = useState(0);
  const walls = new Map<number, Painting[]>();
  for (const p of list) if (p.state !== "failed") walls.set(p.personality, [...(walls.get(p.personality) ?? []), p]);
  const each = w ? Math.floor((w - 24 - 2 * 12) / 3) : 0;
  return (
    <YStack gap={14} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      <Eyebrow>{WORDS.gallery}</Eyebrow>
      {!walls.size ? <Small>{WORDS.empty}</Small> : null}
      {w ? [...walls.values()].map((ps) => (
        <YStack key={ps[0].personality} backgroundColor={GILT.wall} borderRadius={6} padding={12} gap={10}>
          <XStack alignSelf="flex-start" backgroundColor={GILT.frame} paddingHorizontal={10} paddingVertical={3} borderRadius={2}>
            <Text fontFamily="$mono" fontSize={12} letterSpacing={2} fontWeight="700" color="#2b2110">{ps[0].nickname}</Text>
          </XStack>
          <XStack flexWrap="wrap" gap={12}>
            {ps.map((p) => (
              <YStack key={p.id} width={each} gap={4} cursor="pointer" pressStyle={{ opacity: 0.85 }} onPress={() => p.state === "done" && open(p)}>
                <Framed p={p} size={each} />
                <Text fontSize={11} fontFamily="$mono" color="#e6dccb" numberOfLines={2}>{p.title || "…"}</Text>
              </YStack>))}
          </XStack>
        </YStack>)) : null}
    </YStack>
  );
}

export function EaselScreen({ ink, name, slot }: { ink: string; name: string; slot: number | null }) {
  const { width } = useWindowDimensions();
  const [ask, setAsk] = useState("");
  const [now, setNow] = useState<Painting | null>(null);
  const [list, setList] = useState<Painting[]>([]);
  const [large, setLarge] = useState<Painting | null>(null);
  const [error, setError] = useState("");
  const load = () => api<{ paintings: Painting[] }>("/api/paintings").then((r) => setList(r.paintings)).catch(() => {});
  useEffect(() => { load(); }, []);
  // while anything is painting, look again every few seconds (and pick up one begun before the app was closed)
  const pending = (now?.state === "painting" ? [now.id] : []).concat(list.filter((p) => p.state === "painting").map((p) => p.id));
  useEffect(() => {
    if (!pending.length) return;
    const t = setInterval(async () => {
      for (const id of new Set(pending)) {
        try {
          const { painting } = await api<{ painting: Painting }>(`/api/paintings/${id}`);
          if (painting.state !== "painting") { if (now?.id === id) setNow(painting); load(); }
        } catch { /* away: looked at again */ }
      }
    }, 3000);
    return () => clearInterval(t);
  }, [pending.join(",")]);
  const paint = async () => {
    const prompt = ask.trim();
    if (!prompt) return;
    setError("");
    const r = await api<{ painting?: Painting; error?: string }>("/api/paint", { prompt });
    if (!r.painting) throw new Error(r.error || WORDS.failed);
    setNow(r.painting); setAsk(""); load();
  };
  const painting = now?.state === "painting";
  return (
    <YStack gap={16}>
      <Card gap={10}>
        <Eyebrow>{WORDS.eyebrow}</Eyebrow>
        <EaselStage slot={slot} painting={painting} done={now} width={Math.min(width - 48, 640)} />
        {painting ? <Small>{WORDS.painting(name)}</Small> : null}
        {now?.state === "done" ? (
          <YStack gap={2}>
            <Text fontFamily="$mono" fontSize={15} fontWeight="700" letterSpacing={1} color={ink}>{now.title}</Text>
            {now.about ? <Small>{`“${now.about}”`}</Small> : null}
          </YStack>) : null}
        {now?.state === "failed" ? <Small color="$color9">{`${WORDS.failed}${now.error ? ` (${now.error})` : ""}`}</Small> : null}
        {!painting ? (
          <XStack gap={8} flexWrap="wrap" alignItems="center">
            <Entry value={ask} onChange={setAsk} onSubmit={() => { paint().catch((e) => setError((e as Error).message)); }} placeholder={WORDS.ask} limit={300} />
            <Action label={now?.state === "failed" ? WORDS.again : WORDS.paint} onPress={paint} ink={ink} />
          </XStack>) : null}
        {error ? <Small color="$color9">{error}</Small> : null}
      </Card>
      <Gallery list={list} open={setLarge} />
      {large ? <Large p={large} onClose={() => setLarge(null)}
                      onForget={async () => { await api("/api/paintings/forget", { id: large.id }); setLarge(null); load(); }} /> : null}
    </YStack>
  );
}
