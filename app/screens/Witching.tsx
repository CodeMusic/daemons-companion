// C-236 (the user, 2026-10-29): the witching hour -- from 3:00 to 4:00 in the morning, on this phone's clock, the carried
// daemon wears a thin purple shimmer (the book's purple, faint, flickering, as if the seam were thin), and, once the save
// holds THE SUBTLE LAYER, it has a routine of its own named for its first type, here only in the hour: its tune falls,
// and one half step does not belong. The names and the tune are server/src/witching.ts's, one set with the game's
// (DAEMONS T-480). Every word DRAFT.
import { useAudioPlayer } from "expo-audio";
import { useEffect, useState } from "react";
import { Text, YStack } from "tamagui";
import { WITCHING_TUNE, witchingLine, witchingNow, witchingRoutine } from "../../server/src/witching";
import { SUBTLE } from "../look";
import { api, ON_PHONE } from "../net";
import { dayRoot, soundLevel, soundOf } from "../tuneSound";
import { Action, Small } from "../ui";

// in the hour or not, looked at again each half minute
export function useWitching() {
  const [w, setW] = useState(witchingNow());
  useEffect(() => { const t = setInterval(() => setW(witchingNow()), 30000); return () => clearInterval(t); }, []);
  return w;
}

// the shimmer, over the daemon's den: two faint rings that breathe, and now and then drop out
export function WitchShimmer({ height }: { height: number }) {
  const [f, setF] = useState(0);
  useEffect(() => { const t = setInterval(() => setF((x) => x + 1), 140); return () => clearInterval(t); }, []);
  const ring = (k: number) => {
    if ((f + k * 3) % 9 === 0) return null;                   // it flickers
    const s = height * (0.62 + 0.04 * k + 0.02 * Math.sin(f / 4 + k));
    return <YStack key={k} position="absolute" width={s} height={s * 1.08} borderRadius={s} borderWidth={k ? 1 : 2}
                   borderColor={k ? SUBTLE.hue : SUBTLE.lit} opacity={0.55 - 0.15 * k} pointerEvents="none" />;
  };
  return (
    <YStack position="absolute" top={0} left={0} right={0} bottom={0} alignItems="center" justifyContent="center" pointerEvents="none"
            aria-label="a thin purple shimmer">
      {ring(0)}{ring(1)}
    </YStack>
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
      <Text fontFamily="$mono" fontSize={11} letterSpacing={1.5} color={SUBTLE.lit}>THE HOUR</Text>
      <Action label={routine} onPress={run} ink={SUBTLE.hue} />
      {said ? <Small color={SUBTLE.lit}>{said}</Small> : <Small color="$color9">Only now, between three and four.</Small>}
    </YStack>
  );
}
