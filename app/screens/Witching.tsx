// C-236 (the user, 2026-10-29): the witching hour -- from 3:00 to 4:00 in the morning, on this phone's clock, the carried
// daemon wears a thin shimmer and casts no shadow, and, once the save holds THE SUBTLE LAYER, it has a routine of its
// own named for its first type, here only in the hour: its tune falls, and one half step does not belong. The names and
// the tune are server/src/witching.ts's, one set with the game's (DAEMONS T-480). Every word DRAFT.
// C-237: every pulse breathes red<->blue through the book's purple on the clock's eight-second breath (witching.ts PULSE,
// the watches and the game the same); the shimmer's inner circle fills widdershins in emerald over the hour, the minutes
// left and the date beside it; and a touch on the den in the hour opens AS ABOVE SO BELOW in place of the care keys.
import { useAudioPlayer } from "expo-audio";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { Text, XStack, YStack } from "tamagui";
import { AS_ABOVE, EMERALD, hourDate, hourGone, minutesLeft, pulseNow, WITCHING_TUNE, witchingLine, witchingNow, witchingRoutine }
  from "../../server/src/witching";
import { api, ON_PHONE } from "../net";
import { dayRoot, soundLevel, soundOf } from "../tuneSound";
import { Action, Small } from "../ui";

// in the hour or not, looked at again each half minute
export function useWitching() {
  const [w, setW] = useState(witchingNow());
  useEffect(() => { const t = setInterval(() => setW(witchingNow()), 30000); return () => clearInterval(t); }, []);
  return w;
}
// a frame every so often: the breath, the flicker
function useFrame(ms: number) {
  const [f, setF] = useState(0);
  useEffect(() => { const t = setInterval(() => setF((x) => x + 1), ms); return () => clearInterval(t); }, [ms]);
  return f;
}

// the shimmer, about the daemon (in its den, moving with it): two faint rings on the breath, and now and then one drops out
export function WitchShimmer({ side }: { side: number }) {
  const f = useFrame(140);
  const ring = (k: number) => {
    if ((f + k * 3) % 9 === 0) return null;                   // it flickers
    const s = side * (0.84 + 0.08 * k + 0.03 * Math.sin(f / 4 + k));
    return <View key={k} pointerEvents="none" style={{ position: "absolute", left: (side - s) / 2, top: (side * 1.04 - s * 1.08) / 2, width: s, height: s * 1.08,
                                                        borderRadius: s, borderWidth: k ? 1 : 2, borderColor: pulseNow(k ? 0.75 : 1), opacity: 0.6 - 0.15 * k }} />;
  };
  return <>{ring(0)}{ring(1)}</>;
}

// the hour, counting down: the inner circle filled widdershins from twelve in the tablet's emerald -- sixty spokes, one a
// minute -- behind the daemon, with a mark at twelve and at the crease, half past
export function HourPie({ side }: { side: number }) {
  useFrame(10000);
  if (!witchingNow()) return null;                           // C-240: Halloween shimmers all day, but the count is the hour's
  const w = side * 0.76, h = side * 0.84, gone = hourGone(), spoke = (Math.PI * h) / 60 + 1.5;
  const filled = Math.floor(gone * 60 + 0.5);
  return (
    <View pointerEvents="none" style={{ position: "absolute", left: (side - w) / 2, top: (side - h) / 2, width: w, height: h, borderRadius: w, overflow: "hidden" }}>
      {Array.from({ length: filled }, (_, i) => (
        <View key={i} style={{ position: "absolute", left: (w - spoke) / 2, top: 0, width: spoke, height: h, transform: [{ rotate: `${-(i + 0.5) * 6}deg` }] }}>
          <View style={{ height: h / 2, backgroundColor: EMERALD.deep }} />
        </View>
      ))}
      <View style={{ position: "absolute", left: w / 2 - 1, top: 0, width: 2, height: 6, backgroundColor: EMERALD.lit }} />
      <View style={{ position: "absolute", left: w / 2 - 1, bottom: 0, width: 2, height: 6, backgroundColor: EMERALD.lit }} />
    </View>
  );
}

// over the den: the minutes left, and the date -- the hour is three to four, so the time is not needed
export function HourCount() {
  useFrame(15000);
  return (
    <YStack position="absolute" top={8} left={10} pointerEvents="none">
      <Text fontFamily="$mono" fontSize={22} fontWeight="700" color={EMERALD.lit}>{`${minutesLeft()} min left`}</Text>
      <Text fontFamily="$mono" fontSize={11} letterSpacing={1.5} color={EMERALD.lit}>{hourDate()}</Text>
    </YStack>
  );
}

// AS ABOVE SO BELOW -- in the hour, in place of the care keys: a line at a time, in emerald, on the breath. DRAFT
export function AsAbove({ onClose }: { onClose: () => void }) {
  const [at, setAt] = useState(0);
  const f = useFrame(200);
  const glow = (1 - Math.cos((f / 40) * 2 * Math.PI)) / 2;
  return (
    <Pressable onPress={() => setAt((a) => (a + 1) % AS_ABOVE.length)} accessibilityRole="button" accessibilityLabel="the next line">
      <YStack gap={6} padding={12} borderRadius={10} backgroundColor={pulseNow(0.25)} marginTop={6}>
        {at > 0 ? <Small color="$color9">{AS_ABOVE[at - 1]}</Small> : null}
        <Text fontSize={20} fontWeight="600" lineHeight={28} color={glow > 0.5 ? EMERALD.lit : "#3FB06C"}>{AS_ABOVE[at]}</Text>
        <XStack justifyContent="space-between">
          <Small color="$color9">{at + 1 < AS_ABOVE.length ? "tap: more" : "tap: again"}</Small>
          <Text fontSize={12} color={EMERALD.lit} onPress={onClose}>CARE</Text>
        </XStack>
      </YStack>
    </Pressable>
  );
}

// THE HOUR: its routine, once the book is held
export function WitchingHour({ nickname, species, note }: { nickname: string; species: number; note: string }) {
  const player = useAudioPlayer(null);
  const [routine, setRoutine] = useState<string | null>(null);
  const [said, setSaid] = useState("");
  useEffect(() => {
    Promise.all([api<{ held: boolean }>("/api/subtle/today"), api<{ types: string[] }>(`/api/species/${species}`)])
      .then(([s, sp]) => setRoutine(s.held ? witchingRoutine(sp.types ?? []) : null)).catch(() => {});
  }, [species]);
  if (!routine) return null;
  const run = () => {
    setSaid(witchingLine(nickname, routine));
    if (ON_PHONE) {
      try { player.replace({ uri: soundOf("witching", WITCHING_TUNE, dayRoot(note), soundLevel()) }); player.play(); } catch { /* quiet is fine */ }
    }
  };
  return (
    <YStack gap={4} paddingTop={6}>
      <Text fontFamily="$mono" fontSize={11} letterSpacing={1.5} color={EMERALD.lit}>THE HOUR</Text>
      <Action label={routine} onPress={run} ink={pulseNow(0.85)} />
      {said ? <Small color={EMERALD.lit}>{said}</Small> : <Small color="$color9">Only now, between three and four.</Small>}
    </YStack>
  );
}

// C-240: Halloween, with THE HERMETIC LAYER held -- the shimmer all day, the costume (what it fears; a tap takes the mask
// off), and the treats the daemons it met today left. GET /api/halloween?species=. Every word DRAFT.
export type HalloweenT = { on: boolean; costume?: { species: number; name: string } | null; treats?: { text: string; at: string }[] };
export function useHalloween(species: number) {
  const [h, setH] = useState<HalloweenT>({ on: false });
  useEffect(() => {
    const look = () => api<HalloweenT>(`/api/halloween?species=${species}`).then(setH).catch(() => {});
    look(); const t = setInterval(look, 60000); return () => clearInterval(t);
  }, [species]);
  return h;
}
export function HalloweenNote({ h, masked, name }: { h: HalloweenT; masked: boolean; name: string }) {
  if (!h.on) return null;
  return (
    <YStack gap={4} paddingTop={6}>
      <Text fontFamily="$mono" fontSize={11} letterSpacing={1.5} color={EMERALD.lit}>HALLOWEEN</Text>
      {h.costume ? <Small color="$color11">{masked ? `${name} went as ${h.costume.name}, what it fears. Tap it to take the mask off.`
                                                 : `${name}, unmasked. Tap it to put ${h.costume.name} back on.`}</Small> : null}
      {(h.treats ?? []).slice(0, 5).map((t, i) => <Small key={i} color={EMERALD.lit}>{t.text}</Small>)}
      {(h.treats ?? []).length === 0 ? <Small color="$color9">Every daemon it meets today leaves a treat.</Small> : null}
    </YStack>
  );
}
